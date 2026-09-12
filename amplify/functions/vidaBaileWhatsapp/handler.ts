/**
 * whatsappWebhook Lambda — VidaBaile Dance Club Message Handler
 *
 * Webhook receiver for Meta WhatsApp Business API.
 * Routes inbound messages to the InboundChatQueue for AI processing.
 * Updates BROADCAST_RECEIPT ledger records for delivery/read status.
 *
 * Admin Resolution Strategy (3-tier cascade):
 *   1. Button payload embeds adminSub directly (fastest path for templated replies)
 *   2. Reverse lookup: gsi1pk = "PHONE#<displayPhone>" → query ClubRecord for admin PROFILE
 *   3. Fallback: Log warning and skip if unresolvable
 *
 * Status Receipts (from Meta):
 *   - Extract wamid (messageId) and status ("delivered", "read", "failed")
 *   - Query GSI1: gsi1pk = "MSG#<wamid>" to find BROADCAST_RECEIPT
 *   - Update deliveryStatus and readAt timestamp
 *
 * Inbound Messages:
 *   - If user replied to a broadcast message (context.id = wamid):
 *     Query GSI1 to find receipt and set hasReplied = true
 */

import {
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  SQSClient,
  SendMessageCommand,
} from "@aws-sdk/client-sqs";
import { createHmac } from "crypto";

const ddb = new DynamoDBClient({});
const sqs = new SQSClient({});

const TABLE_NAME         = process.env.TABLE_NAME!;
const INBOUND_CHAT_QUEUE = process.env.INBOUND_CHAT_QUEUE_URL!;
const VERIFY_TOKEN       = process.env.META_VERIFY_TOKEN!;
const META_APP_SECRET    = process.env.META_APP_SECRET!;

// ── Webhook Signature Validation ──────────────────────────────────────────
function validateMetaSignature(
  body: string,
  xHubSignature256: string | undefined
): boolean {
  if (!META_APP_SECRET || !xHubSignature256) return false;

  const hash = createHmac("sha256", META_APP_SECRET)
    .update(body)
    .digest("hex");
  const expectedSignature = `sha256=${hash}`;

  return xHubSignature256 === expectedSignature;
}

// ── Reverse Lookup: Display Phone → Admin SUB ────────────────────────────
async function resolveAdminFromDisplayPhone(
  displayPhone: string
): Promise<string | null> {
  if (!displayPhone) return null;

  try {
    const queryRes = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "clubRecordsByGsi1pkAndGsi1sk",
        KeyConditionExpression: "gsi1pk = :gsi1pk AND begins_with(gsi1sk, :prefix)",
        ExpressionAttributeValues: {
          ":gsi1pk": { S: `PHONE#${displayPhone}` },
          ":prefix": { S: "PROFILE" },
        },
        Limit: 1,
      })
    );

    if (queryRes.Items?.length) {
      const adminSub = queryRes.Items[0].pk?.S ?? "";
      console.log(`📱 Resolved display_phone ${displayPhone} → admin ${adminSub}`);
      return adminSub;
    }
  } catch (err: any) {
    console.warn(`⚠️ Admin lookup error for ${displayPhone}:`, err.message);
  }
  return null;
}

// ── Query BROADCAST_RECEIPT by WAMID ──────────────────────────────────────
// Find the receipt record using gsi1pk = "MSG#<wamid>"
async function findBroadcastReceiptByWamid(
  wamid: string
): Promise<{
  adminSub: string;
  sk: string;
  deliveryStatus?: string;
} | null> {
  try {
    const queryRes = await ddb.send(
      new QueryCommand({
        TableName: TABLE_NAME,
        IndexName: "clubRecordsByGsi1pkAndGsi1sk",
        KeyConditionExpression: "gsi1pk = :gsi1pk",
        ExpressionAttributeValues: {
          ":gsi1pk": { S: `MSG#${wamid}` },
        },
        Limit: 1,
      })
    );

    if (queryRes.Items?.length) {
      const item = queryRes.Items[0];
      return {
        adminSub: item.pk?.S ?? "",
        sk: item.sk?.S ?? "",
        deliveryStatus: item.deliveryStatus?.S,
      };
    }
  } catch (err: any) {
    console.warn(`⚠️ Failed to query receipt for WAMID ${wamid}:`, err.message);
  }
  return null;
}

// ── Update BROADCAST_RECEIPT Status ───────────────────────────────────────
async function updateBroadcastReceiptStatus(
  adminSub: string,
  sk: string,
  status: string,
  additionalUpdates?: Record<string, any>
): Promise<void> {
  try {
    let updateExpression = "SET deliveryStatus = :status, updatedAt = :now";
    const expressionValues: any = {
      ":status": { S: status },
      ":now": { S: new Date().toISOString() },
    };

    if (additionalUpdates) {
      for (const [key, value] of Object.entries(additionalUpdates)) {
        updateExpression += `, ${key} = :${key}`;
        if (typeof value === "boolean") {
          expressionValues[`:${key}`] = { BOOL: value };
        } else if (typeof value === "string") {
          expressionValues[`:${key}`] = { S: value };
        }
      }
    }

    await ddb.send(
      new UpdateItemCommand({
        TableName: TABLE_NAME,
        Key: {
          pk: { S: adminSub },
          sk: { S: sk },
        },
        UpdateExpression: updateExpression,
        ExpressionAttributeValues: expressionValues,
      })
    );
    console.log(`📋 Updated receipt: ${sk} → ${status}`);
  } catch (err: any) {
    console.warn(`⚠️ Failed to update receipt: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────────────────

export const handler = async (event: any) => {
  console.log("🔥 Webhook event received");

  // ── Meta Webhook Verification (GET) ──────────────────────────────────────
  if (event.requestContext?.http?.method === "GET") {
    const q = event.queryStringParameters || {};
    if (q["hub.mode"] === "subscribe" && q["hub.verify_token"] === VERIFY_TOKEN) {
      console.log("✅ Webhook verification challenge accepted");
      return { statusCode: 200, body: q["hub.challenge"] };
    }
    console.warn("❌ Webhook verification failed");
    return { statusCode: 403, body: "Forbidden" };
  }

  try {
    const bodyStr = event.body || "{}";

    // Validate Meta signature
    const xHubSig = event.headers?.["x-hub-signature-256"];
    if (!validateMetaSignature(bodyStr, xHubSig)) {
      console.warn("❌ Invalid Meta webhook signature");
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

    // ────────────────────────────────────────────────────────────────────────
    // A. Status Receipts (delivered, read, failed)
    // ────────────────────────────────────────────────────────────────────────
    if (value.statuses) {
      const status = value.statuses[0];
      const wamid = status.id;
      const newStatus = status.status; // "delivered", "read", "failed"

      console.log(
        `📍 Status: WAMID ${wamid} → ${newStatus}`
      );

      // Find receipt by WAMID (GSI1 lookup)
      const receipt = await findBroadcastReceiptByWamid(wamid);
      if (receipt) {
        const updates: Record<string, any> = {};
        if (newStatus === "read") {
          updates.readAt = new Date().toISOString();
          updates.isRead = true; // schema: a.boolean() on BROADCAST_RECEIPT
        }
        await updateBroadcastReceiptStatus(receipt.adminSub, receipt.sk, newStatus, updates);
      } else {
        console.log(`ℹ️ No receipt found for WAMID: ${wamid} (likely non-broadcast message)`);
      }
    }

    // ────────────────────────────────────────────────────────────────────────
    // B. Inbound Messages
    // ────────────────────────────────────────────────────────────────────────
    if (value.messages) {
      const msg = value.messages[0];
      const senderPhone = msg.from;
      const msgType = msg.type as string;
      const contextWamid = msg.context?.id; // If user replied to a broadcast

      // ── Normalize message text ────────────────────────────────────────────
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

      // ── Parse button intents ──────────────────────────────────────────────
      let bookingIntent = "";
      let packageIntent = "";
      let campaignId    = ""; // Extracted from BUY_PACKAGE_..._CAMP#<id>_ADMIN#<sub>
      let adminSubFromPayload = "";

      if (buttonPayload.startsWith("BOOK_CLASS_")) {
        const parts = buttonPayload.replace("BOOK_CLASS_", "").split("_ADMIN#");
        bookingIntent = parts[0] || "";
        adminSubFromPayload = parts[1] || "";
      } else if (buttonPayload.startsWith("BUY_PACKAGE_")) {
        // Payload format: BUY_PACKAGE_<packageId>_CAMP#<campaignId>_ADMIN#<adminSub>
        const withoutPrefix = buttonPayload.replace("BUY_PACKAGE_", "");
        const adminParts    = withoutPrefix.split("_ADMIN#");
        adminSubFromPayload = adminParts[1] || "";
        const beforeAdmin   = adminParts[0]; // e.g. "<packageId>_CAMP#<campaignId>"
        const campParts     = beforeAdmin.split("_CAMP#");
        packageIntent       = campParts[0] || "";
        campaignId          = campParts[1] || "";
      }

      // ── Resolve adminSub (3-tier cascade) ────────────────────────────────
      // Tier 0: contextWamid (free-text reply to a broadcast)
      //   → query BROADCAST_RECEIPT by MSG#<wamid> → receipt.pk IS the adminSub.
      //   This is the most reliable path for members replying without button payload.
      // Tier 1: button payload (BUY_PACKAGE_ / BOOK_CLASS_ embeds adminSub directly)
      // Tier 2: reverse phone lookup (PHONE#<displayPhone> GSI1 query)
      let adminSub = "";

      if (!adminSub && contextWamid) {
        const receipt = await findBroadcastReceiptByWamid(contextWamid);
        if (receipt?.adminSub) {
          adminSub = receipt.adminSub;
          console.log(`🎯 Tier 0 resolved via contextWamid receipt: ${adminSub}`);
        }
      }

      if (!adminSub && adminSubFromPayload) {
        adminSub = adminSubFromPayload;
        console.log(`🎯 Tier 1 resolved via button payload: ${adminSub}`);
      }

      if (!adminSub && displayPhone) {
        const resolved = await resolveAdminFromDisplayPhone(displayPhone);
        if (resolved) {
          adminSub = resolved;
          console.log(`🎯 Tier 2 resolved via display phone: ${adminSub}`);
        }
      }

      if (!adminSub) {
        console.warn(
          `⚠️ Cannot resolve adminSub for phone "${displayPhone}" ` +
          `(contextWamid=${contextWamid ?? "none"}). ` +
          `Ensure the WhatsApp business phone is registered in Settings.`
        );
        return { statusCode: 200, body: "OK" };
      }

      // ── Mark BROADCAST_RECEIPT as replied when user replies to broadcast ───
      // Use a fresh lookup (Tier 0 may have used a local variable out of scope here).
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
      // ── Update member interaction state ──────────────────────────────────
      const memberSk = `MEMBER#${senderPhone}`;
      try {
        await ddb.send(
          new UpdateItemCommand({
            TableName: TABLE_NAME,
            Key: { pk: { S: adminSub }, sk: { S: memberSk } },
            // hasReplied: member sent a reply (schema: a.boolean() on MEMBER record)
            UpdateExpression:
              "SET lastInteractionAt = :now, hasReplied = :true, updatedAt = :now",
            ExpressionAttributeValues: {
              ":now": { S: new Date().toISOString() },
              ":true": { BOOL: true },
            },
          })
        );
      } catch (err: any) {
        console.warn(`⚠️ Failed to update member record: ${err.message}`);
      }
      // ── Enqueue to InboundChatQueue ──────────────────────────────────────
      await sqs.send(
        new SendMessageCommand({
          QueueUrl: INBOUND_CHAT_QUEUE,
          MessageBody: JSON.stringify({
            adminSub,
            senderPhone,
            messageText,
            bookingIntent:  bookingIntent  || null,
            packageIntent:  packageIntent  || null,
            campaignId:     campaignId     || null, // chatAgent uses this to fetch campaign KB
            contextWamid:   contextWamid   || null,
          }),
        })
      );

      console.log(
        `📨 [${msgType}] Queued: "${messageText.substring(0, 50)}" ` +
        `from ${senderPhone} to chatAgent`
      );
    }

    return { statusCode: 200, body: "OK" };
  } catch (err: any) {
    console.error("❌ Webhook error:", err.message);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
