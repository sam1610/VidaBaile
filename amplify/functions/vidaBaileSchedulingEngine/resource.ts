import { defineFunction } from '@aws-amplify/backend';

/**
 * vidaBaileSchedulingEngine
 *
 * Deterministic Scheduling Engine: processes all PENDING_SCHEDULING bookings
 * for a given adminSub, groups them by date + dance style, finds available
 * coaches and facilities, and writes DRAFT_PROPOSAL SCHEDULE records.
 *
 * Invoked on-demand by the Admin UI (AppSync custom mutation).
 * TABLE_NAME injected as env var by backend.ts.
 */
export const vidaBaileSchedulingEngine = defineFunction({
  name: 'vidaBaileSchedulingEngine',
  entry: './handler.ts',
  resourceGroupName: 'data',
  runtime: 20,
  timeoutSeconds: 60,
  memoryMB: 512,
});
