import { beforeAll } from 'vitest';

// Set up context for Amplify backend initialization BEFORE any Amplify module is imported
beforeAll(() => {
  if (!process.env.CDK_CONTEXT_JSON) {
    process.env.CDK_CONTEXT_JSON = JSON.stringify({
      'amplify-backend-namespace': 'vidabaile',
      'amplify-backend-name': 'backend',
      'amplify-backend-type': 'sandbox',
    });
  }
});
