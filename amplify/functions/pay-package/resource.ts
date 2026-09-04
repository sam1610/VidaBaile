import { defineFunction } from '@aws-amplify/backend';

/**
 * PAY_PACKAGE intent handler.
 * Creates or renews a membership package for a member and records payment.
 *
 * IAM grants (dynamodb:GetItem/PutItem/UpdateItem/Query + appsync:GraphQL +
 * secretsmanager:GetSecretValue) are wired in amplify/backend.ts.
 * Requirements: 3.8, 12.1, 12.3
 */
export const payPackageFn = defineFunction({
  name: 'pay-package',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 30,
  resourceGroupName: 'data',
  environment: {
    TABLE_NAME: 'DancingClubData',
  },
});
