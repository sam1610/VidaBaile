/**
 * useAgent — placeholder hook for the WhatsApp AI agent status.
 *
 * TODO: subscribe to agent status events via AppSync subscription
 *
 * Requirements: 3.4
 */

export type AgentStatus = 'idle' | 'processing' | 'error';

export interface UseAgentResult {
  status: AgentStatus;
}

/**
 * Returns the current status of the Strands agent.
 * Currently returns `{ status: 'idle' }` as a typed placeholder until
 * AppSync real-time subscriptions are wired to the agent Lambda.
 */
export function useAgent(): UseAgentResult {
  // TODO: subscribe to agent status events via AppSync subscription
  return { status: 'idle' };
}
