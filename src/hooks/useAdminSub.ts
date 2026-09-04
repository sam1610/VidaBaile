import { useEffect, useState } from 'react';
import { fetchUserAttributes } from 'aws-amplify/auth';

/**
 * CUSTOM HOOK: useAdminSub
 *
 * Fetches the logged-in admin's Cognito SUB on component mount.
 * The SUB is the partition key (pk) for all DynamoDB queries.
 *
 * USAGE:
 *   const { adminSub, loading, error } = useAdminSub();
 *   if (loading) return <div>Loading...</div>;
 *   if (error) return <div>Error: {error.message}</div>;
 *   
 *   // Now safe to use adminSub in queries
 *   const members = await client.models.ClubRecord.listByGsi1({
 *     gsi1pk: `${adminSub}#MEMBERS`
 *   });
 *
 * GUARANTEES:
 * - SUB is fetched once on mount and cached
 * - Loading state prevents child components from querying until SUB is ready
 * - Error state captures auth failures (e.g., user not logged in)
 */
export function useAdminSub() {
  const [adminSub, setAdminSub] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function getAdminSub() {
      try {
        setLoading(true);
        const attributes = await fetchUserAttributes();
        
        if (!isMounted) return;

        const sub = attributes?.sub;
        if (!sub) {
          throw new Error('Admin SUB not found in user attributes');
        }

        setAdminSub(sub);
        setError(null);
      } catch (err) {
        if (!isMounted) return;
        
        const error = err instanceof Error ? err : new Error(String(err));
        console.error('Failed to fetch admin SUB:', error);
        setError(error);
        setAdminSub(null);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    getAdminSub();

    return () => {
      isMounted = false;
    };
  }, []);

  return { adminSub, loading, error };
}
