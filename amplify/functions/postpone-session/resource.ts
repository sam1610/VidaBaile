import { defineFunction } from '@aws-amplify/backend';

/**
 * POSTPONE_SESSION intent handler.
 * Finds an alternative schedule slot and updates the existing booking.
 *
 * IAM grants (dynamodb:GetItem/UpdateItem/Query + appsync:GraphQL)
 * are wired in amplify/backend.ts.
 * Requirements: 3.8, 12.1
 */
export const postponeSessionFn = defineFunction({
  name: 'postpone-session',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 30,
  resourceGroupName: 'data',
  environment: {
    TABLE_NAME: 'DancingClubData',
  },
});
