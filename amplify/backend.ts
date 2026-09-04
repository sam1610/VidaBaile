import { defineBackend } from '@aws-amplify/backend';
import { Effect, PolicyStatement } from 'aws-cdk-lib/aws-iam';
import { Function as LambdaFunction } from 'aws-cdk-lib/aws-lambda';
import { Fn } from 'aws-cdk-lib';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { whatsappWebhookFn } from './functions/whatsapp-webhook/resource';
import { strandsAgentFn } from './functions/strands-agent/resource';
import { bookCoachFn } from './functions/book-coach/resource';
import { payPackageFn } from './functions/pay-package/resource';
import { postponeSessionFn } from './functions/postpone-session/resource';
import { queryMembershipFn } from './functions/query-membership/resource';
import { broadcastMarketingFn } from './functions/broadcast-marketing/resource';

export const backend = defineBackend({
  auth,
  data,
  whatsappWebhookFn,
  strandsAgentFn,
  bookCoachFn,
  payPackageFn,
  postponeSessionFn,
  queryMembershipFn,
  broadcastMarketingFn,
});

// ── Cognito password policy override ────────────────────────────────────────
// defineAuth does not expose passwordPolicy directly — override via CDK escape
// hatch to satisfy Requirement 4.5.
const { cfnUserPool } = backend.auth.resources.cfnResources;
cfnUserPool.addPropertyOverride('Policies.PasswordPolicy', {
  MinimumLength: 8,
  
  RequireLowercase: true,
  RequireUppercase: true,
  RequireNumbers: true,
  RequireSymbols: true,
});

// ── Resolve shared ARN tokens ────────────────────────────────────────────────
// All ARNs are stack-scoped CDK token references — never hardcoded values.
// They are resolved at CloudFormation synthesis / deploy time.
// Use Fn.sub() to defer token resolution until synthesis time.

// Get region and account from the AppSync API ARN (which is a token)
const appSyncArn = backend.data.resources.graphqlApi.arn;

// DancingClubData table ARN and GSI1 ARN (using Fn.sub for deferred resolution)
// Format: arn:aws:dynamodb:REGION:ACCOUNT:table/DancingClubData
const tableArn = Fn.sub('arn:aws:dynamodb:${AWS::Region}:${AWS::AccountId}:table/DancingClubData');
const gsi1Arn = Fn.sub('${TableArn}/index/GSI1', { TableArn: tableArn });

// Secret ARNs (also using Fn.sub for consistency)
const whatsappSecretArn = Fn.sub('arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:vidabaile/whatsapp-token*');
const paymentSecretArn = Fn.sub('arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:vidabaile/payment-credentials*');
const pinpointSecretArn = Fn.sub('arn:aws:secretsmanager:${AWS::Region}:${AWS::AccountId}:secret:vidabaile/pinpoint-credentials*');
const pinpointAppArn = Fn.sub('arn:aws:mobiletargeting:${AWS::Region}:${AWS::AccountId}:apps/*');

// Bedrock foundation model ARNs
const bedrockNovaProArn = Fn.sub('arn:aws:bedrock:${AWS::Region}::foundation-model/amazon.nova-pro-v1:0');
const bedrockNovaMicroArn = Fn.sub('arn:aws:bedrock:${AWS::Region}::foundation-model/amazon.nova-micro-v1:0');

// ── 3.1 whatsapp-webhook: secretsmanager:GetSecretValue ─────────────────────
// Requirement: 12.1, 12.3
backend.whatsappWebhookFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['secretsmanager:GetSecretValue'],
    resources: [whatsappSecretArn.toString()],
  }),
);

(backend.whatsappWebhookFn.resources.lambda as LambdaFunction).addEnvironment(
  'WHATSAPP_TOKEN_SECRET_ARN',
  whatsappSecretArn.toString(),
);

// ── 3.2 strands-agent: bedrock:InvokeModel + appsync:GraphQL ────────────────
// No DynamoDB access — agent calls AppSync, not DynamoDB directly.
// Requirements: 3.8, 12.1
backend.strandsAgentFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['bedrock:InvokeModel'],
    resources: [
      bedrockNovaProArn.toString(),
      bedrockNovaMicroArn.toString(),
    ],
  }),
);

backend.strandsAgentFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['appsync:GraphQL'],
    resources: [Fn.sub('${AppSyncArn}/*', { AppSyncArn: appSyncArn }).toString()],
  }),
);

// ── 3.3 book-coach: DynamoDB (GetItem/PutItem/UpdateItem/Query) + AppSync ───
// Requirements: 3.8, 12.1, 12.2
backend.bookCoachFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:Query',
    ],
    resources: [tableArn.toString(), gsi1Arn.toString()],
  }),
);

backend.bookCoachFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['appsync:GraphQL'],
    resources: [Fn.sub('${AppSyncArn}/*', { AppSyncArn: appSyncArn }).toString()],
  }),
);

// ── 3.4 pay-package: DynamoDB + AppSync + secretsmanager ────────────────────
// Requirements: 3.8, 12.1, 12.3
backend.payPackageFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:GetItem',
      'dynamodb:PutItem',
      'dynamodb:UpdateItem',
      'dynamodb:Query',
    ],
    resources: [tableArn.toString(), gsi1Arn.toString()],
  }),
);

backend.payPackageFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['appsync:GraphQL'],
    resources: [Fn.sub('${AppSyncArn}/*', { AppSyncArn: appSyncArn }).toString()],
  }),
);

backend.payPackageFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['secretsmanager:GetSecretValue'],
    resources: [paymentSecretArn.toString()],
  }),
);

(backend.payPackageFn.resources.lambda as LambdaFunction).addEnvironment(
  'PAYMENT_SECRET_ARN',
  paymentSecretArn.toString(),
);

// ── 3.5 postpone-session: DynamoDB (GetItem/UpdateItem/Query) + AppSync ─────
// Requirements: 3.8, 12.1
backend.postponeSessionFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:GetItem',
      'dynamodb:UpdateItem',
      'dynamodb:Query',
    ],
    resources: [tableArn.toString(), gsi1Arn.toString()],
  }),
);

backend.postponeSessionFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['appsync:GraphQL'],
    resources: [Fn.sub('${AppSyncArn}/*', { AppSyncArn: appSyncArn }).toString()],
  }),
);

// ── 3.6 query-membership: DynamoDB (GetItem/Query only) + AppSync ────────────
// Read-only DynamoDB access — no PutItem or UpdateItem. Requirements: 3.8, 12.1
backend.queryMembershipFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: [
      'dynamodb:GetItem',
      'dynamodb:Query',
    ],
    resources: [tableArn.toString(), gsi1Arn.toString()],
  }),
);

backend.queryMembershipFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['appsync:GraphQL'],
    resources: [Fn.sub('${AppSyncArn}/*', { AppSyncArn: appSyncArn }).toString()],
  }),
);

// ── 3.7 broadcast-marketing: Pinpoint SendMessages + secretsmanager ─────────
// No DynamoDB access. Requirements: 3.8, 12.1, 12.3
backend.broadcastMarketingFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['mobiletargeting:SendMessages'],
    resources: [pinpointAppArn.toString()],
  }),
);

backend.broadcastMarketingFn.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    effect: Effect.ALLOW,
    actions: ['secretsmanager:GetSecretValue'],
    resources: [pinpointSecretArn.toString()],
  }),
);

(backend.broadcastMarketingFn.resources.lambda as LambdaFunction).addEnvironment(
  'PINPOINT_SECRET_ARN',
  pinpointSecretArn.toString(),
);


// ── Tasks 6.1 / 6.2 / 6.3 — DynamoDB Single-Table Design (CDK escape hatch) ─
//
// IMPORTANT: Amplify Gen 2 creates one physical DynamoDB table per model by
// default.  The overrides below align their configuration (billing, PITR, GSI1)
// with the STD contract defined in the architectural spec.
//
// ⚠️  CURRENT LIMITATION: each model still maps to its OWN CloudFormation
// AWS::DynamoDB::Table resource — they do NOT share a single physical table.
// CloudFormation will reject a deployment where two resources in the SAME stack
// try to create tables with the same physical name. A true single physical table
// (one CloudFormation resource, all six entity PK/SK patterns co-located)
// requires defining the table in `amplify/custom/` using a CDK construct and
// wiring the six Lambda functions to that single resource ARN.
// That refactoring is the intended next step.
//
// For now this block establishes the correct billing, PITR, and GSI1
// configuration on every model-scoped table resource so that each one is
// individually spec-compliant.
//
// Requirements: 11.2, 11.3, 11.4, 11.5

const MODEL_NAMES = [
  'Member',
  'Coach',
  'Schedule',
  'Booking',
  'MemberPackage',
  'Claim',
] as const;

const { cfnTables } = backend.data.resources.cfnResources;

// Guard: only apply overrides if cfnTables exists (not in test env)
if (cfnTables) {
  for (const modelName of MODEL_NAMES) {
    const cfnTable = cfnTables[modelName];
    if (!cfnTable) continue;

    // ── 6.2 Billing mode + PITR ───────────────────────────────────────────────
    // Requirements: 11.2, 11.4, 11.5
    cfnTable.addPropertyOverride('BillingMode', 'PAY_PER_REQUEST');
    cfnTable.addPropertyOverride('PointInTimeRecoverySpecification', {
      PointInTimeRecoveryEnabled: true,
    });

    // ── 6.3 Attribute definitions for GSI1 keys ───────────────────────────────
    // Amplify generates PK (HASH) and SK (RANGE) attribute definitions as type S.
    // We append GSI1PK and GSI1SK here so the table recognises them as index keys.
    // The full AttributeDefinitions array is set explicitly to avoid duplicates:
    //   id   → Amplify's auto-generated partition key (type S)
    //   PK, SK → overloaded STD keys (type S)
    //   GSI1PK, GSI1SK → secondary-index keys (type S)
    // Requirements: 11.2, 11.3
    cfnTable.addPropertyOverride('AttributeDefinitions', [
      { AttributeName: 'id', AttributeType: 'S' },
      { AttributeName: 'GSI1PK', AttributeType: 'S' },
      { AttributeName: 'GSI1SK', AttributeType: 'S' },
    ]);

    // ── 6.3 GSI1 global secondary index ──────────────────────────────────────
    // Requirements: 11.2, 11.3
    cfnTable.addPropertyOverride('GlobalSecondaryIndexes', [
      {
        IndexName: 'GSI1',
        KeySchema: [
          { AttributeName: 'GSI1PK', KeyType: 'HASH' },
          { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
        ],
        Projection: {
          ProjectionType: 'ALL',
        },
      },
    ]);
  }
}
