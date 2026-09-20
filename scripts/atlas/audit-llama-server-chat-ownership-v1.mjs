#!/usr/bin/env node

/**
 * Read-only live ownership receipt for the canonical chat endpoint.
 *
 * This probe intentionally uses only GET /health and GET /v1/models. It does
 * not generate text, write caches, or mutate any Atlas substrate.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const root = resolve(process.cwd());
const baseUrl = (process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090').replace(/\/+$/, '');
const expectedModel = process.env.LLAMA_SERVER_MODEL ?? 'ornith-1.5-9b';
const reportPath = resolve(
  process.argv[2] ?? 'docs/reports/llama-server-chat-ownership-v1.json',
);
const timeoutMs = Number(process.env.ATLAS_LLM_OWNERSHIP_TIMEOUT_MS ?? 5_000);

async function getJson(pathname) {
  const started = Date.now();
  try {
    const response = await fetch(`${baseUrl}${pathname}`, {
      signal: AbortSignal.timeout(timeoutMs),
      headers: { accept: 'application/json' },
    });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = { raw: text.slice(0, 512) };
    }
    return {
      ok: response.ok,
      status: response.status,
      latencyMs: Date.now() - started,
      body,
    };
  } catch (error) {
    return {
      ok: false,
      status: null,
      latencyMs: Date.now() - started,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function modelIds(body) {
  const data = Array.isArray(body?.data) ? body.data : [];
  return data.map((model) => model?.id).filter((id) => typeof id === 'string');
}

const health = await getJson('/health');
const models = await getJson('/v1/models');
const discoveredModels = modelIds(models.body);
const modelMatch = discoveredModels.includes(expectedModel);
const liveOwnerProven = health.ok && models.ok && modelMatch;

const report = {
  schema: 'atlas.llama-server-chat-ownership.v1',
  generatedAt: new Date().toISOString(),
  owner: {
    kind: 'CHAT_SYNTHESIS',
    service: 'llama-server',
    endpoint: baseUrl,
    port: new URL(baseUrl).port || null,
    model: expectedModel,
    discoveredModels,
  },
  probes: { health, models },
  status: liveOwnerProven ? 'LIVE_CHAT_OWNER_PROVEN' : 'LIVE_CHAT_OWNER_UNPROVEN',
  policy: {
    rawOllamaChatAllowed: false,
    rawOllamaGenerateAllowed: false,
    ollamaEmbeddingOwner: 'http://127.0.0.1:11434',
    canonicalAuthority: false,
    writesPerformed: false,
  },
  evidence: {
    healthOk: health.ok,
    modelsOk: models.ok,
    expectedModel,
    modelMatch,
    readOnlyProbe: true,
  },
};

mkdirSync(dirname(reportPath), { recursive: true });
writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');

console.log(JSON.stringify({
  status: report.status,
  endpoint: baseUrl,
  model: expectedModel,
  discoveredModels,
  reportPath: reportPath.replace(`${root}/`, ''),
  writesPerformed: false,
}, null, 2));

process.exitCode = liveOwnerProven ? 0 : 1;
