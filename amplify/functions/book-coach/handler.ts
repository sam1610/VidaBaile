import type { Handler } from 'aws-lambda';

const TABLE_NAME = process.env['TABLE_NAME'];
if (!TABLE_NAME) {
  throw new Error('CONFIG_ERROR: TABLE_NAME environment variable is required but not set');
}

export const handler: Handler = async (_event) => {
  // TODO: BOOK_COACH intent implementation
  // - GetItem: verify coach exists (PK=COACH#<coachId>, SK=PROFILE)
  // - GetItem: verify member exists (PK=MEMBER#<memberId>, SK=PROFILE)
  // - Query GSI1: check coach schedule availability (GSI1PK=DATE#<date>)
  // - PutItem: create new booking (PK=BOOKING#<bookingId>, SK=DETAIL)
  return { statusCode: 200 };
};
