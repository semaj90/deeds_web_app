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
import {
  buildPhaseAlignmentReceipt,
  type PhaseAlignmentInputV1,
} from '@deeds/parent-atlas';

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
  handler: (input: unknown) => Promise<unknown>
): (input: unknown) => Promise<unknown> {
  return middleware ? middleware.wrap(handler, toolName, sessionId) : handler;
}

/**
 * Opt-in phase-aware MCP adapter. The phase envelope is transport metadata;
 * it is removed before the existing tool handler receives its domain input.
 * No new executor or persistence owner is introduced here.
 */
export function createPhaseAlignedToolWithDispatcher(
  middleware: DispatcherMiddleware | undefined,
  toolName: string,
  sessionId: string,
  handler: (input: unknown) => Promise<any>
): (input: unknown) => Promise<any> {
  const dispatch = createToolWithDispatcher(
    middleware,
    toolName,
    sessionId,
    handler,
  );

  return async (input: unknown) => {
    if (!input || typeof input !== 'object' || !('phase_alignment' in input)) {
      return dispatch(input);
    }

    const envelope = input as Record<string, unknown>;
    const receipt = buildPhaseAlignmentReceipt({
      ...(envelope.phase_alignment as PhaseAlignmentInputV1),
      selected_tool: toolName,
    });
    const action = receipt.decision.action;
    const dispatchAllowed =
      receipt.decision.decode_admitted ||
      action === 'RETRIEVE' ||
      action === 'EXPAND_GRAPH' ||
      action === 'VALIDATE';

    if (!dispatchAllowed) {
      return {
        content: [{ type: 'text', text: JSON.stringify(receipt) }],
        isError: true,
        phase_alignment_receipt: receipt,
      };
    }

    const { phase_alignment: _phaseAlignment, ...domainInput } = envelope;
    const result = await dispatch(domainInput);
    if (result && typeof result === 'object' && !Array.isArray(result)) {
      return { ...result, phase_alignment_receipt: receipt };
    }
    return { content: [{ type: 'text', text: String(result) }], phase_alignment_receipt: receipt };
  };
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
export const globalSessionContextManager = new ToolSessionContextManager();
