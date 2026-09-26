#!/usr/bin/env node

const args = process.argv.slice(2);
const urlIndex = args.indexOf('--url');
const endpoint = urlIndex >= 0 && args[urlIndex + 1]
  ? args[urlIndex + 1]
  : process.env.RERANK_URL || process.env.RERANK_BASE_URL || process.env.RERANKER_SIDECAR_URL || 'http://127.0.0.1:8099';

const url = `${endpoint.replace(/\/$/, '')}/health`;
const startedAt = Date.now();

try {
  const response = await fetch(url, { signal: AbortSignal.timeout(5000) });
  const text = await response.text();
  let body = text;
  try { body = JSON.parse(text); } catch { /* preserve non-JSON diagnostics */ }
  const receipt = {
    schema: 'atlas.reranker-health.v1',
    endpoint,
    url,
    reachable: true,
    statusCode: response.status,
    healthy: response.ok,
    latencyMs: Date.now() - startedAt,
    body,
    writesPerformed: false,
  };
  console.log(JSON.stringify(receipt, null, 2));
  if (!response.ok) process.exitCode = 1;
} catch (error) {
  console.log(JSON.stringify({
    schema: 'atlas.reranker-health.v1',
    endpoint,
    url,
    reachable: false,
    healthy: false,
    latencyMs: Date.now() - startedAt,
    error: error instanceof Error ? error.message : String(error),
    writesPerformed: false,
  }, null, 2));
  process.exitCode = 1;
}
