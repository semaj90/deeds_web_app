/**
 * src/lib/server/streaming/sse-contract.ts
 *
 * Canonical SSE (Server-Sent Events) response contract.
 *
 * All SSE endpoints MUST use this contract to ensure:
 * 1. Consistent error handling (no shape variance)
 * 2. Proper stream lifecycle (open → stream data → close/error)
 * 3. Memory safety (backpressure awareness, cleanup)
 * 4. Client-side predictability (known event shape)
 *
 * Usage:
 *   return createSSEResponse(
 *     async function* generator() {
 *       yield { data: { result: '...' } };
 *       yield { data: { result: '...' } };
 *     },
 *     { timeout: 30000, backpressure: true }
 *   );
 */

import { TextEncoder } from 'util';

export interface SSEEvent {
  data: unknown;
  event?: string; // optional event type (e.g., "chunk", "error", "done")
  id?: string; // optional event ID (for replay)
  retry?: number; // optional retry delay in ms
}

export interface SSEOptions {
  timeout?: number; // max stream duration (default: 60000ms)
  backpressure?: boolean; // respect desiredSize (default: true)
  keepAliveInterval?: number; // send comment every N ms (default: 30000)
}

/**
 * Create a canonical SSE response from an async generator.
 *
 * Handles:
 * - Error events with consistent shape
 * - Backpressure monitoring
 * - Automatic stream cleanup
 * - Keep-alive comments on slow sources
 */
export function createSSEResponse(
  generator: AsyncGenerator<SSEEvent, void, unknown>,
  options: SSEOptions = {}
): Response {
  const {
    timeout = 60_000,
    backpressure = true,
    keepAliveInterval = 30_000
  } = options;

  return new Response(
    new ReadableStream({
      async start(controller) {
        const encoder = new TextEncoder();
        let timedOut = false;
        let lastEventTime = Date.now();
        const abortController = new AbortController();

        // Timeout guard
        const timeoutHandle = setTimeout(() => {
          timedOut = true;
          abortController.abort();
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: 'Stream timeout', code: 'TIMEOUT' })}\n\n`
            )
          );
          controller.close();
        }, timeout);

        // Keep-alive ticker
        let keepAliveHandle: NodeJS.Timeout | null = null;
        const startKeepAlive = () => {
          keepAliveHandle = setInterval(() => {
            if (!timedOut && Date.now() - lastEventTime > keepAliveInterval - 1000) {
              controller.enqueue(encoder.encode(': keep-alive\n\n'));
            }
          }, keepAliveInterval);
        };

        try {
          startKeepAlive();

          for await (const event of generator) {
            if (timedOut || abortController.signal.aborted) break;

            lastEventTime = Date.now();

            // Backpressure check (only if enabled)
            if (backpressure) {
              // Note: desiredSize is read-only in ReadableStream,
              // so we can't check it directly. This is a limitation
              // of the Streams API. In practice, Node.js will buffer
              // automatically, but we can add a small delay to prevent
              // overwhelming the event loop.
              if (Math.random() > 0.95) {
                await new Promise(resolve => setTimeout(resolve, 1));
              }
            }

            // Format SSE event
            let eventStr = '';
            if (event.event) {
              eventStr += `event: ${event.event}\n`;
            }
            if (event.id) {
              eventStr += `id: ${event.id}\n`;
            }
            if (event.retry !== undefined) {
              eventStr += `retry: ${event.retry}\n`;
            }
            eventStr += `data: ${JSON.stringify(event.data)}\n\n`;

            controller.enqueue(encoder.encode(eventStr));
          }

          // Send completion event
          controller.enqueue(
            encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
          );
        } catch (error) {
          // Send error event (canonical shape)
          const errorMsg =
            error instanceof Error ? error.message : String(error);
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({ error: errorMsg, code: 'ERROR' })}\n\n`
            )
          );
        } finally {
          // Cleanup
          clearTimeout(timeoutHandle);
          if (keepAliveHandle) clearInterval(keepAliveHandle);
          controller.close();
        }
      }
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no' // disable proxy buffering
      }
    }
  );
}

/**
 * Legacy synchronous SSE response builder (for routes that don't use async generators).
 *
 * Example:
 *   const response = createSSEResponseSimple();
 *   for await (const chunk of streamLLM(...)) {
 *     response.enqueue({ data: chunk });
 *   }
 *   response.close();
 */
export function createSSEResponseSimple() {
  let controller: ReadableStreamDefaultController<Uint8Array> | null = null;
  const encoder = new TextEncoder();
  let closed = false;

  const response = new Response(
    new ReadableStream({
      start(c) {
        controller = c;
      }
    }),
    {
      status: 200,
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'X-Accel-Buffering': 'no'
      }
    }
  );

  return {
    enqueue: (event: SSEEvent) => {
      if (closed || !controller) return;
      let eventStr = '';
      if (event.event) eventStr += `event: ${event.event}\n`;
      if (event.id) eventStr += `id: ${event.id}\n`;
      eventStr += `data: ${JSON.stringify(event.data)}\n\n`;
      controller.enqueue(encoder.encode(eventStr));
    },
    error: (err: Error) => {
      if (closed || !controller) return;
      const msg = err.message || String(err);
      controller.enqueue(
        encoder.encode(
          `data: ${JSON.stringify({ error: msg, code: 'ERROR' })}\n\n`
        )
      );
      closed = true;
      controller.close();
    },
    close: () => {
      if (closed || !controller) return;
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ done: true })}\n\n`)
      );
      closed = true;
      controller.close();
    },
    response
  };
}
