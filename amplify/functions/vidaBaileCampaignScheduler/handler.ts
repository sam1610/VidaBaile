/**
 * vidaBaileCampaignScheduler Lambda
 *
 * Triggered every 1 minute via Amplify Gen 2 schedule trigger (EventBridge).
 *
 * Algorithm:
 *   1. Query DynamoDB GSI2 for BROADCAST records where:
 *        gsi2pk = "ALL#BROADCASTS"
 *        gsi2sk <= "LAUNCH#<now-iso>"   (all past/present launch times)
 *      FilterExpression: broadcastStatus = "SCHEDULED"
 *   2. For each due campaign, atomically mark it RUNNING (conditional update
 *      prevents duplicate execution on concurrent ticks).
 *   3. Invoke vidaBaileDispatchBroadcast asynchronously (InvocationType: Event)
 *      so the scheduler returns immediately without waiting for bulk SQS enqueue.
 *
 * GSI2 key patterns (written by DatabaseService.createCampaign):
 *   gsi2pk: "ALL#BROADCASTS"
 *   gsi2sk: "LAUNCH#<ISO-datetime>"   e.g. "LAUNCH#2026-09-18T18:32:00.000Z"
 */

import {
  DynamoDBClient,
  QueryCommand,
  UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import {
  LambdaClient,
  InvokeCommand,
  InvocationType,
} from "@aws-sdk/client-lambda";

const ddb    = new DynamoDBClient({});
const lambda = new LambdaClient({});

const TABLE_NAME            = process.env.TABLE_NAME!;
const DISPATCH_FUNCTION_ARN = process.env.DISPATCH_FUNCTION_ARN!;

// ────────────────────────────────────────────────────────────────────────────
// Query due campaigns: gsi2pk = ALL#BROADCASTS, gsi2sk <= LAUNCH#<now>
// FilterExpression keeps only SCHEDULED items (avoids re-firing RUNNING/COMPLETED)
// ────────────────────────────────────────────────────────────────────────────
async function queryDueCampaigns(): Promise<any[]> {
  const nowIso = new Date().toISOString();
  const allItems: any[] = [];
  let lastKey: any = undefined;

  try {
    do {
      const res = await ddb.send(
        new QueryCommand({
          TableName:              TABLE_NAME,
          IndexName:              "clubRecordsByGsi2pkAndGsi2sk",
          KeyConditionExpression: "gsi2pk = :gsi2pk AND gsi2sk <= :gsi2sk",
          FilterExpression:       "broadcastStatus = :scheduled",
          ExpressionAttributeValues: {
            ":gsi2pk":    { S: "ALL#BROADCASTS" },
            ":gsi2sk":    { S: `LAUNCH#${nowIso}` },
            ":scheduled": { S: "SCHEDULED" },
          },
          ExclusiveStartKey: lastKey,
        })
      );

      allItems.push(...(res.Items ?? []));
      lastKey = res.LastEvaluatedKey;
    } while (lastKey);

    console.log(`🔍 Found ${allItems.length} due campaign(s)`);
    return allItems;
  } catch (err: any) {
    console.error("❌ queryDueCampaigns error:", err.message);
    return [];
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Atomically transition SCHEDULED → RUNNING
// ConditionalCheckFailedException = another tick claimed it first — safe to skip
// ────────────────────────────────────────────────────────────────────────────
async function markCampaignRunning(adminSub: string, sk: string): Promise<void> {
  await ddb.send(
    new UpdateItemCommand({
      TableName:           TABLE_NAME,
      Key:                 { pk: { S: adminSub }, sk: { S: sk } },
      UpdateExpression:    "SET broadcastStatus = :running, updatedAt = :now",
      ConditionExpression: "broadcastStatus = :scheduled",
      ExpressionAttributeValues: {
        ":running":   { S: "RUNNING" },
        ":scheduled": { S: "SCHEDULED" },
        ":now":       { S: new Date().toISOString() },
      },
    })
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Mark campaign COMPLETED (called after async dispatch is confirmed in-flight)
// ────────────────────────────────────────────────────────────────────────────
async function markCampaignCompleted(adminSub: string, sk: string): Promise<void> {
  await ddb.send(
    new UpdateItemCommand({
      TableName:        TABLE_NAME,
      Key:              { pk: { S: adminSub }, sk: { S: sk } },
      UpdateExpression: "SET broadcastStatus = :done, updatedAt = :now",
      ExpressionAttributeValues: {
        ":done": { S: "COMPLETED" },
        ":now":  { S: new Date().toISOString() },
      },
    })
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Invoke vidaBaileDispatchBroadcast (async — InvocationType: Event)
//
// Dispatch handler reads: event.arguments.input
// Required fields: adminSub, templateName, broadcastType, promotionalContent
// Optional fields: campaignId, packageIntent, targetingOptions
//
// targetingOptions is stored as JSON string in DynamoDB — parse it here so
// dispatch receives a plain object it can destructure directly.
// ────────────────────────────────────────────────────────────────────────────
async function invokeDispatch(campaign: any): Promise<void> {
  const adminSub   = campaign.pk?.S ?? "";
  const campaignId = campaign.sk?.S?.replace("BROADCAST#", "") ?? "";
  const rawTargeting = campaign.targetingOptions?.S;
  const targeting = rawTargeting ? (() => {
    try { return JSON.parse(rawTargeting); } catch { return {}; }
  })() : {};

  // templateName falls back to broadcastType, then "promo_offer"
  const templateName      = campaign.broadcastType?.S ?? "promo_offer";
  const broadcastType     = campaign.broadcastType?.S ?? "promo_offer";
  const promotionalContent = campaign.promotionalContent?.S ?? "";
  const packageIntent     = campaign.packageRef?.S ?? "";

  const payload = {
    arguments: {
      input: {
        adminSub,
        campaignId,          // scheduler-set; dispatch skips generating a new broadcastId
        templateName,
        broadcastType,
        promotionalContent,
        packageIntent,
        targetingOptions: targeting,
      },
    },
  };

  console.log(`🚀 Invoking dispatch for campaign ${campaignId} (admin: ${adminSub})`);

  await lambda.send(
    new InvokeCommand({
      FunctionName:   DISPATCH_FUNCTION_ARN,
      InvocationType: InvocationType.Event, // async — scheduler does not wait
      Payload:        Buffer.from(JSON.stringify(payload)),
    })
  );
  // With Event invocation, StatusCode 202 = accepted; no Payload to parse
  console.log(`📨 Dispatch invoked asynchronously for campaign ${campaignId}`);
}

// ────────────────────────────────────────────────────────────────────────────
// Main Handler (EventBridge scheduled trigger)
// ────────────────────────────────────────────────────────────────────────────
export const handler = async (_event: any): Promise<{ processed: number; skipped: number; errors: number }> => {
  console.log("⏰ Campaign scheduler tick —", new Date().toISOString());

  const campaigns = await queryDueCampaigns();
  if (campaigns.length === 0) {
    console.log("ℹ️  No campaigns due this tick");
    return { processed: 0, skipped: 0, errors: 0 };
  }

  let processed = 0;
  let skipped   = 0;
  let errors    = 0;

  for (const campaign of campaigns) {
    const adminSub = campaign.pk?.S ?? "";
    const sk       = campaign.sk?.S ?? "";

    if (!adminSub || !sk) {
      console.warn("⚠️  Skipping campaign with missing pk/sk");
      skipped++;
      continue;
    }

    try {
      // Step 1: atomic SCHEDULED → RUNNING (prevents duplicate execution)
      await markCampaignRunning(adminSub, sk);
      console.log(`🟡 ${sk} → RUNNING`);

      // Step 2: fire-and-forget dispatch (async Lambda invocation)
      await invokeDispatch(campaign);

      // Step 3: mark COMPLETED — delivery tracking via BROADCAST_RECEIPT records
      await markCampaignCompleted(adminSub, sk);
      console.log(`✅ ${sk} → COMPLETED`);
      processed++;
    } catch (err: any) {
      if (err.name === "ConditionalCheckFailedException") {
        // Another scheduler tick already claimed this campaign — safe to skip
        console.log(`⏭️  ${sk} already claimed by concurrent tick — skipping`);
        skipped++;
      } else {
        console.error(`❌ ${sk} failed:`, err.message);
        errors++;
      }
    }
  }

  console.log(`📊 Tick complete: processed=${processed} skipped=${skipped} errors=${errors}`);
  return { processed, skipped, errors };
};
