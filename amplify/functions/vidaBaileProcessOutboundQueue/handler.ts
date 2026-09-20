/**
 * vidaBaileProcessOutboundQueue Lambda
 *
 * Consumes messages from OutboundBroadcastQueue.
 * Sends each message to the Meta WhatsApp Cloud API, then creates a
 * BROADCAST_RECEIPT record in DynamoDB for delivery tracking.
 *
 * SQS payload contract (written by vidaBaileDispatchBroadcast):
 *   adminSub           — required: BROADCAST_RECEIPT pk
 *   broadcastId        — required: BROADCAST_RECEIPT sk prefix
 *   campaignId         — same value as broadcastId; embedded in button payload for chatAgent
 *   recipientPhone     — required: message destination + sk suffix (E.164 with +)
 *   recipientName      — display name
 *   templateName       — "promo_offer" | plain text fallback
 *   promotionalContent — message body
 *   packageIntent      — package ID for button payload routing
 *
 * BROADCAST_RECEIPT key pattern:
 *   pk:     adminSub
 *   sk:     BROADCAST#<broadcastId>#MEMBER#<recipientPhone>
 *   gsi1pk: MSG#<wamid>   (for webhook delivery-status routing)
 *   gsi1sk: WEBHOOK
 */

import { DynamoDBClient, PutItemCommand } from "@aws-sdk/client-dynamodb";

const ddb = new DynamoDBClient({});

const TABLE_NAME        = process.env.TABLE_NAME!;
const META_ACCESS_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN!;
const PHONE_NUMBER_ID   = process.env.WHATSAPP_PHONE_ID!;
const FLOW_ID           = process.env.WHATSAPP_FLOW_ID ?? "";
const FLOW_CTA          = process.env.WHATSAPP_FLOW_CTA ?? "View Packages";

export const handler = async (event: any) => {
  console.log("📨 Processing outbound broadcast queue");

  const batchItemFailures: Array<{ itemIdentifier: string }> = [];

  for (const record of event.Records) {
    try {
      // ── 1. Parse SQS body ───────────────────────────────────────────────
      const messageBody = JSON.parse(record.body);

      const adminSub:           string | undefined = messageBody.adminSub;
      const broadcastId:        string | undefined = messageBody.broadcastId;
      const campaignId:         string             = messageBody.campaignId ?? broadcastId ?? "";
      const recipientPhone:     string | undefined = messageBody.recipientPhone;
      const recipientName:      string             = messageBody.recipientName      ?? "Dancer";
      const templateName:       string             = messageBody.templateName       ?? "promo_offer";
      const promotionalContent: string             = messageBody.promotionalContent ?? "";
      const packageIntent:      string             = messageBody.packageIntent      ?? "";

      // ── 2. Pre-flight validation — fail fast before any external call ───
      if (!adminSub || !broadcastId || !recipientPhone) {
        const missing = [
          !adminSub       && "adminSub",
          !broadcastId    && "broadcastId",
          !recipientPhone && "recipientPhone",
        ].filter(Boolean).join(", ");
        throw new Error(`Missing required SQS payload fields: ${missing}`);
      }

      // ── 3. Build WhatsApp payload ────────────────────────────────────────
      // Meta requires the phone number without the leading '+'.
      const targetNumber = recipientPhone.replace(/^\+/, "");

      let metaPayload: object;

      if (templateName === "promo_offer") {
        // Use interactive/flow message type so the physical WhatsApp client
        // receives flow_action + flow_action_payload and fires the INIT request.
        // Meta template messages do NOT support these fields (returns HTTP 400).
        // Guard: FLOW_ID must be set before sending an interactive flow message
        if (!FLOW_ID) {
          throw new Error("WHATSAPP_FLOW_ID environment variable is not set — cannot send interactive flow message");
        }

        metaPayload = {
          messaging_product: "whatsapp",
          recipient_type:    "individual",
          to:                targetNumber,
          type:              "interactive",
          interactive: {
            type: "flow",
            header: {
              type: "text",
              text:  "VidaBaile — Exclusive Offer",
            },
            body: {
              text: promotionalContent || "We have a special package waiting for you. Tap below to explore!",
            },
            footer: {
              text: "Reply STOP to unsubscribe",
            },
            action: {
              name: "flow",
              parameters: {
                flow_message_version: "3",
                flow_token:           `BUY_PACKAGE_${packageIntent}_CAMP#${campaignId}_ADMIN#${adminSub}`,
                flow_id:              FLOW_ID,
                flow_cta:             FLOW_CTA,
                mode:                 "published",
                // data_exchange instructs the physical WhatsApp client to immediately
                // call our endpoint with action:"INIT" when the button is tapped.
                // "navigate" does NOT trigger a server call — it just opens the screen statically.
                flow_action:          "data_exchange",
                // flow_action_payload must NOT be set when flow_action is "data_exchange"
              },
            },
          },
        };
      } else {
        metaPayload = {
          messaging_product: "whatsapp",
          recipient_type:    "individual",
          to:                targetNumber,
          type:              "text",
          text: { body: promotionalContent || "Hello from VidaBaile!" },
        };
      }

      console.log(`📤 Payload type: ${ (metaPayload as any).type } | FLOW_ID: ${FLOW_ID} | templateName: ${templateName}`);

      // ── 4. Send via Meta WhatsApp Cloud API ──────────────────────────────
      const response = await fetch(
        `https://graph.facebook.com/v20.0/${PHONE_NUMBER_ID}/messages`,
        {
          method:  "POST",
          headers: {
            Authorization:  `Bearer ${META_ACCESS_TOKEN}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(metaPayload),
        }
      );

      const metaData: any = await response.json();
      if (!response.ok) {
        // Log the full error body so error_data.details is visible in CloudWatch
        console.error(`❌ Meta API full error:`, JSON.stringify(metaData));
        throw new Error(
          `Meta API error (${response.status}): ${metaData.error?.message ?? JSON.stringify(metaData)}`
        );
      }

      const wamid: string | undefined = metaData.messages?.[0]?.id;
      if (!wamid) {
        throw new Error("Meta API returned success but no message ID in response");
      }
      console.log(`✅ Sent to ${recipientPhone} (WAMID: ${wamid})`);

      // ── 5. Create BROADCAST_RECEIPT ledger record ────────────────────────
      // recipientPhone stored with '+' so webhook reverse-lookup matches exactly.
      const receiptPk = adminSub;
      const receiptSk = `BROADCAST#${broadcastId}#MEMBER#${recipientPhone}`;
      const now       = new Date().toISOString();

      await ddb.send(
        new PutItemCommand({
          TableName: TABLE_NAME,
          Item: {
            pk:                { S: receiptPk },
            sk:                { S: receiptSk },
            entityType:        { S: "BROADCAST_RECEIPT" },
            gsi1pk:            { S: `MSG#${wamid}` },
            gsi1sk:            { S: "WEBHOOK" },
            deliveryStatus:    { S: "SENT" },
            hasReplied:        { BOOL: false },
            whatsappMessageId: { S: wamid },
            recipientPhone:    { S: recipientPhone },
            recipientName:     { S: recipientName },
            broadcastId:       { S: broadcastId },
            createdAt:         { S: now },
          },
        })
      );
      console.log(`📋 BROADCAST_RECEIPT created: ${receiptSk} (MSG#${wamid})`);

    } catch (err: any) {
      console.error(`❌ Record ${record.messageId} failed: ${err.message}`);
      batchItemFailures.push({ itemIdentifier: record.messageId });
    }
  }

  const total     = event.Records.length;
  const succeeded = total - batchItemFailures.length;
  console.log(`📊 Batch complete: ${succeeded}/${total} succeeded`);

  return { batchItemFailures };
};
