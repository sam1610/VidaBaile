import { defineBackend } from '@aws-amplify/backend';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { Rule, Schedule } from 'aws-cdk-lib/aws-events';
import { LambdaFunction as EventsLambdaTarget } from 'aws-cdk-lib/aws-events-targets';
import { SqsEventSource } from 'aws-cdk-lib/aws-lambda-event-sources';
import { Queue } from 'aws-cdk-lib/aws-sqs';
import { Fn } from 'aws-cdk-lib';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { vidaBaileWhatsapp } from './functions/vidaBaileWhatsapp/resource';
import { vidaBailePayPackage } from './functions/vidaBailePayPackage/resource';
import { vidaBaileChatAgent } from './functions/vidaBaileChatAgent/resource';
import { vidaBaileProcessOutboundQueue } from './functions/vidaBaileProcessOutboundQueue/resource';
import { vidaBaileDispatchBroadcast } from './functions/vidaBaileDispatchBroadcast/resource';
import { vidaBaileCampaignScheduler } from './functions/vidaBaileCampaignScheduler/resource';

export const backend = defineBackend({
  auth,
  data,
  vidaBaileWhatsapp,
  vidaBailePayPackage,
  vidaBaileChatAgent,
  vidaBaileProcessOutboundQueue,
  vidaBaileDispatchBroadcast,
  vidaBaileCampaignScheduler,
});

// ── Cognito password policy override ────────────────────────────────────────
const { cfnUserPool } = backend.auth.resources.cfnResources;
cfnUserPool.addPropertyOverride('Policies.PasswordPolicy', {
  MinimumLength: 8,
  RequireLowercase: true,
  RequireUppercase: true,
  RequireNumbers: true,
  RequireSymbols: true,
});

// ─────────────────────────────────────────────────────────────────────────────
// CRITICAL: DynamoDB Table & SQS Queue Configuration
// ─────────────────────────────────────────────────────────────────────────────
// All Lambda functions target the VidaBaile ClubRecord table.
// Single-Table Design (STD):
//   - pk: adminSub (Cognito SUB, multi-tenant partition)
//   - sk: MEMBER#<phone>, BROADCAST#<id>, BROADCAST#<id>#MEMBER#<phone>
//   - gsi1pk / gsi1sk: Reverse lookups, cross-entity queries
//   - gsi2pk / gsi2sk: Temporal and relational queries
//
// SQS queues (inbound-chat-queue, outbound-broadcast-queue) are preserved.
// ─────────────────────────────────────────────────────────────────────────────

// Dynamic table reference from AppSync data resources
const clubRecordTable = backend.data.resources.tables['ClubRecord'];
const CLUBRECORD_TABLE_ARN = clubRecordTable.tableArn;
const CLUBRECORD_GSI1_ARN = Fn.sub('${TableArn}/index/clubRecordsByGsi1pkAndGsi1sk', {
  TableArn: CLUBRECORD_TABLE_ARN,
});
const CLUBRECORD_GSI2_ARN = Fn.sub('${TableArn}/index/clubRecordsByGsi2pkAndGsi2sk', {
  TableArn: CLUBRECORD_TABLE_ARN,
});

// Bedrock ARNs — Nova Pro (primary reply) + Nova Micro (analysis, per architecture steering doc)
const bedrockClaudeArn = Fn.sub(
  'arn:aws:bedrock:${AWS::Region}::foundation-model/amazon.nova-pro-v1:0'
);
const bedrockNovaMicroArn = Fn.sub(
  'arn:aws:bedrock:${AWS::Region}::foundation-model/amazon.nova-micro-v1:0'
);

// SQS Queue ARNs (preserved from existing topology)
const inboundChatQueueArn = Fn.sub(
  'arn:aws:sqs:${AWS::Region}:${AWS::AccountId}:inbound-chat-queue'
);
const outboundBroadcastQueueArn = Fn.sub(
  'arn:aws:sqs:${AWS::Region}:${AWS::AccountId}:outbound-broadcast-queue'
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION A: AppSync Tool Functions (DynamoDB ClubRecord table)
// ─────────────────────────────────────────────────────────────────────────────

// ── A.1 vidaBailePayPackage: DynamoDB GetItem/PutItem/UpdateItem/Query ─────────
backend.vidaBailePayPackage.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:Query',
    ],
    resources: [
      CLUBRECORD_TABLE_ARN.toString(),
      CLUBRECORD_GSI1_ARN.toString(),
      CLUBRECORD_GSI2_ARN.toString(),
    ],
  }),
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION B: WhatsApp Lambda Functions (ClubRecord table + SQS)
// ─────────────────────────────────────────────────────────────────────────────
// All handlers target the VidaBaile ClubRecord table.
// TABLE_NAME injected as environment variable via clubRecordTable.tableName.
// IAM grants ClubRecord table + gsi1pk-gsi1sk-index + gsi2pk-gsi2sk-index.
// SQS event sources wired with CDK SqsEventSource.
// ─────────────────────────────────────────────────────────────────────────────

// ── B.1 vidaBaileWhatsapp: DynamoDB (ClubRecord) + SQS SendMessage ─────────────
backend.vidaBaileWhatsapp.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
      'dynamodb:Query',
      'dynamodb:PutItem',
    ],
    resources: [
      CLUBRECORD_TABLE_ARN.toString(),
      CLUBRECORD_GSI1_ARN.toString(),
      CLUBRECORD_GSI2_ARN.toString(),
    ],
  }),
);

backend.vidaBaileWhatsapp.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['sqs:SendMessage'],
    resources: [inboundChatQueueArn.toString()],
  }),
);

(backend.vidaBaileWhatsapp.resources.lambda as LambdaFunction).addEnvironment(
  'TABLE_NAME',
  clubRecordTable.tableName
);
(backend.vidaBaileWhatsapp.resources.lambda as LambdaFunction).addEnvironment(
  'INBOUND_CHAT_QUEUE_URL',
  Fn.sub('https://sqs.${AWS::Region}.amazonaws.com/${AWS::AccountId}/inbound-chat-queue')
);

// ── B.2 vidaBaileChatAgent: DynamoDB (ClubRecord) + SQS Receive + Bedrock ──────
backend.vidaBaileChatAgent.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
      'dynamodb:Query',
      'dynamodb:PutItem',
    ],
    resources: [
      CLUBRECORD_TABLE_ARN.toString(),
      CLUBRECORD_GSI1_ARN.toString(),
      CLUBRECORD_GSI2_ARN.toString(),
    ],
  }),
);

backend.vidaBaileChatAgent.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage'],
    resources: [inboundChatQueueArn.toString()],
  }),
);

backend.vidaBaileChatAgent.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['bedrock:InvokeModel'],
    resources: [
      bedrockClaudeArn.toString(),      // Nova Pro — primary conversational reply
      bedrockNovaMicroArn.toString(),   // Nova Micro — lightweight analysis call
    ],
  }),
);

(backend.vidaBaileChatAgent.resources.lambda as LambdaFunction).addEnvironment(
  'TABLE_NAME',
  clubRecordTable.tableName
);

// ── B.3 vidaBaileProcessOutboundQueue: DynamoDB (ClubRecord) + SQS Receive ─────
backend.vidaBaileProcessOutboundQueue.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:GetItem',
    ],
    resources: [
      CLUBRECORD_TABLE_ARN.toString(),
      CLUBRECORD_GSI1_ARN.toString(),
      CLUBRECORD_GSI2_ARN.toString(),
    ],
  }),
);

backend.vidaBaileProcessOutboundQueue.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['sqs:ReceiveMessage', 'sqs:DeleteMessage'],
    resources: [outboundBroadcastQueueArn.toString()],
  }),
);

(backend.vidaBaileProcessOutboundQueue.resources.lambda as LambdaFunction).addEnvironment(
  'TABLE_NAME',
  clubRecordTable.tableName
);

// ── B.4 vidaBaileDispatchBroadcast: DynamoDB (ClubRecord) + SQS SendMessageBatch
backend.vidaBaileDispatchBroadcast.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:Query',
      'dynamodb:PutItem',
      'dynamodb:GetItem',
    ],
    resources: [
      CLUBRECORD_TABLE_ARN.toString(),
      CLUBRECORD_GSI1_ARN.toString(),
      CLUBRECORD_GSI2_ARN.toString(),
    ],
  }),
);

backend.vidaBaileDispatchBroadcast.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'sqs:SendMessage',
      'sqs:SendMessageBatch',
    ],
    resources: [outboundBroadcastQueueArn.toString()],
  }),
);

(backend.vidaBaileDispatchBroadcast.resources.lambda as LambdaFunction).addEnvironment(
  'TABLE_NAME',
  clubRecordTable.tableName
);
(backend.vidaBaileDispatchBroadcast.resources.lambda as LambdaFunction).addEnvironment(
  'OUTBOUND_QUEUE_URL',
  Fn.sub('https://sqs.${AWS::Region}.amazonaws.com/${AWS::AccountId}/outbound-broadcast-queue')
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION C: SQS Event Source Wiring
// ─────────────────────────────────────────────────────────────────────────────
// Wire existing SQS queues to their Lambda handlers.
// ─────────────────────────────────────────────────────────────────────────────

// ── C.1 inbound-chat-queue → vidaBaileChatAgent (batchSize=1) ─────────────────
// Process one message at a time to preserve per-member Bedrock context.
const inboundQueue = Queue.fromQueueArn(
  backend.stack,
  'InboundChatQueueRef',
  inboundChatQueueArn.toString()
);

(backend.vidaBaileChatAgent.resources.lambda as LambdaFunction).addEventSource(
  new SqsEventSource(inboundQueue, {
    batchSize: 1,
  })
);

// ── C.2 outbound-broadcast-queue → vidaBaileProcessOutboundQueue (batchSize=10)
// Batch delivery for high-volume broadcast sends.
const outboundQueue = Queue.fromQueueArn(
  backend.stack,
  'OutboundBroadcastQueueRef',
  outboundBroadcastQueueArn.toString()
);

(backend.vidaBaileProcessOutboundQueue.resources.lambda as LambdaFunction).addEventSource(
  new SqsEventSource(outboundQueue, {
    batchSize: 10,
  })
);

// ─────────────────────────────────────────────────────────────────────────────
// SECTION D: Campaign Scheduler (EventBridge 1-minute CRON + Lambda IAM)
// ─────────────────────────────────────────────────────────────────────────────
// Polls every 1 minute for BROADCAST records with:
//   status = SCHEDULED  and  launchDateTime <= now
// For each match: atomically marks RUNNING, then async-invokes
// vidaBaileDispatchBroadcast (InvocationType: Event) so enqueuing happens
// independently.  Handler timeout is 55 s — well within the 1-minute window.
// ─────────────────────────────────────────────────────────────────────────────

const schedulerFn = backend.vidaBaileCampaignScheduler.resources.lambda as LambdaFunction;
const dispatchFn  = backend.vidaBaileDispatchBroadcast.resources.lambda as LambdaFunction;

// ── D.1 DynamoDB: Query (GSI2 range) + UpdateItem (conditional RUNNING/COMPLETED)
backend.vidaBaileCampaignScheduler.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:Query',
      'dynamodb:UpdateItem',
    ],
    resources: [
      CLUBRECORD_TABLE_ARN.toString(),
      CLUBRECORD_GSI2_ARN.toString(), // gsi2pk=ALL#BROADCASTS, gsi2sk<=LAUNCH#<now>
    ],
  }),
);

// ── D.2 Lambda: async invoke permission targeting dispatchBroadcast explicitly
backend.vidaBaileCampaignScheduler.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['lambda:InvokeFunction'],
    resources: [dispatchFn.functionArn],
  }),
);

// ── D.3 Environment variables injected at deploy time
schedulerFn.addEnvironment('TABLE_NAME',            clubRecordTable.tableName);
schedulerFn.addEnvironment('DISPATCH_FUNCTION_ARN', dispatchFn.functionArn);

// ── D.4 EventBridge rule: rate(1 minute)
new Rule(backend.stack, 'CampaignSchedulerRule', {
  schedule: Schedule.expression('rate(1 minute)'),
  targets:  [new EventsLambdaTarget(schedulerFn)],
  description: 'Triggers vidaBaileCampaignScheduler every minute to fire due broadcast campaigns',
});
