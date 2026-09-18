import { useEffect, useRef, useState } from 'react';
import { Authenticator, Alert, View } from '@aws-amplify/ui-react';
import { Hub } from 'aws-amplify/utils';
import { signOut, getCurrentUser } from 'aws-amplify/auth';
import { generateClient } from 'aws-amplify/data';
import { AppTabs } from './components/layout/AppTabs';
import type { Schema } from '../amplify/data/resource'; // Adjust path to your schema if necessary
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
/**
 * Executes exactly once upon successful login.
 * Queries DynamoDB for an existing PROFILE record for this Cognito sub.
 * If missing, it automatically provisions the base admin profile.
 */
function ProfileInitializer({ children }: { children: React.ReactNode }) {
  const [isProfileReady, setIsProfileReady] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function initializeProfile() {
      try {
        const { userId: adminSub } = await getCurrentUser();
        
        // 1. Check if the profile exists
        const { data: profiles } = await client.models.ClubRecord.list({
          filter: { pk: { eq: adminSub }, sk: { eq: 'PROFILE' } }
        });

        // 2. Create the profile if it doesn't exist
        if (profiles.length === 0) {
          console.log("Creating new Admin Profile...");
          await client.models.ClubRecord.create({
            pk: adminSub,
            sk: 'PROFILE',
            entityType: 'PROFILE',
            // Default WhatsApp number binding - to be managed via Settings UI later
            gsi1pk: `WHATSAPP#97333787388`, 
            gsi1sk: 'PROFILE',
            name: 'New Dance Club', 
          });
        }
        
        if (isMounted) setIsProfileReady(true);
      } catch (error) {
        console.error("Error initializing profile:", error);
        // Failsafe: allow UI to load even if query fails, avoiding a frozen screen
        if (isMounted) setIsProfileReady(true); 
      }
    }

    initializeProfile();

    return () => {
      isMounted = false;
    };
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

  // ── Token-refresh failure → sign out within 5 s ────────────────────────────
  useEffect(() => {
    const stopListening = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'tokenRefresh_failure') {
        setShowPermissionsError(false);
        signOutTimerRef.current = setTimeout(() => {
          void signOut();
        }, 5000);
      }

      if (
        payload.event === 'signedIn' ||
        payload.event === 'tokenRefresh'
      ) {
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
    reportPermissionsError: () => {
      setShowPermissionsError(true);
    },
    clearPermissionsError: () => {
      setShowPermissionsError(false);
    },
  };

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <PermissionsErrorContext.Provider value={permissionsErrorContextValue}>
      <Authenticator>
        {() => (
          <ProfileInitializer>
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              height: '100dvh', 
              width: '100%', 
              backgroundColor: '#f9fafb',
              overflow: 'hidden'
            }}>
              {showPermissionsError && (
                <View style={{ flexShrink: 0, zIndex: 50 }}>
                  <Alert
                    variation="error"
                    isDismissible={true}
                    hasIcon={true}
                    heading="Insufficient permissions"
                    onDismiss={() => {
                      setShowPermissionsError(false);
                    }}
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
    </PermissionsErrorContext.Provider>
  );
}

export default App;