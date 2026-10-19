import { defineFunction,secret } from '@aws-amplify/backend';

export const vidaBaileFlowEndpoint = defineFunction({
  name: 'vidaBaileFlowEndpoint',
  entry: './handler.ts',
  timeoutSeconds: 15,
  environment: {
    // This injects the secure parameter into process.env.FLOW_PRIVATE_KEY
    FLOW_PRIVATE_KEY: secret('FLOW_PRIVATE_KEY'),
    DEFAULT_ADMIN_SUB: 'c4e87408-4081-70a9-2b30-b0917d8c3d5d',
    // Note: TABLE_NAME will be passed dynamically from backend.ts
  },
});