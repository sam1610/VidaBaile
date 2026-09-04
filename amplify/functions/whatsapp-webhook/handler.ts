import type { APIGatewayProxyHandlerV2 } from 'aws-lambda';

/**
 * Cold-start guard: WHATSAPP_TOKEN_SECRET_ARN must be set before the handler
 * is exported. If absent, Lambda aborts during initialisation — no partial
 * execution occurs.
 * Requirement 12.4.
 */
const SECRET_ARN = process.env['WHATSAPP_TOKEN_SECRET_ARN'];
if (!SECRET_ARN) {
  throw new Error(
    'CONFIG_ERROR: WHATSAPP_TOKEN_SECRET_ARN environment variable is required but not set',
  );
}

export const handler: APIGatewayProxyHandlerV2 = async (_event) => {
  // TODO: Validate Meta webhook signature (X-Hub-Signature-256) using
  //       the token retrieved from Secrets Manager via SECRET_ARN.
  // TODO: Parse message body, sender phone number, timestamp.
  // TODO: Forward to strands-agent Lambda for intent classification.
  return {
    statusCode: 200,
    body: JSON.stringify({ message: 'OK' }),
  };
};
