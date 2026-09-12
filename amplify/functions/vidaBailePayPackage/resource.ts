import { defineFunction } from '@aws-amplify/backend';

/**
 * PAY_PACKAGE intent handler.
 * Creates or renews a membership package for a member and records payment.
 *
 * IAM grants (dynamodb:GetItem/PutItem/UpdateItem/Query) are wired in amplify/backend.ts.
 */
export const vidaBailePayPackage = defineFunction({
  name: 'vidaBailePayPackage',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 30,
  resourceGroupName: 'data',
});
