import { createContext, useContext } from 'react';

export type UserRole = 'admin' | 'coach';

export interface UserRoleContextValue {
  userRole: UserRole;
  coachId: string;   // Cognito sub of the logged-in user (used as coachPhone for data filter)
}

export const UserRoleContext = createContext<UserRoleContextValue>({
  userRole: 'admin',
  coachId: '',
});

export function useUserRole(): UserRoleContextValue {
  return useContext(UserRoleContext);
}
