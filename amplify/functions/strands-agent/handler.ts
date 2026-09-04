import type { Handler } from 'aws-lambda';

/**
 * Cold-start guard: BEDROCK_MODEL_ID must be set.
 * Requirement 12.4.
 */
const BEDROCK_MODEL_ID = process.env['BEDROCK_MODEL_ID'];
if (!BEDROCK_MODEL_ID) {
  throw new Error(
    'CONFIG_ERROR: BEDROCK_MODEL_ID environment variable is required but not set',
  );
}

export const handler: Handler = async (_event) => {
  // TODO: Classify WhatsApp message intent using Amazon Bedrock (BEDROCK_MODEL_ID).
  // TODO: Guard loop — if intent is UNSUPPORTED, send deflection message and
  //       log to DynamoDB for analytics. Do NOT invoke any MCP tool.
  // TODO: Route to MCP tool for BOOK_COACH | PAY_PACKAGE |
  //       POSTPONE_SESSION | QUERY_MEMBERSHIP.
  return { statusCode: 200 };
};
