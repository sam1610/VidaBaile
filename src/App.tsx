import { useEffect, useRef, useState } from 'react';
import { Authenticator } from '@aws-amplify/ui-react';
import { Alert, View } from '@aws-amplify/ui-react';
import { Hub } from 'aws-amplify/utils';
import { signOut } from 'aws-amplify/auth';
import { AppTabs } from './components/layout/AppTabs';
import '@aws-amplify/ui-react/styles.css';

// ── Permissions-error context ─────────────────────────────────────────────────
// Exported so child components (e.g. useAppSync hook) can signal a 401/403
// response from AppSync without prop-drilling.
import { createContext, useContext } from 'react';

interface PermissionsErrorContextValue {
  /** Call this to display the "Insufficient permissions" banner. */
  reportPermissionsError: () => void;
  /** Call this to dismiss the banner (e.g. on tab change). */
  clearPermissionsError: () => void;
}

export const PermissionsErrorContext =
  createContext<PermissionsErrorContextValue>({
    reportPermissionsError: () => undefined,
    clearPermissionsError: () => undefined,
  });

/** Convenience hook for child components. */
export function usePermissionsError(): PermissionsErrorContextValue {
  return useContext(PermissionsErrorContext);
}

// ── App ───────────────────────────────────────────────────────────────────────

/**
 * Root application component.
 *
 * Responsibilities:
 * 1. Authentication gate — wraps <AppTabs> in <Authenticator>; nothing inside
 *    renders before Cognito authentication is confirmed.
 * 2. Session-expiry handler — listens for `tokenRefresh_failure` on the Amplify
 *    Hub `auth` channel and calls `signOut()` within 5 seconds so the
 *    <Authenticator> re-renders the login form (Requirement 4.4).
 * 3. Insufficient-permissions banner — maintains `showPermissionsError` state;
 *    displays an <Alert variation="error"> when set. State is exposed through
 *    PermissionsErrorContext so AppSync callers can report 401/403 errors
 *    without prop-drilling (Requirements 4.6, 4.7).
 *
 * No React Router is used — "redirect to login" is achieved by calling
 * signOut(), which causes <Authenticator> to unmount its children and
 * render the built-in Cognito login form.
 */
function App(): React.ReactElement {
  const [showPermissionsError, setShowPermissionsError] =
    useState<boolean>(false);

  // Ref to hold the pending signOut timer so we can cancel on unmount.
  const signOutTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Token-refresh failure → sign out within 5 s ────────────────────────────
  useEffect(() => {
    const stopListening = Hub.listen('auth', ({ payload }) => {
      if (payload.event === 'tokenRefresh_failure') {
        // Clear any protected UI state.
        setShowPermissionsError(false);

        // Schedule sign-out within 5 seconds.
        signOutTimerRef.current = setTimeout(() => {
          void signOut();
        }, 5000);
      }

      // When the user successfully signs in or token refresh succeeds,
      // cancel any pending forced sign-out.
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
      // Unsubscribe from Hub on unmount.
      stopListening();
      // Cancel the pending sign-out timer if component unmounts first.
      if (signOutTimerRef.current !== null) {
        clearTimeout(signOutTimerRef.current);
        signOutTimerRef.current = null;
      }
    };
  }, []);

  // ── AppSync 401 / 403 detection ───────────────────────────────────────────
  // Amplify v6 Auth Hub events are a closed set and do not include a
  // sign-in failure event for group-level rejections. AppSync Unauthorized
  // errors surface at the GraphQL response layer, not at the auth Hub layer.
  //
  // Detection path: the `useAppSync` hook (task 12.1) receives the GraphQL
  // error response, inspects `errors[].errorType`, and calls
  // `reportPermissionsError()` from PermissionsErrorContext when it sees an
  // "Unauthorized" errorType.  App.tsx owns the state and renders the banner;
  // the hook is the caller.  No Hub listener is needed here.

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
      {/*
        <Authenticator> renders the Cognito-hosted login form until the user
        is authenticated. Once signed in, it renders its children — AppTabs.
        Nothing inside the children block executes before authentication.
      */}
      <Authenticator>
        {() => (
          <View>
            {/*
              Insufficient-permissions banner.
              Displayed when AppSync returns a 401/403 / Unauthorized error.
              Dismissible via the onDismiss handler or cleared on tab change
              by child components calling clearPermissionsError().
            */}
            {showPermissionsError && (
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
            )}

            {/* Main tab navigation — renders after Cognito authentication */}
            <AppTabs />
          </View>
        )}
      </Authenticator>
    </PermissionsErrorContext.Provider>
  );
}

export default App;
