/**
 * GET  /api/ingestion/stream
 *
 * Server-Sent Events endpoint for document ingestion progress.
 * Clients connect with EventSource and receive real-time progress updates
 * as documents are parsed, chunked, embedded, and indexed into Qdrant.
 *
 * Query params:
 *   jobId    — UUID of an active ingestion job to follow
 *   caseId   — optional case UUID to scope ingestion status
 *
 * Event types emitted:
 *   connected     → { jobId, timestamp }
 *   progress      → { jobId, stage, percent, message, chunkCount }
 *   chunk_indexed → { chunkId, collectionName, score }
 *   error         → { message }
 *   done          → { jobId, totalChunks, collectionName, elapsed }
 *   ping          → { timestamp }     (keep-alive every 25s)
 */

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { requireUser } from '$lib/server/auth-utils.js';
import { getRedis } from '$lib/server/redis.js';

const INGESTION_POLL_MS = 800;
const KEEPALIVE_MS = 25_000;
const MAX_STREAM_MS = 5 * 60 * 1_000; // 5 min max

export const GET: RequestHandler = async (event) => {
  requireUser(event);

  const jobId = event.url.searchParams.get('jobId');
  if (!jobId) {
    return json({ error: 'jobId is required' }, { status: 400 });
  }

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

      send('connected', { jobId, timestamp: new Date().toISOString() });

      const startTime = Date.now();
      let done = false;
      let lastStage = '';

      const pingId = setInterval(() => {
        if (!done) send('ping', { timestamp: new Date().toISOString() });
      }, KEEPALIVE_MS);

      const pollId = setInterval(async () => {
        if (done || Date.now() - startTime > MAX_STREAM_MS) {
          clearInterval(pollId);
          clearInterval(pingId);
          if (!done) send('error', { message: 'Ingestion stream timeout' });
          controller.close();
          return;
        }

        try {
          const redis = getRedis();
          const raw = await redis.get(`ingest:job:${jobId}`);
          if (!raw) return;

          const job = JSON.parse(raw) as {
            stage: string;
            percent: number;
            message: string;
            chunkCount: number;
            totalChunks?: number;
            collectionName?: string;
            status?: string;
            error?: string;
          };

          // Always emit progress on stage change or percent update
          if (job.stage !== lastStage || job.percent % 5 === 0) {
            send('progress', {
              jobId,
              stage: job.stage,
              percent: job.percent,
              message: job.message,
              chunkCount: job.chunkCount,
            });
            lastStage = job.stage;
          }

          if (job.status === 'done') {
            send('done', {
              jobId,
              totalChunks: job.totalChunks ?? job.chunkCount,
              collectionName: job.collectionName ?? 'unknown',
              elapsed: Date.now() - startTime,
            });
            done = true;
            clearInterval(pollId);
            clearInterval(pingId);
            controller.close();
          } else if (job.status === 'error') {
            send('error', { message: job.error ?? 'Ingestion failed' });
            done = true;
            clearInterval(pollId);
            clearInterval(pingId);
            controller.close();
          }
        } catch (err) {
          send('error', { message: (err as Error)?.message ?? 'Poll error' });
        }
      }, INGESTION_POLL_MS);
    },

    cancel() {
      // Client disconnected — intervals cleared by their references above
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
