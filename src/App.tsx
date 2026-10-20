import { useEffect, useRef, useState, createContext, useContext } from 'react';
import { Authenticator, Alert, View } from '@aws-amplify/ui-react';
import { Hub } from 'aws-amplify/utils';
import { signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { AppTabs } from './components/layout/AppTabs';
import type { Schema } from '../amplify/data/resource';
import { UserRoleContext, type UserRole } from './context/UserRoleContext';
import '@aws-amplify/ui-react/styles.css';

// ── Permissions-error context ─────────────────────────────────────────────────
interface PermissionsErrorContextValue {
  reportPermissionsError: () => void;
  clearPermissionsError:  () => void;
}

export const PermissionsErrorContext =
  createContext<PermissionsErrorContextValue>({
    reportPermissionsError: () => undefined,
    clearPermissionsError:  () => undefined,
  });

export function usePermissionsError(): PermissionsErrorContextValue {
  return useContext(PermissionsErrorContext);
}

// ── AppSync client ────────────────────────────────────────────────────────────
const client = generateClient<Schema>();

// ── Role state shape ──────────────────────────────────────────────────────────
interface ResolvedIdentity {
  userRole: UserRole;
  coachId:  string;  // logged-in user's own sub
  adminSub: string;  // partition-owner sub (admin's sub even for coaches)
}

const UNRESOLVED: ResolvedIdentity = { userRole: 'admin', coachId: '', adminSub: '' };

// ── AuthenticatedShell ────────────────────────────────────────────────────────
/**
 * Rendered INSIDE the Authenticator callback so we are guaranteed a live,
 * fully-authenticated session before we touch fetchAuthSession().
 *
 * Pattern taken from reference fdbv_pj/src/App.tsx: derive userGroup from
 * the access-token payload AFTER the Authenticator confirms sign-in, using
 * forceRefresh:true so newly assigned Cognito groups are always visible.
 */
function AuthenticatedShell({
  showPermissionsError,
  onDismissPermissionsError,
}: {
  showPermissionsError: boolean;
  onDismissPermissionsError: () => void;
}): React.ReactElement {
  const [identity, setIdentity] = useState<ResolvedIdentity>(UNRESOLVED);
  // null = not yet resolved; prevents rendering AppTabs with wrong role
  const [resolved, setResolved] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function resolveIdentity() {
      try {
        // forceRefresh: true — same as reference project — guarantees the
        // access token carries the latest Cognito group assignments.
        const session = await fetchAuthSession({ forceRefresh: true });
        const payload = session.tokens?.accessToken?.payload;
        const groups  = (payload?.['cognito:groups'] as string[] | undefined) ?? [];
        const sub     = (payload?.['sub'] as string | undefined) ?? '';

        console.log('[AuthenticatedShell] cognito:groups =', groups, '| sub =', sub);

        const role: UserRole = groups.includes('coach') ? 'coach' : 'admin';

        if (role === 'admin') {
          if (isMounted) {
            setIdentity({ userRole: 'admin', coachId: sub, adminSub: sub });
            setResolved(true);
          }
          return;
        }

        // Coach: locate the admin's PROFILE to get the partition key (pk).
        // The PROFILE record's pk is always the admin's sub.
        let resolvedAdminSub = '';
        try {
          const { data: records } = await client.models.ClubRecord.list({
            filter: { sk: { eq: 'PROFILE' }, entityType: { eq: 'PROFILE' } },
          });
          resolvedAdminSub = records?.[0]?.pk ?? '';
          if (resolvedAdminSub) {
            console.log('[AuthenticatedShell] role=coach | adminSub resolved:', resolvedAdminSub);
          } else {
            console.warn('[AuthenticatedShell] Coach login: PROFILE record not found');
          }
        } catch (lookupErr) {
          console.warn('[AuthenticatedShell] Coach PROFILE lookup failed:', lookupErr);
        }

        if (isMounted) {
          setIdentity({ userRole: 'coach', coachId: sub, adminSub: resolvedAdminSub });
          setResolved(true);
        }
      } catch (err) {
        console.error('[AuthenticatedShell] resolveIdentity failed:', err);
        // On failure keep default admin role so the app doesn't hang.
        if (isMounted) {
          const { userId } = await getCurrentUser().catch(() => ({ userId: '' }));
          setIdentity({ userRole: 'admin', coachId: userId, adminSub: userId });
          setResolved(true);
        }
      }
    }

    resolveIdentity();
    return () => { isMounted = false; };
  }, []); // runs once — Authenticator guarantees this mounts only when signed in

  // ── PROFILE initializer for admins ────────────────────────────────────────
  // Runs only after identity is resolved to avoid creating a PROFILE before
  // we know the user's actual role.
  const [profileReady, setProfileReady] = useState(false);

  useEffect(() => {
    if (!resolved) return;  // wait for identity

    let isMounted = true;

    async function initProfile() {
      try {
        if (identity.userRole === 'coach') {
          // Coaches never own a PROFILE — nothing to create.
          if (isMounted) setProfileReady(true);
          return;
        }

        const { data: profiles } = await client.models.ClubRecord.list({
          filter: { pk: { eq: identity.adminSub }, sk: { eq: 'PROFILE' } },
        });

        if (profiles.length === 0) {
          console.log('[AuthenticatedShell] Creating initial PROFILE for admin…');
          await client.models.ClubRecord.create({
            pk:         identity.adminSub,
            sk:         'PROFILE',
            entityType: 'PROFILE',
            gsi1pk:     `${identity.adminSub}#SETTINGS`,
            gsi1sk:     'PROFILE',
            name:       'New Dance Studio',
          });
        }

        if (isMounted) setProfileReady(true);
      } catch (err) {
        console.error('[AuthenticatedShell] initProfile error:', err);
        if (isMounted) setProfileReady(true); // Don't block the app
      }
    }

    initProfile();
    return () => { isMounted = false; };
  }, [resolved, identity.adminSub, identity.userRole]);

  // ── Loading gate ──────────────────────────────────────────────────────────
  if (!resolved || !profileReady) {
    return (
      <div style={{ display: 'flex', height: '100dvh', alignItems: 'center', justifyContent: 'center' }}>
        <p>Initializing workspace…</p>
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <UserRoleContext.Provider value={identity}>
      <div style={{
        display:         'flex',
        flexDirection:   'column',
        height:          '100dvh',
        width:           '100%',
        backgroundColor: '#f9fafb',
        overflow:        'hidden',
      }}>
        {showPermissionsError && (
          <View style={{ flexShrink: 0, zIndex: 50 }}>
            <Alert
              variation="error"
              isDismissible={true}
              hasIcon={true}
              heading="Insufficient permissions"
              onDismiss={onDismissPermissionsError}
            >
              Your account does not have permission to perform this action.
              Please contact your administrator.
            </Alert>
          </View>
        )}
        <AppTabs />
      </div>
    </UserRoleContext.Provider>
  );
}

// ── App ───────────────────────────────────────────────────────────────────────
function App(): React.ReactElement {
  const [showPermissionsError, setShowPermissionsError] = useState(false);
  const signOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Token-refresh failure → auto sign-out in 5 s
  useEffect(() => {
    const stopListening = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'tokenRefresh_failure') {
        setShowPermissionsError(false);
        signOutTimerRef.current = setTimeout(() => { void signOut(); }, 5000);
      }
      if (payload.event === 'signedIn' || payload.event === 'tokenRefresh') {
        if (signOutTimerRef.current !== null) {
          clearTimeout(signOutTimerRef.current);
          signOutTimerRef.current = null;
        }
      }
    });
    return () => {
      stopListening();
      if (signOutTimerRef.current !== null) clearTimeout(signOutTimerRef.current);
    };
  }, []);

  const permissionsErrorContextValue: PermissionsErrorContextValue = {
    reportPermissionsError: () => setShowPermissionsError(true),
    clearPermissionsError:  () => setShowPermissionsError(false),
  };

  return (
    <PermissionsErrorContext.Provider value={permissionsErrorContextValue}>
      <Authenticator>
        {() => (
          <AuthenticatedShell
            showPermissionsError={showPermissionsError}
            onDismissPermissionsError={() => setShowPermissionsError(false)}
          />
        )}
      </Authenticator>
    </PermissionsErrorContext.Provider>
  );
}

export default App;
