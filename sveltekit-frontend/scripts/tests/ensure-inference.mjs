#!/usr/bin/env node
/**
 * ensure-inference.mjs
 *
 * Shared helper for audit scripts. Ensures a local LLM inference backend
 * is reachable before running agent phases.
 *
 * Priority order:
 *   1. TurboQuant :8090  (already running)
 *   2. Ollama     :11434 (already running)
 *   3. Spawn llama-server.exe → TurboQuant :8090  (if --turbo)
 *   4. rag-only fallback                           (if neither available)
 *
 * KV cache defaults to q8_0 (stable). tq4_0/turbo3 require --turbo-kv flag.
 */

import { spawn } from 'node:child_process';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';

// ── Defaults ──────────────────────────────────────────────────────────────────

const DEFAULT_LLAMA_EXE =
  process.env.LLAMA_SERVER_EXE ??
  'C:\\Users\\james\\Desktop\\llama-server-cuda\\llama-server.exe';

const DEFAULT_MODEL_DIRS = [
  process.env.GGUF_MODEL_DIR,
  'C:\\Users\\james\\Desktop\\models',
  'C:\\Users\\james\\Desktop\\llama-server-cuda\\models',
  'C:\\Users\\james\\Videos\\deeds-web-app\\models',
  // Ollama blob cache — gemma4-legal merged GRPO LoRA
  path.join(
    process.env.USERPROFILE ?? 'C:\\Users\\james',
    '.ollama', 'blobs'
  ),
].filter(Boolean);

// Known gemma4-legal blob hash (fallback for USERPROFILE/.ollama/blobs)
const KNOWN_BLOB =
  process.env.GEMMA4_GGUF_PATH ??
  path.join(
    process.env.USERPROFILE ?? 'C:\\Users\\james',
    '.ollama', 'blobs',
    'sha256-a79de882a921b9c3781a95a8ef555ea51e7c4dd685a8b2854e9bbe73ab081b43',
  );

// ── Internal helpers ──────────────────────────────────────────────────────────

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Returns true if TurboQuant responds on /health or /v1/models.
 */
async function isTurboQuantHealthy(baseUrl = 'http://127.0.0.1:8090') {
  for (const endpoint of ['/health', '/v1/models']) {
    try {
      const res = await fetch(`${baseUrl}${endpoint}`, {
        signal: AbortSignal.timeout(2500),
      });
      if (res.ok) return true;
    } catch { /* not up yet */ }
  }
  return false;
}

/**
 * Returns true if Ollama responds on /api/tags.
 */
async function isOllamaHealthy(baseUrl = 'http://localhost:11434') {
  try {
    const res = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch { return false; }
}

/**
 * Scan model dirs for a Gemma GGUF.
 * Prefers: gemma + legal, then gemma + e4b, then any gemma + 4.
 */
function findGemmaGguf() {
  // Fast path — known blob
  if (existsSync(KNOWN_BLOB)) return KNOWN_BLOB;

  const candidates = [];
  for (const dir of DEFAULT_MODEL_DIRS) {
    if (!dir || !existsSync(dir)) continue;
    let entries;
    try { entries = readdirSync(dir); } catch { continue; }
    for (const file of entries) {
      const lower = file.toLowerCase();
      if (!lower.endsWith('.gguf') && !lower.startsWith('sha256-')) continue;
      if (!lower.includes('gemma')) continue;
      const priority =
        lower.includes('legal') ? 0 :
        lower.includes('e4b')   ? 1 :
        lower.includes('4')     ? 2 : 3;
      candidates.push({ file: path.join(dir, file), priority });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0]?.file ?? null;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * @typedef {Object} InferenceResult
 * @property {boolean} ok
 * @property {'turboquant-existing'|'turboquant-started'|'ollama'|'rag-only'|'none'} backend
 * @property {string}  [baseUrl]
 * @property {string}  [modelPath]
 * @property {string}  [kvCache]
 * @property {string}  [reason]
 */

/**
 * Ensure an LLM backend is reachable before running agent phases.
 *
 * @param {Object} opts
 * @param {boolean} [opts.turbo=false]           - If true, attempt to spawn llama-server.exe
 * @param {boolean} [opts.requireInference=false] - If true, throw when no backend found
 * @param {string}  [opts.baseUrl]               - TurboQuant base URL
 * @param {string}  [opts.llamaExe]              - Path to llama-server.exe
 * @param {string}  [opts.kvCache='q8_0']        - KV cache type (q8_0=stable, tq4_0/turbo3=experimental)
 * @returns {Promise<InferenceResult>}
 */
export async function ensureInference({
  turbo            = false,
  requireInference = false,
  baseUrl          = 'http://127.0.0.1:8090',
  llamaExe         = DEFAULT_LLAMA_EXE,
  kvCache          = 'q8_0',
} = {}) {

  // 1. TurboQuant already up?
  if (await isTurboQuantHealthy(baseUrl)) {
    return { ok: true, backend: 'turboquant-existing', baseUrl, kvCache };
  }

  // 2. Ollama already up?
  if (await isOllamaHealthy()) {
    return { ok: true, backend: 'ollama', baseUrl: 'http://localhost:11434' };
  }

  // 3. Neither up — try to spawn TurboQuant if --turbo
  if (!turbo) {
    const result = {
      ok: false,
      backend: 'rag-only',
      reason: 'No LLM backend reachable and --turbo not set.',
    };
    if (requireInference) throw new Error(result.reason);
    return result;
  }

  if (!existsSync(llamaExe)) {
    const result = {
      ok: false,
      backend: 'none',
      reason: `llama-server.exe not found at ${llamaExe}. Set LLAMA_SERVER_EXE env var.`,
    };
    if (requireInference) throw new Error(result.reason);
    return result;
  }

  const modelPath = findGemmaGguf();
  if (!modelPath) {
    const result = {
      ok: false,
      backend: 'none',
      reason: 'No Gemma GGUF found. Set GGUF_MODEL_DIR or GEMMA4_GGUF_PATH.',
    };
    if (requireInference) throw new Error(result.reason);
    return result;
  }

  // Spawn detached — keeps running after the script exits if needed
  const child = spawn(
    llamaExe,
    [
      '-m', modelPath,
      '-ngl', '99',
      '-c', '32768',
      '--flash-attn', 'on',
      '-ctk', kvCache,
      '-ctv', kvCache,
      '--host', '127.0.0.1',
      '--port', '8090',
      '--log-disable',
    ],
    { detached: true, stdio: 'ignore', windowsHide: true },
  );
  child.unref();

  // Wait up to 30s for /health
  for (let i = 0; i < 30; i++) {
    await sleep(1000);
    if (await isTurboQuantHealthy(baseUrl)) {
      return {
        ok:        true,
        backend:   'turboquant-started',
        baseUrl,
        modelPath,
        kvCache,
      };
    }
  }

  const result = {
    ok:        false,
    backend:   'turboquant-start-timeout',
    reason:    'llama-server.exe launched but did not respond within 30s.',
    modelPath,
    kvCache,
  };
  if (requireInference) throw new Error(result.reason);
  return result;
}

/**
 * Format inference result as a markdown table block for plan files.
 */
export function inferenceMarkdownTable(inf) {
  return `## Inference Readiness

| Field | Value |
|-------|-------|
| Backend | \`${inf.backend}\` |
| URL | \`${inf.baseUrl ?? 'n/a'}\` |
| Model | \`${inf.modelPath ? path.basename(inf.modelPath) : 'n/a'}\` |
| KV cache | \`${inf.kvCache ?? 'n/a'}\` |
| Status | ${inf.ok ? '✅ ready' : `❌ ${inf.reason ?? 'unavailable'}`} |
`;
}
