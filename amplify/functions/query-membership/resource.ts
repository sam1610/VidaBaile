import { defineFunction } from '@aws-amplify/backend';

/**
 * QUERY_MEMBERSHIP intent handler.
 * Returns member profile, active packages, and booking history.
 *
 * IAM grants (dynamodb:GetItem/Query + appsync:GraphQL)
 * are wired in amplify/backend.ts.
 * Requirements: 3.8, 12.1
 */
export const queryMembershipFn = defineFunction({
  name: 'query-membership',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 30,
  resourceGroupName: 'data',
  environment: {
    TABLE_NAME: 'DancingClubData',
  },
});
