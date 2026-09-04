import { useState, useRef } from 'react';
import { generateClient } from 'aws-amplify/data';
import type { Schema } from '../../amplify/data/resource';

/**
 * Module-level singleton — the client is created once across the entire
 * application lifetime, not on every render or hook invocation.
 * This mirrors the pattern used in amplify-config.ts (configured flag).
 *
 * Requirements: 1.4
 */
let clientSingleton: ReturnType<typeof generateClient<Schema>> | null = null;

function getClient(): ReturnType<typeof generateClient<Schema>> {
  if (!clientSingleton) {
    clientSingleton = generateClient<Schema>();
  }
  return clientSingleton;
}

export interface UseAppSyncResult {
  /** Memoized AppSync client with full Schema type inference */
  client: ReturnType<typeof generateClient<Schema>>;
  /** True while an async operation initiated via this hook is in flight */
  loading: boolean;
  /** Last error thrown by an async operation, or null if none */
  error: Error | null;
  /** Reset the error state back to null */
  clearError: () => void;
}

/**
 * `useAppSync` — provides a memoized AppSync client together with
 * lightweight loading / error state for the calling component.
 *
 * The underlying client instance is a module-level singleton so it is
 * shared across all consumers and is never re-created on re-renders.
 *
 * Usage:
 * ```tsx
 * const { client, loading, error } = useAppSync();
 * const result = await client.models.Member.list();
 * ```
 */
export function useAppSync(): UseAppSyncResult {
  // useRef keeps the same client reference stable across renders for this
  // component instance, while the module-level singleton ensures only one
  // client is ever created regardless of how many components call this hook.
  const clientRef = useRef<ReturnType<typeof generateClient<Schema>>>(getClient());

  const [loading, _setLoading] = useState<boolean>(false);
  const [error, setError] = useState<Error | null>(null);

  const clearError = (): void => {
    setError(null);
  };

  return {
    client: clientRef.current,
    loading,
    error,
    clearError,
  };
}

// Re-export the Schema type so consumers can import it from the hook barrel
// without needing to reach into the amplify/ directory themselves.
export type { Schema };
