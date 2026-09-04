import { defineFunction } from '@aws-amplify/backend';

/**
 * WhatsApp webhook ingestion function.
 * Receives inbound webhook POST events from Meta, validates the
 * X-Hub-Signature-256 header, and forwards to the Strands agent.
 *
 * IAM grants (secretsmanager:GetSecretValue) are wired in amplify/backend.ts.
 * Requirements: 3.8, 12.1, 12.3, 12.4
 */
export const whatsappWebhookFn = defineFunction({
  name: 'whatsapp-webhook',
  entry: './handler.ts',
  resourceGroupName: 'data',
  runtime: 20,
  timeoutSeconds: 30,
});
