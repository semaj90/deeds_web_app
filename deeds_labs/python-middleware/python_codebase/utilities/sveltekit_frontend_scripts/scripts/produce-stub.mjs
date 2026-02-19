#!/usr/bin/env node
/**
 * produce-stub.mjs
 * Minimal producer stub to simulate GPU inference streaming token-by-token.
 * Usage: node produce-stub.mjs --url http://localhost:5173 --requestId demo-1 --token SECRET
 */
import fetch from 'node-fetch';
import { argv } from 'process';

function arg(name, fallback) {
  const idx = argv.indexOf(name);
  if (idx === -1) return fallback;
  return argv[idx + 1] || fallback;
}

const baseUrl = arg('--url', 'http://localhost:5173');
const requestId = arg('--requestId', `demo-${Date.now()}`);
const token = arg('--token', '');
const chunks = [
  'Hello, ',
  'this is a simulated ',
  'token stream. ',
  'Each piece is a chunk.\n',
  'Final chunk.'
];

(async () => {
  let seq = 1;
  for (const chunk of chunks) {
    const resp = await fetch(`${baseUrl}/api/realtime/produce`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ requestId, seq, chunk, meta: { simulated: true } })
    });
    const body = await resp.text();
    console.log(seq, resp.status, body);
    seq++;
    await new Promise(r => setTimeout(r, 200));
  }
  console.log('Done producing chunks');
})();
