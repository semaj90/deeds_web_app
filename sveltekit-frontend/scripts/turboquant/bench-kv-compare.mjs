#!/usr/bin/env node
/**
 * bench-kv-compare.mjs
 *
 * Compares the current TurboQuant KV baseline (expected q8_0/q8_0 on :8090)
 * against a temporary f16/f16 launch on a side port. The goal is to produce a
 * concrete comparison artifact, not to replace the default runtime.
 */

import fs from 'node:fs/promises';
import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import os from 'node:os';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const APP_ROOT = path.resolve(__dirname, '..', '..');
const REPO_ROOT = path.resolve(APP_ROOT, '..');
const LOG_DIR = path.join(APP_ROOT, 'logs', 'turboquant');
const DEFAULT_HOST = '127.0.0.1';
const BASE_PORT = Number(process.env.TURBO_BENCH_BASE_PORT ?? '8090');
const F16_PORT = Number(process.env.TURBO_BENCH_F16_PORT ?? '8094');
const BASE_URL = `http://${DEFAULT_HOST}:${BASE_PORT}`;
const F16_URL = `http://${DEFAULT_HOST}:${F16_PORT}`;
const MODEL = process.env.TURBO_MODEL_NAME ?? 'gemma4-rotorquant:latest';
const CHAT_TIMEOUT_MS = Number(process.env.TURBO_BENCH_CHAT_TIMEOUT_MS ?? '120000');
const PROMPT =
  process.env.TURBO_BENCH_PROMPT ??
  'Return strict JSON only: {"ok":true,"mode":"kv-compare"}';

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hasRuntimeDeps(candidate) {
  if (!candidate || !existsSync(candidate)) return false;
  const dir = path.dirname(candidate);
  return existsSync(path.join(dir, 'ggml.dll')) && existsSync(path.join(dir, 'ggml-cuda.dll'));
}

function firstExisting(candidates) {
  return candidates.find((candidate) => typeof candidate === 'string' && existsSync(candidate));
}

function findLlamaExecutable() {
  const candidates = [
    process.env.LLAMA_SERVER_PATH,
    path.join(REPO_ROOT, 'tools', 'llama-server', 'llama-server.exe'),
    path.join(REPO_ROOT, 'bin', 'llama-server.exe'),
    path.join(REPO_ROOT, 'vendor', 'llama-server', 'llama-server.exe'),
    'C:\\Users\\james\\Desktop\\llama-server-cuda\\llama-server.exe',
  ].filter(Boolean);
  return candidates.find(hasRuntimeDeps) ?? firstExisting(candidates);
}

function findGemmaGguf() {
  const knownBlob =
    process.env.GEMMA4_GGUF_PATH ??
    path.join(
      process.env.USERPROFILE ?? 'C:\\Users\\james',
      '.ollama',
      'blobs',
      'sha256-a79de882a921b9c3781a95a8ef555ea51e7c4dd685a8b2854e9bbe73ab081b43'
    );
  if (existsSync(knownBlob)) return knownBlob;

  const modelDirs = [
    process.env.GGUF_MODEL_DIR,
    'C:\\Users\\james\\Desktop\\models',
    'C:\\Users\\james\\Desktop\\llama-server-cuda\\models',
    path.join(REPO_ROOT, 'vendor', 'models'),
    path.join(REPO_ROOT, 'models'),
    path.join(process.env.USERPROFILE ?? 'C:\\Users\\james', '.ollama', 'blobs'),
  ].filter(Boolean);

  const candidates = [];
  for (const dir of modelDirs) {
    if (!dir || !existsSync(dir)) continue;
    let entries = [];
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const file of entries) {
      const lower = file.toLowerCase();
      if (!lower.endsWith('.gguf') && !lower.startsWith('sha256-')) continue;
      if (!lower.includes('gemma')) continue;
      const priority =
        lower.includes('legal') ? 0 : lower.includes('e4b') ? 1 : lower.includes('4') ? 2 : 3;
      candidates.push({ file: path.join(dir, file), priority });
    }
  }
  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0]?.file ?? null;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function isHealthy(baseUrl) {
  try {
    const res = await fetch(`${baseUrl}/health`, { signal: AbortSignal.timeout(2500) });
    return res.ok;
  } catch {
    return false;
  }
}

function spawnLlamaServer({ port, kv }) {
  const exe = findLlamaExecutable();
  const model = findGemmaGguf();
  if (!exe) throw new Error('llama-server.exe not found');
  if (!model) throw new Error('Gemma GGUF not found');

  const args = [
    '-m',
    model,
    '-ngl',
    '99',
    '-c',
    String(Number(process.env.LLM_CONTEXT_SIZE ?? '65536')),
    '--flash-attn',
    'on',
    '-ctk',
    kv,
    '-ctv',
    kv,
    '--host',
    DEFAULT_HOST,
    '--port',
    String(port),
    '--log-disable',
  ];

  const child = spawn(exe, args, {
    detached: false,
    stdio: 'ignore',
    windowsHide: true,
    cwd: APP_ROOT,
  });

  return { child, exe, model };
}

async function waitForHealth(baseUrl, timeoutMs = 30000) {
  const deadline = performance.now() + timeoutMs;
  while (performance.now() < deadline) {
    if (await isHealthy(baseUrl)) return true;
    await sleep(500);
  }
  return false;
}

async function streamChat(baseUrl, prompt) {
  const startedAt = performance.now();
  let firstTokenMs = null;
  let outputTokens = 0;
  let promptTokens = null;
  let completionTokens = null;
  let content = '';

  const res = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 64,
      stream: true,
      temperature: 0,
      stream_options: { include_usage: true },
    }),
    signal: AbortSignal.timeout(CHAT_TIMEOUT_MS),
  });

  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split(/\r?\n/);
    buffer = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const obj = JSON.parse(data);
        if (obj?.usage) {
          promptTokens = typeof obj.usage.prompt_tokens === 'number' ? obj.usage.prompt_tokens : promptTokens;
          completionTokens =
            typeof obj.usage.completion_tokens === 'number' ? obj.usage.completion_tokens : completionTokens;
        }
        const delta = obj?.choices?.[0]?.delta ?? {};
        const text = delta?.content ?? delta?.reasoning_content ?? '';
        if (text) {
          content += text;
          outputTokens += 1;
          if (firstTokenMs === null) firstTokenMs = performance.now() - startedAt;
        }
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }

  const totalMs = performance.now() - startedAt;
  const finalPromptTokens =
    Number.isFinite(promptTokens) && promptTokens > 0 ? promptTokens : Math.max(1, Math.ceil(prompt.length / 4));
  const finalCompletionTokens =
    Number.isFinite(completionTokens) && completionTokens > 0 ? completionTokens : outputTokens;
  const tokensPerSecond = finalCompletionTokens > 0 && totalMs > 0 ? (finalCompletionTokens / totalMs) * 1000 : 0;
  const parsedJson = (() => {
    try {
      return JSON.parse(content.trim());
    } catch {
      return null;
    }
  })();

  return {
    time_to_first_token_ms: Math.round(firstTokenMs ?? totalMs),
    tokens_per_second: Number(tokensPerSecond.toFixed(2)),
    prompt_tokens: finalPromptTokens,
    completion_tokens: finalCompletionTokens,
    total_ms: Math.round(totalMs),
    response_preview: content.trim().slice(0, 160),
    json_valid: Boolean(parsedJson),
  };
}

async function persistReport(report) {
  await ensureDir(LOG_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(LOG_DIR, `bench-kv-compare-${stamp}.json`);
  const latestPath = path.join(LOG_DIR, 'bench-kv-compare-latest.json');
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  await fs.writeFile(outPath, payload, 'utf8');
  await fs.writeFile(latestPath, payload, 'utf8');
  return { outPath, latestPath };
}

async function main() {
  const exe = findLlamaExecutable();
  const model = findGemmaGguf();
  if (!exe) throw new Error('llama-server.exe not found');
  if (!model) throw new Error('Gemma GGUF not found');

  if (!(await isHealthy(BASE_URL))) {
    throw new Error(`Baseline TurboQuant is not healthy at ${BASE_URL}`);
  }

  const f16 = spawnLlamaServer({ port: F16_PORT, kv: 'f16' });
  let f16Ready = false;
  try {
    f16Ready = await waitForHealth(F16_URL, 45_000);
    if (!f16Ready) {
      throw new Error(`f16 TurboQuant did not become healthy at ${F16_URL}`);
    }

    const q8_0 = await streamChat(BASE_URL, PROMPT);
    const f16Result = await streamChat(F16_URL, PROMPT);

    const report = {
      generatedAt: new Date().toISOString(),
      model: MODEL,
      prompt: PROMPT,
      baseline: {
        kv: 'q8_0/q8_0',
        baseUrl: BASE_URL,
        ...q8_0,
      },
      comparison: {
        kv: 'f16/f16',
        baseUrl: F16_URL,
        ...f16Result,
      },
      deltas: {
        time_to_first_token_ms: f16Result.time_to_first_token_ms - q8_0.time_to_first_token_ms,
        tokens_per_second: Number((f16Result.tokens_per_second - q8_0.tokens_per_second).toFixed(2)),
        total_ms: f16Result.total_ms - q8_0.total_ms,
      },
      notes: [
        'Baseline is the live server currently running on :8090.',
        'Comparison server is temporary and is terminated after the benchmark.',
        'Choose q8_0 unless f16 is materially better for the target workload.',
      ],
    };

    const paths = await persistReport(report);
    console.log(JSON.stringify({ ...report, paths }, null, 2));
  } finally {
    if (f16.child && !f16.child.killed) {
      try {
        f16.child.kill();
      } catch {
        // ignore
      }
    }
    if (process.platform === 'win32' && f16.child?.pid) {
      spawnSync('taskkill', ['/PID', String(f16.child.pid), '/T', '/F'], { windowsHide: true });
    }
  }
}

main().catch((err) => {
  console.error(JSON.stringify({ status: 'fail', error: String(err) }, null, 2));
  process.exit(1);
});
