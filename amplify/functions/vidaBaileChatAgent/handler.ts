/**
 * vidaBaileChatAgent Lambda — VidaBaile Dance Club AI Assistant
 *
 * Primary model:   Amazon Nova Pro  (conversational reply)
 * Secondary model: Amazon Nova Micro (lightweight chat analysis JSON)
 *
 * Flow:
 *  1. Fetch member profile + rolling chat history
 *  2. Fetch knowledge base (campaign KB → package KB fallback)
 *  3. Build system prompt — strict language matching, KB-only answers
 *  4. Invoke Nova Pro → chunked WhatsApp delivery
 *  5. Invoke Nova Micro → generate { sentiment, summary } analysis JSON
 *  6. Persist updated chat history + analysis JSON to member DynamoDB record
 */

import {
  DynamoDBClient,
  GetItemCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from "@aws-sdk/client-bedrock-runtime";

const ddb    = new DynamoDBClient({});
const bedrock = new BedrockRuntimeClient({});

const TABLE_NAME          = process.env.TABLE_NAME!;
const WHATSAPP_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const WHATSAPP_PHONE_ID   = process.env.WHATSAPP_PHONE_ID!;

const MODEL_PRIMARY  = "amazon.nova-pro-v1:0";   // complex reasoning
const MODEL_ANALYSIS = "amazon.nova-micro-v1:0"; // fast, low-cost analysis

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

// ────────────────────────────────────────────────────────────────────────────
// SYSTEM PROMPT
//
// {MEMBER_TIER} / {MEMBER_STATUS} / {MEMBER_PACKAGES} — member context
// {KNOWLEDGE_BASE_TEXT} — replaced with campaign or package KB before invocation
// ────────────────────────────────────────────────────────────────────────────
const SYSTEM_PROMPT =
  "You are the official customer service assistant for VidaBaile Dance Club.\n" +
  "RULE 1: You must detect the language of the user's message and REPLY IN THAT EXACT " +
  "LANGUAGE (e.g., if the user writes in French, you MUST reply in French).\n" +
  "RULE 2: Answer their questions using ONLY the context provided below. " +
  "Do not invent details.\n" +
  "[PACKAGE CONTEXT]: {KNOWLEDGE_BASE_TEXT}";

// ────────────────────────────────────────────────────────────────────────────
// Fetch member profile + rolling chat history (last 10 turns)
// Chat history stored as JSON array in the member DynamoDB record.
// ────────────────────────────────────────────────────────────────────────────
async function getMemberProfile(adminSub: string, phone: string) {
  try {
    const res = await ddb.send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: { pk: { S: adminSub }, sk: { S: `MEMBER#${phone}` } },
      })
    );
    if (!res.Item) return null;

    // chatHistory: new key (string-encoded JSON array of conversation turns)
    // chatAnalysis: new key (string-encoded JSON analytics object { sentiment, summary })
    // Fall back to chatAnalysis in case older records pre-date the rename.
    let chatHistory: any[] = [];
    const rawHistory = res.Item.chatHistory?.S ?? res.Item.chatAnalysis?.S;
    if (rawHistory) {
      try {
        const parsed = JSON.parse(rawHistory);
        if (Array.isArray(parsed)) chatHistory = parsed;
        // If parsed is an object (analytics format), ignore — not history
      } catch { /* ignore malformed JSON */ }
    }

    return {
      name:           res.Item.name?.S ?? "Member",
      tier:           res.Item.tier?.S ?? "STANDARD",
      status:         res.Item.status?.S ?? "ACTIVE",
      activePackages: res.Item.activePackages?.SS ?? [],
      chatHistory,
    };
  } catch (err: any) {
    console.warn(`⚠️ getMemberProfile error: ${err.message}`);
    return null;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Fetch knowledge base text
//
// Priority:
//   1. campaignId → BROADCAST#<id>.campaignKnowledgeBase
//   2. packageIntent → CATALOG#<id>.packageKnowledgeBase
//   3. Empty string (prompt still enforces boundary — model says "I don't know")
// ────────────────────────────────────────────────────────────────────────────
async function getKnowledgeBase(
  adminSub: string,
  campaignId:    string | null | undefined,
  packageIntent: string | null | undefined
): Promise<string> {
  if (campaignId) {
    try {
      const res = await ddb.send(
        new GetItemCommand({
          TableName: TABLE_NAME,
          Key: { pk: { S: adminSub }, sk: { S: `BROADCAST#${campaignId}` } },
        })
      );
      const kb  = res.Item?.campaignKnowledgeBase?.S;
      const pkg = res.Item?.packageRef?.S ?? "";
      if (kb) {
        console.log(`📚 Campaign KB loaded (${campaignId})`);
        return `${kb}${pkg ? `\nRelated Package: ${pkg}` : ""}`;
      }
    } catch (err: any) {
      console.warn(`⚠️ Campaign KB fetch error: ${err.message}`);
    }
  }

  if (packageIntent) {
    try {
      const res = await ddb.send(
        new GetItemCommand({
          TableName: TABLE_NAME,
          Key: { pk: { S: adminSub }, sk: { S: `CATALOG#${packageIntent}` } },
        })
      );
      const kb = res.Item?.packageKnowledgeBase?.S;
      if (kb) {
        console.log(`📦 Package KB loaded (${packageIntent})`);
        return kb;
      }
    } catch (err: any) {
      console.warn(`⚠️ Package KB fetch error: ${err.message}`);
    }
  }

  console.log("ℹ️ No KB found — model will use boundary rule");
  return "No specific package or campaign context available for this conversation.";
}

// ────────────────────────────────────────────────────────────────────────────
// Invoke a Nova model (Converse API format shared by Pro and Micro)
// ────────────────────────────────────────────────────────────────────────────
async function invokeNova(
  modelId:      string,
  systemPrompt: string,
  messages:     any[],
  maxTokens:    number = 512
): Promise<any[]> {
  const payload: any = {
    system: [{ text: systemPrompt }],
    messages,
    inferenceConfig: { maxTokens, temperature: 0.3 },
  };

  const res = await bedrock.send(
    new InvokeModelCommand({
      modelId,
      contentType: "application/json",
      body:        JSON.stringify(payload),
    })
  );

  const body = JSON.parse(new TextDecoder().decode(res.body));
  return body.output?.message?.content ?? body.content ?? [];
}

// ────────────────────────────────────────────────────────────────────────────
// Secondary call: analyse member message → { sentiment, summary }
// Uses Nova Micro for speed and cost efficiency.
// Returns null on any error — analysis is non-critical.
// ────────────────────────────────────────────────────────────────────────────
async function analyseMessage(userMessage: string): Promise<{ sentiment: string; summary: string } | null> {
  const analysisPrompt =
    `You are a sentiment analysis engine. Analyse the following member message and respond with ONLY valid JSON, no prose, no markdown.\n` +
    `Required format exactly: {"sentiment":"positive","summary":"one sentence"}\n` +
    `sentiment must be exactly one of: positive, neutral, negative`;

  try {
    const blocks = await invokeNova(
      MODEL_ANALYSIS,
      analysisPrompt,
      [{ role: "user", content: [{ text: userMessage }] }],
      128
    );
    const raw = blocks.find((b: any) => b.type === "text" || b.text)?.text ?? "";
    // Strip any accidental markdown fences before parsing
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.sentiment && parsed.summary) return parsed;
  } catch (err: any) {
    console.warn(`⚠️ Analysis call failed: ${err.message}`);
  }
  return null;
}

// ────────────────────────────────────────────────────────────────────────────
// Main Handler
// ────────────────────────────────────────────────────────────────────────────
export const handler = async (event: any) => {
  console.log("🤖 chatAgent triggered");
  const batchItemFailures: { itemIdentifier: string }[] = [];

  for (const record of event.Records) {
    try {
      const msg = JSON.parse(record.body);
      const {
        adminSub,
        senderPhone,
        messageText,
        packageIntent,
        campaignId,
        contextWamid,
      } = msg;

      const now = new Date().toISOString();

      // ── 0. Guard: adminSub is required for all DynamoDB operations ──────
      if (!adminSub) {
        throw new Error(
          `Missing adminSub in SQS payload — cannot fetch member profile or knowledge base ` +
          `(senderPhone=${senderPhone})`
        );
      }

      // ── 1. Fetch member profile ─────────────────────────────────────────
      const member = await getMemberProfile(adminSub, senderPhone);
      if (!member) {
        console.warn(`⚠️ Member not found: ${senderPhone}`);
        continue;
      }

      // ── 2. Fetch knowledge base ─────────────────────────────────────────
      const kbText = await getKnowledgeBase(adminSub, campaignId, packageIntent);

      // ── 3. Build system prompt — inject KB text only ─────────────────────
      // Member context is surfaced via conversation history, not system prompt,
      // to keep the prompt compact and aligned with the KB-boundary rule.
      const systemPrompt = SYSTEM_PROMPT
        .replace("{KNOWLEDGE_BASE_TEXT}", kbText || "No campaign or package context is available.");

      // ── 4. Build conversation messages (rolling window last 10) ─────────
      const messages = [
        ...(Array.isArray(member.chatHistory) ? member.chatHistory : []),
        { role: "user", content: [{ text: messageText }] },
      ];

      // ── 5. Primary call — Nova Pro generates reply ──────────────────────
      const responseBlocks = await invokeNova(
        MODEL_PRIMARY,
        systemPrompt,
        messages,
        1024
      );

      let assistantReply = "";
      for (const block of responseBlocks) {
        if (block.type === "text" || block.text) {
          assistantReply += block.text ?? "";
        }
      }
      assistantReply = assistantReply.trim() || "We will get back to you shortly.";
      console.log(`💬 Reply generated (${assistantReply.length} chars)`);

      // ── 6. Send reply to member via WhatsApp (chunked) ──────────────────
      const chunks = assistantReply.split(/\n\n+/).map(c => c.trim()).filter(Boolean);
      for (let i = 0; i < chunks.length; i++) {
        const payload: any = {
          messaging_product: "whatsapp",
          recipient_type:    "individual",
          to:                senderPhone,
          type:              "text",
          text:              { body: chunks[i] },
        };
        if (contextWamid && i === 0) payload.context = { message_id: contextWamid };

        const res = await fetch(
          `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
          {
            method:  "POST",
            headers: {
              Authorization:  `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(payload),
          }
        );
        if (!res.ok) {
          const err = await res.json();
          console.error(`❌ WhatsApp send failed (chunk ${i}):`, err);
          break;
        }
        if (i < chunks.length - 1) await sleep(1500);
      }

      // ── 7. Secondary call — Nova Micro generates { sentiment, summary } ─
      const analysis = await analyseMessage(messageText);
      if (analysis) {
        console.log(`📊 Analysis : sentiment=${analysis.sentiment}`);
      }

      // ── 8. Persist rolling history + analysis to DynamoDB ───────────────
      // Append assistant turn to the message array, keep last 10 exchanges.
      // Nova Converse format: messages are { role, content: [{ text }] }
      const assistantTurn = { role: "assistant", content: [{ text: assistantReply }] };
      const updatedHistory = [...messages, assistantTurn].slice(-10);

      let updateExpr = "SET chatHistory = :history, updatedAt = :now";
      const exprVals: any = {
        ":history": { S: JSON.stringify(updatedHistory) },
        ":now":     { S: now },
      };

      // chatAnalysis stores the analysis JSON object (schema: a.json())
      if (analysis) {
        updateExpr += ", chatAnalysis = :analysis";
        exprVals[":analysis"] = { S: JSON.stringify(analysis) };
      }

      await ddb.send(
        new UpdateItemCommand({
          TableName:                 TABLE_NAME,
          Key:                       { pk: { S: adminSub }, sk: { S: `MEMBER#${senderPhone}` } },
          UpdateExpression:          updateExpr,
          ExpressionAttributeValues: exprVals,
        })
      );

    } catch (err: any) {
      console.error(`❌ chatAgent error: ${err.message}`);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  return { batchItemFailures };
};
