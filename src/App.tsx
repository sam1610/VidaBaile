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
  clearPermissionsError: () => void;
}

export const PermissionsErrorContext =
  createContext<PermissionsErrorContextValue>({
    reportPermissionsError: () => undefined,
    clearPermissionsError: () => undefined,
  });

export function usePermissionsError(): PermissionsErrorContextValue {
  return useContext(PermissionsErrorContext);
}

// ── AppSync Client ────────────────────────────────────────────────────────────
const client = generateClient<Schema>();

// ── Profile Initializer ───────────────────────────────────────────────────────
function ProfileInitializer({ children }: { children: React.ReactNode }) {
  const [isProfileReady, setIsProfileReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function initializeProfile() {
      try {
        const { userId: adminSub } = await getCurrentUser();

        const { data: profiles } = await client.models.ClubRecord.list({
          filter: { pk: { eq: adminSub }, sk: { eq: 'PROFILE' } }
        });

        if (profiles.length === 0) {
          console.log('Creating new Admin Profile...');
          await client.models.ClubRecord.create({
            pk: adminSub,
            sk: 'PROFILE',
            entityType: 'PROFILE',
            gsi1pk: 'WHATSAPP#97333787388',
            gsi1sk: 'PROFILE',
            name: 'New Dance Club',
          });
        }

        if (isMounted) setIsProfileReady(true);
      } catch (error) {
        console.error('Error initializing profile:', error);
        if (isMounted) setIsProfileReady(true);
      }
    }

    initializeProfile();
    return () => { isMounted = false; };
  }, []);

  if (!isProfileReady) {
    return (
      <div style={{ display: 'flex', height: '100dvh', alignItems: 'center', justifyContent: 'center' }}>
        <p>Initializing workspace...</p>
      </div>
    );
  }

  return <>{children}</>;
}

// ── App ───────────────────────────────────────────────────────────────────────
function App(): React.ReactElement {
  const [showPermissionsError, setShowPermissionsError] = useState<boolean>(false);
  const signOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Resolved role + coachId from Cognito session ──────────────────────────
  const [userRole, setUserRole] = useState<UserRole>('admin');
  const [coachId,  setCoachId]  = useState<string>('');

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
        console.log('[App] role resolved:', role, '| coachId:', sub);
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

  // ── Context value ──────────────────────────────────────────────────────────
  const permissionsErrorContextValue: PermissionsErrorContextValue = {
    reportPermissionsError: () => setShowPermissionsError(true),
    clearPermissionsError:  () => setShowPermissionsError(false),
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <PermissionsErrorContext.Provider value={permissionsErrorContextValue}>
      <UserRoleContext.Provider value={{ userRole, coachId }}>
        <Authenticator>
          {() => (
            <ProfileInitializer>
              <div style={{
                display: 'flex',
                flexDirection: 'column',
                height: '100dvh',
                width: '100%',
                backgroundColor: '#f9fafb',
                overflow: 'hidden',
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
                      Your account does not have permission to perform this action.
                      Please contact your administrator.
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
