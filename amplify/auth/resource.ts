import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['Admins', 'coach'],  // 'Admins' must match the group name in amplify/data/resource.ts auth rules
  userAttributes: {
    // Define the custom attribute to link coaches to their admin
    'custom:adminSub': {
      dataType: 'String',
      mutable: true,
      maxLen: 50,
    },
  },
});