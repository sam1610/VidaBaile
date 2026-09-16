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
  QueryCommand
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
  "RULE 1: ALWAYS reply in the exact same language as the user's message.\n" +
  "RULE 2: Answer strictly using ONLY the [PACKAGE CONTEXT] below. If the context does not contain the answer, politely state you do not have that information.\n" +
  "RULE 3: BE EXTREMELY BRIEF. Write a maximum of 1 to 2 short sentences. Answer ONLY the specific question asked.\n" +
  "RULE 4: CURRENT CONTEXT OVERRIDES HISTORY. The [PACKAGE CONTEXT] below is the absolute truth. If your chat history contains information about a different package or dance style, you MUST ignore the history and use ONLY the new context below.\n\n" +
  "[PACKAGE CONTEXT]\n{KNOWLEDGE_BASE_TEXT}";

// ────────────────────────────────────────────────────────────────────────────
// Fetch member profile + rolling chat history (last 10 turns)
// Chat history stored as JSON array in the member DynamoDB record.
// ────────────────────────────────────────────────────────────────────────────
async function getMemberProfile(adminSub: string, phone: string) {
  const cleanPhone = phone.trim();
const phoneWithPlus = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
const phoneWithoutPlus = phoneWithPlus.replace('+', '');

try {
// Attempt 1: Look for MEMBER#+973...
let res = await ddb.send(
  new GetItemCommand({
    TableName: TABLE_NAME,
    Key: { pk: { S: adminSub }, sk: { S: `MEMBER#${phoneWithPlus}` } },
  })
);

// Attempt 2: Look for MEMBER#973... (no plus) if Attempt 1 fails
if (!res.Item) {
  res = await ddb.send(
    new GetItemCommand({
      TableName: TABLE_NAME,
      Key: { pk: { S: adminSub }, sk: { S: `MEMBER#${phoneWithoutPlus}` } },
    })
  );
}

// 2. FALLBACK PROFILE (Self-Healing Mechanism)
if (!res.Item) {
  console.warn(`⚠️ Member not found in DB for ${cleanPhone}. Generating fallback profile.`);
  return {
    name:           "Dancer",
    tier:           "STANDARD",
    status:         "ACTIVE",
    activePackages: [],
    chatHistory:    [],
  };
}

    // chatHistory: new key (string-encoded JSON array of conversation turns)
    // chatAnalysis: new key (string-encoded JSON analytics object { sentiment, summary })
    let chatHistory: any[] = [];
    const rawHistory = res.Item.chatHistory?.S ?? res.Item.chatAnalysis?.S;
    if (rawHistory) {
      try {
        const parsed = JSON.parse(rawHistory);
        if (Array.isArray(parsed)) chatHistory = parsed;
        // If parsed is an object (analytics format), ignore — not history
      } catch { /* ignore malformed JSON */ }
    }

    // ── Time-Based Session Expiration ────────────────────────────────────────
    const lastInteractionAt = res.Item.lastInteractionAt?.S;
    if (lastInteractionAt) {
      const lastTime = new Date(lastInteractionAt).getTime();
      const now = new Date().getTime();
      const hoursSinceLastMessage = (now - lastTime) / (1000 * 60 * 60);

      // If more than 12 hours have passed, flush the history for this session
      if (hoursSinceLastMessage > 12) {
        console.log(`🕒 Session expired (${hoursSinceLastMessage.toFixed(1)} hours ago). Starting fresh context.`);
        chatHistory = []; 
      }
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
  campaignId: string | null | undefined,
  packageIntent: string | null | undefined,
  senderPhone: string
): Promise<string> {
  console.log(`🔍 KB Lookup | campaignId: \({campaignId || "NULL"} | phone:\){senderPhone}`);

 // 1. Autonomous Fallback: Recovers missing campaignId using normalized phone
  if (!campaignId) {
    try {
      const recentRes = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
          // FIX: Filter on the non-key attribute 'recipientPhone' instead of 'sk'
          FilterExpression: "recipientPhone = :phone",
          ExpressionAttributeValues: {
            ":pk": { S: adminSub },
            ":prefix": { S: "BROADCAST#" },
            ":phone": { S: senderPhone } // Webhook already normalized this to E.164
          }
        })
      );
      
      const items = recentRes.Items || [];
      if (items.length > 0) {
        // Sort descending by createdAt — most recent receipt first
        items.sort((a, b) => (b.createdAt?.S || "").localeCompare(a.createdAt?.S || ""));

        // Walk receipts from newest to oldest. For each, check that its parent
        // BROADCAST record is not an old COMPLETED campaign dispatched before the
        // current one. Accept the first receipt whose campaign is SCHEDULED, RUNNING,
        // or has no status (legacy) — i.e. not a stale completed campaign.
        for (const item of items) {
          const skVal = item.sk?.S;
          if (!skVal) continue;
          const match = skVal.match(/^BROADCAST#([^#]+)#MEMBER#/);
          if (!match?.[1]) continue;
          const candidateId = match[1];

          // Quick-check: fetch the parent BROADCAST record status
          let parentStatus: string | undefined;
          try {
            const parentRes = await ddb.send(
              new GetItemCommand({
                TableName: TABLE_NAME,
                Key: { pk: { S: adminSub }, sk: { S: `BROADCAST#${candidateId}` } },
              })
            );
            parentStatus = parentRes.Item?.broadcastStatus?.S;
          } catch { /* ignore — use candidate anyway */ }

          // Skip only if the campaign has a known COMPLETED status AND there
          // are newer campaigns. Accept COMPLETED if it's the only option.
          if (parentStatus === "COMPLETED" && items.indexOf(item) < items.length - 1) {
            console.log(`⏭️ Skipping COMPLETED campaign ${candidateId} in auto-recovery`);
            continue;
          }

          campaignId = candidateId;
          console.log(`🪄 Recovered campaignId: ${campaignId} (status=${parentStatus ?? "none"})`);
          break;
        }
      } else {
         console.log(`⚠️ Auto-recovery found 0 receipts for phone ${senderPhone}`);
      }
    } catch (err: any) {
      console.warn(`⚠️ Auto-recovery failed: ${err.message}`);
    }
  }

  // 2. Fetch the KB using the campaignId
  if (campaignId) {
    try {
      const broadcastRes = await ddb.send(
        new GetItemCommand({
          TableName: TABLE_NAME,
          Key: { pk: { S: adminSub }, sk: { S: `BROADCAST#${campaignId}` } },
        })
      );

      // Use KB regardless of campaign status — COMPLETED just means dispatched,
      // not that the context is wrong. The member is still asking about this campaign.
      const kb = broadcastRes.Item?.campaignKnowledgeBase?.S;
      if (kb) {
        console.log(`📚 Campaign KB loaded (${campaignId})`);
        return kb;
      }

      // 3. Deep-fetch the CATALOG KB via package pointer
      const packageRef = broadcastRes.Item?.packageIntent?.S || broadcastRes.Item?.packageRef?.S;
      if (packageRef) {
        const catalogSk = packageRef.startsWith("CATALOG#") ? packageRef : `CATALOG#${packageRef}`;
        const catalogRes = await ddb.send(
          new GetItemCommand({
            TableName: TABLE_NAME,
            Key: { pk: { S: adminSub }, sk: { S: catalogSk } },
          })
        );
        const catalogKb = catalogRes.Item?.packageKnowledgeBase?.S;
        if (catalogKb) {
          console.log(`📦 Catalog KB successfully loaded via ${catalogSk}`);
          return catalogKb;
        }
      }
    } catch (err: any) {
      console.warn(`⚠️ KB fetch error: ${err.message}`);
    }
  }

  // 4. Standalone package query (button payload)
  if (!campaignId && packageIntent) {
    try {
      const res = await ddb.send(
        new GetItemCommand({
          TableName: TABLE_NAME,
          Key: { pk: { S: adminSub }, sk: { S: `CATALOG#${packageIntent}` } },
        })
      );
      const kb = res.Item?.packageKnowledgeBase?.S;
      if (kb) {
        console.log(`📦 Package KB loaded directly (${packageIntent})`);
        return kb;
      }
    } catch (err: any) {
      console.warn(`⚠️ Package KB fetch error: ${err.message}`);
    }
  }

  console.log("ℹ️ No KB found — model will enforce boundary rule");
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
      let {
        adminSub,
        senderPhone,
        messageText,
        packageIntent,
        campaignId,
        contextWamid,
      } = msg;

      const now = new Date().toISOString();

      // ── 0. Guard: Resolve free-text replies using contextWamid ──────
      if (!adminSub && contextWamid) {
        console.log(`🔍 Free text detected. Resolving adminSub from context: ${contextWamid}`);
        try {
          const receiptRes = await ddb.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              IndexName: "clubRecordsByGsi1pkAndGsi1sk",
              KeyConditionExpression: "gsi1pk = :gsi1pk",
              ExpressionAttributeValues: { ":gsi1pk": { S: `MSG#${contextWamid}` } },
              Limit: 1
            })
          );
          
          if (receiptRes.Items && receiptRes.Items.length > 0) {
            adminSub = receiptRes.Items[0].pk?.S;
            // Extract campaignId from sk format: BROADCAST##MEMBER#
            const skMatch = receiptRes.Items[0].sk?.S?.match(/^BROADCAST#([^#]+)#MEMBER#/);
            if (skMatch && skMatch[1]) {
              campaignId = skMatch[1];
            }
            console.log(`✅ Dynamically resolved adminSub: \({adminSub}, campaignId:\){campaignId}`);
          }
        } catch (err: any) {
          console.warn(`⚠️ Failed to resolve contextWamid: ${err.message}`);
        }
      }

      // Hard stop if we still have no adminSub after attempting to resolve
      if (!adminSub) {
        throw new Error(
          `Missing adminSub in SQS payload and failed to resolve — cannot fetch member profile ` +
          `(senderPhone=${senderPhone})`
        );
      }

      // ── RESET command — developer/support tool ────────────────────────
      // Sending the word "RESET" (case-insensitive) clears the rolling chat
      // history for this member, giving the AI a clean slate on the next turn.
      if (messageText.trim().toUpperCase() === "RESET") {
        console.log(`🔄 RESET command received from ${senderPhone}`);
        await ddb.send(
          new UpdateItemCommand({
            TableName: TABLE_NAME,
            Key: { pk: { S: adminSub }, sk: { S: `MEMBER#${senderPhone}` } },
            UpdateExpression: "REMOVE chatHistory",
          })
        );
        // Acknowledge to the member and skip the rest of the AI pipeline
        await fetch(
          `https://graph.facebook.com/v20.0/${WHATSAPP_PHONE_ID}/messages`,
          {
            method:  "POST",
            headers: {
              Authorization:  `Bearer ${WHATSAPP_ACCESS_TOKEN}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              messaging_product: "whatsapp",
              recipient_type:    "individual",
              to:                senderPhone,
              type:              "text",
              text:              { body: "Context reset." },
            }),
          }
        );
        continue; // skip Bedrock invocation for this record
      }

      // ── 1. Fetch member profile ─────────────────────────────────────────
      const member = await getMemberProfile(adminSub, senderPhone) ?? {
        name: "Member",
        tier: "STANDARD",
        status: "ACTIVE",
        activePackages: [] as string[],
        chatHistory: [] as any[],
      };

      // ── 2. Fetch knowledge base ─────────────────────────────────────────
      const kbText = await getKnowledgeBase(adminSub, campaignId, packageIntent, senderPhone);

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

      let updateExpr = "SET chatHistory = :history, updatedAt = :now, entityType = :type, #nm = :name";
const exprNames: any = { "#nm": "name" };
const exprVals: any = {
  ":history": { S: JSON.stringify(updatedHistory) },
  ":now":     { S: now },
  ":type":    { S: "MEMBER" },
  ":name":    { S: member.name }
};

if (analysis) {
  updateExpr += ", chatAnalysis = :analysis";
  exprVals[":analysis"] = { S: JSON.stringify(analysis) };
}

await ddb.send(
  new UpdateItemCommand({
    TableName:                 TABLE_NAME,
    Key:                       { pk: { S: adminSub }, sk: { S: `MEMBER#${senderPhone}` } },
    UpdateExpression:          updateExpr,
    ExpressionAttributeNames:  exprNames, // <-- ADD THIS LINE
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
