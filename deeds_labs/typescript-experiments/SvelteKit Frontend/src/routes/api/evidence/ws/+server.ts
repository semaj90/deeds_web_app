import type { RequestHandler } from '@sveltejs/kit';
import { registerEvidenceSocket } from '$lib/server/evidence/socketManager';

export const GET: RequestHandler = ({ request }) => {
  if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
    return new Response('Expected WebSocket upgrade', { status: 426 });
  }

  const pair = (globalThis as any).WebSocketPair ? new (globalThis as any).WebSocketPair() : null;

  if (!pair) {
    return new Response('WebSocket not supported on this platform', { status: 500 });
  }

  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

  server.accept();
  registerEvidenceSocket(server);

  server.addEventListener('message', (event) => {
    // Echo or handle ping messages if needed
    if (event.data === 'ping') {
      server.send('pong');
    }
  });

  return new Response(null, {
    status: 101,
    webSocket: client
  });
};
