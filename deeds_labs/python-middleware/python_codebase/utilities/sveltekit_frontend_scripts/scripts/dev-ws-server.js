#!/usr/bin/env node
// Simple WebSocket dev server (ESM) to simulate token streaming for local testing.
// Usage: node scripts/dev-ws-server.js [port]

import WebSocket, { WebSocketServer } from 'ws';
const port = process.env.PORT || process.argv[2] || 8085;
const wss = new WebSocketServer({ port: Number(port) });

console.log(`Dev WS server listening on ws://localhost:${port}`);

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

wss.on('connection', async function connection(ws) {
  console.log('Client connected');
  ws.on('message', async function incoming(message) {
    try {
      const data = JSON.parse(message.toString());
      switch (data.type) {
        case 'handshake':
          ws.send(JSON.stringify({ type: 'connected', clientId: data.clientId || 'dev-client' }));
          break;
        case 'chat':
          {
            // Simulate streaming tokens for the chat content
            const requestId = data.requestId || 'req-' + Date.now();
            ws.send(
              JSON.stringify({
                type: 'response_start',
                requestId,
                payload: { model: 'dev-sim', gpu: false },
              })
            );
            const tokens = `Simulated response for: ${data.content}`.split(' ');
            for (let i = 0; i < tokens.length; i++) {
              await sleep(150);
              ws.send(
                JSON.stringify({
                  type: 'token',
                  requestId,
                  payload: { token: tokens[i], index: i, isFinal: i === tokens.length - 1 },
                })
              );
            }
            ws.send(
              JSON.stringify({
                type: 'response_end',
                requestId,
                payload: { status: 'complete', tokenCount: tokens.length },
              })
            );
          }
          break;
        case 'batch':
          ws.send(
            JSON.stringify({ type: 'batch_started', payload: { count: data.items?.length || 0 } })
          );
          // Echo back simple results
          await sleep(200);
          ws.send(
            JSON.stringify({
              type: 'batch_complete',
              results: (data.items || []).map((i) => ({ summary: `Processed: ${i}` })),
            })
          );
          break;
        case 'document_upload':
          ws.send(
            JSON.stringify({
              type: 'document_processed',
              payload: { documentId: 'doc-' + Date.now(), summary: 'Document processed (dev)' },
            })
          );
          break;
        case 'tts_request':
          ws.send(
            JSON.stringify({
              type: 'tts_ready',
              payload: { url: 'https://example.com/tts/dev.mp3' },
            })
          );
          break;
        default:
          ws.send(JSON.stringify({ type: 'error', payload: { message: 'unknown type' } }));
      }
    } catch (err) {
      ws.send(JSON.stringify({ type: 'error', payload: { message: 'invalid json' } }));
    }
  });

  ws.on('close', () => console.log('Client disconnected'));
});
