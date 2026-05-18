/**
 * Phase 80: Tool Trace Observability
 *
 * Granular logger to track execution details for each step of the RAG pipeline
 * and LLM agent tool calls. Captures args, result_summary, duration_ms, status,
 * and error details.
 */

import { db } from '$lib/server/db/client.js';
import { toolTraces } from '$lib/server/db/schema.js';

export type ToolTraceStatus = 'ok' | 'error' | 'skipped';

export interface LogToolTraceParams {
  messageId: string;
  toolName: string;
  args?: Record<string, unknown> | null;
  resultSummary?: string | null;
  durationMs: number;
  status?: ToolTraceStatus;
  error?: string | null;
}

/**
 * Log a granular tool or pipeline execution trace.
 * Fire-and-forget, try-caught to never block the main request pipeline.
 */
export async function logToolTrace(params: LogToolTraceParams): Promise<void> {
  const { messageId, toolName, args, resultSummary, durationMs, status = 'ok', error } = params;

  // Clean messageId to ensure it matches the schema's expectation
  if (!messageId || !toolName) {
    return;
  }

  try {
    const traceId = `trace_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.insert(toolTraces).values({
      id: traceId,
      messageId,
      toolName,
      args: args ? JSON.stringify(args) : null,
      resultSummary: resultSummary ?? null,
      durationMs: Math.round(durationMs),
      status,
      error: error?.trim() ? error.trim() : null,
    });
  } catch (err) {
    console.warn(
      `[Tool Trace] Failed to log trace for tool "${toolName}" (non-fatal):`,
      err instanceof Error ? err.message : err
    );
  }
}
