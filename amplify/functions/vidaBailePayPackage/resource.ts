import { defineFunction } from '@aws-amplify/backend';

/**
 * PAY_PACKAGE intent handler.
 * Creates or renews a membership package for a member and records payment.
 *
 * IAM grants (dynamodb:GetItem/PutItem/UpdateItem/Query) are wired in amplify/backend.ts.
 * TABLE_NAME is injected by backend.ts at deploy time.
 * PAYMENT_SECRET_ARN: the ARN of the Secrets Manager secret holding payment credentials.
 *   - Set this to the real ARN in backend.ts via addEnvironment() once the secret is created.
 *   - This is NOT a secret value — it is only an ARN pointer, so secret() is not used here.
 */
export const vidaBailePayPackage = defineFunction({
  name: 'vidaBailePayPackage',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 30,
  resourceGroupName: 'data',
  // PAYMENT_SECRET_ARN is injected by backend.ts (addEnvironment) once the Secrets Manager
  // secret ARN is known. Do not hardcode ARNs here.
});
