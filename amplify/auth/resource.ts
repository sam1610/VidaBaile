import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: true,
  },
  groups: ['Admins'],
  // passwordPolicy is applied via CDK escape hatch in backend.ts
  // because defineAuth does not expose a passwordPolicy prop in this version
});
