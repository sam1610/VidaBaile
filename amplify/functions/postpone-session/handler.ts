import type { Handler } from 'aws-lambda';

const TABLE_NAME = process.env['TABLE_NAME'];
if (!TABLE_NAME) {
  throw new Error('CONFIG_ERROR: TABLE_NAME environment variable is required but not set');
}

export const handler: Handler = async (_event) => {
  // TODO: POSTPONE_SESSION intent implementation
  // - GetItem: verify booking exists (PK=BOOKING#<bookingId>, SK=DETAIL)
  // - Query GSI1: list available schedule slots (GSI1PK=DATE#<newDate>)
  // - UpdateItem: update booking with new scheduleId
  return { statusCode: 200 };
};
