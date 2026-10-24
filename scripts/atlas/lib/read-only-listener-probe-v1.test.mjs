import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import test from 'node:test';
import { probeReadOnlyListenerV1 } from './read-only-listener-probe-v1.mjs';

test('reports only TCP listener reachability without sending an HTTP request', async () => {
  let receivedBytes = 0;
  const server = createServer((socket) => {
    socket.on('data', (chunk) => { receivedBytes += chunk.length; });
    socket.end();
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  try {
    assert.equal(await probeReadOnlyListenerV1(`http://127.0.0.1:${address.port}/api/health`), 'LISTENER_REACHABLE');
    assert.equal(receivedBytes, 0);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
});

test('refuses unsupported or malformed listener URLs', async () => {
  assert.equal(await probeReadOnlyListenerV1('https://127.0.0.1:5173'), 'UNSUPPORTED_SCHEME');
  assert.equal(await probeReadOnlyListenerV1('not a url'), 'INVALID_URL');
});

test('reports an unavailable listener without sending an HTTP request', async () => {
  const reservation = createServer();
  await new Promise((resolve) => reservation.listen(0, '127.0.0.1', resolve));
  const address = reservation.address();
  await new Promise((resolve, reject) => reservation.close((error) => error ? reject(error) : resolve()));
  assert.equal(await probeReadOnlyListenerV1(`http://127.0.0.1:${address.port}`, 250), 'UNAVAILABLE');
});
