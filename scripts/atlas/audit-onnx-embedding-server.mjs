#!/usr/bin/env node
/**
 * Probe the local EmbeddingGemma ONNX embedding server.
 *
 * Expected server:
 *   python sveltekit-frontend/scripts/embed-server/serve.py --backend onnx --port 8081
 *
 * The server exposes OpenAI-compatible POST /v1/embeddings and internally
 * chooses DirectML if onnxruntime exposes DmlExecutionProvider, otherwise CPU.
 */

import fs from 'node:fs';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const URL_BASE = (process.env.OLLAMA_EMBED_BASE_URL || process.env.EMBED_SERVER_URL || 'http://127.0.0.1:8081').replace(/\/$/, '');
const REPORT_JSON = path.join(REPO_ROOT, 'docs/reports/onnx-embedding-server-audit.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs/reports/onnx-embedding-server-audit.md');
const BATCH_SIZE = Number(process.env.EMBED_AUDIT_BATCH_SIZE || 8);

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

async function postEmbeddings(texts) {
  const start = performance.now();
  const res = await fetch(`${URL_BASE}/v1/embeddings`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ input: texts, model: 'embeddinggemma' }),
    signal: AbortSignal.timeout(15000),
  });
  const elapsedMs = Math.round(performance.now() - start);
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    throw new Error(`HTTP ${res.status}: ${body.slice(0, 300)}`);
  }
  const json = await res.json();
  const vectors = Array.isArray(json.data) ? json.data.map((row) => row.embedding) : [];
  return { elapsedMs, vectors, response: json };
}

function render(report) {
  return [
    '# ONNX Embedding Server Audit',
    '',
    `- generated_at: ${report.generated_at}`,
    `- url: ${report.url}`,
    `- status: ${report.status}`,
    `- backend: ${report.health?.backend ?? 'unknown'}`,
    `- dim: ${report.health?.dim ?? 'unknown'}`,
    `- providers_available: ${(report.health?.providers_available ?? []).join(', ') || 'unknown'}`,
    `- providers_active: ${(report.health?.providers_active ?? []).join(', ') || 'unknown'}`,
    `- batch_size: ${report.batch_size}`,
    `- elapsed_ms: ${report.embedding_probe?.elapsed_ms ?? 'n/a'}`,
    `- vectors: ${report.embedding_probe?.vectors ?? 0}`,
    `- dimension_ok: ${report.embedding_probe?.dimension_ok ?? false}`,
    '',
    '## Routing',
    '',
    'Set this to route the existing embedding client through the ONNX server before Ollama:',
    '',
    '```powershell',
    '$env:OLLAMA_EMBED_BASE_URL="http://127.0.0.1:8081"',
    '```',
    '',
    'The existing embedding client will still cache Redis keys and write Postgres/Qdrant through the current workers.',
    '',
  ].join('\n') + '\n';
}

async function main() {
  const texts = Array.from({ length: BATCH_SIZE }, (_, i) => `parent atlas embedding audit ${i}`);
  const report = {
    generated_at: new Date().toISOString(),
    url: URL_BASE,
    status: 'FAIL',
    health: null,
    batch_size: texts.length,
    embedding_probe: null,
    error: null,
  };

  try {
    report.health = await getJson(`${URL_BASE}/health`);
    const probe = await postEmbeddings(texts);
    report.embedding_probe = {
      elapsed_ms: probe.elapsedMs,
      vectors: probe.vectors.length,
      dimensions: probe.vectors.map((vector) => vector?.length ?? 0),
      dimension_ok: probe.vectors.length === texts.length && probe.vectors.every((vector) => vector?.length === 768),
      ms_per_text: Math.round((probe.elapsedMs / texts.length) * 10) / 10,
    };
    report.status = report.embedding_probe.dimension_ok ? 'PASS' : 'WARN';
  } catch (error) {
    report.error = error instanceof Error ? error.message : String(error);
  }

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  fs.writeFileSync(REPORT_MD, render(report), 'utf8');
  console.log(JSON.stringify(report, null, 2));
  if (report.status === 'FAIL') process.exitCode = 1;
}

main();
