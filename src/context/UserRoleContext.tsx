import { createContext, useContext } from 'react';

export type UserRole = 'admin' | 'coach';

export interface UserRoleContextValue {
  userRole:  UserRole;
  /** Cognito sub of the logged-in user (coach's own sub when role === 'coach'). */
  coachId:   string;
  /**
   * Cognito sub that owns the DancingClubData partition — always the admin's
   * sub.  For admins this equals coachId; for coaches this is the admin sub
   * resolved from the PROFILE record so every service call hits the right pk.
   */
  adminSub:  string;
}

export const UserRoleContext = createContext<UserRoleContextValue>({
  userRole:  'admin',
  coachId:   '',
  adminSub:  '',
});

export function useUserRole(): UserRoleContextValue {
  return useContext(UserRoleContext);
}
