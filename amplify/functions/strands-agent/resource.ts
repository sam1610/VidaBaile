import { defineFunction } from '@aws-amplify/backend';

/**
 * Strands SDK agent runtime function.
 * Classifies WhatsApp message intent and executes the appropriate MCP tool.
 * No DynamoDB access — calls AppSync, which resolves to DynamoDB.
 *
 * IAM grants (bedrock:InvokeModel, appsync:GraphQL) are wired in amplify/backend.ts.
 * Requirements: 3.8, 12.1
 */
export const strandsAgentFn = defineFunction({
  name: 'strands-agent',
  entry: './handler.ts',
  runtime: 20,
  timeoutSeconds: 60,resourceGroupName: 'data',
  environment: {
    BEDROCK_MODEL_ID: 'amazon.nova-pro-v1:0',
  },
});
