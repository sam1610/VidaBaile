import type { Handler } from 'aws-lambda';

const PINPOINT_SECRET_ARN = process.env['PINPOINT_SECRET_ARN'];
if (!PINPOINT_SECRET_ARN) {
  throw new Error(
    'CONFIG_ERROR: PINPOINT_SECRET_ARN environment variable is required but not set',
  );
}

export const handler: Handler = async (_event) => {
  // TODO: Admin-triggered broadcast implementation
  // - GetSecretValue: retrieve Pinpoint credentials via PINPOINT_SECRET_ARN
  //   — never read credentials from env or source files
  // - mobiletargeting:SendMessages: send broadcast to target segment,
  //   scoped to the Pinpoint application ARN defined at deploy time
  // No DynamoDB access.
  return { statusCode: 200 };
};
