// @ts-nocheck
/**
 * Dispatcher Middleware: Route MCP Tool Calls Through LangGraph State Machine
 *
 * Wraps MCP tool execution with:
 * 1. State machine routing (track tool call → result → next action)
 * 2. Netflix Headroom overflow protection (32KB state limit)
 * 3. PostgreSQL audit trail persistence
 * 4. Engram memory bridge integration (agent learning)
 * 5. Keyword extraction for BM25 indexing
 *
 * **Architecture:**
 *   MCP tool invocation
 *     ↓
 *   dispatcherMiddleware.route()
 *     ├─ Apply headroom constraints
 *     ├─ Invoke tool via original handler
 *     ├─ Capture result in dispatcher state
 *     ├─ Persist state to PostgreSQL
 *     ├─ Record observation in Engram
 *     └─ Return result to MCP client
 *
 * **Usage:**
 *   const middleware = new DispatcherMiddleware(pool, engramBridge, langgraphBridge);
 *   const wrappedTool = middleware.wrap(originalToolHandler, toolName, sessionId);
 *   const result = await wrappedTool(input);
 */

import { z } from 'zod';
import type { Pool } from 'pg';
import type { LangGraphBridge, DispatcherState } from './langgraph-bridge.js';
import type { EngramMemoryBridge } from './memory-bridge.js';
import { extractKeywordsFromState } from './langgraph-bridge.js';

/**
 * No-op LangGraph bridge for when LangGraph is disabled.
 * Allows dispatcher middleware to function without state machine routing.
 */
class NoOpLangGraphBridge implements Omit<LangGraphBridge, 'constructor'> {
  getConfig() {
    return { maxStateSize: 32_000, maxToolResultChars: 12_000, priorityLanes: [], memoryOverflowBehavior: 'truncate' as const };
  }

  applyHeadroom(state: DispatcherState): DispatcherState {
    return state; // Passthrough, no constraints
  }

  async invokeTool(
    toolName: string,
    toolResult: Record<string, unknown>,
    currentState: DispatcherState
  ): Promise<{ result: unknown; updatedState: DispatcherState }> {
    return { result: toolResult, updatedState: currentState }; // Passthrough
  }

  async persistStateToDB(state: DispatcherState, sessionId: string): Promise<void> {
    // No-op: don't persist when LangGraph is disabled
  }

  async ensureSchema(): Promise<void> {
    // No-op: no schema to ensure
  }
}

/**
 * Tool execution metadata (captured before/after invocation)
 */
export const ToolExecutionMetadataSchema = z.object({
  toolName: z.string(),
  sessionId: z.string(),
  toolCallId: z.string(),
  invokedAt: z.string().datetime(),
  completedAt: z.string().datetime().optional(),
  inputSize: z.number().int(),
  resultSize: z.number().int().optional(),
  resultTruncated: z.boolean().default(false),
  error: z.string().optional(),
  duration_ms: z.number().int(),
});

export type ToolExecutionMetadata = z.infer<typeof ToolExecutionMetadataSchema>;

/**
 * Dispatcher middleware: wraps tool invocation with state routing + persistence
 */
export class DispatcherMiddleware {
  private pool: Pool | null;
  private engramBridge: EngramMemoryBridge | null;
  private langgraphBridge: LangGraphBridge | NoOpLangGraphBridge;
  private langgraphEnabled: boolean;
  private callCounter = 0;

  constructor(
    pool: Pool | null,
    engramBridge: EngramMemoryBridge | null,
    langgraphBridge: LangGraphBridge | NoOpLangGraphBridge | null,
    langgraphEnabled: boolean = true
  ) {
    this.pool = pool;
    this.engramBridge = engramBridge;
    this.langgraphBridge = langgraphBridge || new NoOpLangGraphBridge();
    this.langgraphEnabled = langgraphEnabled && langgraphBridge !== null;
  }

  /**
   * Generate a unique tool call ID (for audit trail)
   */
  private generateToolCallId(): string {
    const timestamp = Date.now();
    const counter = ++this.callCounter;
    const random = Math.random().toString(16).slice(2, 8);
    return `tcall_${timestamp}_${counter}_${random}`;
  }

  /**
   * Wrap a tool handler with dispatcher middleware
   *
   * @param handler - Original async tool handler: (input: unknown) => Promise<unknown>
   * @param toolName - Name of the tool (e.g., 'trace.kag_search')
   * @param sessionId - Session ID for audit trail
   * @returns Wrapped handler that routes through dispatcher state machine
   */
  wrap(
    handler: (input: unknown) => Promise<unknown>,
    toolName: string,
    sessionId: string
  ): (input: unknown) => Promise<unknown> {
    return async (input: unknown) => {
      const toolCallId = this.generateToolCallId();
      const invokedAt = new Date().toISOString();
      const startTime = Date.now();

      // Initialize dispatcher state
      let currentState: DispatcherState = {
        current_tool: toolName,
        current_input: typeof input === 'object' ? (input as Record<string, unknown>) : { raw: String(input) },
        action: 'tool_call',
      };

      try {
        // Apply headroom constraints to input (if LangGraph enabled)
        const headroomed = this.langgraphEnabled
          ? this.langgraphBridge.applyHeadroom(currentState)
          : currentState;

        // Invoke the original tool handler
        const result = await handler(input);

        // Capture result in state (if LangGraph enabled)
        const resultSize = JSON.stringify(result).length;
        let constrainedResult = result;

        if (this.langgraphEnabled) {
          const { result: cResult, updatedState } = await this.langgraphBridge.invokeTool(
            toolName,
            typeof result === 'object' ? (result as Record<string, unknown>) : { raw: String(result) },
            headroomed
          );
          constrainedResult = cResult;
          currentState = { ...updatedState, action: 'complete' };
        } else {
          // Bypass LangGraph: return result directly with minimal state update
          currentState = { ...currentState, action: 'complete' };
        }

        // Persist state to PostgreSQL (guarded by pool availability)
        if (this.pool) {
          const config = this.langgraphBridge.getConfig();
          await this.persistExecution(
            {
              toolName,
              sessionId,
              toolCallId,
              invokedAt,
              completedAt: new Date().toISOString(),
              inputSize: JSON.stringify(input).length,
              resultSize,
              resultTruncated: resultSize > config.maxToolResultChars,
              duration_ms: Date.now() - startTime,
            },
            currentState
          );
        }

        // Record observation in Engram
        await this.recordObservation(toolName, sessionId, 'success', constrainedResult);

        return constrainedResult;
      } catch (error) {
        // Capture error in state
        const errorMsg = error instanceof Error ? error.message : String(error);
        currentState = { ...currentState, action: 'error' };

        // Persist error state
        await this.persistExecution(
          {
            toolName,
            sessionId,
            toolCallId,
            invokedAt,
            completedAt: new Date().toISOString(),
            inputSize: JSON.stringify(input).length,
            error: errorMsg.slice(0, 500),
            duration_ms: Date.now() - startTime,
          },
          currentState
        );

        // Record observation in Engram
        await this.recordObservation(toolName, sessionId, 'error', { error: errorMsg });

        throw error;
      }
    };
  }

  /**
   * Persist tool execution metadata and state to PostgreSQL
   */
  private async persistExecution(metadata: ToolExecutionMetadata, state: DispatcherState): Promise<void> {
    if (!this.pool) return;

    try {
      const client = await this.pool.connect();
      try {
        // Extract keywords for BM25 indexing
        const keywords = extractKeywordsFromState(state);

        await client.query(
          `INSERT INTO tool_execution_audit (
            tool_call_id, tool_name, session_id, input_size, result_size,
            result_truncated, error, duration_ms, keywords, state_json, created_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, NOW())
          ON CONFLICT (tool_call_id) DO UPDATE SET
            state_json = EXCLUDED.state_json,
            result_size = EXCLUDED.result_size,
            duration_ms = EXCLUDED.duration_ms,
            error = EXCLUDED.error
          `,
          [
            metadata.toolCallId,
            metadata.toolName,
            metadata.sessionId,
            metadata.inputSize,
            metadata.resultSize || 0,
            metadata.resultTruncated,
            metadata.error || null,
            metadata.duration_ms,
            keywords.join(' '),
            JSON.stringify(state),
          ]
        );

        // Also persist to dispatcher state history (for long-term audit)
        await this.langgraphBridge.persistStateToDB(state, metadata.sessionId);
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn('[dispatcher] Failed to persist execution:', err);
      // Non-fatal: don't let audit logging block tool execution
    }
  }

  /**
   * Record tool invocation observation in Engram memory bridge
   */
  private async recordObservation(
    toolName: string,
    sessionId: string,
    outcome: 'success' | 'error',
    result: unknown
  ): Promise<void> {
    if (!this.engramBridge) return;

    try {
      await this.engramBridge.recordObservation({
        type: 'tool_invocation',
        tool_name: toolName,
        session_id: sessionId,
        outcome,
        result_summary: this.summarizeResult(result),
        created_at: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('[dispatcher] Failed to record observation:', err);
      // Non-fatal: don't let memory recording block tool execution
    }
  }

  /**
   * Summarize result for memory recording (truncate large results)
   */
  private summarizeResult(result: unknown): string {
    const str = JSON.stringify(result);
    if (str.length <= 500) return str;
    return str.slice(0, 497) + '...';
  }

  /**
   * Ensure schema exists (audit tables)
   */
  async ensureSchema(): Promise<void> {
    if (!this.pool) return;

    try {
      const client = await this.pool.connect();
      try {
        await client.query(`
          CREATE TABLE IF NOT EXISTS tool_execution_audit (
            id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            tool_call_id VARCHAR(255) UNIQUE NOT NULL,
            tool_name VARCHAR(255) NOT NULL,
            session_id VARCHAR(255) NOT NULL,
            input_size INT NOT NULL,
            result_size INT DEFAULT 0,
            result_truncated BOOLEAN DEFAULT false,
            error TEXT,
            duration_ms INT NOT NULL,
            keywords TEXT,
            state_json JSONB NOT NULL,
            created_at TIMESTAMP NOT NULL DEFAULT NOW(),

            CONSTRAINT valid_duration CHECK (duration_ms >= 0)
          );

          CREATE INDEX IF NOT EXISTS idx_tool_execution_session
            ON tool_execution_audit (session_id, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_tool_execution_tool
            ON tool_execution_audit (tool_name, created_at DESC);
          CREATE INDEX IF NOT EXISTS idx_tool_execution_keywords
            ON tool_execution_audit USING GIN (to_tsvector('english', keywords));
        `);
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn('[dispatcher] Schema creation failed:', err);
    }
  }

  /**
   * Query tool execution history for a session
   */
  async getSessionHistory(sessionId: string, limit = 50): Promise<ToolExecutionMetadata[]> {
    if (!this.pool) return [];

    try {
      const client = await this.pool.connect();
      try {
        const result = await client.query(
          `SELECT
            tool_call_id, tool_name, session_id, input_size, result_size,
            result_truncated, error, duration_ms, created_at
           FROM tool_execution_audit
           WHERE session_id = $1
           ORDER BY created_at DESC
           LIMIT $2
          `,
          [sessionId, limit]
        );

        return result.rows.map((row) => ({
          toolName: row.tool_name,
          sessionId: row.session_id,
          toolCallId: row.tool_call_id,
          invokedAt: row.created_at.toISOString(),
          inputSize: row.input_size,
          resultSize: row.result_size,
          resultTruncated: row.result_truncated,
          error: row.error,
          duration_ms: row.duration_ms,
        }));
      } finally {
        client.release();
      }
    } catch (err) {
      console.warn('[dispatcher] Failed to query history:', err);
      return [];
    }
  }
}
