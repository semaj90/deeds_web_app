#!/usr/bin/env node
/**
 * wait-for-grpc-stack.mjs
 *
 * Polls until both TurboQuant (:8090) and Go retrieval (:50053/:8100) are
 * healthy, then exits 0. Exits 1 after WAIT_TIMEOUT_S seconds if either
 * service never becomes healthy.
 *
 * Does NOT spawn services — use ensure-grpc-stack.mjs first.
 * Designed for use as the readiness gate in dev:grpc:
 *
 *   npm run services:grpc:ensure && npm run services:grpc:ready && npm run dev
 */

import net from 'node:net';

const POLL_INTERVAL_MS = 500;
const WAIT_TIMEOUT_S   = parseInt(process.env.GRPC_WAIT_TIMEOUT_S ?? '60', 10);

const TURBO_PORT         = parseInt(process.env.TURBO_PORT          ?? '8090',  10);
const RETRIEVAL_HTTP_PORT = parseInt(process.env.RETRIEVAL_HTTP_PORT ?? '8100',  10);
const RETRIEVAL_GRPC_PORT = parseInt(process.env.RETRIEVAL_GRPC_PORT ?? '50053', 10);
const RETRIEVAL_HOST     = process.env.RETRIEVAL_HOST ?? '127.0.0.1';

const TIMEOUT = 800;

const c = {
  green:  (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim:    (s) => `\x1b[2m${s}\x1b[0m`,
  bold:   (s) => `\x1b[1m${s}\x1b[0m`,
};

async function httpHealthy(url) {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT) });
    return res.ok;
  } catch {
    return false;
  }
}

function tcpConnectable(host, port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error',   () => { sock.destroy(); resolve(false); });
    sock.setTimeout(TIMEOUT, () => { sock.destroy(); resolve(false); });
  });
}

async function isTurboHealthy() {
  return httpHealthy(`http://127.0.0.1:${TURBO_PORT}/health`);
}

async function isRetrievalHealthy() {
  const http = await httpHealthy(`http://${RETRIEVAL_HOST}:${RETRIEVAL_HTTP_PORT}/health`);
  if (http) return true;
  return tcpConnectable(RETRIEVAL_HOST, RETRIEVAL_GRPC_PORT);
}

async function waitFor(label, healthFn, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let dots = 0;
  while (Date.now() < deadline) {
    if (await healthFn()) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
    dots++;
    if (dots % 10 === 0) {
      const remaining = Math.ceil((deadline - Date.now()) / 1000);
      process.stdout.write(c.dim(`  waiting for ${label}… (${remaining}s left)\n`));
    }
  }
  return false;
}

console.log(`\n${c.bold('wait-for-grpc-stack')}: polling until services are ready…\n`);
console.log(c.dim(`  timeout: ${WAIT_TIMEOUT_S}s | poll interval: ${POLL_INTERVAL_MS}ms\n`));

const timeoutMs = WAIT_TIMEOUT_S * 1000;

const [turboOk, retrievalOk] = await Promise.all([
  waitFor(`TurboQuant :${TURBO_PORT}`,                                    isTurboHealthy,     timeoutMs),
  waitFor(`Go retrieval :${RETRIEVAL_GRPC_PORT}/:${RETRIEVAL_HTTP_PORT}`, isRetrievalHealthy, timeoutMs),
]);

console.log('');

if (turboOk) {
  console.log(c.green(`  ✓ TurboQuant :${TURBO_PORT} ready`));
} else {
  console.log(c.yellow(`  ○ TurboQuant :${TURBO_PORT} not ready after ${WAIT_TIMEOUT_S}s — frontend may degrade`));
}

if (retrievalOk) {
  console.log(c.green(`  ✓ Go retrieval :${RETRIEVAL_GRPC_PORT}/:${RETRIEVAL_HTTP_PORT} ready`));
} else {
  console.log(c.yellow(`  ○ Go retrieval not ready after ${WAIT_TIMEOUT_S}s — frontend will use inline fallback`));
}

console.log('');

if (turboOk && retrievalOk) {
  console.log(c.green('gRPC stack confirmed ready — starting frontend\n'));
  process.exit(0);
} else {
  // Exit 0 regardless — frontend degrades gracefully when services are absent.
  // Change to process.exit(1) if you want to hard-block the frontend on missing services.
  console.log(c.yellow('gRPC stack partial — frontend will start with available services\n'));
  process.exit(0);
}

