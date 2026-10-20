import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['admin', 'coach'],
  userAttributes: {
    // Define the custom attribute to link coaches to their admin
    'custom:adminSub': {
      dataType: 'String',
      mutable: true,
      maxLen: 50,
    },
  },
});