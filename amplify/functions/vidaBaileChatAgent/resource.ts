import { defineFunction, secret } from '@aws-amplify/backend';

export const vidaBaileChatAgent = defineFunction({
  name: 'vidaBaileChatAgent',
  entry: './handler.ts',
  runtime: 20,
  // 60s: Bedrock InvokeModel + DynamoDB reads + WhatsApp send reply
  // InboundChatQueue visibility timeout (90s) > this (60s) — AWS constraint satisfied
  timeoutSeconds: 60,
  memoryMB: 256,
  environment: {
    // WhatsApp credentials needed to send the AI reply back to the member
    WHATSAPP_ACCESS_TOKEN: secret('WHATSAPP_ACCESS_TOKEN'),
    WHATSAPP_PHONE_ID:     secret('WHATSAPP_PHONE_ID'),
  },
});
