#!/usr/bin/env node
import 'dotenv/config';
/**
 * ensure-llama-server.mjs
 *
 * Ensures llama-server.exe is running on :8090 using the active local GGUF.
 * Prefers explicit env paths so the launcher follows the current Path B
 * runtime: stock llama.cpp CUDA + IQ4_XS model.
 */

import os from 'node:os';
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, '..');

const HOST = process.env.LLAMA_SERVER_HOST ?? '127.0.0.1';
const PORT = parseInt(process.env.LLAMA_SERVER_PORT ?? '8090', 10);
const BASE = `http://${HOST}:${PORT}`;
const TIMEOUT = 1_000;
const RETRIES = 60;

const LLAMA_EXE_CANDIDATES = [
  process.env.LLAMA_SERVER_PATH,
  path.join(projectRoot, 'bin', 'llama-server.exe'),
  'C:\\Users\\james\\Desktop\\llama-server-cuda\\llama-server.exe',
].filter(Boolean);

const MODEL_CANDIDATES = [
  process.env.ROTORQUANT_MODEL_PATH,
  process.env.TURBO_MODEL_PATH,
  path.join(projectRoot, 'models', 'gemma4-rotorquant:latest-iq4xs-direct.gguf'),
  path.join(projectRoot, 'models', 'gemma4-rotorquant:latest-iq4xs.gguf'),
  path.join(projectRoot, 'models', 'gemma4-rotorquant:latest-q4_k_m.gguf'),
].filter(Boolean);

const MMPROJ_CANDIDATES = [
  process.env.MMPROJ_PATH,
  path.join(projectRoot, 'models', 'mmproj-BF16.gguf'),
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
const CTX =
  process.env.LLM_CONTEXT_SIZE ??
  process.env.TURBO_CTX ??
  process.env.LLAMA_SERVER_CTX ??
  process.env.OLLAMA_CONTEXT_LENGTH ??
  '65536';
const NGL = process.env.TURBO_NGL ?? process.env.LLAMA_SERVER_NGL ?? '99';
const CACHE_TYPE_K = process.env.LLAMA_CACHE_TYPE_K ?? process.env.TURBO_KV_K ?? 'q8_0';
const CACHE_TYPE_V = process.env.LLAMA_CACHE_TYPE_V ?? process.env.TURBO_KV_V ?? 'q8_0';
const THREADS_BATCH = Math.max(
  1,
  parseInt(process.env.LLAMA_SERVER_THREADS_BATCH ?? String(THREADS), 10)
);
const CACHE_REUSE = process.env.LLAMA_CACHE_REUSE ?? '256';

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
    '--cache-prompt',
    '--cache-reuse',
    String(CACHE_REUSE),
    '--jinja',
    '-ctk',
    CACHE_TYPE_K,
    '-ctv',
    CACHE_TYPE_V,
  ];

  if (MMPROJ) args.push('--mmproj', MMPROJ);

  const child = spawn(LLAMA_EXE, args, {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
    cwd: projectRoot,
  });
  child.unref();

  for (let i = 0; i < RETRIES; i++) {
    await new Promise((r) => setTimeout(r, 500));
    if (await isLlamaServerHealthy()) return true;
  }

  console.error('[ensure-llama-server] llama-server did not become healthy in time');
  return false;
}

const args = process.argv.slice(2);
if (args.includes('--spawn')) {
  const ok = await ensureLlamaServer();
  process.exit(ok ? 0 : 1);
} else {
  const healthy = await isLlamaServerHealthy();
  console.log(healthy ? `llama-server: healthy (${BASE})` : `llama-server: not running (${BASE})`);
}




