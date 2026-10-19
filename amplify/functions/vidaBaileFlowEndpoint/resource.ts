import { defineFunction,secret } from '@aws-amplify/backend';

export const vidaBaileFlowEndpoint = defineFunction({
  name: 'vidaBaileFlowEndpoint',
  entry: './handler.ts',
  timeoutSeconds: 15,
  environment: {
    // This injects the secure parameter into process.env.FLOW_PRIVATE_KEY
    FLOW_PRIVATE_KEY: secret('FLOW_PRIVATE_KEY'),
    DEFAULT_ADMIN_SUB: '2498f418-50c1-705f-652c-af1373291b84',
    // Note: TABLE_NAME will be passed dynamically from backend.ts
  },
});