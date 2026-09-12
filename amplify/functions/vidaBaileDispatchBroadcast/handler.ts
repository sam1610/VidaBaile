import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
} from "@aws-sdk/client-dynamodb";
import { SQSClient, SendMessageBatchCommand } from "@aws-sdk/client-sqs";

const ddb = new DynamoDBClient({});
const sqs = new SQSClient({});

const TABLE_NAME = process.env.TABLE_NAME!;
const OUTBOUND_QUEUE = process.env.OUTBOUND_QUEUE_URL!;

// ────────────────────────────────────────────────────────────────────────────
// Query Members by Targeting Criteria (With Pagination)
// ────────────────────────────────────────────────────────────────────────────
async function queryTargetMembers(
  adminSub: string,
  options: {
    tier?: string;
    status?: string;
    activePackageOnly?: boolean;
    gender?: string;
  }
): Promise<Array<{ phone: string; name: string; tier: string; status: string }>> {
  const members: Array<{ phone: string; name: string; tier: string; status: string }> = [];
  let lastEvaluatedKey: any = undefined;

  try {
    do {
      const res = await ddb.send(
        new QueryCommand({
          TableName: TABLE_NAME,
          KeyConditionExpression: "pk = :adminSub AND begins_with(sk, :prefix)",
          ExpressionAttributeValues: {
            ":adminSub": { S: adminSub },
            ":prefix": { S: "MEMBER#" },
          },
          ExclusiveStartKey: lastEvaluatedKey,
        })
      );

      for (const item of res.Items ?? []) {
        const phone = item.sk?.S?.replace("MEMBER#", "") ?? "";
        const tier = item.tier?.S ?? "STANDARD";
        const status = item.status?.S ?? "ACTIVE";
        const gender = item.gender?.S?.toUpperCase();
        const activePackages = item.activePackages?.SS ?? [];
        const name = item.displayName?.S ?? item.name?.S ?? "Member";

        if (options.tier && options.tier !== "ALL" && tier !== options.tier) continue;
        if (options.status && options.status !== "ALL" && status !== options.status) continue;
        if (options.gender && options.gender !== "ALL" && gender !== options.gender) continue;
        if (options.activePackageOnly && activePackages.length === 0) continue;

        members.push({ phone, name, tier, status });
      }
      
      lastEvaluatedKey = res.LastEvaluatedKey;
    } while (lastEvaluatedKey);

    console.log(`✅ Targeted ${members.length} members`);
  } catch (err: any) {
    console.error(`❌ Query error: ${err.message}`);
  }

  return members;
}

// ────────────────────────────────────────────────────────────────────────────
// Create BROADCAST Run Record
// ────────────────────────────────────────────────────────────────────────────
async function createBroadcastRecord(
  adminSub: string,
  broadcastId: string,
  options: {
    templateName: string;
    broadcastType: string;
    promotionalContent: string;
    targetingOptions?: any;
    targetMemberCount: number;
    packageIntent?: string;
  }
): Promise<void> {
  try {
    const item: any = {
      pk: { S: adminSub },
      sk: { S: `BROADCAST#${broadcastId}` },
      entityType: { S: "BROADCAST" },
      templateName: { S: options.templateName },
      broadcastType: { S: options.broadcastType },
      promotionalContent: { S: options.promotionalContent },
      targetTier: { S: options.targetingOptions?.tier ?? "ALL" },
      targetStatus: { S: options.targetingOptions?.status ?? "ACTIVE" },
      targetGender: { S: options.targetingOptions?.gender ?? "ALL" },
      targetMemberCount: { N: String(options.targetMemberCount) },
      createdAt: { S: new Date().toISOString() },
      updatedAt: { S: new Date().toISOString() },
    };

    if (options.packageIntent) {
      item.packageIntent = { S: options.packageIntent };
    }

    await ddb.send(new PutItemCommand({ TableName: TABLE_NAME, Item: item }));
    console.log(`📊 Created BROADCAST record: ${adminSub}#BROADCAST#${broadcastId}`);
  } catch (err: any) {
    console.error(`❌ Failed to create BROADCAST record: ${err.message}`);
    throw err;
  }
}

// ────────────────────────────────────────────────────────────────────────────
// Main Handler: AppSync Mutation Trigger
// ────────────────────────────────────────────────────────────────────────────
export const handler = async (event: any) => {
  console.log("📢 Broadcast dispatch triggered");

  try {
    const {
      adminSub,
      campaignId: incomingCampaignId, // set by scheduler; if absent, generate fresh
      templateName,
      broadcastType,
      promotionalContent,
      targetingOptions,
      packageIntent,
    } = event.arguments?.input ?? {};

    // Scheduler passes campaignId (= BROADCAST record sk suffix).
    // Direct Admin UI calls generate a new one here.
    const broadcastId = incomingCampaignId ?? Date.now().toString();

    if (!adminSub || !templateName || !promotionalContent) {
      console.warn("❌ Missing required dispatch parameters", {
        adminSub: !!adminSub,
        templateName: !!templateName,
        promotionalContent: !!promotionalContent,
      });
      return { success: false, error: "Missing parameters" };
    }
    if (!broadcastId) {
      console.warn("❌ broadcastId is undefined — cannot create receipts");
      return { success: false, error: "Missing broadcastId" };
    }

    console.log(`🔑 broadcastId: ${broadcastId}`);

    const targetMembers = await queryTargetMembers(adminSub, {
      tier: targetingOptions?.tier,
      status: targetingOptions?.status ?? "ACTIVE",
      activePackageOnly: targetingOptions?.activePackageOnly,
      gender: targetingOptions?.gender,
    });

    if (targetMembers.length === 0) {
      console.log("ℹ️ No members matched targeting criteria");
      return { success: true, totalQueued: 0, broadcastId };
    }

    await createBroadcastRecord(adminSub, broadcastId, {
      templateName,
      broadcastType,
      promotionalContent,
      targetingOptions,
      targetMemberCount: targetMembers.length,
      packageIntent,
    });

    const batchSize = 10;
    let totalQueued = 0;

    for (let i = 0; i < targetMembers.length; i += batchSize) {
      const batch = targetMembers.slice(i, i + batchSize);
      const entries = batch.map((member, idx) => {
        return {
          Id: String(i + idx),
          MessageBody: JSON.stringify({
            adminSub,                          // required: BROADCAST_RECEIPT pk
            broadcastId,                       // required: BROADCAST_RECEIPT sk prefix
            campaignId: broadcastId,           // chatAgent fetches BROADCAST#campaignId for KB
            recipientPhone: member.phone,
            recipientName: member.name,
            templateName,
            promotionalContent,
            broadcastType,
            packageIntent,
            sendAt: new Date().toISOString(),
          }),
        };
      });

      await sqs.send(
        new SendMessageBatchCommand({
          QueueUrl: OUTBOUND_QUEUE,
          Entries: entries,
        })
      );

      totalQueued += batch.length;
      console.log(`✅ Batch ${Math.floor(i / batchSize) + 1} (${batch.length} messages) queued`);
    }

    console.log(`📊 Total queued: ${totalQueued}`);
    return { success: true, totalQueued, broadcastId };
  } catch (err: any) {
    console.error("❌ Dispatch error:", err.message);
    return { success: false, error: err.message };
  }
};