import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import * as crypto from "crypto";

const sqs = new SQSClient({});
const ddb = new DynamoDBClient({});
const TABLE_NAME = process.env.TABLE_NAME!;
const INBOUND_CHAT_QUEUE = process.env.INBOUND_CHAT_QUEUE_URL!;

// Helper to validate Meta X-Hub-Signature-256
function validateMetaSignature(body: string, signatureHeader?: string): boolean {
  const appSecret = process.env.META_APP_SECRET;
  
  if (!appSecret || !signatureHeader) {
      return false; 
  }
  
  const expectedSignature = "sha256=" + crypto
    .createHmac("sha256", appSecret)
    .update(body)
    .digest("hex");
  
  const signatureBuffer = Buffer.from(signatureHeader, 'utf8');
  const expectedBuffer = Buffer.from(expectedSignature, 'utf8');

  if (signatureBuffer.byteLength !== expectedBuffer.byteLength) {
      return false;
  }
  
  return crypto.timingSafeEqual(signatureBuffer, expectedBuffer);
}

async function findBroadcastReceiptByWamid(wamid: string) {
  console.log(`🔎 findBroadcastReceiptByWamid | wamid=${wamid} | table=${TABLE_NAME}`);
  try {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "clubRecordsByGsi1pkAndGsi1sk",
      KeyConditionExpression: "gsi1pk = :gsi1pk AND gsi1sk = :gsi1sk",
      ExpressionAttributeValues: {
        ":gsi1pk": { S: `MSG#${wamid}` },
        ":gsi1sk": { S: "WEBHOOK" }
      }
    }));
    const item = res.Items?.[0];
    if (!item) {
      console.warn(`⚠️ findBroadcastReceiptByWamid | No receipt for wamid=${wamid} (${res.Items?.length ?? 0} items returned)`);
      return null;
    }
    console.log(`✅ findBroadcastReceiptByWamid | Found receipt | adminSub=${item.pk?.S} | sk=${item.sk?.S}`);
    return {
      adminSub: item.pk?.S || "",
      sk: item.sk?.S || "",
      deliveryStatus: item.deliveryStatus?.S || ""
    };
  } catch (err: any) {
    console.error(`❌ findBroadcastReceiptByWamid | DynamoDB error: ${err.message} | wamid=${wamid}`);
    return null;
  }
}

// FIXED: Record and exprVals variable name matching
async function updateBroadcastReceiptStatus(adminSub: string, sk: string, status: string, extraUpdates: Record<string, any> = {}) {
  try {
    let updateExpr = "SET deliveryStatus = :status, updatedAt = :now";
    const exprVals: Record<string, any> = {
      ":status": { S: status },
      ":now": { S: new Date().toISOString() }
    };
    
    if (extraUpdates.readAt) {
      updateExpr += ", readAt = :readAt";
      exprVals[":readAt"] = { S: extraUpdates.readAt };
    }
    if (extraUpdates.isRead !== undefined) {
      updateExpr += ", isRead = :isRead";
      exprVals[":isRead"] = { BOOL: extraUpdates.isRead };
    }
    if (extraUpdates.hasReplied !== undefined) {
      updateExpr += ", hasReplied = :hasReplied";
      exprVals[":hasReplied"] = { BOOL: extraUpdates.hasReplied };
    }

    await ddb.send(new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: { pk: { S: adminSub }, sk: { S: sk } },
      UpdateExpression: updateExpr,
      ExpressionAttributeValues: exprVals
    }));
  } catch (err: any) {
    console.warn(`⚠️ Failed to update receipt status: ${err.message}`);
  }
}

async function resolveAdminFromDisplayPhone(displayPhone: string) {
  try {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "clubRecordsByGsi1pkAndGsi1sk",
      KeyConditionExpression: "gsi1pk = :gsi1pk AND gsi1sk = :gsi1sk",
      ExpressionAttributeValues: {
        ":gsi1pk": { S: "WHATSAPP_MAPPING" },
        ":gsi1sk": { S: `PHONE#${displayPhone}` }
      }
    }));
    return res.Items?.[0]?.pk?.S || null;
  } catch {
    return null;
  }
}

export const handler = async (event: any) => {
  console.log("🔥 Webhook event received");

  if (event.requestContext?.http?.method === "GET") {
    const q = event.queryStringParameters || {};
    const verifyToken = process.env.META_VERIFY_TOKEN;
    
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === verifyToken) {
      console.log("✅ Webhook verification challenge accepted");
      return { statusCode: 200, body: q["hub.challenge"] };
    }
    console.warn("❌ Webhook verification failed");
    return { statusCode: 403, body: "Forbidden" };
  }

  try {
    let bodyStr = event.body || "{}";

    if (event.isBase64Encoded) {
      bodyStr = Buffer.from(bodyStr, "base64").toString("utf8");
    }

    const xHubSig = event.headers?.["x-hub-signature-256"] || event.headers?.["X-Hub-Signature-256"];
    if (!validateMetaSignature(bodyStr, xHubSig)) {
      console.error(`❌ Signature mismatch! Header received: ${xHubSig || "NONE"}. (Check META_APP_SECRET)`);
      return { statusCode: 403, body: "Invalid signature" };
    }

    const body = JSON.parse(bodyStr);
    const entry = body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;

    if (!value) {
      console.warn("⚠️ No value in webhook payload");
      return { statusCode: 200, body: "OK" };
    }

    const displayPhone = value.metadata?.display_phone_number ?? "";

    if (value.statuses) {
      const status = value.statuses[0];
      const wamid = status.id;
      const newStatus = status.status; 

      console.log(`📍 Status: WAMID \({wamid} →\){newStatus}`);

      const receipt = await findBroadcastReceiptByWamid(wamid);
      if (receipt) {
        // FIXED: Record
        const updates: Record<string, any> = {};
        if (newStatus === "read") {
          updates.readAt = new Date().toISOString();
          updates.isRead = true;
        }
        await updateBroadcastReceiptStatus(receipt.adminSub, receipt.sk, newStatus, updates);
      } else {
        console.log(`ℹ️ No receipt found for WAMID: ${wamid} (likely non-broadcast message)`);
      }
    }

    if (value.messages) {
      const msg = value.messages[0];
      const senderPhone = msg.from.startsWith('+') ? msg.from : `+${msg.from}`;
      const msgType = msg.type as string;
      const contextWamid = msg.context?.id;
      const contacts = value.contacts || [];
      const senderProfileName = contacts[0]?.profile?.name || "";

      let messageText = "";
      let buttonPayload = "";

      if (msgType === "text") {
        messageText = msg.text?.body ?? "";
      } else if (msgType === "button") {
        messageText = msg.button?.text ?? "Button pressed";
        buttonPayload = msg.button?.payload ?? "";
      } else if (msgType === "interactive") {
        const ir = msg.interactive;
        if (ir?.type === "button_reply") {
          messageText = ir.button_reply?.title ?? ir.button_reply?.id ?? "Button";
          buttonPayload = ir.button_reply?.id ?? "";
        } else if (ir?.type === "list_reply") {
          messageText = ir.list_reply?.title ?? ir.list_reply?.id ?? "List choice";
          buttonPayload = ir.list_reply?.id ?? "";
        } else {
          messageText = "Interactive message";
        }
      } else {
        console.warn(`⚠️ Unknown message type: ${msgType}`);
        return { statusCode: 200, body: "OK" };
      }

      if (!messageText.trim()) {
        console.warn(`⚠️ Empty message from ${senderPhone}`);
        return { statusCode: 200, body: "OK" };
      }

      let bookingIntent = "";
      let packageIntent = "";
      let campaignId    = "";
      let adminSubFromPayload = "";

      if (buttonPayload.startsWith("BOOK_CLASS_")) {
        const parts = buttonPayload.replace("BOOK_CLASS_", "").split("_ADMIN#");
        bookingIntent = parts[0] || "";
        adminSubFromPayload = parts[1] || "";
      } else if (buttonPayload.startsWith("BUY_PACKAGE_")) {
        const withoutPrefix = buttonPayload.replace("BUY_PACKAGE_", "");
        const adminParts    = withoutPrefix.split("_ADMIN#");
        adminSubFromPayload = adminParts[1] || "";
        const beforeAdmin   = adminParts[0];
        const campParts     = beforeAdmin.split("_CAMP#");
        packageIntent       = campParts[0] || "";
        campaignId          = campParts[1] || "";
      }

      let adminSub = "";

      if (contextWamid) {
        const receipt = await findBroadcastReceiptByWamid(contextWamid);
        if (receipt?.adminSub) {
          adminSub = receipt.adminSub;
          console.log(`🎯 Tier 0 resolved via contextWamid receipt: ${adminSub}`);
          const skMatch = receipt.sk.match(/^BROADCAST#([^#]+)#MEMBER#/);
          if (skMatch?.[1]) {
            campaignId = skMatch[1];
            console.log(`📋 campaignId extracted from receipt sk: ${campaignId}`);
          }
        }
      }

      if (!adminSub && adminSubFromPayload) {
        adminSub = adminSubFromPayload;
        console.log(`🎯 Tier 1 resolved via button payload: ${adminSub}`);
      }

      if (!adminSub && displayPhone) {
        const displayVariants = [displayPhone, `+${displayPhone.replace('+', '')}`];
        for (const variant of displayVariants) {
          const resolved = await resolveAdminFromDisplayPhone(variant);
          if (resolved) {
            adminSub = resolved;
            console.log(`🎯 Tier 2 resolved via display phone: ${adminSub}`);
            break;
          }
        }
      }

      if (!adminSub) {
        const displayPhoneRaw = body.entry?.[0]?.changes?.[0]?.value?.metadata?.display_phone_number;
        
        if (displayPhoneRaw) {
          const cleanPhone = displayPhoneRaw.replace('+', ''); 
          
          try {
            const profileQuery = await ddb.send(new QueryCommand({
              TableName: process.env.TABLE_NAME,
              IndexName: "clubRecordsByGsi1pkAndGsi1sk",
              KeyConditionExpression: "gsi1pk = :phone AND gsi1sk = :profile",
              ExpressionAttributeValues: {
                ":phone": { S: `WHATSAPP#${cleanPhone}` },
                ":profile": { S: "PROFILE" }
              }
            }));

            if (profileQuery.Items && profileQuery.Items.length > 0) {
              adminSub = profileQuery.Items[0].pk?.S ?? "";
              console.log(`🎯 Tier 2 resolved via WhatsApp Number: ${adminSub}`);
            }
          } catch (err: any) {
             console.warn(`⚠️ Failed to resolve profile: ${err.message}`);
          }
        }
      }

      if (!adminSub) {
        console.error(`❌ adminSub resolution failed | msgType=${msgType} | contextWamid=${contextWamid ?? "none"} | displayPhone=${displayPhone} | senderPhone=${senderPhone} | messageText="${messageText.substring(0, 80)}"`);
        return { statusCode: 200, body: "OK" }; 
      }

      if (!campaignId) {
        try {
          const normalizedPhone = senderPhone.startsWith("+") ? senderPhone : `+${senderPhone}`;
          const recentBroadcasts = await ddb.send(
            new QueryCommand({
              TableName: TABLE_NAME,
              KeyConditionExpression: "pk = :pk AND begins_with(sk, :prefix)",
              FilterExpression: "recipientPhone = :phone",
              ExpressionAttributeValues: {
                ":pk":     { S: adminSub },
                ":prefix": { S: "BROADCAST#" },
                ":phone":  { S: normalizedPhone },
              },
              ScanIndexForward: false,
              Limit: 10,
            })
          );
          if (recentBroadcasts.Items?.length) {
            const sk = recentBroadcasts.Items[0].sk?.S || "";
            const match = sk.match(/^BROADCAST#([^#]+)#MEMBER#/);
            if (match?.[1]) {
              campaignId = match[1];
              console.log(`🪄 Inferred missing campaignId: ${campaignId} for free-text reply`);
            }
          }
        } catch (err: any) {
          console.warn("Could not infer campaign context:", err.message);
        }
      }

      if (contextWamid) {
        console.log(`💬 Reply to broadcast WAMID: ${contextWamid}`);
        const replyReceipt = await findBroadcastReceiptByWamid(contextWamid);
        if (replyReceipt) {
          await updateBroadcastReceiptStatus(
            replyReceipt.adminSub,
            replyReceipt.sk,
            replyReceipt.deliveryStatus || "READ",
            { hasReplied: true }
          );
        }
      }

      const memberSk = `MEMBER#${senderPhone}`;
      try {
        let updateExpr = "SET lastInteractionAt = :now, hasReplied = :true, updatedAt = :now";
        const exprNames: any = {};
        const exprVals: any = {
          ":now": { S: new Date().toISOString() },
          ":true": { BOOL: true },
        };

        if (senderProfileName) {
          updateExpr += ", #memberName = :name";
          exprNames["#memberName"] = "name";
          exprVals[":name"] = { S: senderProfileName };
        }

        const updateInput: any = {
          TableName: TABLE_NAME,
          Key: { pk: { S: adminSub }, sk: { S: memberSk } },
          UpdateExpression: updateExpr,
          ExpressionAttributeValues: exprVals,
        };

        if (Object.keys(exprNames).length > 0) {
          updateInput.ExpressionAttributeNames = exprNames;
        }

        await ddb.send(new UpdateItemCommand(updateInput));
      } catch (err: any) {
        console.warn(`⚠️ Failed to update member record: ${err.message}`);
      }

      console.log(`📤 Enqueuing to SQS | adminSub=${adminSub} | campaignId=${campaignId ?? "none"} | contextWamid=${contextWamid ?? "none"} | queue=${INBOUND_CHAT_QUEUE}`);
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: INBOUND_CHAT_QUEUE,
          MessageBody: JSON.stringify({
            adminSub,
            senderPhone,
            messageText,
            bookingIntent:  bookingIntent  || null,
            packageIntent:  packageIntent  || null,
            campaignId:     campaignId     || null,
            contextWamid:   contextWamid   || null,
          }),
        })
      );

      console.log(`📨 [\({msgType}] Queued: "\){messageText.substring(0, 50)}" from ${senderPhone} to chatAgent`);
    }

    return { statusCode: 200, body: "OK" };
  } catch (err: any) {
    console.error("❌ Webhook error:", err.message);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};