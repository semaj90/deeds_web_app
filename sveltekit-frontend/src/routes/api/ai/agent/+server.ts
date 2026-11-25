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
import { pool }           from '$lib/server/db/client.js';
import { findRepoRoot, searchDocCorpus } from '$lib/server/atlas/docs/doc-intelligence-read-model.js';
import { readVerifiedCanonicalDocChunksV1 } from '$lib/server/atlas/docs/external-doc-citation-readback-v1.js';
import { buildExternalDocContextManifestV1 } from '$lib/server/atlas/docs/external-doc-context-manifest-v1.js';
import { recommendFromOfficialDocReadbackV1 } from '$lib/server/atlas/docs/external-doc-dspy-v1.js';
import { readOpenSpecTaskReceiptView } from '$lib/server/atlas/openspec-board/task-receipt-view-v1.js';
import { runGemma4Agent } from '$lib/server/ai/gemma4-agent.js';

const a2aAdmittedDocContextRequestSchema = z.object({
  query: z.string().min(2).max(300),
  product: z.string().min(1).max(100).optional(),
  productVersion: z.string().min(1).max(100).optional(),
  limit: z.number().int().min(1).max(10).default(5),
  recommend: z.boolean().default(false),
  canonicalOfficialOnly: z.boolean().default(true),
  taskRef: z.object({
    logicalTaskKey: z.string().min(1).max(512),
    taskRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  }).strict(),
}).strict();
import { getRedis }       from '$lib/server/redis.js';
import { recordSearchQuery, type HitPipeline } from '$lib/server/features/observability/index.js';
import { ENV } from '$lib/server/env.server.js';
import {
  a2aConflictFreeBatchProposalRequestV1Schema,
  a2aErrorFixProposalRequestV1Schema,
  buildA2AConflictFreeBatchProposalResultV1,
  buildA2AErrorFixProposalResultV1,
} from '$lib/server/atlas/kanban-acp-dag-contracts.js';
import { readErrorFixTaskReceiptV1 } from '$lib/server/atlas/openspec-board/error-fix-task-receipt-v1.js';
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
      metadata: {
        ...(metadata ?? {}),
        taskId: (metadata as Record<string, unknown> | undefined)?.taskId ?? null,
      },
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

  // Shares ACP's proposal-only contract; it does not call the model or execute a repair.
  if (task.metadata?.skill === 'agentic-error-fix-proposal') {
    const errorFix = a2aErrorFixProposalRequestV1Schema.safeParse(task.metadata.errorFix);
    if (!errorFix.success) {
      return json(
        { error: { code: -32602, message: 'Invalid agentic-error-fix-proposal input' } },
        { status: 400 },
      );
    }
    const result = buildA2AErrorFixProposalResultV1({ requestId: task.id, errorFix: errorFix.data });
    const ref = errorFix.data.workboardTaskRef;
    if (!ref) return json(result);

    return json({
      ...result,
      metadata: {
        ...result.metadata,
        workboardReceipt: await readErrorFixTaskReceiptV1(ref)
      }
    });
  }

  if (task.metadata?.skill === 'agentic-conflict-free-batch-proposal') {
    const batch = a2aConflictFreeBatchProposalRequestV1Schema.safeParse(task.metadata.batch);
    if (!batch.success) {
      return json(
        { error: { code: -32602, message: 'Invalid agentic-conflict-free-batch-proposal input' } },
        { status: 400 },
      );
    }
    return json(buildA2AConflictFreeBatchProposalResultV1({ requestId: task.id, batch: batch.data }));
  }

  if (task.metadata?.skill === 'external-doc-admitted-context') {
    const parsed = a2aAdmittedDocContextRequestSchema.safeParse(task.metadata.docQuery);
    if (!parsed.success) {
      return json(
        { error: { code: -32602, message: 'Invalid external-doc-admitted-context input' } },
        { status: 400 },
      );
    }
    const taskLookup = await readOpenSpecTaskReceiptView(parsed.data.taskRef.logicalTaskKey);
    if (taskLookup.status !== 'FOUND' || taskLookup.task.checkboxState !== 'Open'
      || taskLookup.task.key !== parsed.data.taskRef.logicalTaskKey
      || taskLookup.task.revision !== parsed.data.taskRef.taskRevision
      || !taskLookup.identity.logicalTaskKey
      || taskLookup.identity.logicalTaskKey !== parsed.data.taskRef.logicalTaskKey) {
      return json({
        jsonrpc: '2.0', id: task.id,
        error: { code: -32009, message: 'Open workboard task reference is missing, stale, or not open' },
      }, { status: 409 });
    }
    const taskBinding = {
      schema: 'atlas.documentation-task-binding.v1' as const,
      logicalTaskKey: taskLookup.identity.logicalTaskKey,
      taskRevision: taskLookup.task.revision,
      sourceRef: taskLookup.task.sourceRef,
      sourceFileSha256: taskLookup.identity.sourceFileSha256,
      workboardSnapshotSha256: taskLookup.identity.workboardSnapshotSha256,
    };
    const docResult = await searchDocCorpus({
      pool,
      root: process.cwd(),
      q: parsed.data.query,
      limit: parsed.data.recommend ? Math.min(parsed.data.limit, 4) : parsed.data.limit,
      product: parsed.data.product ?? null,
      productVersion: parsed.data.productVersion ?? null,
      canonicalOfficialOnly: parsed.data.canonicalOfficialOnly
    });
    const citationReadback = await readVerifiedCanonicalDocChunksV1({ pool, hits: docResult.hits });
    const contextManifest = buildExternalDocContextManifestV1({
      requestId: task.id,
      query: parsed.data.query,
      tokenBudget: 2048,
      readback: citationReadback,
      taskBinding,
    });
    const citations = contextManifest ? citationReadback.citations : [];
    const recommendation = parsed.data.recommend
      ? await recommendFromOfficialDocReadbackV1({
          requestId: task.id,
          query: parsed.data.query,
          readback: citationReadback,
          taskBinding,
          python: ENV.PYTHON_PATH,
          llamaUrl: ENV.LLAMA_SERVER_URL,
          repoRoot: findRepoRoot(),
          signal: request.signal,
        })
      : null;
    return json({
      jsonrpc: '2.0',
      id: task.id,
      result: {
        id: task.id,
        status: { state: 'completed' },
        artifacts: [
          {
            artifactId: `admitted-doc-context:${task.id}`,
            name: 'atlas.a2a-doc-artifact.v1',
            parts: [
              {
                type: 'data',
                data: {
                  schema: 'atlas.a2a-doc-artifact.v1',
                  canonicalAuthority: false,
                  writesPerformed: false,
                  mode: docResult.mode,
                  query: docResult.query,
                  citationReadbackStatus: citationReadback.status,
                  citationBlockers: citationReadback.blockers,
                  contextManifest,
                  recommendation,
                  citations
                }
              }
            ]
          }
        ]
      }
    });
  }

  // Extract text query from first text part
  const textPart = task.message.parts.find((p): p is { text: string } => 'text' in p);
  if (!textPart) {
    return json({ error: { code: -32600, message: 'Task message must contain a text part' } }, { status: 400 });
  }

  const query    = textPart.text;
  const pipeline = (task.metadata?.pipeline as string | undefined) ?? 'ace';

  recordSearchQuery({ query, pipeline: pipeline as HitPipeline, cacheHit: false, userId });

  // A2A skill "openspec-workboard": same read-only handler as the ACP tool
  // openspec:workboard_recommend (WORKBOARD-03). No LLM round, no writes.
  if (task.metadata?.skill === 'openspec-workboard') {
    const { executeACPTool } = await import('$lib/server/services/knowledge-search/ACPToolRegistry.js');
    const res = await executeACPTool('openspec:workboard_recommend', {
      limit: task.metadata?.limit,
      change_id: task.metadata?.change_id,
      released_events: task.metadata?.released_events,
    });
    return json({
      id: task.id,
      status: { state: res.success ? 'completed' : 'failed' },
      artifacts: [{ name: 'workboard', parts: [{ data: res.success ? res.data : { error: res.error } }] }],
      metadata: { skill: 'openspec-workboard', userId },
    });
  }

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
      metadata: {
        ...(task.metadata ?? {}),
        taskId: task.id,
      },
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
                goToolClusterContext: result.goToolClusterContext,
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
            taskId,
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
