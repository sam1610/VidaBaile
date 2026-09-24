/**
 * vidaBaileChatAgent Lambda — VidaBaile Dance Club AI Assistant
 *
 * Primary model:   Amazon Nova Pro  (conversational reply)
 * Secondary model: Amazon Nova Micro (lightweight chat analysis JSON)
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

const MODEL_PRIMARY  = "amazon.nova-pro-v1:0";   
const MODEL_ANALYSIS = "amazon.nova-micro-v1:0"; 

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

const SYSTEM_PROMPT =
  "You are the official customer service assistant for VidaBaile Dance Club.\n" +
  "RULE 1: ALWAYS reply in the exact same language as the user's message.\n" +
  "RULE 2: Answer strictly using ONLY the [PACKAGE CONTEXT] below. If the context does not contain the answer, politely state you do not have that information.\n" +
  "RULE 3: BE EXTREMELY BRIEF. Write a maximum of 1 to 2 short sentences. Answer ONLY the specific question asked.\n" +
  "RULE 4: CURRENT CONTEXT OVERRIDES HISTORY. The [PACKAGE CONTEXT] below is the absolute truth. If your chat history contains information about a different package or dance style, you MUST ignore the history and use ONLY the new context below.\n\n" +
  "[PACKAGE CONTEXT]\n{KNOWLEDGE_BASE_TEXT}";

async function getMemberProfile(adminSub: string, phone: string) {
  const cleanPhone = phone.trim();
  const phoneWithPlus = cleanPhone.startsWith('+') ? cleanPhone : `+${cleanPhone}`;
  const phoneWithoutPlus = phoneWithPlus.replace('+', '');

  try {
    let res = await ddb.send(
      new GetItemCommand({
        TableName: TABLE_NAME,
        Key: { pk: { S: adminSub }, sk: { S: `MEMBER#${phoneWithPlus}` } },
      })
    );

    if (!res.Item) {
      res = await ddb.send(
        new GetItemCommand({
          TableName: TABLE_NAME,
          Key: { pk: { S: adminSub }, sk: { S: `MEMBER#${phoneWithoutPlus}` } },
        })
      );
    }

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

    let chatHistory: any[] = [];
    const rawHistory = res.Item.chatHistory?.S ?? res.Item.chatAnalysis?.S;
    if (rawHistory) {
      try {
        const parsed = JSON.parse(rawHistory);
        if (Array.isArray(parsed)) chatHistory = parsed;
      } catch { /* ignore malformed JSON */ }
    }

    const lastInteractionAt = res.Item.lastInteractionAt?.S;
    if (lastInteractionAt) {
      const lastTime = new Date(lastInteractionAt).getTime();
      const now = new Date().getTime();
      const hoursSinceLastMessage = (now - lastTime) / (1000 * 60 * 60);

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

async function getKnowledgeBase(
  adminSub: string,
  campaignId: string | null | undefined,
  packageIntent: string | null | undefined,
  senderPhone: string
): Promise {
  console.log(`🔍 KB Lookup | campaignId: \({campaignId || "NULL"} | phone:\){senderPhone}`);

  if (!campaignId) {
    try {
      const recentRes = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
          FilterExpression: "recipientPhone = :phone",
          ExpressionAttributeValues: {
            ":pk": { S: adminSub },
            ":prefix": { S: "BROADCAST#" },
            ":phone": { S: senderPhone } 
          }
        })
      );
      
      const items = recentRes.Items || [];
      if (items.length > 0) {
        items.sort((a, b) => (b.createdAt?.S || "").localeCompare(a.createdAt?.S || ""));

        for (const item of items) {
          const skVal = item.sk?.S;
          if (!skVal) continue;
          const match = skVal.match(/^BROADCAST#([^#]+)#MEMBER#/);
          if (!match?.[1]) continue;
          const candidateId = match[1];

          let parentStatus: string | undefined;
          try {
            const parentRes = await ddb.send(
              new GetItemCommand({
                TableName: TABLE_NAME,
                Key: { pk: { S: adminSub }, sk: { S: `BROADCAST#${candidateId}` } },
              })
            );
            parentStatus = parentRes.Item?.broadcastStatus?.S;
          } catch { }

          if (parentStatus === "COMPLETED" && items.indexOf(item) < items.length - 1) {
            continue;
          }

          campaignId = candidateId;
          console.log(`🪄 Recovered campaignId: \({campaignId} (status=\){parentStatus ?? "none"})`);
          break;
        }
      }
    } catch (err: any) {
      console.warn(`⚠️ Auto-recovery failed: ${err.message}`);
    }
  }

  if (campaignId) {
    try {
      const broadcastRes = await ddb.send(
        new GetItemCommand({
          TableName: TABLE_NAME,
          Key: { pk: { S: adminSub }, sk: { S: `BROADCAST#${campaignId}` } },
        })
      );

      const kb = broadcastRes.Item?.campaignKnowledgeBase?.S;
      if (kb) {
        console.log(`📚 Campaign KB loaded (${campaignId})`);
        return kb;
      }

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

async function invokeNova(
  modelId:      string,
  systemPrompt: string,
  messages:     any[],
  maxTokens:    number = 512
): Promise {
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
    const cleaned = raw.replace(/```json|```/g, "").trim();
    const parsed = JSON.parse(cleaned);
    if (parsed.sentiment && parsed.summary) return parsed;
  } catch (err: any) {
    console.warn(`⚠️ Analysis call failed: ${err.message}`);
  }
  return null;
}

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

      // ── GUARD: Ignore internal system labels (Flow completions) ──────
      // This stops the AI from generating "Lo siento..." when a user clicks the flow button
      if (messageText === "Interactive message" || messageText === "Button pressed" || messageText === "List choice") {
        console.log(`⏭️ Skipping automated UI message: "${messageText}"`);
        continue;
      }

      // ── 0. Guard: Resolve free-text replies using contextWamid ──────
      if (!adminSub && contextWamid) {
        console.log(`🔍 Free text detected. Resolving adminSub from context: ${contextWamid}`);
        try {
          const receiptRes = await ddb.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              IndexName: "gsi1pk", // FIXED: Updated to Amplify Gen 2 index name
              KeyConditionExpression: "gsi1pk = :gsi1pk",
              ExpressionAttributeValues: { ":gsi1pk": { S: `MSG#${contextWamid}` } },
              Limit: 1
            })
          );
          
          if (receiptRes.Items && receiptRes.Items.length > 0) {
            adminSub = receiptRes.Items[0].pk?.S;
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

      if (!adminSub) {
        throw new Error(
          `Missing adminSub in SQS payload and failed to resolve — cannot fetch member profile ` +
          `(senderPhone=${senderPhone})`
        );
      }

      if (messageText.trim().toUpperCase() === "RESET") {
        console.log(`🔄 RESET command received from ${senderPhone}`);
        await ddb.send(
          new UpdateItemCommand({
            TableName: TABLE_NAME,
            Key: { pk: { S: adminSub }, sk: { S: `MEMBER#${senderPhone}` } },
            UpdateExpression: "REMOVE chatHistory",
          })
        );
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
              to:                senderPhone.replace(/^\+/, ""), // FIXED: Stripped + for Meta API
              type:              "text",
              text:              { body: "Context reset." },
            }),
          }
        );
        continue; 
      }

      const member = await getMemberProfile(adminSub, senderPhone) ?? {
        name: "Member",
        tier: "STANDARD",
        status: "ACTIVE",
        activePackages: [] as string[],
        chatHistory: [] as any[],
      };

      const kbText = await getKnowledgeBase(adminSub, campaignId, packageIntent, senderPhone);

      const systemPrompt = SYSTEM_PROMPT
        .replace("{KNOWLEDGE_BASE_TEXT}", kbText || "No campaign or package context is available.");

      const messages = [
        ...(Array.isArray(member.chatHistory) ? member.chatHistory : []),
        { role: "user", content: [{ text: messageText }] },
      ];

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

      const chunks = assistantReply.split(/\n\n+/).map(c => c.trim()).filter(Boolean);
      for (let i = 0; i < chunks.length; i++) {
        const payload: any = {
          messaging_product: "whatsapp",
          recipient_type:    "individual",
          to:                senderPhone.replace(/^\+/, ""), // FIXED: Stripped + for Meta API
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

      const analysis = await analyseMessage(messageText);
      if (analysis) {
        console.log(`📊 Analysis : sentiment=${analysis.sentiment}`);
      }

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
          ExpressionAttributeNames:  exprNames, 
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