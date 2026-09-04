import { defineFunction } from '@aws-amplify/backend';

/**
 * Admin-triggered marketing broadcast function.
 * Sends messages to member segments via Amazon Pinpoint.
 * No DynamoDB access.
 *
 * IAM grants (mobiletargeting:SendMessages + secretsmanager:GetSecretValue)
 * are wired in amplify/backend.ts.
 * Requirements: 3.8, 12.1, 12.3
 */
export const broadcastMarketingFn = defineFunction({
  name: 'broadcast-marketing',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 60,
  resourceGroupName: 'data',
});
