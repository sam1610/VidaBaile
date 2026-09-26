import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";
import { DynamoDBClient, GetItemCommand, QueryCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
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


/**
 * Tier 2b / Tier 3: Reverse phone-to-tenant lookup via GSI2.
 *
 * Queries gsi2pk = "PHONE#<phone>" on the GSI2 index.  Two record types
 * populate this index:
 *
 *   1. BROADCAST_RECEIPT (written by vidaBaileProcessOutboundQueue):
 *        gsi2pk = PHONE#<recipientPhone>
 *        gsi2sk = ADMIN#<adminSub>
 *      Available from the very first broadcast send — no prior interaction needed.
 *
 *   2. MEMBER routing stamp (written by writePhoneRoutingRecord below):
 *        gsi2pk = PHONE#<senderPhone>
 *        gsi2sk = ADMIN#<adminSub>   (same shape, same query)
 *      Written after every successful message so subsequent lookups stay O(1).
 *
 * Both record types use the same gsi2sk prefix so a single begins_with query
 * returns the adminSub regardless of which record type matched first.
 * No env var, no hardcoded SUB, no redeployment when a new club signs up.
 */
async function resolveAdminFromSenderPhone(senderPhone: string): Promise<string | null> {
  const normalizedPhone = senderPhone.startsWith("+") ? senderPhone : `+${senderPhone}`;
  console.log(`🔎 Tier 3 GSI2 phone lookup | senderPhone=${normalizedPhone}`);

  try {
    const res = await ddb.send(new QueryCommand({
      TableName: TABLE_NAME,
      IndexName: "clubRecordsByGsi2pkAndGsi2sk",
      KeyConditionExpression: "gsi2pk = :gsi2pk AND begins_with(gsi2sk, :prefix)",
      ExpressionAttributeValues: {
        ":gsi2pk":  { S: `PHONE#${normalizedPhone}` },
        ":prefix":  { S: "ADMIN#" },
      },
      Limit: 1,
    }));
    const hit = res.Items?.[0];
    if (hit?.pk?.S) {
      console.log(`✅ Tier 3 GSI2 resolved | adminSub=${hit.pk.S} | gsi2sk=${hit.gsi2sk?.S}`);
      return hit.pk.S;
    }
    console.warn(`⚠️ Tier 3 GSI2 | no record for PHONE#${normalizedPhone} — member may not have received a broadcast yet`);
  } catch (err: any) {
    console.error(`❌ Tier 3 GSI2 query failed: ${err.message}`);
  }
  return null;
}

/**
 * Write a GSI2 routing record so subsequent free-text messages from this
 * phone resolve adminSub instantly via Tier 3 Strategy A.
 *
 * Record shape:
 *   pk      = adminSub
 *   sk      = MEMBER#<normalizedPhone>    (already exists from broadcast send)
 *   gsi2pk  = PHONE#<normalizedPhone>
 *   gsi2sk  = "ADMIN"
 *
 * Uses UpdateItem (conditional-free) so it is idempotent and safe to call
 * on every inbound message without double-write risk.
 */
async function writePhoneRoutingRecord(adminSub: string, senderPhone: string): Promise<void> {
  const normalizedPhone = senderPhone.startsWith("+") ? senderPhone : `+${senderPhone}`;
  try {
    await ddb.send(new UpdateItemCommand({
      TableName: TABLE_NAME,
      Key: { pk: { S: adminSub }, sk: { S: `MEMBER#${normalizedPhone}` } },
      UpdateExpression: "SET gsi2pk = :gsi2pk, gsi2sk = :gsi2sk, updatedAt = :now",
      ExpressionAttributeValues: {
        ":gsi2pk": { S: `PHONE#${normalizedPhone}` },
        ":gsi2sk": { S: `ADMIN#${adminSub}` },
        ":now":    { S: new Date().toISOString() },
      },
    }));
    console.log(`📌 Phone routing record written | ${normalizedPhone} → ${adminSub}`);
  } catch (err: any) {
    // Non-blocking — routing record is a cache, not a hard dependency.
    console.warn(`⚠️ Could not write phone routing record: ${err.message}`);
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

      // ── Tier 0: contextWamid → BROADCAST_RECEIPT lookup ─────────────────
      // User explicitly "swipe-replied" to a broadcast message. The wamid of
      // that broadcast message is in msg.context.id — look up the receipt.
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

      // ── Tier 1: button payload _ADMIN# suffix ────────────────────────────
      // Flow / quick-reply buttons embed the adminSub in the payload string.
      if (!adminSub && adminSubFromPayload) {
        adminSub = adminSubFromPayload;
        console.log(`🎯 Tier 1 resolved via button payload: ${adminSub}`);
      }

      // ── Tier 2: display-phone → WHATSAPP_MAPPING record ─────────────────
      // Requires a WHATSAPP_MAPPING record written by admin setup (optional).
      // Tries both raw and +prefix variants of the display phone number.
      if (!adminSub && displayPhone) {
        const displayVariants = [
          displayPhone,
          `+${displayPhone.replace('+', '')}`,
          displayPhone.replace('+', ''),
        ];
        for (const variant of displayVariants) {
          const resolved = await resolveAdminFromDisplayPhone(variant);
          if (resolved) {
            adminSub = resolved;
            console.log(`🎯 Tier 2a resolved via display phone mapping (${variant}): ${adminSub}`);
            break;
          }
        }
      }

      // ── Tier 2b: senderPhone → MEMBER record via GSI2 routing record ─────
      // This is the fast-path written by writePhoneRoutingRecord() after the
      // first successful message from this member.
      if (!adminSub) {
        const resolved = await resolveAdminFromSenderPhone(senderPhone);
        if (resolved) {
          adminSub = resolved;
          console.log(`🎯 Tier 2b resolved via GSI2 phone routing record: ${adminSub}`);
        }
      }

      // ── Tier 3: senderPhone → GSI2 phone-to-tenant index ───────────────
      // Queries gsi2pk = "PHONE#<senderPhone>" on the GSI2 index.
      // BROADCAST_RECEIPT records are stamped with this key by the outbound
      // processor at send time — so this works from the very first reply,
      // with no env var, no hardcoded SUB, and no redeployment needed when
      // a new club joins the platform.
      if (!adminSub) {
        const resolved = await resolveAdminFromSenderPhone(senderPhone);
        if (resolved) {
          adminSub = resolved;
          console.log(`🎯 Tier 3 resolved via GSI2 phone-to-tenant index: ${adminSub}`);
        }
      }

      if (!adminSub) {
        console.error(
          `❌ adminSub resolution exhausted all tiers | ` +
          `msgType=${msgType} | contextWamid=${contextWamid ?? "none"} | ` +
          `displayPhone=${displayPhone} | senderPhone=${senderPhone} | ` +
          `messageText="${messageText.substring(0, 80)}" | ` +
          `HINT: Ensure the outbound processor has sent at least one broadcast to this member — ` +
          `GSI2 routing is stamped automatically on send. No env var or redeployment needed.`
        );
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

      // Write GSI2 phone routing record so Tier 2b works on next free-text message.
      // Fire-and-forget (non-blocking) — SQS enqueue does not wait for this.
      void writePhoneRoutingRecord(adminSub, senderPhone);

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