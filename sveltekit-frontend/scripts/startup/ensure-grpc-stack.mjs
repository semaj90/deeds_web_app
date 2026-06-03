#!/usr/bin/env node
/**
 * ensure-grpc-stack.mjs
 *
 * Starts the Go retrieval gRPC service (:50053 / :8100) and the TurboQuant
 * llama-server (:8090) if not already healthy. Returns immediately once both
 * are confirmed healthy or have been spawned.
 *
 * Used by dev:grpc so the frontend only starts after the backing services are up.
 *
 * Health checks (read-only, no mutations):
 *   :8090  — llama-server /health
 *   :50053 — Go retrieval gRPC (TCP connect)
 *   :8100  — Go retrieval HTTP /health
 */

import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..', '..');

const TIMEOUT = 1_000;
const TURBO_PORT = parseInt(process.env.TURBO_PORT ?? '8090', 10);
const RETRIEVAL_HTTP_PORT = parseInt(process.env.RETRIEVAL_HTTP_PORT ?? '8100', 10);
const RETRIEVAL_GRPC_PORT = parseInt(process.env.RETRIEVAL_GRPC_PORT ?? '50053', 10);
const RETRIEVAL_HOST = process.env.RETRIEVAL_HOST ?? '127.0.0.1';

const c = {
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
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
    sock.once('error', () => { sock.destroy(); resolve(false); });
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

// ── TurboQuant ensure ─────────────────────────────────────────────────────────
async function ensureTurbo() {
  if (await isTurboHealthy()) {
    console.log(c.green(`  ✓ TurboQuant :${TURBO_PORT} already healthy`));
    return true;
  }
  console.log(c.dim(`  → spawning llama-server via ensure-llama-server.mjs…`));
  const { ensureLlamaServer } = await import('../ensure-llama-server.mjs');
  const ok = await ensureLlamaServer();
  if (ok) {
    console.log(c.green(`  ✓ TurboQuant :${TURBO_PORT} healthy`));
  } else {
    console.log(c.yellow(`  ○ TurboQuant :${TURBO_PORT} did not start — proceeding without GPU inference`));
  }
  return ok;
}

// ── Go retrieval ensure ───────────────────────────────────────────────────────
async function ensureRetrieval() {
  if (await isRetrievalHealthy()) {
    console.log(c.green(`  ✓ Go retrieval :${RETRIEVAL_GRPC_PORT}/:${RETRIEVAL_HTTP_PORT} already healthy`));
    return true;
  }

  const goExe = process.env.GO_RETRIEVAL_EXE ?? null;
  const serviceDir = path.resolve(projectRoot, '..', 'services', 'go-retrieval-service');

  console.log(c.dim(`  → spawning Go retrieval service (${serviceDir})…`));

  const env = {
    ...process.env,
    HTTP_PORT: String(RETRIEVAL_HTTP_PORT),
    GRPC_PORT: String(RETRIEVAL_GRPC_PORT),
    QDRANT_URL: process.env.QDRANT_URL ?? 'http://localhost:6333',
    REDIS_URL: process.env.REDIS_URL ?? 'redis://localhost:6379',
    OLLAMA_URL: process.env.OLLAMA_URL ?? 'http://localhost:11434',
    EMBED_SERVICE_URL: process.env.EMBED_SERVICE_URL ?? 'localhost:50051',
    GPU_EMBED_ENABLED: 'true',
    EMBED_MODEL: process.env.EMBED_MODEL ?? 'embeddinggemma:latest',
  };

  try {
    // Prefer pre-built exe, fall back to `go run .`
    const cmd = goExe ?? 'go';
    const args = goExe ? [] : ['run', '.'];
    const child = spawn(cmd, args, {
      cwd: serviceDir,
      env,
      detached: true,
      stdio: 'ignore',
      windowsHide: true,
    });
    child.unref();
  } catch (err) {
    console.log(c.yellow(`  ○ Could not spawn Go retrieval service: ${err.message}`));
    return false;
  }

  // Poll up to 30s
  for (let i = 0; i < 60; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isRetrievalHealthy()) {
      console.log(c.green(`  ✓ Go retrieval :${RETRIEVAL_GRPC_PORT}/:${RETRIEVAL_HTTP_PORT} healthy`));
      return true;
    }
  }

  console.log(c.yellow(`  ○ Go retrieval did not become healthy in 30s — frontend will use inline fallback`));
  return false;
}

// ── Main ──────────────────────────────────────────────────────────────────────
console.log(`\n${c.bold('ensure-grpc-stack')}: checking service health…\n`);

const [turboOk, retrievalOk] = await Promise.all([ensureTurbo(), ensureRetrieval()]);

console.log('');
if (turboOk && retrievalOk) {
  console.log(c.green('gRPC stack ready — starting frontend'));
} else {
  const missing = [!turboOk && 'TurboQuant', !retrievalOk && 'Go retrieval'].filter(Boolean);
  console.log(c.yellow(`gRPC stack partial (${missing.join(', ')} not healthy) — frontend will degrade gracefully`));
}
console.log('');
