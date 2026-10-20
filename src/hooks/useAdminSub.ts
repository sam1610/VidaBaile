import { useEffect, useState } from 'react';
import { fetchUserAttributes } from 'aws-amplify/auth';
import { useUserRole } from '../context/UserRoleContext';

/**
 * CUSTOM HOOK: useAdminSub
 *
 * Returns the Cognito sub that owns the DancingClubData partition — i.e. the
 * admin's sub.  All DynamoDB queries must use this value as their pk.
 *
 * Behaviour by role
 * -----------------
 * admin : fetches the logged-in user's own sub via fetchUserAttributes (same
 *         as before).
 * coach : reads adminSub from UserRoleContext, which was resolved in App.tsx
 *         by looking up the single PROFILE record (entityType='PROFILE').
 *         This guarantees coaches query the admin's partition, not their own,
 *         so studio branding and all data lookups work correctly.
 *
 * USAGE
 *   const { adminSub, loading, error } = useAdminSub();
 */
export function useAdminSub() {
  const { userRole, adminSub: contextAdminSub } = useUserRole();

  const [adminSub, setAdminSub] = useState<string | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<Error | null>(null);

  useEffect(() => {
    // ── Coach path ────────────────────────────────────────────────────────────
    // adminSub is already resolved in App.tsx from the PROFILE record.
    // Wait for it to become non-empty (App.tsx makes an async lookup).
    if (userRole === 'coach') {
      if (contextAdminSub) {
        setAdminSub(contextAdminSub);
        setLoading(false);
        setError(null);
      } else {
        // Context hasn't resolved yet — keep loading.
        setLoading(true);
      }
      return;
    }

    // ── Admin path ────────────────────────────────────────────────────────────
    let isMounted = true;

    async function getAdminSub() {
      try {
        setLoading(true);
        const attributes = await fetchUserAttributes();
        if (!isMounted) return;

        const sub = attributes?.sub;
        if (!sub) throw new Error('Admin SUB not found in user attributes');

        setAdminSub(sub);
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        const e = err instanceof Error ? err : new Error(String(err));
        console.error('[useAdminSub] Failed to fetch admin SUB:', e);
        setError(e);
        setAdminSub(null);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    getAdminSub();
    return () => { isMounted = false; };
  }, [userRole, contextAdminSub]);

  return { adminSub, loading, error };
}
