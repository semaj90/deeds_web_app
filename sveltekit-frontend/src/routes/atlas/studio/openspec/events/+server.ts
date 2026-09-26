import type { RequestHandler } from './$types';
import { computeOpenSpecReportFingerprint } from '$lib/server/atlas/openspec-board/report-reader';

export const GET: RequestHandler = async ({ request }) => {
  const encoder = new TextEncoder();
  let closed = false;
  let timer: ReturnType<typeof setInterval> | null = null;
  let previous = await computeOpenSpecReportFingerprint();

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      };

      send('ready', { fingerprint: previous });
      timer = setInterval(async () => {
        try {
          const next = await computeOpenSpecReportFingerprint();
          if (next !== previous) {
            previous = next;
            send('changed', { fingerprint: next });
          } else {
            send('heartbeat', { ok: true });
          }
        } catch (error) {
          send('error', { message: error instanceof Error ? error.message : String(error) });
        }
      }, 3000);

      request.signal.addEventListener('abort', () => {
        closed = true;
        if (timer) clearInterval(timer);
        try { controller.close(); } catch { /* already closed */ }
      }, { once: true });
    },
    cancel() {
      closed = true;
      if (timer) clearInterval(timer);
    }
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive'
    }
  });
};
