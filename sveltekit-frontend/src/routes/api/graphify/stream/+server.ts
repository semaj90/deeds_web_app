/**
 * GET  /api/graphify/stream
 *
 * Server-Sent Events endpoint for real-time graph construction progress.
 * Emits events as the rg + ast-grep hybrid indexer parses files, extracts
 * AST nodes, builds the JSONB relationship graph, and writes to Qdrant.
 *
 * Pipeline:
 *   rg (file discovery) -> ast-grep (AST extraction)
 *   -> JSONB (Postgres graph storage)
 *   -> Qdrant (semantic similarity indexing)
 *   -> Redis (TOON compression cache)
 *
 * Query params:
 *   runId   — UUID of an active graphify run to follow
 *   scope   — optional path prefix filter (e.g. "src/lib/server")
 *
 * Event types emitted:
 *   connected    → { runId, timestamp }
 *   file_parsed  → { file, nodeCount, edgeCount }
 *   graph_built  → { nodes, edges, collections }
 *   qdrant_sync  → { vectors, collections, elapsed }
 *   toon_warm    → { keys, hitRate }
 *   error        → { message }
 *   done         → { runId, totalFiles, totalNodes, totalEdges, elapsed }
 *   ping         → { timestamp }
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth-utils.js';
import { getRedis } from '$lib/server/redis.js';

const GRAPHIFY_POLL_MS = 500;
const KEEPALIVE_MS = 25_000;
const MAX_STREAM_MS = 10 * 60 * 1_000; // 10 min for large codebases

export const GET: RequestHandler = async (event) => {
  requireUser(event);

  const runId = event.url.searchParams.get('runId');
  if (!runId) {
    return json({ error: 'runId is required' }, { status: 400 });
  }

  const scope = event.url.searchParams.get('scope') ?? null;
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (eventName: string, data: unknown) => {
        try {
          controller.enqueue(
            encoder.encode(`event: ${eventName}\ndata: ${JSON.stringify(data)}\n\n`)
          );
        } catch {
          // client disconnected
        }
      };

      send('connected', { runId, scope, timestamp: new Date().toISOString() });

      const startTime = Date.now();
      let done = false;
      let lastSeq = 0;

      const pingId = setInterval(() => {
        if (!done) send('ping', { timestamp: new Date().toISOString() });
      }, KEEPALIVE_MS);

      const pollId = setInterval(async () => {
        if (done || Date.now() - startTime > MAX_STREAM_MS) {
          clearInterval(pollId);
          clearInterval(pingId);
          if (!done) send('error', { message: 'Graphify stream timeout' });
          controller.close();
          return;
        }

        try {
          const redis = getRedis();

          // Read run status
          const statusRaw = await redis.get(`graphify:run:${runId}:status`);
          if (!statusRaw) return;

          const status = JSON.parse(statusRaw) as {
            phase: 'parsing' | 'graph' | 'qdrant' | 'toon' | 'done' | 'error';
            totalFiles: number;
            parsedFiles: number;
            totalNodes: number;
            totalEdges: number;
            collections: string[];
            vectors: number;
            error?: string;
          };

          // Stream incremental file events from a Redis list
          const eventsKey = `graphify:run:${runId}:events`;
          const eventsRaw = await redis.lrange(eventsKey, lastSeq, lastSeq + 19);
          for (const raw of eventsRaw) {
            try {
              const ev = JSON.parse(raw) as { type: string; [k: string]: unknown };
              send(ev.type, ev);
              lastSeq++;
            } catch {
              // malformed event — skip
            }
          }

          // Emit phase-level progress
          if (status.phase === 'parsing') {
            send('file_parsed', {
              file: null,
              nodeCount: status.totalNodes,
              edgeCount: status.totalEdges,
              parsedFiles: status.parsedFiles,
              totalFiles: status.totalFiles,
            });
          } else if (status.phase === 'qdrant') {
            send('qdrant_sync', {
              vectors: status.vectors,
              collections: status.collections,
              elapsed: Date.now() - startTime,
            });
          } else if (status.phase === 'toon') {
            send('toon_warm', { keys: status.vectors, hitRate: 0 });
          } else if (status.phase === 'done') {
            send('done', {
              runId,
              totalFiles: status.totalFiles,
              totalNodes: status.totalNodes,
              totalEdges: status.totalEdges,
              elapsed: Date.now() - startTime,
            });
            done = true;
            clearInterval(pollId);
            clearInterval(pingId);
            controller.close();
          } else if (status.phase === 'error') {
            send('error', { message: status.error ?? 'Graphify run failed' });
            done = true;
            clearInterval(pollId);
            clearInterval(pingId);
            controller.close();
          }
        } catch (err) {
          send('error', { message: (err as Error)?.message ?? 'Poll error' });
        }
      }, GRAPHIFY_POLL_MS);
    },

    cancel() {
      // Client disconnected
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-store',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    },
  });
};
