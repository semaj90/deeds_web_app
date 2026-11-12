import { json } from '@sveltejs/kit';
/**
 * Phase 76: Server-Sent Events (SSE) Endpoint
 * Enhanced with heartbeat, error handling, and proper cleanup
 *
 * ChatSession connects to /api/sse/${chatId} - this endpoint handles that
 *
 * Delivery contract (resumable, duplicate-free):
 *  - Producers append each token ONCE to the Valkey stream and publish it with the stream ID as
 *    `eventId` (see publishTokenDelta). This route sends that ID as the SSE `id:`.
 *  - On reconnect the browser sends `Last-Event-ID` (or `?lastEventId=`); we subscribe FIRST
 *    (buffering live messages), replay stream entries AFTER the cursor (exclusive range), then flush
 *    the buffer, dropping anything at or before the last delivered ID. No gap, no duplicates.
 *  - Messages without an `eventId` (e.g. collaboration presence/cursor events) are ephemeral: they
 *    are relayed without an `id:` and are not replayable.
 *  - If history cannot be replayed we send `event: resync` so the client fetches a snapshot
 *    instead of assuming the missing tokens were delivered.
 *
 * SECURITY (deferred, tracked in CLAUDE.md G4/G5): this route does not verify that the user owns
 * the chat/case in `params.id` before subscribing or replaying. Do not rely on the ID being secret.
 */

import type IORedis from 'ioredis';

import { getRedis } from '$lib/server/redis.js';
import { readTokenStream } from '$lib/server/redis-streams.js';
import { sseFormat, sseHeaders } from '$lib/server/streaming/sse-utils.js';
import { compareStreamIds, isStreamId, parseResumeCursor } from '$lib/server/streaming/sse-cursor.js';
import type { RequestHandler } from './$types';
import { isUuid, isValidSafeId } from '$lib/server/validation.js';

const REPLAY_PAGE_SIZE = 100;
// 20 pages x 100 = 2000 entries, the stream's MAXLEN cap, so this is the whole retained history.
const REPLAY_MAX_PAGES = 20;
// Live messages buffered while replaying. Beyond this we drop the buffer and ask for a resync.
const PENDING_CAP = 2000;

// Shared Redis pub/sub connection — ONE connection for ALL SSE clients
// Each client registers a callback; the shared subscriber fans out messages
let sharedSubscriber: IORedis | null = null;
const channelCallbacks = new Map<string, Set<(message: string) => void>>();

function getSharedSubscriber(): IORedis {
  if (!sharedSubscriber || sharedSubscriber.status === 'end') {
    // Dedicated subscriber connection duplicated from the shared client: same host/port/password
    // options as every other server-side Redis use. Do not build it from REDIS_URL: .env.local can
    // override it with a URL that has no password, which Valkey rejects with NOAUTH.
    sharedSubscriber = getRedis().duplicate({ maxRetriesPerRequest: 2 });
    sharedSubscriber.on('message', (channel: string, message: string) => {
      const cbs = channelCallbacks.get(channel);
      if (cbs) {
        for (const cb of cbs) {
          try { cb(message); } catch { /* individual callback error */ }
        }
      }
    });
    sharedSubscriber.on('error', (err) => {
      console.warn('[SSE shared sub] Redis error:', err.message);
    });
  }
  return sharedSubscriber;
}

async function subscribeChannel(channel: string, cb: (message: string) => void): Promise<void> {
  const sub = getSharedSubscriber();
  if (!channelCallbacks.has(channel)) {
    channelCallbacks.set(channel, new Set());
    await sub.subscribe(channel);
  }
  channelCallbacks.get(channel)!.add(cb);
}

async function unsubscribeChannel(channel: string, cb: (message: string) => void): Promise<void> {
  const cbs = channelCallbacks.get(channel);
  if (!cbs) return;
  cbs.delete(cb);
  if (cbs.size === 0) {
    channelCallbacks.delete(channel);
    try { await sharedSubscriber?.unsubscribe(channel); } catch { /* ignore */ }
  }
}

export const GET: RequestHandler = async ({ params, request, locals, url }) => {
  if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
  const chatId = params.id;

  if (!isUuid(chatId) && !isValidSafeId(chatId)) {
    return new Response('Invalid ID format', { status: 400 });
  }

  // Resume cursor: a validated stream ID, or null for a fresh connection.
  const resumeFrom = parseResumeCursor(request.headers, url);

  let closed = false;
  let heartbeatInterval: ReturnType<typeof setInterval> | null = null;
  let messageCallback: ((message: string) => void) | null = null;
  const channel = `updates:${chatId}`;

  console.log(`[SSE] connection request for chat:${chatId}${resumeFrom ? ` (resume after ${resumeFrom})` : ''}`);

  const cleanup = () => {
    closed = true;
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      heartbeatInterval = null;
    }
    if (messageCallback) {
      unsubscribeChannel(channel, messageCallback).catch(() => {});
      messageCallback = null;
    }
  };

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      const write = (event: string, data: unknown, id?: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(sseFormat(event, data, id)));
        } catch (e) {
          console.warn('SSE write failed:', e);
        }
      };

      // Highest stream ID delivered on this connection; anything <= it is a duplicate/stale.
      let lastDelivered: string | null = resumeFrom;

      const deliver = (data: Record<string, unknown>) => {
        const eventId = isStreamId(data.eventId) ? data.eventId : null;
        if (eventId) {
          if (lastDelivered && compareStreamIds(eventId, lastDelivered) <= 0) return;
          lastDelivered = eventId;
        }
        write('message', data, eventId ?? undefined);
      };

      const handleLive = (message: string) => {
        let data: Record<string, unknown>;
        try {
          const parsed = JSON.parse(message);
          data = parsed && typeof parsed === 'object' ? parsed : { type: 'delta', content: message };
        } catch {
          data = { type: 'delta', content: message };
        }
        deliver(data);
      };

      try {
        // 1. Subscribe FIRST so nothing published during replay is lost. Buffer while replaying.
        let replaying = resumeFrom !== null;
        let overflowed = false;
        const pending: string[] = [];
        messageCallback = (message: string) => {
          if (!replaying) return handleLive(message);
          if (pending.length >= PENDING_CAP) {
            overflowed = true;
            return;
          }
          pending.push(message);
        };
        await subscribeChannel(channel, messageCallback);
        console.log(`[SSE] subscribed to ${channel}`);

        // 2. Replay entries strictly AFTER the cursor ('(' = exclusive range start).
        let replayFailed = false;
        if (resumeFrom) {
          try {
            let from = `(${resumeFrom}`;
            let replayed = 0;
            for (let page = 0; page < REPLAY_MAX_PAGES; page++) {
              const entries = await readTokenStream(chatId, from, REPLAY_PAGE_SIZE);
              for (const entry of entries) {
                const event = typeof entry.meta.event === 'string' ? entry.meta.event : null;
                const payload =
                  entry.meta.payload && typeof entry.meta.payload === 'object' ? entry.meta.payload : {};
                deliver(
                  event
                    ? { ...payload, type: event, eventId: entry.id, replayed: true }
                    : entry.done
                      ? { type: 'done', eventId: entry.id, replayed: true }
                      : { type: 'delta', content: entry.chunk, seq: entry.seq, eventId: entry.id, replayed: true }
                );
                replayed++;
              }
              if (entries.length < REPLAY_PAGE_SIZE) break;
              from = `(${entries[entries.length - 1].id}`;
            }
            if (replayed > 0) console.log(`[SSE] Replayed ${replayed} entries for chat:${chatId}`);
          } catch (err) {
            replayFailed = true;
            console.warn('[SSE] replay failed:', (err as Error).message);
          }
        }

        // 3. Tell the client when history could not be fully restored; it must fetch a snapshot.
        if (replayFailed || overflowed) {
          write('resync', { chatId, reason: replayFailed ? 'REPLAY_UNAVAILABLE' : 'REPLAY_BUFFER_OVERFLOW' });
        }

        write('ready', { chatId, timestamp: new Date().toISOString(), resumedFrom: resumeFrom });

        // 4. Flush what arrived during replay (deliver() drops anything already sent), go live.
        replaying = false;
        for (const message of pending.splice(0)) handleLive(message);

        // Keepalive ping every 15 seconds
        heartbeatInterval = setInterval(() => {
          write('ping', { t: Date.now() });
        }, 15000);
      } catch (error) {
        console.error('SSE Redis connection failed:', error);
        write('error', { message: 'Failed to connect to message stream' });
        cleanup();
        controller.close();
      }
    },

    cancel() {
      console.log(`[SSE] connection closed for chat:${chatId}`);
      cleanup();
    },
  });

  // Handle client disconnect via abort signal
  request.signal.addEventListener('abort', cleanup);

  return new Response(stream, { headers: sseHeaders() });
};
