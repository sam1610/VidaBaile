import type { Handler } from 'aws-lambda';

const TABLE_NAME = process.env['TABLE_NAME'];
if (!TABLE_NAME) {
  throw new Error('CONFIG_ERROR: TABLE_NAME environment variable is required but not set');
}

export const handler: Handler = async (_event) => {
  // TODO: QUERY_MEMBERSHIP intent implementation
  // - GetItem: retrieve member profile (PK=MEMBER#<memberId>, SK=PROFILE)
  // - Query GSI1: list active packages (GSI1PK=MEMBER#<memberId>)
  // - Query GSI1: list booking history (GSI1PK=MEMBER#<memberId>)
  return { statusCode: 200 };
};
