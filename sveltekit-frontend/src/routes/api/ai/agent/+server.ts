/**
 * POST /api/ai/agent
 *
 * Gemma4 tool-calling agent — supports two calling conventions:
 *
 * 1. Native format:
 *    { query, systemPrompt?, pipeline? }
 *    → { answer, toolsUsed, rounds, durationMs, sources }
 *
 * 2. Google A2A Task format (tasks/send):
 *    { id, message: { role: 'user', parts: [{ text }] }, metadata? }
 *    → A2A TaskResult: { id, status, artifacts, metadata }
 *
 * 3. Google A2A streaming (tasks/sendSubscribe):
 *    Header: Accept: text/event-stream
 *    Same Task body — returns SSE stream of TaskStatusUpdateEvent + TaskArtifactUpdateEvent
 *
 * Agent discovery: GET /.well-known/agent.json
 * Rate limited: 20 req/user/min (GPU-bound).
 * Docs: scripts/docs/typescript-7-release-notes.md (A2A section)
 */

import { json }           from '@sveltejs/kit';
import { z }              from 'zod';
import { runGemma4Agent } from '$lib/server/ai/gemma4-agent.js';
import { getRedis }       from '$lib/server/redis.js';
import { recordSearchQuery, type HitPipeline } from '$lib/server/analytics/search-analytics.js';
import { ENV } from '$lib/server/env.server.js';
import type { RequestHandler } from './$types';

const RATE_LIMIT    = 20;
const RATE_WINDOW_S = 60;

// ── Zod schemas ───────────────────────────────────────────────────────────────

// Native format
const NativeSchema = z.object({
  query: z.string().min(1).max(4000),
  systemPrompt: z.string().max(2000).optional(),
  pipeline: z.string().max(20).optional().default('ace'),
  bypassCache: z.boolean().optional().default(false),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// A2A Task format (Google Agent2Agent spec)
const A2APartSchema = z.union([
  z.object({ text: z.string().min(1).max(4000) }),
  z.object({ data: z.record(z.string(), z.unknown()) }),
]);

const A2AMessageSchema = z.object({
  role:  z.enum(['user', 'agent']),
  parts: z.array(A2APartSchema).min(1),
});

const A2ATaskSchema = z.object({
  id:       z.string().min(1),
  message:  A2AMessageSchema,
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// ── A2A types ─────────────────────────────────────────────────────────────────

type A2ATaskStatus = 'submitted' | 'working' | 'completed' | 'failed' | 'canceled';

interface A2AArtifact {
  name:  string;
  parts: Array<{ text?: string; data?: Record<string, unknown> }>;
}

interface A2ATaskResult {
  id:        string;
  status:    { state: A2ATaskStatus; message?: A2AMessage };
  artifacts?: A2AArtifact[];
  metadata?: Record<string, unknown>;
}

interface A2AMessage {
  role:  string;
  parts: Array<{ text?: string; data?: Record<string, unknown> }>;
}

// ── SSE helpers ───────────────────────────────────────────────────────────────

function sseEvent(event: string, data: unknown): string {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

// ── Rate limit ────────────────────────────────────────────────────────────────

async function checkRateLimit(userId: string): Promise<boolean> {
  try {
    const redis  = getRedis();
    const bucket = `ratelimit:agent:${userId}`;
    const count  = await redis.incr(bucket);
    if (count === 1) await redis.expire(bucket, RATE_WINDOW_S);
    return count <= RATE_LIMIT;
  } catch {
    return true; // Redis down — allow through
  }
}

// ── Handler ───────────────────────────────────────────────────────────────────

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: 'Invalid JSON' }, { status: 400 });
  }

  if (!(await checkRateLimit(locals.user.id))) {
    return json(
      { error: `Rate limit exceeded — max ${RATE_LIMIT} agent calls per minute` },
      { status: 429 },
    );
  }

  // Detect A2A vs native by presence of 'message' key (A2A Task shape)
  const isA2A = typeof body === 'object' && body !== null && 'message' in body;

  if (isA2A) {
    return handleA2ATask(body, request, locals.user.id);
  }

  return handleNative(body, locals.user.id);
};

// ── Native handler ────────────────────────────────────────────────────────────

async function handleNative(body: unknown, userId: string): Promise<Response> {
  const parsed = NativeSchema.safeParse(body);
  if (!parsed.success) {
    return json({ error: parsed.error.issues[0]?.message ?? 'Bad request' }, { status: 400 });
  }

  const { query, systemPrompt, pipeline, bypassCache, metadata } = parsed.data;

  try {
    const result = await runGemma4Agent(query, {
      systemPrompt,
      pipeline,
      userId,
      sessionId: userId,
      bypassCache,
      metadata,
    });
    const cacheHit = result.cacheTier === 'L1_redis' || result.cacheTier === 'L2_qdrant';
    recordSearchQuery({ query, pipeline: pipeline as HitPipeline, cacheHit, userId });
    return json(result);
  } catch (err) {
    const message = (err as Error).message;
    console.error('[agent] native call failed:', message);
    return json(
      {
        error: 'Agent failed — model may be unavailable',
        ...(ENV.NODE_ENV !== 'production' || ENV.DEV_BYPASS_AUTH ? { detail: message } : {}),
      },
      { status: 503 }
    );
  }
}

// ── A2A handler ───────────────────────────────────────────────────────────────

async function handleA2ATask(body: unknown, request: Request, userId: string): Promise<Response> {
  const parsed = A2ATaskSchema.safeParse(body);
  if (!parsed.success) {
    return json(
      { error: { code: -32600, message: parsed.error.issues[0]?.message ?? 'Invalid Task' } },
      { status: 400 },
    );
  }

  const task = parsed.data;

  // Extract text query from first text part
  const textPart = task.message.parts.find((p): p is { text: string } => 'text' in p);
  if (!textPart) {
    return json({ error: { code: -32600, message: 'Task message must contain a text part' } }, { status: 400 });
  }

  const query    = textPart.text;
  const pipeline = (task.metadata?.pipeline as string | undefined) ?? 'ace';

  recordSearchQuery({ query, pipeline: pipeline as HitPipeline, cacheHit: false, userId });

  // Streaming A2A (tasks/sendSubscribe) — client sends Accept: text/event-stream
  const wantsStream = request.headers.get('accept')?.includes('text/event-stream');

  if (wantsStream) {
    return handleA2AStream(task.id, query, pipeline, userId);
  }

  // Non-streaming A2A (tasks/send) — return completed TaskResult
  try {
    const result = await runGemma4Agent(query, {
      pipeline,
      userId,
      sessionId: userId,
      metadata: task.metadata,
    });

    const taskResult: A2ATaskResult = {
      id: task.id,
      status: { state: 'completed' },
      artifacts: [
        {
          name: 'answer',
          parts: [{ text: result.answer }],
        },
        {
          name: 'metadata',
          parts: [
            {
              data: {
                toolsUsed: result.toolsUsed,
                rounds: result.rounds,
                durationMs: result.durationMs,
                sources: result.sources,
                cacheTrace: result.cacheTrace,
                errorFixMemoryHit: result.errorFixMemoryHit,
                verificationStatus: result.verificationStatus,
              },
            },
          ],
        },
      ],
      metadata: { pipeline, userId },
    };

    return json(taskResult);
  } catch (err) {
    const message = (err as Error).message;
    console.error('[agent] A2A task failed:', message);

    const failedResult: A2ATaskResult = {
      id: task.id,
      status: {
        state: 'failed',
        message: {
          role: 'agent',
          parts: [
            {
              text:
                ENV.NODE_ENV !== 'production' || ENV.DEV_BYPASS_AUTH
                  ? `Agent failed — ${message}`
                  : 'Agent failed — model may be unavailable',
            },
          ],
        },
      },
    };
    return json(failedResult, { status: 503 });
  }
}

// ── A2A SSE streaming (tasks/sendSubscribe) ───────────────────────────────────

function handleA2AStream(taskId: string, query: string, pipeline: string, userId: string): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const enc = new TextEncoder();
      const send = (event: string, data: unknown) =>
        controller.enqueue(enc.encode(sseEvent(event, data)));

      // Emit: submitted
      send('task_status', {
        id:     taskId,
        status: { state: 'submitted' },
        final:  false,
      });

      // Emit: working
      send('task_status', {
        id:     taskId,
        status: { state: 'working' },
        final:  false,
      });

      try {
        const result = await runGemma4Agent(query, {
          pipeline,
          userId,
          sessionId: userId,
          metadata: {
            source: 'a2a-stream',
            ...(typeof taskId === 'string' ? { route: taskId } : {}),
          },
        });

        // Emit answer artifact
        send('task_artifact', {
          id:       taskId,
          artifact: {
            name:  'answer',
            index: 0,
            parts: [{ text: result.answer }],
          },
        });

        // Emit metadata artifact
        send('task_artifact', {
          id:       taskId,
          artifact: {
            name:  'metadata',
            index: 1,
            parts: [{ data: {
              toolsUsed:  result.toolsUsed,
              rounds:     result.rounds,
              durationMs: result.durationMs,
            }}],
          },
        });

        // Emit: completed (final)
        send('task_status', {
          id:     taskId,
          status: { state: 'completed' },
          final:  true,
        });
      } catch (err) {
        console.error('[agent] A2A stream failed:', (err as Error).message);
        send('task_status', {
          id:     taskId,
          status: {
            state:   'failed',
            message: { role: 'agent', parts: [{ text: 'Agent failed' }] },
          },
          final: true,
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type':  'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection':    'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
}
