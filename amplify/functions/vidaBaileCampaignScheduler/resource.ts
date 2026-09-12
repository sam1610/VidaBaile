import { defineFunction } from '@aws-amplify/backend';

/**
 * vidaBaileCampaignScheduler
 *
 * Polls every 1 minute for BROADCAST records whose launchDateTime has passed
 * and whose broadcastStatus is still SCHEDULED. For each match it atomically
 * transitions the status to RUNNING and asynchronously invokes
 * vidaBaileDispatchBroadcast (InvocationType: Event) so the scheduler
 * returns quickly without blocking on bulk SQS enqueuing.
 *
 * EventBridge CRON wired in amplify/backend.ts Section D.
 * TABLE_NAME and DISPATCH_FUNCTION_ARN injected as env vars by backend.ts.
 */
export const vidaBaileCampaignScheduler = defineFunction({
  name: 'vidaBaileCampaignScheduler',
  entry: './handler.ts',
  runtime: 20,
  // 55s: well within the 1-minute EventBridge window.
  // Async dispatch invocations return immediately (InvocationType: Event)
  // so the only latency here is DDB query + N * conditional update + N * Lambda.invoke.
  timeoutSeconds: 55,
  memoryMB: 256,
});
