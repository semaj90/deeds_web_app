import type { RequestHandler } from '@sveltejs/kit';
import JobStateMachine from '../../../../lib/workers/job-state-machine';
import LokiStore from '../../../../lib/workers/loki-store';

// singleton store + machine
const globalAny = globalThis as any;
if (!globalAny.__job_store) {
  globalAny.__job_store = new LokiStore();
  globalAny.__job_machine = new JobStateMachine(globalAny.__job_store, { concurrency: 4 });
}

const store: LokiStore = globalAny.__job_store;
const machine: JobStateMachine = globalAny.__job_machine;

export const GET: RequestHandler = async ({ request }) => {
  const headers = new Headers({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
  });

  const stream = new ReadableStream({
    start(controller) {
      const send = (data: any) => {
        try {
          const payload = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(new TextEncoder().encode(payload));
        } catch (e) {
          // ignore
        }
      };

      // send initial snapshot
      machine
        .list()
        .then((list) => send({ type: 'snapshot', items: list }))
        .catch(() => {});

      const onUpdate = (rec: any) => send({ type: 'update', item: rec });
      const onRemove = (id: string) => send({ type: 'remove', id });

      store.on('update', onUpdate);
      store.on('remove', onRemove);

      // cleanup when closed
      const cleanup = () => {
        store.off('update', onUpdate);
        store.off('remove', onRemove);
        controller.close();
      };

      // attempt to detect client disconnect via request.signal
      request.signal.addEventListener('abort', () => cleanup());
    },
    cancel() {
      // noop
    },
  });

  return new Response(stream, { headers });
};

export const POST: RequestHandler = async ({ request }) => {
  // accept a small ping or control (not implemented fully) - return current list
  const list = await machine.list();
  return new Response(JSON.stringify({ items: list }), {
    headers: { 'Content-Type': 'application/json' },
  });
};
