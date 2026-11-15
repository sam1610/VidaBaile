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
    // Stored as a secret so it can be rotated per-environment without redeployment.
    // Set via: npx ampx sandbox secret set WHATSAPP_FLOW_ID
    // Current value: 1122104134028730
    WHATSAPP_FLOW_ID:  secret('WHATSAPP_FLOW_ID'),
    // CTA button label shown on the interactive flow message (non-sensitive).
    WHATSAPP_FLOW_CTA: 'View Packages',
  },
});
