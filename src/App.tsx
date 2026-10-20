import { useEffect, useRef, useState } from 'react';
import { Authenticator, Alert, View } from '@aws-amplify/ui-react';
import { Hub } from 'aws-amplify/utils';
import { signOut, getCurrentUser, fetchAuthSession } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { AppTabs } from './components/layout/AppTabs';
import type { Schema } from '../amplify/data/resource';
import { UserRoleContext, type UserRole } from './context/UserRoleContext';
import '@aws-amplify/ui-react/styles.css';

// ── Permissions-error context ─────────────────────────────────────────────────
import { createContext, useContext } from 'react';

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

// ── AppSync Client ────────────────────────────────────────────────────────────
const client = generateClient<Schema>();

// ── Profile Initializer ───────────────────────────────────────────────────────
/**
 * Runs once after sign-in.  For admins it guarantees a PROFILE record exists.
 * For coaches the PROFILE is owned by the admin so we skip creation entirely.
 */
interface ProfileInitializerProps {
  children: React.ReactNode;
  userRole: UserRole;
}

function ProfileInitializer({ children, userRole }: ProfileInitializerProps) {
  const [isProfileReady, setIsProfileReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function initializeProfile() {
      try {
        // Coaches don't own a PROFILE record — nothing to initialise.
        if (userRole === 'coach') {
          if (isMounted) setIsProfileReady(true);
          return;
        }

        const { userId: adminSub } = await getCurrentUser();

        const { data: profiles } = await client.models.ClubRecord.list({
          filter: { pk: { eq: adminSub }, sk: { eq: 'PROFILE' } },
        });

        if (profiles.length === 0) {
          console.log('[ProfileInitializer] Creating new Admin PROFILE…');
          await client.models.ClubRecord.create({
            pk:        adminSub,
            sk:        'PROFILE',
            entityType:'PROFILE',
            gsi1pk:    `${adminSub}#SETTINGS`,
            gsi1sk:    'PROFILE',
            name:      'New Dance Studio',
          });
        }

        if (isMounted) setIsProfileReady(true);
      } catch (error) {
        console.error('[ProfileInitializer] Error:', error);
        if (isMounted) setIsProfileReady(true); // Don't block the app
      }
    }

    initializeProfile();
    return () => { isMounted = false; };
  }, [userRole]);

  if (!isProfileReady) {
    return (
      <div style={{ display: 'flex', height: '100dvh', alignItems: 'center', justifyContent: 'center' }}>
        <p>Initializing workspace…</p>
      </div>
    );
  }

  return <>{children}</>;
}

// ── App ───────────────────────────────────────────────────────────────────────
function App(): React.ReactElement {
  const [showPermissionsError, setShowPermissionsError] = useState<boolean>(false);
  const signOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Role + identity resolved from the Cognito access token ────────────────
  const [userRole,  setUserRole]  = useState<UserRole>('admin');
  const [coachId,   setCoachId]   = useState<string>('');
  /**
   * adminSub is always the DancingClubData partition owner.
   * - For admins  : equals their own Cognito sub.
   * - For coaches : the admin's sub, resolved by finding the single PROFILE
   *   record in the table (entityType = 'PROFILE', sk = 'PROFILE') and reading
   *   its pk.  This guarantees every service call uses the right partition key
   *   so studio branding and all data queries work for coach logins too.
   */
  const [adminSub,  setAdminSub]  = useState<string>('');

  useEffect(() => {
    async function resolveRole() {
      try {
        const session = await fetchAuthSession();
        const payload = session.tokens?.accessToken?.payload;
        const groups  = (payload?.['cognito:groups'] as string[] | undefined) ?? [];
        const sub     = (payload?.['sub'] as string | undefined) ?? '';

        const role: UserRole = groups.includes('coach') ? 'coach' : 'admin';
        setUserRole(role);
        setCoachId(sub);

        if (role === 'admin') {
          // Admin owns the partition — their sub is the adminSub.
          setAdminSub(sub);
          console.log('[App] role=admin | adminSub:', sub);
        } else {
          // Coach: find the PROFILE record (there is exactly one per club) and
          // extract its pk which is the admin's sub.
          try {
            const { data: records } = await client.models.ClubRecord.list({
              filter: { sk: { eq: 'PROFILE' }, entityType: { eq: 'PROFILE' } },
            });
            const profileRecord = records?.[0];
            if (profileRecord?.pk) {
              setAdminSub(profileRecord.pk);
              console.log('[App] role=coach | resolved adminSub:', profileRecord.pk);
            } else {
              console.warn('[App] Coach login: PROFILE record not found — adminSub will be empty');
            }
          } catch (lookupErr) {
            console.warn('[App] Coach login: PROFILE lookup failed:', lookupErr);
          }
        }
      } catch (err) {
        console.warn('[App] Could not resolve Cognito role — defaulting to admin:', err);
      }
    }
    resolveRole();
  }, []);

  // ── Token-refresh failure → sign out within 5 s ────────────────────────────
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
      if (signOutTimerRef.current !== null) {
        clearTimeout(signOutTimerRef.current);
        signOutTimerRef.current = null;
      }
    };
  }, []);

  // ── Context values ─────────────────────────────────────────────────────────
  const permissionsErrorContextValue: PermissionsErrorContextValue = {
    reportPermissionsError: () => setShowPermissionsError(true),
    clearPermissionsError:  () => setShowPermissionsError(false),
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <PermissionsErrorContext.Provider value={permissionsErrorContextValue}>
      <UserRoleContext.Provider value={{ userRole, coachId, adminSub }}>
        <Authenticator>
          {() => (
            <ProfileInitializer userRole={userRole}>
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
                      onDismiss={() => setShowPermissionsError(false)}
                    >
                      Your account does not have permission to perform this
                      action. Please contact your administrator.
                    </Alert>
                  </View>
                )}
                <AppTabs />
              </div>
            </ProfileInitializer>
          )}
        </Authenticator>
      </UserRoleContext.Provider>
    </PermissionsErrorContext.Provider>
  );
}

export default App;
