/**
 * Canonical agent/workflow run status registry.
 *
 * Single source of truth consumed by:
 *   - SQL CHECK constraint  (workflow_orchestration_tables.sql)
 *   - tRPC Zod schemas      (routers/workflow.ts, routers/agent.ts)
 *   - Queue command schemas (queue/commands.ts)
 *   - UI status badges      (import type { AgentRunStatus } from '$lib/server/trpc/run-status')
 *
 * Never repeat literal status strings in query files. Import from here.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Status values — ordered by lifecycle
// ---------------------------------------------------------------------------

export const agentRunStatuses = [
  'received',    // run accepted, not yet dispatched
  'planning',    // orchestrator is building the task graph
  'executing',   // at least one task is in flight
  'validating',  // results are being validated before completion
  'blocked',     // waiting for human-in-the-loop input
  'completed',   // terminal — success
  'failed',      // terminal — non-recoverable error
  'cancelled',   // terminal — user-initiated cancellation
] as const;

export type AgentRunStatus = (typeof agentRunStatuses)[number];

export const agentRunStatusSchema = z.enum(agentRunStatuses);

// ---------------------------------------------------------------------------
// Terminal states — transitions out of these are forbidden
// ---------------------------------------------------------------------------

export const TERMINAL_STATUSES = new Set<AgentRunStatus>([
  'completed',
  'failed',
  'cancelled',
]);

export function isTerminal(status: AgentRunStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}

// ---------------------------------------------------------------------------
// Allowed transition table
// ---------------------------------------------------------------------------

const ALLOWED_TRANSITIONS: Record<AgentRunStatus, ReadonlySet<AgentRunStatus>> = {
  received:   new Set<AgentRunStatus>(['planning', 'failed', 'cancelled']),
  planning:   new Set<AgentRunStatus>(['executing', 'failed', 'cancelled']),
  executing:  new Set<AgentRunStatus>(['validating', 'blocked', 'completed', 'failed', 'cancelled']),
  validating: new Set<AgentRunStatus>(['completed', 'executing', 'failed', 'cancelled']),
  blocked:    new Set<AgentRunStatus>(['executing', 'failed', 'cancelled']),
  completed:  new Set<AgentRunStatus>(),
  failed:     new Set<AgentRunStatus>(),
  cancelled:  new Set<AgentRunStatus>(),
};

export function isTransitionAllowed(from: AgentRunStatus, to: AgentRunStatus): boolean {
  return ALLOWED_TRANSITIONS[from].has(to);
}
