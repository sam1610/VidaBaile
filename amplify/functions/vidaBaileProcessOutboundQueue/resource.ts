import { defineFunction, secret } from '@aws-amplify/backend';

export const vidaBaileProcessOutboundQueue = defineFunction({
  name: 'vidaBaileProcessOutboundQueue',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 60,
  environment: {
    WHATSAPP_ACCESS_TOKEN: secret('WHATSAPP_ACCESS_TOKEN'),
    WHATSAPP_PHONE_ID:     secret('WHATSAPP_PHONE_ID'),
  },
});
