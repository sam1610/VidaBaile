#!/usr/bin/env npx ts-node

import {
  DynamoDBClient,
  QueryCommand,
  PutItemCommand,
  DeleteItemCommand,
  type DynamoDBClientConfig,
  type QueryCommandInput,
  type AttributeValue,
} from '@aws-sdk/client-dynamodb';

type AttributeMap = Record<string, AttributeValue>;
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

const OLD_ADMIN_SUB = 'b42814e8-1051-70ea-2d3b-7b11284dbbae';
const NEW_ADMIN_SUB = 'c4e87408-4081-70a9-2b30-b0917d8c3d5d';

const tableName = process.env.TABLE_NAME;
if (!tableName) {
  console.error('ERROR: TABLE_NAME environment variable is required');
  console.error('Usage: TABLE_NAME=DancingClubData npx ts-node scripts/migrateAdminSub.ts');
  process.exit(1);
}

const config: DynamoDBClientConfig = {};
if (process.env.AWS_ENDPOINT) {
  config.endpoint = process.env.AWS_ENDPOINT;
}
if (process.env.AWS_REGION) {
  config.region = process.env.AWS_REGION;
}
const client = new DynamoDBClient(config);

async function queryAllItems(pk: string): Promise<AttributeMap[]> {
  const items: AttributeMap[] = [];
  let lastKey: Record<string, any> | undefined;

  do {
    const input: QueryCommandInput = {
      TableName: tableName,
      KeyConditionExpression: 'pk = :pk',
      ExpressionAttributeValues: marshall({ ':pk': pk }),
      ExclusiveStartKey: lastKey,
    };

    const response = await client.send(new QueryCommand(input));
    if (response.Items) {
      items.push(...response.Items);
    }
    lastKey = response.LastEvaluatedKey;
  } while (lastKey);

  return items;
}

function replaceSubInValue(value: any): any {
  if (typeof value === 'string') {
    return value.replace(new RegExp(OLD_ADMIN_SUB, 'g'), NEW_ADMIN_SUB);
  }
  if (Array.isArray(value)) {
    return value.map(replaceSubInValue);
  }
  if (value && typeof value === 'object') {
    const replaced: Record<string, any> = {};
    for (const [key, val] of Object.entries(value)) {
      replaced[key] = replaceSubInValue(val);
    }
    return replaced;
  }
  return value;
}

function transformItem(item: AttributeMap): Record<string, any> {
  const unmarshalled = unmarshall(item);
  const transformed = replaceSubInValue(unmarshalled);
  return transformed;
}

async function migrateItem(item: AttributeMap): Promise<void> {
  const oldKey = { pk: item.pk, sk: item.sk };
  const transformed = transformItem(item);

  await client.send(
    new PutItemCommand({
      TableName: tableName,
      Item: marshall(transformed),
    })
  );
  console.log(`  ✅ Put new item: ${String(item.sk)}`);

  await client.send(
    new DeleteItemCommand({
      TableName: tableName,
      Key: oldKey,
    })
  );
  console.log(`  🗑️  Deleted old item: ${String(item.sk)}`);
}

async function main() {
  console.log(`🔄 Starting migration`);
  console.log(`   Table: ${tableName}`);
  console.log(`   Old SUB: ${OLD_ADMIN_SUB}`);
  console.log(`   New SUB: ${NEW_ADMIN_SUB}`);
  console.log('');

  console.log(`📥 Fetching all items with pk = ${OLD_ADMIN_SUB}...`);
  const items = await queryAllItems(OLD_ADMIN_SUB);
  console.log(`   Found ${items.length} items\n`);

  if (items.length === 0) {
    console.log('⚠️  No items to migrate. Exiting.');
    return;
  }

  let successCount = 0;
  let errorCount = 0;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const sk = item.sk ? String(item.sk.S ?? item.sk.N ?? item.sk) : '(no sk)';
    console.log(`[${i + 1}/${items.length}] Migrating: ${sk}`);

    try {
      await migrateItem(item);
      successCount++;
    } catch (err) {
      errorCount++;
      console.error(`  ❌ Error: ${err instanceof Error ? err.message : err}`);
    }
  }

  console.log('');
  console.log('📊 Migration complete');
  console.log(`   Succeeded: ${successCount}`);
  console.log(`   Failed:    ${errorCount}`);

  if (errorCount > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
