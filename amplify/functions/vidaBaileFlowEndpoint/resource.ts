import { defineFunction,secret } from '@aws-amplify/backend';

export const vidaBaileFlowEndpoint = defineFunction({
  name: 'vidaBaileFlowEndpoint',
  entry: './handler.ts',
  timeoutSeconds: 15,
  environment: {
    // This injects the secure parameter into process.env.FLOW_PRIVATE_KEY
    FLOW_PRIVATE_KEY: secret('FLOW_PRIVATE_KEY'),
    DEFAULT_ADMIN_SUB: 'b42814e8-1051-70ea-2db3-7b11284dbbae',
    // Note: TABLE_NAME will be passed dynamically from backend.ts
  },
});