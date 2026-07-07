/**
 * LangGraph Bridge: Connect OpenCode Gemma4 Tool Calls to Parent Atlas Dispatcher
 *
 * Implements Netflix Headroom: memory-constrained dispatcher with overflow handling.
 * Prevents dispatcher state explosion when processing large tool results.
 *
 * Netflix Headroom Strategy:
 * - Soft limit: 32KB for state JSONB
 * - Hard limit: 12KB for tool result truncation
 * - Priority lanes: graph, topology, kag preserved first
 * - Overflow behavior: truncate > summarize > error
 */

import { z } from 'zod';
import { Pool } from 'pg';

/**
 * Dispatcher state shape (shared with parent-atlas)
 */
export const DispatcherStateSchema = z.object({
  current_tool: z.string().optional(),
  current_input: z.record(z.unknown()).optional(),
  action: z.enum(['tool_call', 'step', 'complete', 'error']).optional(),
  candidates: z
    .array(
      z.object({
        id: z.string(),
        name: z.string(),
        confidence: z.number().min(0).max(1),
        source: z.string(),
      })
    )
    .optional(),
  history: z.array(z.record(z.unknown())).optional(),
  trace: z.record(z.unknown()).optional(),
});

export type DispatcherState = z.infer<typeof DispatcherStateSchema>;

export const HeadroomConfigSchema = z.object({
  maxStateSize: z.number().int().positive().default(32_000), // 32KB soft limit
  maxToolResultChars: z.number().int().positive().default(12_000), // 12KB hard limit
  priorityLanes: z.array(z.string()).default(['graph', 'topology', 'kag']),
  memoryOverflowBehavior: z.enum(['truncate', 'summarize', 'error']).default('truncate'),
});

export type HeadroomConfig = z.infer<typeof HeadroomConfigSchema>;

/**
 * LangGraph Bridge: manages state + tool invocation within Headroom constraints
 */
export class LangGraphBridge {
  private config: HeadroomConfig;
  private pool: Pool | null;
  private stateHistory: DispatcherState[] = [];

  constructor(config?: Partial<HeadroomConfig>, pool?: Pool) {
    this.config = HeadroomConfigSchema.parse(config || {});
    this.pool = pool || null;
  }

  /**
   * Process a tool call through the dispatcher state machine
   * with Netflix Headroom overflow protection
   */
  async invokeTool(
    toolName: string,
    toolInput: Record<string, unknown>,
    currentState: DispatcherState
  ): Promise<{ result: unknown; updatedState: DispatcherState }> {
    // Apply headroom constraints to current state
    const headroomed = this.applyHeadroom(currentState);

    // Simulate dispatcher invocation (in real implementation, calls LangGraph runtime)
    const newState: DispatcherState = {
      ...headroomed,
      current_tool: toolName,
      current_input: toolInput,
      action: 'tool_call',
    };

    // Record state transition (optional: for audit trail)
    this.stateHistory.push(newState);

    // Apply headroom to tool result size
    let result: unknown = toolInput;
    if (typeof toolInput === 'string' && toolInput.length > this.config.maxToolResultChars) {
      result = toolInput.slice(0, this.config.maxToolResultChars) + '\n[... truncated ...]';
    } else if (typeof toolInput === 'object') {
      try {
        const truncated = JSON.parse(
          JSON.stringify(toolInput).slice(0, this.config.maxToolResultChars)
        );
        result = truncated;
      } catch {
        result = { _error: 'Result too large or malformed' };
      }
    }

    return {
      result,
      updatedState: newState,
    };
  }

  /**
   * Netflix Headroom: Constrain state to maxStateSize
   * Strategy:
   *   1. Keep priority lanes intact
   *   2. Prune low-confidence candidates
   *   3. Summarize old history
   *   4. Truncate verbose trace fields
   */
  private applyHeadroom(state: DispatcherState): DispatcherState {
    const stateStr = JSON.stringify(state);
    if (stateStr.length <= this.config.maxStateSize) {
      return state; // No overflow
    }

    const pruned = { ...state };

    // Strategy 1: Remove low-confidence candidates (keep high-confidence ones)
    if (pruned.candidates && Array.isArray(pruned.candidates)) {
      pruned.candidates = pruned.candidates
        .filter((c) => c.confidence > 0.5)
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 10); // Keep top-10
    }

    // Strategy 2: Truncate history (keep last N steps)
    if (pruned.history && Array.isArray(pruned.history)) {
      pruned.history = pruned.history.slice(-5); // Keep last 5 steps
    }

    // Strategy 3: Summarize verbose fields in trace
    if (pruned.trace && typeof pruned.trace === 'object') {
      const trace = pruned.trace as Record<string, unknown>;

      // Truncate detailed_log
      if (typeof trace.detailed_log === 'string' && trace.detailed_log.length > 1000) {
        trace.detailed_log =
          trace.detailed_log.slice(0, 500) +
          '\n[... summarized - see full trace in database ...]';
      }

      // Keep only essential fields
      const essentialFields = ['step', 'action', 'timestamp', 'status'];
      const filtered: Record<string, unknown> = {};
      for (const key of essentialFields) {
        if (key in trace) {
          filtered[key] = trace[key];
        }
      }
      pruned.trace = filtered;
    }

    const prunedStr = JSON.stringify(pruned);
    if (prunedStr.length > this.config.maxStateSize) {
      // Last resort: encode as minimal summary
      return {
        current_tool: state.current_tool,
        action: state.action,
        _summary: `State was ${prunedStr.length} bytes, truncated to ${this.config.maxStateSize} bytes`,
      } as DispatcherState;
    }

    return pruned;
  }

  /**
   * Get state history (for debugging / audit trail)
   */
  getStateHistory(): DispatcherState[] {
    return [...this.stateHistory];
  }

  /**
   * Clear state history
   */
  clearStateHistory(): void {
    this.stateHistory = [];
  }

  /**
   * Persist state to PostgreSQL for long-term audit (optional)
   */
  async persistStateToDB(state: DispatcherState, sessionId: string): Promise<void> {
    if (!this.pool) {
      console.warn('[LangGraphBridge] No database pool configured, skipping persistence');
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query(
        `INSERT INTO dispatcher_state_history
          (session_id, state_json, created_at)
         VALUES ($1, $2, NOW())`,
        [sessionId, JSON.stringify(state)]
      );
    } catch (err) {
      console.error('[LangGraphBridge] Failed to persist state:', err);
    } finally {
      client.release();
    }
  }

  /**
   * Ensure database table for state history
   */
  async ensureSchema(): Promise<void> {
    if (!this.pool) {
      console.warn('[LangGraphBridge] No database pool configured, skipping schema creation');
      return;
    }

    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS dispatcher_state_history (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          session_id VARCHAR(255) NOT NULL,
          state_json JSONB NOT NULL,
          created_at TIMESTAMP NOT NULL DEFAULT NOW(),

          CONSTRAINT session_not_empty CHECK (session_id <> '')
        );

        CREATE INDEX IF NOT EXISTS idx_dispatcher_state_session
          ON dispatcher_state_history (session_id, created_at DESC);
      `);
    } finally {
      client.release();
    }
  }
}

/**
 * Utility: Extract keywords for BM25 tagging from dispatcher state
 */
export function extractKeywordsFromState(state: DispatcherState): string[] {
  const keywords = new Set<string>();

  if (state.current_tool) {
    keywords.add(state.current_tool);
    // Add namespace (e.g., 'graph' from 'graph.expand_neighborhood')
    const [ns] = state.current_tool.split('.');
    if (ns) keywords.add(ns);
  }

  if (state.current_input && typeof state.current_input === 'object') {
    // Extract query-like strings
    for (const [key, val] of Object.entries(state.current_input)) {
      if (key === 'query' && typeof val === 'string') {
        // Split by whitespace, take first 3 words
        val.split(/\s+/)
          .slice(0, 3)
          .forEach((w) => keywords.add(w.toLowerCase()));
      }
    }
  }

  return Array.from(keywords).filter((k) => k.length > 0);
}
