#!/usr/bin/env node
/**
 * Read-only Ornith/llama-server YaRN profile probe.
 *
 * This does not launch/restart llama-server and never writes Postgres/Qdrant/Valkey/Neo4j.
 * It proves only what the currently running :8090 process exposes and that it can complete
 * a bounded deterministic request under the expected context profile.
 *
 * Usage:
 *   node scripts/atlas/prove-ornith-yarn-runtime-v1.mjs
 *   node scripts/atlas/prove-ornith-yarn-runtime-v1.mjs --expected-min-context=65536
 *   LLAMA_SERVER_URL=http://127.0.0.1:8090 node ...
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const BASE = (process.env.LLAMA_SERVER_URL ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const EXPECTED_MIN_CONTEXT = Number(
  process.argv.find((a) => a.startsWith('--expected-min-context='))?.split('=')[1] ?? 65536,
);
const OUT = process.argv.find((a) => a.startsWith('--out='))?.slice(6)
  ?? 'docs/reports/ornith-yarn-runtime-v1.json';

async function getJson(url, init) {
  const response = await fetch(url, init);
  const text = await response.text();
  if (!response.ok) throw new Error(`${response.status} ${response.statusText}: ${text.slice(0, 500)}`);
  return text ? JSON.parse(text) : {};
}

function pickNumber(...values) {
  for (const v of values) if (Number.isFinite(Number(v))) return Number(v);
  return null;
}

const startedAt = new Date().toISOString();
const props = await getJson(`${BASE}/props`);
const models = await getJson(`${BASE}/v1/models`);

const modelIds = Array.isArray(models?.data) ? models.data.map((m) => String(m?.id ?? '')) : [];
const exposedModel = String(
  props?.model_alias ?? props?.model_path ?? props?.model ?? modelIds[0] ?? '',
);

const nCtx = pickNumber(
  props?.n_ctx,
  props?.n_ctx_train,
  props?.default_generation_settings?.n_ctx,
  props?.default_generation_settings?.n_ctx_train,
  props?.total_slots && props?.n_ctx_slot ? props.n_ctx_slot : null,
);

const modelLooksOrnith = /ornith|qwen35/i.test(exposedModel)
  || modelIds.some((id) => /ornith|qwen35/i.test(id));

const completion = await getJson(`${BASE}/v1/chat/completions`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({
    model: modelIds[0] || 'local',
    messages: [{ role: 'user', content: 'Reply with exactly: YARN_PROBE_OK' }],
    max_tokens: 12,
    temperature: 0,
  }),
});

const text = completion?.choices?.[0]?.message?.content ?? '';
const completionOk = typeof text === 'string' && text.includes('YARN_PROBE_OK');
const contextCheck = nCtx == null ? 'UNEXPOSED' : (nCtx >= EXPECTED_MIN_CONTEXT ? 'PASS' : 'FAIL');

const report = {
  schema: 'atlas.ornith-yarn-runtime-proof.v1',
  status:
    modelLooksOrnith && completionOk && contextCheck !== 'FAIL'
      ? 'ORNITH_RUNTIME_PROBE_PASS'
      : 'ORNITH_RUNTIME_PROBE_FAIL',
  startedAt,
  finishedAt: new Date().toISOString(),
  baseUrl: BASE,
  expectedMinContext: EXPECTED_MIN_CONTEXT,
  observations: {
    exposedModel,
    modelIds,
    modelLooksOrnith,
    exposedContextTokens: nCtx,
    contextCheck,
    completionOk,
    responsePreview: String(text).slice(0, 160),
  },
  interpretation: {
    provesServerReachable: true,
    provesOrnithIdentity: modelLooksOrnith,
    provesBoundedCompletion: completionOk,
    provesConfiguredContextIfExposed: contextCheck === 'PASS',
    provesYaRNAlgorithmActive: false,
    note:
      'llama.cpp /props does not provide a stable cross-version field that proves the exact YaRN CLI flags. ' +
      'Treat this as runtime/context evidence only. Bind an exact launcher command or process-command-line receipt ' +
      'before claiming a specific --rope-scaling/--yarn-* configuration.',
  },
  safety: {
    restartsServer: false,
    mutatesCanonicalStores: false,
    changesModelProfile: false,
  },
};

const outPath = path.resolve(ROOT, OUT);
await fs.mkdir(path.dirname(outPath), { recursive: true });
await fs.writeFile(outPath, JSON.stringify(report, null, 2) + '\n', 'utf8');
console.log(JSON.stringify(report, null, 2));
if (report.status !== 'ORNITH_RUNTIME_PROBE_PASS') process.exitCode = 1;
