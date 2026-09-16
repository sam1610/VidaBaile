import { defineFunction } from '@aws-amplify/backend';

export const vidaBaileFlowEndpoint = defineFunction({
  name: 'vidaBaileFlowEndpoint',
  entry: './handler.ts',
  timeoutSeconds: 15,
  // We will need to configure Function URL mapping in backend.ts
});