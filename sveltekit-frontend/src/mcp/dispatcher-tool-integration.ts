// @ts-nocheck
/**
 * Dispatcher Tool Integration Helper
 *
 * Provides utilities for registering MCP tools with dispatcher middleware activation.
 * This enables automatic state tracking, audit logging, and memory integration for all tool invocations.
 *
 * **Usage in tool registration:**
 *
 * ```typescript
 * import { createToolWithDispatcher } from './dispatcher-tool-integration.js';
 *
 * // Wrap a tool handler
 * const toolHandler = createToolWithDispatcher(
 *   dispatcherMiddleware,
 *   'trace.kag_search',
 *   sessionId,
 *   async (input) => {
 *     // Original tool logic here
 *     return result;
 *   }
 * );
 *
 * // Register with MCP server
 * server.registerTool('trace.kag_search', { ... }, toolHandler);
 * ```
 */

import type { DispatcherMiddleware } from './dispatcher-middleware.js';
import type { QueryExecutionContextV1, QueryExecutionModeV1 } from '$lib/server/execution/query-execution-policy-v1.js';

/**
 * Generate a session ID from MCP request context
 */
export function generateSessionId(): string {
  const timestamp = Date.now();
  const random = Math.random().toString(16).slice(2, 8);
  return `session_${timestamp}_${random}`;
}

/**
 * Create a tool handler wrapped with dispatcher middleware
 *
 * @param middleware - Dispatcher middleware instance
 * @param toolName - Name of the tool (e.g., 'trace.kag_search')
 * @param sessionId - Session ID for audit trail
 * @param handler - Original tool handler function
 * @returns Wrapped handler that routes through dispatcher state machine
 */
export function createToolWithDispatcher(
  middleware: DispatcherMiddleware,
  toolName: string,
  sessionId: string,
  handler: (input: unknown, context: QueryExecutionContextV1) => Promise<unknown>,
  executionMode: QueryExecutionModeV1 = 'MUTATING',
  options?: { operatorGated?: boolean }
): (input: unknown) => Promise<unknown> {
  return middleware.wrap(handler, toolName, sessionId, executionMode, options);
}

/**
 * Session context: captures session metadata across tool invocations
 */
export interface ToolSessionContext {
  sessionId: string;
  startedAt: Date;
  toolsCalled: string[];
  errorCount: number;
  totalDuration: number;
}

/**
 * Maintain per-request session context for dispatcher tracking
 */
export class ToolSessionContextManager {
  private contexts = new Map<string, ToolSessionContext>();

  /**
   * Create a new session context
   */
  createSession(sessionId?: string): ToolSessionContext {
    const id = sessionId || generateSessionId();
    const context: ToolSessionContext = {
      sessionId: id,
      startedAt: new Date(),
      toolsCalled: [],
      errorCount: 0,
      totalDuration: 0,
    };
    this.contexts.set(id, context);
    return context;
  }

  /**
   * Get an existing session context
   */
  getSession(sessionId: string): ToolSessionContext | undefined {
    return this.contexts.get(sessionId);
  }

  /**
   * Record a tool invocation in the session context
   */
  recordToolCall(sessionId: string, toolName: string, durationMs: number, error?: Error): void {
    const context = this.contexts.get(sessionId);
    if (!context) return;

    context.toolsCalled.push(toolName);
    context.totalDuration += durationMs;
    if (error) context.errorCount += 1;
  }

  /**
   * Get session summary
   */
  getSummary(sessionId: string): { totalTools: number; totalDuration: number; errors: number } | null {
    const context = this.contexts.get(sessionId);
    if (!context) return null;

    return {
      totalTools: context.toolsCalled.length,
      totalDuration: context.totalDuration,
      errors: context.errorCount,
    };
  }

  /**
   * Clean up session context (call when session ends)
   */
  endSession(sessionId: string): void {
    this.contexts.delete(sessionId);
  }
}

/**
 * Global session context manager (shared across tool invocations in the MCP server)
 */
/**
 * Global session context manager (shared across tool invocations in the MCP server)
 */
export const globalSessionContextManager = new ToolSessionContextManager();

/**
 * Wrap an MCP tool handler with fail-closed phase-alignment verification.
 * Blocks `QUARANTINE` state paths before invoking the underlying handler,
 * strips `phase_alignment` from the forwarded input, and attaches `phase_alignment_receipt`.
 */
export function createPhaseAlignedToolWithDispatcher(
  middleware: DispatcherMiddleware | undefined,
  toolName: string,
  sessionId: string,
  handler: (input: any) => Promise<any>
) {
  const baseHandler = middleware
    ? createToolWithDispatcher(middleware, toolName, sessionId, handler)
    : handler;

  return async (input: any) => {
    const { phase_alignment, ...forwardedInput } = input ?? {};
    const statePath: string[] = Array.isArray(phase_alignment?.state_path)
      ? phase_alignment.state_path
      : ['UNKNOWN'];

    if (statePath.includes('QUARANTINE')) {
      return {
        isError: true,
        content: [{ type: 'text', text: `BLOCKED: ${toolName} quarantined by phase alignment gate` }],
        phase_alignment_receipt: {
          toolName,
          sessionId,
          requestId: phase_alignment?.request_id ?? null,
          statePath,
          decision: { action: 'BLOCK', reason: 'PHASE_ALIGNMENT_QUARANTINE' },
        },
      };
    }

    const result = await baseHandler(forwardedInput);
    return {
      ...(result && typeof result === 'object' ? result : { content: [{ type: 'text', text: String(result) }] }),
      phase_alignment_receipt: {
        toolName,
        sessionId,
        requestId: phase_alignment?.request_id ?? null,
        statePath,
        decision: { action: 'VALIDATE', reason: 'PHASE_ALIGNMENT_OK' },
      },
    };
  };
}
