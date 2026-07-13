#!/usr/bin/env node
/**
 * ensure-llama-server.mjs
 *
 * Two exports:
 *
 *   ensureLlamaServer()   — chat/VLM server on :8090 (Gemma4, --jinja, KV cache)
 *   ensureEmbedServer()   — embedding server on :8081 (embeddinggemma, --embedding
 *                           --pooling mean --embd-normalize 2)
 *
 * The embedding server exposes OpenAI-compatible POST /v1/embeddings.
 * Set OLLAMA_EMBED_BASE_URL=http://127.0.0.1:8081 in .env to route the
 * SvelteKit embedding pipeline through it instead of Ollama.
 *
 * CLI flags:
 *   --spawn          start chat server (default)
 *   --spawn-embed    start embedding server
 *   --spawn-both     start both servers
 */

import os from 'node:os';
import net from 'node:net';
import dotenv from 'dotenv';
import { spawn } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');
const workspaceRoot = projectRoot.endsWith('sveltekit-frontend')
  ? path.resolve(projectRoot, '..')
  : projectRoot;

function loadEnvFile(filePath, baseValues = {}) {
  if (!existsSync(filePath)) return {};
  const parsed = dotenv.parse(readFileSync(filePath));
  for (const [key, value] of Object.entries(parsed)) {
    const current = process.env[key];
    if (current === undefined || current === baseValues[key]) {
      process.env[key] = value;
    }
  }
  return parsed;
}

const rootEnv = loadEnvFile(path.join(projectRoot, '.env'));
loadEnvFile(path.join(projectRoot, '.env.local'), rootEnv);

const HOST = process.env.LLAMA_SERVER_HOST ?? process.env.TURBO_HOST ?? '127.0.0.1';
const PORT = parseInt(process.env.LLAMA_SERVER_PORT ?? process.env.TURBO_PORT ?? '8090', 10);
const BASE = `http://${HOST}:${PORT}`;
const TIMEOUT = 1_000;
// 5.3 GB GGUF at -ngl 99 on RTX 3060 Ti takes 45–90s to load; poll for up to 3 min
const RETRIES = 180;

const LLAMA_EXE_CANDIDATES = [
  process.env.LLAMA_SERVER_PATH,
  path.join(projectRoot, 'tools', 'llama-server', 'llama-server.exe'),
  path.join(projectRoot, 'bin', 'llama-server.exe'),
  path.join(projectRoot, 'vendor', 'llama-server', 'llama-server.exe'),
  'C:\\Users\\james\\Desktop\\llama-server-cuda\\llama-server.exe',
].filter(Boolean);

const MODEL_CANDIDATES = [
  process.env.ROTORQUANT_MODEL_PATH,
  process.env.TURBO_MODEL_PATH,
  path.join(workspaceRoot, 'models', 'gemma4-legal-iq4xs-direct.gguf'),
  path.join(workspaceRoot, 'models', 'gemma4-rotorquant:latest-iq4xs-direct.gguf'),
  path.join(workspaceRoot, 'models', 'gemma4-rotorquant:latest-iq4xs.gguf'),
  path.join(workspaceRoot, 'models', 'gemma4-rotorquant:latest-q4_k_m.gguf'),
  path.join(workspaceRoot, 'vendor', 'models', 'gemma4-legal.gguf'),
  path.join(workspaceRoot, 'vendor', 'models', 'gemma4-rotorquant:latest.gguf'),
  path.join(projectRoot, 'models', 'gemma4-legal-iq4xs-direct.gguf'),
].filter(Boolean);

const MMPROJ_CANDIDATES = [
  process.env.MMPROJ_PATH,
  path.join(workspaceRoot, 'models', 'mmproj-F16.gguf'),
  path.join(workspaceRoot, 'models', 'mmproj-BF16.gguf'),
  path.join(workspaceRoot, 'vendor', 'models', 'mmproj-gemma4.gguf'),
  path.join(projectRoot, 'models', 'mmproj-F16.gguf'),
].filter(Boolean);

function firstExisting(candidates) {
  return candidates.find((candidate) => typeof candidate === 'string' && existsSync(candidate));
}

function hasLlamaRuntimeDeps(candidate) {
  if (!candidate || !existsSync(candidate)) return false;
  const dir = path.dirname(candidate);
  return existsSync(path.join(dir, 'ggml.dll')) && existsSync(path.join(dir, 'ggml-cuda.dll'));
}

const LLAMA_EXE =
  LLAMA_EXE_CANDIDATES.find(hasLlamaRuntimeDeps) ?? firstExisting(LLAMA_EXE_CANDIDATES);
const MODEL = firstExisting(MODEL_CANDIDATES);
const MMPROJ = firstExisting(MMPROJ_CANDIDATES);

const DEFAULT_THREADS = Math.max(
  4,
  Math.min(12, Math.floor((os.availableParallelism?.() ?? os.cpus().length) / 2))
);
const THREADS = Math.max(1, parseInt(process.env.LLAMA_SERVER_THREADS ?? `${DEFAULT_THREADS}`, 10));
const PARALLEL = Math.max(
  1,
  parseInt(process.env.LLAMA_SERVER_PARALLEL ?? process.env.TURBO_PARALLEL ?? '1', 10)
);
const CTX_REQUESTED =
  process.env.LLM_CONTEXT_SIZE ??
  process.env.TURBO_CTX ??
  process.env.LLAMA_SERVER_CTX ??
  process.env.OLLAMA_CONTEXT_LENGTH ??
  '65536';
const SHORT_CTX_OK = /^(1|true|yes|on)$/i.test(
  process.env.LLAMA_SERVER_ALLOW_SHORT_CONTEXT ??
  process.env.TURBO_CTX_ALLOW_SHORT_CONTEXT ??
  ''
);
const CTX_MIN = 65536;
let CTX = parseInt(CTX_REQUESTED, 10);
if (!Number.isFinite(CTX)) CTX = CTX_MIN;
if (CTX < CTX_MIN && !SHORT_CTX_OK) {
  console.warn(
    `[ensure-llama-server] Requested context ${CTX} is below the repo default of ${CTX_MIN}. ` +
      `Clamping to ${CTX_MIN}. Set TURBO_CTX_ALLOW_SHORT_CONTEXT=true to opt in to a shorter context.`
  );
  CTX = CTX_MIN;
}
const NGL = process.env.TURBO_NGL ?? process.env.LLAMA_SERVER_NGL ?? '99';
function resolveCacheType(suffix, fallback = 'q8_0') {
  const turboKey = process.env[`TURBO_KV_${suffix}`];
  const llamaKey = process.env[`LLAMA_CACHE_TYPE_${suffix}`];
  return turboKey ?? llamaKey ?? fallback;
}

const CACHE_TYPE_K = resolveCacheType('K');
const CACHE_TYPE_V = resolveCacheType('V');
const THREADS_BATCH = Math.max(
  1,
  parseInt(process.env.LLAMA_SERVER_THREADS_BATCH ?? String(THREADS), 10)
);
const CACHE_REUSE = process.env.LLAMA_CACHE_REUSE ?? '256';

// Chat template: file-based override takes priority, then default to repo template.
// Set TURBO_CHAT_TEMPLATE_FILE=none to skip (only if GGUF has a correct embedded template).
const _defaultTemplateFile = path.resolve(workspaceRoot, 'configs', 'templates', 'gemma4-opencode.jinja');
const CHAT_TEMPLATE_FILE =
  process.env.TURBO_CHAT_TEMPLATE_FILE === 'none'
    ? null
    : (process.env.TURBO_CHAT_TEMPLATE_FILE ?? (existsSync(_defaultTemplateFile) ? _defaultTemplateFile : null));

/** Returns true if something is already listening on HOST:PORT (even if not HTTP-healthy). */
function isPortBound(host, port) {
  return new Promise((resolve) => {
    const sock = net.createConnection({ host, port });
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => { sock.destroy(); resolve(false); });
    sock.setTimeout(500, () => { sock.destroy(); resolve(false); });
  });
}

export async function isLlamaServerHealthy() {
  try {
    const res = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(TIMEOUT) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureLlamaServer() {
  if (await isLlamaServerHealthy()) return true;

  if (!LLAMA_EXE) {
    console.warn(
      '[ensure-llama-server] llama-server.exe not found in configured locations — skipping'
    );
    return false;
  }

  if (!MODEL) {
    console.warn('[ensure-llama-server] GGUF model not found in configured locations — skipping');
    return false;
  }

  console.log(`[ensure-llama-server] Using binary: ${LLAMA_EXE}`);
  console.log(`[ensure-llama-server] Using model: ${MODEL}`);
  if (MMPROJ) {
    console.log(`[ensure-llama-server] Using mmproj: ${MMPROJ}`);
  } else {
    console.log('[ensure-llama-server] No mmproj found; starting text-only');
  }

  const args = [
    '-m',
    MODEL,
    '--host',
    HOST,
    '--port',
    String(PORT),
    '-c',
    String(CTX),
    '-ngl',
    String(NGL),
    '-t',
    String(THREADS),
    '-tb',
    String(THREADS_BATCH),
    '-np',
    String(PARALLEL),
    '-fa',
    'on',
    '-ctk',
    CACHE_TYPE_K,
    '-ctv',
    CACHE_TYPE_V,
    '--jinja',
    '--reasoning-format',
    'none',
    '--cont-batching',
    '--cache-prompt',
    '--cache-reuse',
    String(CACHE_REUSE),
    '--metrics',
    '--log-verbosity',
    '3',
  ];

  if (MMPROJ) args.push('--mmproj', MMPROJ);
  if (CHAT_TEMPLATE_FILE) {
    args.push('--chat-template-file', CHAT_TEMPLATE_FILE);
    console.log(`[ensure-llama-server] Chat template: ${CHAT_TEMPLATE_FILE}`);
  } else {
    console.warn('[ensure-llama-server] No chat-template-file — using embedded GGUF template (may poison system role)');
  }

  const child = spawn(LLAMA_EXE, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: projectRoot,
  });
  child.unref();

  // Zombie-process detection: after 5 failed health polls, check if the port
  // is already bound by a stale process that isn't responding to HTTP.
  const ZOMBIE_CHECK_AFTER = 5;
  for (let i = 0; i < RETRIES; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isLlamaServerHealthy()) return true;
    if (i === ZOMBIE_CHECK_AFTER && (await isPortBound(HOST, PORT))) {
      console.warn(
        `[ensure-llama-server] Port ${PORT} is already bound by another process but is not` +
          ` responding to HTTP health checks. Kill the stale process first or verify with:` +
          ` curl http://${HOST}:${PORT}/health`
      );
      // Exit 0 so the VS Code task doesn't show as a hard failure.
      process.exit(0);
    }
  }

  console.error('[ensure-llama-server] llama-server did not become healthy in time');
  return false;
}

// ── Embedding server (llama-server :8081 with --embedding) ───────────────────

const EMBED_HOST = process.env.EMBED_SERVER_HOST ?? '127.0.0.1';
const EMBED_PORT = parseInt(process.env.EMBED_SERVER_PORT ?? '8081', 10);
const EMBED_BASE = `http://${EMBED_HOST}:${EMBED_PORT}`;

// Auto-discover embedding model blob via Ollama manifest (reads sha256 digest → blob path).
// Tries embeddinggemma first, then nomic-embed-text, then all-minilm.
function resolveOllamaEmbedBlob() {
  const home = process.env.USERPROFILE ?? process.env.HOME ?? 'C:\\Users\\james';
  const manifestRoot = path.join(home, '.ollama', 'models', 'manifests', 'registry.ollama.ai', 'library');
  const blobRoot     = path.join(home, '.ollama', 'models', 'blobs');
  for (const tag of ['embeddinggemma', 'nomic-embed-text', 'all-minilm']) {
    const mf = path.join(manifestRoot, tag, 'latest');
    if (!existsSync(mf)) continue;
    try {
      const data  = JSON.parse(readFileSync(mf, 'utf8'));
      const layer = (data.layers ?? []).find((l) => l.mediaType === 'application/vnd.ollama.image.model');
      if (!layer?.digest) continue;
      const blobPath = path.join(blobRoot, layer.digest.replace(':', '-'));
      if (existsSync(blobPath)) {
        console.log(`[ensure-embed-server] auto-discovered ${tag} blob: ${blobPath}`);
        return blobPath;
      }
    } catch { /* malformed manifest */ }
  }
  return null;
}

const EMBED_MODEL_CANDIDATES = [
  process.env.EMBED_MODEL_PATH,
  // Primary: converted GGUF from sentence-transformers model (--sentence-transformers-dense-modules)
  path.join(workspaceRoot, 'models', 'embeddinggemma-300m-q8_0.gguf'),
  path.join(workspaceRoot, 'models', 'embeddinggemma-300m-f16.gguf'),
  // Legacy names
  path.join(workspaceRoot, 'models', 'embeddinggemma.gguf'),
  path.join(workspaceRoot, 'vendor', 'models', 'embeddinggemma.gguf'),
  path.join(workspaceRoot, 'models', 'embeddinggemma-300m.gguf'),
  // Fallback: Ollama blob (no Dense projection layers — lower quality embeddings)
  resolveOllamaEmbedBlob(),
  path.join(workspaceRoot, 'models', 'nomic-embed-text-v1.5.Q4_K_M.gguf'),
].filter(Boolean);

const EMBED_MODEL = firstExisting(EMBED_MODEL_CANDIDATES);
// EMBED_THREADS intentionally unused — llama-server manages threading internally for embedding workloads
const EMBED_CTX = parseInt(process.env.EMBED_SERVER_CTX ?? '2048', 10);
// GPU layers for embed model — default 99 (full GPU), set 0 for CPU-only
const EMBED_NGL = parseInt(process.env.EMBED_SERVER_NGL ?? '99', 10);

export async function isEmbedServerHealthy() {
  try {
    const res = await fetch(`${EMBED_BASE}/health`, { signal: AbortSignal.timeout(TIMEOUT) });
    return res.ok;
  } catch {
    return false;
  }
}

export async function ensureEmbedServer() {
  if (await isEmbedServerHealthy()) return true;

  if (!LLAMA_EXE) {
    console.warn('[ensure-llama-server] llama-server.exe not found — skipping embed server');
    return false;
  }

  if (!EMBED_MODEL) {
    console.warn('[ensure-embed-server] embeddinggemma GGUF not found. Convert it first:');
    console.warn('');
    console.warn('  pwsh -NoProfile -ExecutionPolicy Bypass -File ../scripts/convert-embeddinggemma-to-gguf.ps1');
    console.warn('');
    console.warn('  This produces: models/embeddinggemma-300m-f16.gguf');
    console.warn('  Requires: llama-cpp-turboquant-gemma4 converter (--sentence-transformers-dense-modules)');
    console.warn('  Converter path: C:\\Users\\james\\Downloads\\llama-cpp-turboquant-gemma4-feature-turboquant-kv-cache\\...');
    console.warn('');
    console.warn('[ensure-embed-server] Falling back to Ollama for embeddings (no Dense projection — lower quality)');
    return false;
  }

  console.log(`[ensure-embed-server] Using binary: ${LLAMA_EXE}`);
  console.log(`[ensure-embed-server] Using model:  ${EMBED_MODEL}`);
  console.log(`[ensure-embed-server] Port: ${EMBED_PORT}  NGL: ${EMBED_NGL}  CTX: ${EMBED_CTX}`);

  const EMBED_BATCH  = parseInt(process.env.EMBED_BATCH_SIZE  ?? '512', 10);
  const EMBED_UBATCH = parseInt(process.env.EMBED_UBATCH_SIZE ?? '512', 10);

  const args = [
    '-m', EMBED_MODEL,
    '--host', EMBED_HOST,
    '--port', String(EMBED_PORT),
    '-c', String(EMBED_CTX),
    '-ngl', String(EMBED_NGL),
    '-b', String(EMBED_BATCH),
    '-ub', String(EMBED_UBATCH),
    '--embedding',
    '--pooling', 'mean',
    '--metrics',
    '--log-verbosity', '3',
  ];

  const child = spawn(LLAMA_EXE, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: projectRoot,
  });
  child.unref();

  // embeddinggemma (593 MB) loads in ~5–10s; poll for up to 60s
  const EMBED_RETRIES = 120;
  for (let i = 0; i < EMBED_RETRIES; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isEmbedServerHealthy()) {
      console.log(`[ensure-embed-server] healthy at ${EMBED_BASE}`);
      return true;
    }
  }

  console.error('[ensure-embed-server] embedding server did not become healthy in time');
  return false;
}

// ── CLI entry ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
if (args.includes('--spawn-both')) {
  const [chat, embed] = await Promise.all([ensureLlamaServer(), ensureEmbedServer()]);
  process.exit(chat && embed ? 0 : 1);
} else if (args.includes('--spawn-embed')) {
  const ok = await ensureEmbedServer();
  process.exit(ok ? 0 : 1);
} else if (args.includes('--spawn')) {
  const ok = await ensureLlamaServer();
  process.exit(ok ? 0 : 1);
} else {
  const [chatHealthy, embedHealthy] = await Promise.all([
    isLlamaServerHealthy(),
    isEmbedServerHealthy(),
  ]);
  console.log(chatHealthy ? `chat server:  healthy (${BASE})` : `chat server:  not running (${BASE})`);
  console.log(embedHealthy ? `embed server: healthy (${EMBED_BASE})` : `embed server: not running (${EMBED_BASE})`);
  console.log(`[ensure-llama-server] binary=${LLAMA_EXE ?? 'n/a'}`);
  console.log(`[ensure-llama-server] chat model=${MODEL ?? 'n/a'}`);
  console.log(`[ensure-llama-server] embed model=${EMBED_MODEL ?? 'n/a'}`);
  console.log(`[ensure-llama-server] mmproj=${MMPROJ ?? 'n/a'}`);
}


