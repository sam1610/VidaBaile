import { defineFunction, secret } from '@aws-amplify/backend';

export const vidaBaileProcessOutboundQueue = defineFunction({
  name: 'vidaBaileProcessOutboundQueue',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 60,
  environment: {
    WHATSAPP_ACCESS_TOKEN: secret('WHATSAPP_ACCESS_TOKEN'),
    WHATSAPP_PHONE_ID:     secret('WHATSAPP_PHONE_ID'),
    // Meta-assigned Flow ID for the package-selection WhatsApp Flow.
    // Not a secret — visible in the Meta Business dashboard.
    WHATSAPP_FLOW_ID:      '2184446669618705',
    // CTA button label shown on the interactive flow message (default: "View Packages").
    WHATSAPP_FLOW_CTA:      'View Packages',
  },
});
