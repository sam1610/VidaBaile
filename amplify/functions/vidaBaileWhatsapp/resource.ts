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
    WHATSAPP_PHONE_ID: secret('WHATSAPP_PHONE_ID'),
  },
});
