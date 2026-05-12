#!/usr/bin/env node
/**
 * start-trace-mcp-cluster.mjs
 *
 * Multicore launcher for trace-mcp-server.ts.
 *
 * Spawns N tsx worker processes (default: min(cpus, 4)) on ports 8789-8792.
 * A lightweight HTTP/SSE-transparent round-robin proxy runs on the public
 * port :8788 and forwards every request to the next healthy worker.
 *
 * Usage:
 *   node scripts/start-trace-mcp-cluster.mjs          # auto (min 4, max cpus)
 *   node scripts/start-trace-mcp-cluster.mjs 2        # 2 workers
 *   TRACE_MCP_PORT=8788 node ...                       # custom public port
 *
 * The proxy is SSE-transparent: it streams response bytes directly so
 * MCP Streamable HTTP sessions work correctly across the proxy hop.
 */

import { spawn }            from 'node:child_process';
import http                 from 'node:http';
import { resolve, dirname } from 'node:path';
import { fileURLToPath }    from 'node:url';
import os                   from 'node:os';

const __dirname     = dirname(fileURLToPath(import.meta.url));
const ROOT          = resolve(__dirname, '..');
const SERVER_SCRIPT = resolve(ROOT, 'src/mcp/trace-mcp-server.ts');

// On Windows tsx.cmd is the correct shim; fall through to tsx on POSIX
const TSX = process.platform === 'win32'
  ? resolve(ROOT, 'node_modules/.bin/tsx.cmd')
  : resolve(ROOT, 'node_modules/.bin/tsx');

const PUBLIC_PORT   = Number(process.env.TRACE_MCP_PORT  ?? 8788);
const PUBLIC_HOST   = process.env.TRACE_MCP_HOST          ?? '127.0.0.1';
const WORKER_COUNT  = Math.min(
  Number(process.argv[2] || process.env.TRACE_MCP_WORKERS || os.cpus().length),
  4
);
const WORKER_BASE   = PUBLIC_PORT + 1;    // 8789, 8790, 8791, 8792

// ── Worker state ───────────────────────────────────────────────────────────────

/** @type {{ port: number; proc: import('node:child_process').ChildProcess; alive: boolean }[]} */
const workers = new Array(WORKER_COUNT).fill(null);
let   rrIndex = 0;

function spawnWorker(index) {
  const port = WORKER_BASE + index;

  const args = [SERVER_SCRIPT];
  const launchCommand = process.platform === 'win32' ? 'cmd.exe' : TSX;
  const launchArgs = process.platform === 'win32' ? ['/c', TSX, ...args] : args;
  const proc = spawn(launchCommand, launchArgs, {
    env: {
      ...process.env,
      TRACE_MCP_PORT: String(port),
      TRACE_MCP_HOST: '127.0.0.1',
      TRACE_MCP_URL: `http://127.0.0.1:${port}`,
      TRACE_MCP_WORKER_ID: String(index),
    },
    stdio: 'inherit',
    // Don't detach — we want this to be a child of the cluster
  });

  workers[index] = { port, proc, alive: true };

  proc.on('exit', (code, signal) => {
    console.error(
      `[cluster] worker ${index} (port ${port}) exited` +
      ` (${signal ?? code ?? 'unknown'}), restarting in 1 s…`
    );
    workers[index].alive = false;
    setTimeout(() => spawnWorker(index), 1_000);
  });

  console.log(`[cluster] started worker ${index} PID ${proc.pid} on :${port}`);
  return { port, proc, alive: true };
}

// ── HTTP proxy (SSE-transparent) ───────────────────────────────────────────────

/**
 * Pipe req → proxyReq, proxyRes → res.
 * Preserves SSE streaming: no buffering, flush immediately.
 */
function proxyRequest(workerPort, req, res) {
  const options = {
    hostname: '127.0.0.1',
    port:     workerPort,
    path:     req.url ?? '/',
    method:   req.method ?? 'GET',
    headers:  { ...req.headers, host: `127.0.0.1:${workerPort}` },
  };

  const proxyReq = http.request(options, (proxyRes) => {
    // Copy status + headers directly — preserves Content-Type: text/event-stream
    res.writeHead(proxyRes.statusCode ?? 200, proxyRes.headers);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error(`[cluster] proxy error → worker :${workerPort}: ${err.message}`);
    if (!res.headersSent) {
      res.writeHead(502, { 'Content-Type': 'application/json' });
    }
    if (!res.writableEnded) {
      res.end(JSON.stringify({ error: 'worker_unavailable', detail: err.message }));
    }
  });

  // Stream request body (POST for MCP tool calls)
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    req.pipe(proxyReq, { end: true });
  } else {
    proxyReq.end();
  }
}

// ── Start workers ──────────────────────────────────────────────────────────────

for (let i = 0; i < WORKER_COUNT; i++) {
  spawnWorker(i);
}

// Give workers 2 s to bind before opening the proxy
const STARTUP_DELAY = Number(process.env.TRACE_MCP_STARTUP_MS ?? 2_000);

setTimeout(() => {
  const proxy = http.createServer((req, res) => {
    // Health — proxy answers directly (no worker round-trip needed)
    if (req.method === 'GET' && req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        ok:      true,
        version: '1.0.0-cluster',
        workers: WORKER_COUNT,
        ports:   workers.map(w => w?.port),
        uptime:  process.uptime(),
      }));
      return;
    }

    // Round-robin to next alive worker
    let tries = 0;
    let w = null;
    while (tries < WORKER_COUNT) {
      const candidate = workers[rrIndex % WORKER_COUNT];
      rrIndex++;
      tries++;
      if (candidate?.alive) { w = candidate; break; }
    }

    if (!w) {
      res.writeHead(503, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'no_workers_available' }));
      return;
    }

    proxyRequest(w.port, req, res);
  });

  proxy.on('error', (err) => {
    console.error(`[cluster] proxy error on :${PUBLIC_PORT}: ${err.message}`);
  });

  proxy.listen(PUBLIC_PORT, PUBLIC_HOST, () => {
    console.log(
      `[cluster] TRACE MCP proxy listening on http://${PUBLIC_HOST}:${PUBLIC_PORT}` +
      ` → workers :${WORKER_BASE}–:${WORKER_BASE + WORKER_COUNT - 1}`
    );
    console.log(`[cluster] ${WORKER_COUNT} workers, round-robin, SSE-transparent`);
  });
}, STARTUP_DELAY);

// ── Graceful shutdown ──────────────────────────────────────────────────────────

function shutdown(sig) {
  console.log(`\n[cluster] received ${sig}, shutting down workers…`);
  for (const w of workers) {
    if (w?.proc && !w.proc.killed) {
      try { w.proc.kill('SIGTERM'); } catch { /* already dead */ }
    }
  }
  setTimeout(() => process.exit(0), 2_000);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));
