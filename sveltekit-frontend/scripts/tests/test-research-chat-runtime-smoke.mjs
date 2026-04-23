#!/usr/bin/env node
/**
 * Runtime smoke test for the research-backed live routes.
 *
 * Covers:
 *   1. POST /api/codebase-index/deep-research
 *   2. POST /api/codeintel/ace with includeResearch=true
 *   3. POST /api/ai/contextual-chat
 *
 * Usage:
 *   node scripts/tests/test-research-chat-runtime-smoke.mjs [--base http://localhost:5173] [--verbose]
 *
 * Requires: dev server running on localhost:5173. The VS Code task wrapper can
 * start `npm run dev:grpc` automatically when the stack is not already ready.
 */

import crypto from 'node:crypto';
import process from 'node:process';
import net from 'node:net';

const args = process.argv.slice(2);
const baseIndex = args.indexOf('--base');
const BASE = baseIndex >= 0 ? args[baseIndex + 1] : process.env.BASE_URL || 'http://localhost:5173';
const VERBOSE = args.includes('--verbose');
const RETRIEVAL_GRPC_PORT = Number(process.env.RETRIEVAL_GRPC_PORT || '50053');

const green = (s) => `\x1b[32m${s}\x1b[0m`;
const red = (s) => `\x1b[31m${s}\x1b[0m`;
const yellow = (s) => `\x1b[33m${s}\x1b[0m`;
const cyan = (s) => `\x1b[36m${s}\x1b[0m`;
const dim = (s) => `\x1b[2m${s}\x1b[0m`;

function logVerbose(...parts) {
  if (VERBOSE) console.log(dim(parts.join(' ')));
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForServer(maxAttempts = 20, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(BASE, { signal: AbortSignal.timeout(3000) });
      if (res.ok || res.status < 500) return true;
    } catch {
      // keep retrying
    }
    logVerbose(`waiting for dev server (${attempt}/${maxAttempts})`);
    await sleep(delayMs);
  }
  return false;
}

async function canConnectPort(port, host = '127.0.0.1', timeoutMs = 2000) {
  return await new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, host);
  });
}

async function waitForGrpc(maxAttempts = 30, delayMs = 2000) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (await canConnectPort(RETRIEVAL_GRPC_PORT)) return true;
    logVerbose(`waiting for retrieval gRPC (${attempt}/${maxAttempts})`);
    await sleep(delayMs);
  }
  return false;
}

async function postJson(path, body, timeoutMs = 120_000) {
  const started = performance.now();
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  const latencyMs = Math.round(performance.now() - started);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    // keep raw text for failures
  }
  return { ok: res.ok, status: res.status, latencyMs, text, json };
}

const results = [];

function pass(label, latencyMs, note = '') {
  results.push({ label, ok: true, latencyMs, note });
  console.log(
    `  ${green('PASS')} ${label.padEnd(34)} ${String(latencyMs).padStart(6)}ms  ${note}`.trimEnd()
  );
}

function fail(label, note) {
  results.push({ label, ok: false, note });
  console.error(`  ${red('FAIL')} ${label.padEnd(34)} ${note}`);
}

console.log(cyan('\nRuntime Research + Chat Smoke Test'));
console.log(dim(`base=${BASE}`));

if (!(await waitForServer())) {
  console.error(red(`Dev server not ready at ${BASE}`));
  process.exit(1);
}

if (!(await waitForGrpc())) {
  console.error(red(`Retrieval gRPC not ready on 127.0.0.1:${RETRIEVAL_GRPC_PORT}`));
  process.exit(1);
}

console.log(cyan('\n--- POST /api/codebase-index/deep-research ---'));
try {
  const deep = await postJson(
    '/api/codebase-index/deep-research',
    { maxClusters: 1, resultsPerQuery: 1, maxDepth: 1, skipQdrant: true },
    240_000,
  );
  const payload = deep.json ?? {};
  if (
    deep.ok &&
    payload.ok === true &&
    Number(payload.queriesRun ?? 0) > 0 &&
    Number(payload.pagesIndexed ?? 0) > 0
  ) {
    const writes = Number(payload.rowsInserted ?? 0) + Number(payload.rowsUpdated ?? 0);
    pass('deep-research', deep.latencyMs, `pages=${payload.pagesIndexed} writes=${writes}`);
  } else {
    fail('deep-research', `status=${deep.status} body=${deep.text.slice(0, 240)}`);
  }
} catch (err) {
  fail('deep-research', String(err));
}

console.log(cyan('\n--- POST /api/codeintel/ace includeResearch=true ---'));
try {
  const ace = await postJson(
    '/api/codeintel/ace',
    {
      query: 'svelte 5 runes performance reactivity',
      includeResearch: true,
      limit: 5,
      sessionId: crypto.randomUUID(),
    },
    60_000,
  );
  const payload = ace.json ?? {};
  const researchCount = Array.isArray(payload.researchContext) ? payload.researchContext.length : 0;
  if (ace.ok && payload.degraded !== true && payload.health?.ok === true && researchCount > 0) {
    pass('ace includeResearch', ace.latencyMs, `researchChunks=${researchCount}`);
  } else {
    fail('ace includeResearch', `status=${ace.status} body=${ace.text.slice(0, 240)}`);
  }
} catch (err) {
  fail('ace includeResearch', String(err));
}

console.log(cyan('\n--- POST /api/ai/contextual-chat ---'));
try {
  const chat = await postJson(
    '/api/ai/contextual-chat',
    {
      message: 'What is the significance of Miranda v. Arizona?',
      jurisdiction: 'federal',
      tags: ['miranda', 'criminal-procedure'],
    },
    120_000,
  );
  const payload = chat.json ?? {};
  const answer = typeof payload.response === 'string' ? payload.response : '';
  if (chat.ok && answer.length > 200 && typeof payload.model === 'string') {
    pass('contextual-chat', chat.latencyMs, `model=${payload.model}`);
    logVerbose(`answer=${answer.slice(0, 180)}...`);
  } else {
    fail('contextual-chat', `status=${chat.status} body=${chat.text.slice(0, 240)}`);
  }
} catch (err) {
  fail('contextual-chat', String(err));
}

const passed = results.filter((result) => result.ok).length;
const failed = results.length - passed;

console.log(`\n${'='.repeat(64)}`);
console.log(`Runtime smoke: ${passed}/${results.length} passed ${failed ? red('FAIL') : green('OK')}`);
for (const result of results.filter((item) => item.ok)) {
  console.log(`  ${result.label.padEnd(34)} ${String(result.latencyMs).padStart(6)}ms ${result.note ?? ''}`.trimEnd());
}
for (const result of results.filter((item) => !item.ok)) {
  console.error(`  ${result.label.padEnd(34)} ${result.note}`);
}

process.exit(failed > 0 ? 1 : 0);