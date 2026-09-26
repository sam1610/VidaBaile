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
    // No ADMIN_SUB_LIST needed. Tenant routing is resolved at runtime from
    // the GSI2 index stamped onto every BROADCAST_RECEIPT by the outbound
    // processor. New clubs self-register automatically on first broadcast.
  },
});
