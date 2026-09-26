import { defineFunction, secret } from '@aws-amplify/backend';

export const vidaBaileWhatsapp = defineFunction({
  name: 'vidaBaileWhatsapp',
  entry: './handler.ts',
  resourceGroupName: 'data',
  runtime: 20,
  timeoutSeconds: 29,   // Function URL default limit is 29s; webhook must respond quickly
  environment: {
    META_VERIFY_TOKEN:     secret('META_VERIFY_TOKEN'),
    META_APP_SECRET:       secret('META_APP_SECRET'),
    WHATSAPP_ACCESS_TOKEN: secret('WHATSAPP_ACCESS_TOKEN'),
    // Tier 3 fallback: comma-separated Cognito SUBs of all admin accounts.
    // Used when a free-text message arrives with no contextWamid.
    // Set via: npx ampx sandbox secret set ADMIN_SUB_LIST
    // Value format: "sub-aaa-111,sub-bbb-222"
    // Single-tenant shortcut: set DEFAULT_ADMIN_SUB to the single admin SUB.
    ADMIN_SUB_LIST:        secret('ADMIN_SUB_LIST'),
  },
});
