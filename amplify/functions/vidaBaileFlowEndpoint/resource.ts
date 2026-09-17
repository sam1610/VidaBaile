import { defineFunction,secret } from '@aws-amplify/backend';

export const vidaBaileFlowEndpoint = defineFunction({
  name: 'vidaBaileFlowEndpoint',
  entry: './handler.ts',
  timeoutSeconds: 15,
  environment: {
    // This injects the secure parameter into process.env.FLOW_PRIVATE_KEY
    FLOW_PRIVATE_KEY: secret('FLOW_PRIVATE_KEY'),
    // Note: TABLE_NAME will be passed dynamically from backend.ts
  },
  // We will need to configure Function URL mapping in backend.ts
});