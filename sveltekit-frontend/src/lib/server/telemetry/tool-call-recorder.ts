/**
 * tool-call-recorder.ts
 *
 * Single place where every tool invocation becomes a durable row.
 * Called by MCP handlers, gRPC service stubs, and the OpenCode adapter.
 *
 * Contract:
 *   begin()  → returns a ToolCallHandle (call before invoking the tool)
 *   handle.end()  → writes the completed row (call after result returns)
 *
 * The Redis centroid cache key (if hit) is stored in metadata so the
 * retrieval trace can skip Qdrant/Neo4j lookups on cache replay.
 */

import { db } from '$lib/server/db/client';
import { sql } from 'drizzle-orm';

export type ToolSource = 'mcp' | 'grpc' | 'opencode' | 'internal';

export interface ToolCallHandle {
  id: string;
  complete(result: {
    ok: boolean;
    summary?: string;
    error?: string;
    otelSpanId?: string;
    otelTraceId?: string;
  }): Promise<void>;
}

/**
 * Begin recording a tool call. Returns a handle; call handle.complete() when done.
 */
export async function recordToolCallBegin(opts: {
  toolName: string;
  toolSource?: ToolSource;
  arguments?: Record<string, unknown>;
  traceId?: string;
  sessionId?: string;
}): Promise<ToolCallHandle> {
  const { toolName, toolSource = 'mcp', arguments: args = {}, traceId, sessionId } = opts;
  const calledAt = Date.now();

  let id: string;
  try {
    const [row] = await db.execute<{ id: string }>(sql`
      INSERT INTO tool_call_events
        (tool_name, tool_source, arguments, trace_id, session_id, called_at)
      VALUES
        (${toolName}, ${toolSource}, ${JSON.stringify(args)}::jsonb,
         ${traceId ?? null}::uuid, ${sessionId ?? null}, now())
      RETURNING id
    `);
    id = (row as { id: string }).id;
  } catch {
    // Non-blocking — if the DB is unavailable, still return a handle that no-ops
    id = crypto.randomUUID();
  }

  return {
    id,
    async complete({ ok, summary, error, otelSpanId, otelTraceId }) {
      const latencyMs = Date.now() - calledAt;
      try {
        await db.execute(sql`
          UPDATE tool_call_events SET
            result_ok      = ${ok},
            result_summary = ${summary?.slice(0, 512) ?? null},
            error_message  = ${error ?? null},
            latency_ms     = ${latencyMs},
            otel_span_id   = ${otelSpanId ?? null},
            otel_trace_id  = ${otelTraceId ?? null},
            completed_at   = now()
          WHERE id = ${id}::uuid
        `);
      } catch { /* non-blocking */ }
    },
  };
}

/**
 * Convenience wrapper: records begin+end around an async tool function.
 */
export async function withToolCallRecord<T>(
  opts: {
    toolName: string;
    toolSource?: ToolSource;
    arguments?: Record<string, unknown>;
    traceId?: string;
    sessionId?: string;
  },
  fn: () => Promise<T>,
): Promise<T> {
  const handle = await recordToolCallBegin(opts);
  try {
    const result = await fn();
    const summary = typeof result === 'string'
      ? result
      : JSON.stringify(result).slice(0, 512);
    await handle.complete({ ok: true, summary });
    return result;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    await handle.complete({ ok: false, error });
    throw err;
  }
}

/**
 * Create a task envelope — call before starting a multi-step agent job.
 */
export async function createAgentTask(opts: {
  taskType: string;
  title?: string;
  description?: string;
  sourceRef?: string;
  packetKey?: string;
  sessionId?: string;
  payload?: Record<string, unknown>;
  priority?: number;
}): Promise<string> {
  try {
    const [row] = await db.execute<{ id: string }>(sql`
      INSERT INTO agent_tasks
        (task_type, title, description, source_ref, packet_key, session_id, payload, priority)
      VALUES
        (${opts.taskType}, ${opts.title ?? null}, ${opts.description ?? null},
         ${opts.sourceRef ?? null}, ${opts.packetKey ?? null}, ${opts.sessionId ?? null},
         ${JSON.stringify(opts.payload ?? {})}::jsonb, ${opts.priority ?? 50})
      RETURNING id
    `);
    return (row as { id: string }).id;
  } catch {
    return crypto.randomUUID();
  }
}

/**
 * Append an outcome row — call after a task or retrieval session completes.
 */
export async function recordOutcome(opts: {
  outcomeType: string;
  taskId?: string;
  traceId?: string;
  toolCallId?: string;
  score?: number;
  reward?: number;
  feedback?: string;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO outcome_ledger
        (outcome_type, task_id, trace_id, tool_call_id, score, reward, feedback, metadata)
      VALUES
        (${opts.outcomeType}, ${opts.taskId ?? null}::uuid,
         ${opts.traceId ?? null}::uuid, ${opts.toolCallId ?? null}::uuid,
         ${opts.score ?? null}, ${opts.reward ?? null},
         ${opts.feedback ?? null}, ${JSON.stringify(opts.metadata ?? {})}::jsonb)
    `);
  } catch { /* non-blocking */ }
}