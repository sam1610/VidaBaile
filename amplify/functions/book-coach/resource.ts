import { defineFunction } from '@aws-amplify/backend';

/**
 * BOOK_COACH intent handler.
 * Verifies coach and member exist, checks schedule availability, creates booking.
 *
 * IAM grants (dynamodb:GetItem/PutItem/UpdateItem/Query + appsync:GraphQL)
 * are wired in amplify/backend.ts.
 * Requirements: 3.8, 12.1, 12.2
 */
export const bookCoachFn = defineFunction({
  name: 'book-coach',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 30,
  resourceGroupName: 'data',
  environment: {
    TABLE_NAME: 'DancingClubData',
  },
});
