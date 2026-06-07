#!/usr/bin/env node
/**
 * bench-cache-matrix.mjs
 *
 * Phase 7 TurboQuant generation benchmark across cache states.
 * Measures streamed TTFT / TPS while tagging the cache source that
 * assembled the prompt for each scenario.
 *
 * Scenarios:
 * - no cache
 * - Redis cache hit
 * - Postgres cache hit
 * - local JSON cache hit
 * - changed repo SHA miss
 * - changed system prompt miss
 * - changed tool definitions miss
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..', '..');
const LOG_DIR = path.join(ROOT, 'logs', 'turboquant');
const CACHE_DIR = path.join(ROOT, '.cache', 'ace', 'context-packs');
const REDIS_CONTAINER = process.env.REDIS_CONTAINER ?? process.env.DEEDS_REDIS_CONTAINER ?? 'legal-ai-valkey';
const POSTGRES_CONTAINER = process.env.DEEDS_POSTGRES_CONTAINER || '94823593eb8e_legal-ai-postgres';
const BASE_URL = (process.env.TURBO_BASE ?? 'http://127.0.0.1:8090').replace(/\/$/, '');
const MODEL = process.env.TURBO_MODEL_NAME ?? 'gemma4-rotorquant:latest';
const CHAT_TIMEOUT_MS = Number(process.env.TURBO_BENCH_CHAT_TIMEOUT_MS ?? '120000');

const BASE_PROMPT =
  process.env.TURBO_BENCH_PROMPT ??
  'Summarize the issue and provide one practical next step in two sentences.';

const SCENARIOS = [
  { id: 'no-cache', cacheSource: 'miss', cause: 'cold_start' },
  { id: 'redis-hit', cacheSource: 'redis', cause: 'exact-hot-hit' },
  { id: 'postgres-hit', cacheSource: 'postgres', cause: 'durable-audit-hit' },
  { id: 'local-json-hit', cacheSource: 'local-json', cause: 'snapshot-hit' },
  { id: 'changed-repo-sha-miss', cacheSource: 'miss', cause: 'repo_git_sha_changed' },
  { id: 'changed-system-prompt-miss', cacheSource: 'miss', cause: 'system_prompt_hash_changed' },
  { id: 'changed-tool-definitions-miss', cacheSource: 'miss', cause: 'tool_definitions_hash_changed' },
];

function runDocker(args, input) {
  return spawnSync('docker', args, {
    encoding: 'utf8',
    windowsHide: true,
    input,
    maxBuffer: 10 * 1024 * 1024,
  });
}

function sqlLiteral(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

async function ensureDir(dir) {
  await fs.mkdir(dir, { recursive: true });
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function sanitizeCacheKey(key) {
  return key.replace(/[:<>"/\\|?*]+/g, '_');
}

function buildCacheKey(id) {
  return `ace:context:${id}:v1`;
}

function buildSnapshotPath(cacheKey) {
  return path.join(CACHE_DIR, `${sanitizeCacheKey(cacheKey)}.json`);
}

async function readRedisJson(key) {
  const result = runDocker(['exec', REDIS_CONTAINER, 'redis-cli', 'GET', key]);
  if (result.status !== 0) return null;
  const raw = (result.stdout || '').trim();
  if (!raw || raw === '(nil)') return null;
  try {
    return JSON.parse(raw);
  } catch {
    return raw;
  }
}

async function setRedisJson(key, value) {
  const result = runDocker(['exec', '-i', REDIS_CONTAINER, 'redis-cli', 'SET', key, JSON.stringify(value)]);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `Failed to set ${key}`);
  }
}

async function delRedisKeys(keys) {
  if (!keys.length) return;
  const result = runDocker(['exec', REDIS_CONTAINER, 'redis-cli', 'DEL', ...keys]);
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `Failed to delete ${keys.join(', ')}`);
  }
}

async function clearPostgresRow(cacheKey) {
  const sql = `
DELETE FROM llm_context_cache WHERE cache_key = ${sqlLiteral(cacheKey)};
DELETE FROM ace_retrieval_runs WHERE metadata->>'cacheKey' = ${sqlLiteral(cacheKey)};
`;
  const result = runDocker(
    ['exec', '-i', '-e', 'PGPASSWORD=123456', POSTGRES_CONTAINER, 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-v', 'ON_ERROR_STOP=1'],
    sql
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `Failed to clear ${cacheKey} from Postgres`);
  }
}

async function writePostgresRow({ cacheKey, pack, metadata }) {
  const contextJson = JSON.stringify(pack).replace(/'/g, "''");
  const summary = String(pack.summary ?? '').replace(/'/g, "''");
  const chunkIds = JSON.stringify(pack.chunkIds ?? []).replace(/'/g, "''");
  const graphPaths = JSON.stringify(pack.graphPaths ?? []).replace(/'/g, "''");
  const toolPolicy = JSON.stringify(pack.toolPolicy ?? {}).replace(/'/g, "''");
  const sql = `
INSERT INTO llm_context_cache (
  cache_key,
  model_name,
  model_quant,
  backend,
  tokenizer_hash,
  system_prompt_hash,
  tool_definitions_hash,
  repo_git_sha,
  corpus_hash,
  rag_bundle_hash,
  graph_snapshot_hash,
  context_pack_json,
  summary,
  chunk_ids,
  graph_paths,
  tool_policy,
  estimated_prefix_tokens,
  hit_count,
  last_used_at
) VALUES (
  ${sqlLiteral(cacheKey)},
  'gemma4-rotorquant:latest',
  'n/a',
  'phase7-benchmark',
  ${sqlLiteral(metadata.tokenizerHash)},
  ${sqlLiteral(metadata.systemPromptHash)},
  ${sqlLiteral(metadata.toolDefinitionsHash)},
  ${sqlLiteral(metadata.repoGitSha)},
  ${sqlLiteral(metadata.corpusHash)},
  ${sqlLiteral(metadata.ragBundleHash)},
  ${sqlLiteral(metadata.graphSnapshotHash)},
  ${sqlLiteral(contextJson)}::jsonb,
  ${sqlLiteral(summary)},
  ${sqlLiteral(chunkIds)}::jsonb,
  ${sqlLiteral(graphPaths)}::jsonb,
  ${sqlLiteral(toolPolicy)}::jsonb,
  ${Number(metadata.estimatedPrefixTokens ?? 0)},
  ${Number(metadata.hitCount ?? 1)},
  NOW()
)
ON CONFLICT (cache_key) DO UPDATE SET
  context_pack_json = EXCLUDED.context_pack_json,
  summary = EXCLUDED.summary,
  chunk_ids = EXCLUDED.chunk_ids,
  graph_paths = EXCLUDED.graph_paths,
  tool_policy = EXCLUDED.tool_policy,
  repo_git_sha = EXCLUDED.repo_git_sha,
  rag_bundle_hash = EXCLUDED.rag_bundle_hash,
  graph_snapshot_hash = EXCLUDED.graph_snapshot_hash,
  hit_count = EXCLUDED.hit_count,
  last_used_at = NOW();
`;
  const result = runDocker(
    ['exec', '-i', '-e', 'PGPASSWORD=123456', POSTGRES_CONTAINER, 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-v', 'ON_ERROR_STOP=1'],
    sql
  );
  if (result.status !== 0) {
    throw new Error((result.stderr || result.stdout || '').trim() || `Failed to write ${cacheKey} to Postgres`);
  }
}

async function readPostgresHasRow(cacheKey) {
  const sql = `SELECT 1 FROM llm_context_cache WHERE cache_key = ${sqlLiteral(cacheKey)} LIMIT 1;`;
  const result = runDocker(
    ['exec', '-i', '-e', 'PGPASSWORD=123456', POSTGRES_CONTAINER, 'psql', '-U', 'legal_admin', '-d', 'legal_ai_db', '-tAc', sql]
  );
  if (result.status !== 0) return false;
  return (result.stdout || '').trim() === '1';
}

async function clearSnapshot(cacheKey) {
  const filePath = buildSnapshotPath(cacheKey);
  try {
    await fs.unlink(filePath);
  } catch {
    // ignore
  }
}

async function writeSnapshot(cacheKey, pack) {
  const filePath = buildSnapshotPath(cacheKey);
  await ensureDir(path.dirname(filePath));
  await fs.writeFile(filePath, JSON.stringify(pack, null, 2), 'utf8');
  return filePath;
}

async function resolveCacheSource(cacheKey) {
  const redis = await readRedisJson(`ace:ctx:${cacheKey}`);
  if (redis) return 'redis';
  if (await readPostgresHasRow(cacheKey)) return 'postgres';
  if (await exists(buildSnapshotPath(cacheKey))) return 'local-json';
  return 'miss';
}

async function clearScenario(cacheKey) {
  await delRedisKeys([`ace:ctx:${cacheKey}`, `ace:ctx:hits:${cacheKey}`, `ace:ctx:meta:${cacheKey}`]);
  await clearPostgresRow(cacheKey).catch(() => {});
  await clearSnapshot(cacheKey);
}

function buildPack(id, prompt, scenario) {
  return {
    id,
    contextId: id,
    cacheKey: buildCacheKey(id),
    queryHash: `query-${id}`,
    intent: 'benchmark',
    coordinates: {
      clusterId: `cluster_${id}`,
      somRow: 3,
      somCol: 7,
      manifold4: [0.12, -0.33, 0.71, 0.24],
    },
    chunkIds: ['chunk:alpha', 'chunk:beta', 'chunk:gamma'],
    summaryIds: ['summary:alpha'],
    sourceRefs: ['src/lib/server/cache/ace-context-pack-cache.ts'],
    graphPaths: ['file:src/lib/server/cache/ace-context-pack-cache.ts -> cache:ace'],
    featureMapPackets: [{ family: 'phase7-benchmark', signal: scenario.id }],
    wikiCards: [{ title: 'TurboQuant Cache Benchmark', score: 1 }],
    relationshipReports: [{ relation: 'benchmarks', target: 'TurboQuant' }],
    tscDiagnostics: { errors: 0, warnings: 0, rawOutputPath: '' },
    turboVecCandidates: [{ id: `candidate-${id}`, score: 0.95 }],
    retrievalTrace: { redisHit: scenario.cacheSource === 'redis', qdrantHits: 0, degraded: false },
    toolPolicy: { allowed: ['rg', 'atlas.search'], forbidden: ['read_full_file'] },
    nextSteps: ['resolve cache source', 'run TurboQuant generation'],
    degraded: false,
    snapshotUrl: `file://${buildSnapshotPath(buildCacheKey(id))}`,
    version: 'v1',
    createdAt: new Date().toISOString(),
    summary: `${scenario.id}: ${prompt.slice(0, 120)}`,
    metadata: {
      repoGitSha: `sha-${scenario.id}`,
      corpusHash: `corpus-${scenario.id}`,
      ragBundleHash: `rag-${scenario.id}`,
      graphSnapshotHash: `graph-${scenario.id}`,
      tokenizerHash: `tok-${scenario.id}`,
      systemPromptHash: `sys-${scenario.id}`,
      toolDefinitionsHash: `tool-${scenario.id}`,
      estimatedPrefixTokens: 256,
      hitCount: scenario.cacheSource === 'miss' ? 0 : 1,
      scenario: scenario.id,
      cacheSource: scenario.cacheSource,
      cause: scenario.cause,
    },
    pointers: {},
    prompt,
  };
}

async function prepareScenario(scenario, prompt) {
  const cacheKey = buildCacheKey(scenario.id);
  await clearScenario(cacheKey);
  const pack = buildPack(scenario.id, prompt, scenario);

  if (scenario.cacheSource === 'redis') {
    await setRedisJson(`ace:ctx:${cacheKey}`, pack);
    await setRedisJson(`ace:ctx:hits:${cacheKey}`, { count: 1, cacheSource: 'redis' });
    await setRedisJson(`ace:ctx:meta:${cacheKey}`, {
      lastUsedAt: new Date().toISOString(),
      cacheSource: 'redis',
      promptTokensSavedEstimate: 256,
    });
  } else if (scenario.cacheSource === 'postgres') {
    await writePostgresRow({
      cacheKey,
      pack,
      metadata: {
        tokenizerHash: `tok-${scenario.id}`,
        systemPromptHash: `sys-${scenario.id}`,
        toolDefinitionsHash: `tool-${scenario.id}`,
        repoGitSha: `sha-${scenario.id}`,
        corpusHash: `corpus-${scenario.id}`,
        ragBundleHash: `rag-${scenario.id}`,
        graphSnapshotHash: `graph-${scenario.id}`,
        estimatedPrefixTokens: 256,
        hitCount: 1,
      },
    });
  } else if (scenario.cacheSource === 'local-json') {
    await writeSnapshot(cacheKey, pack);
  }

  const resolved = await resolveCacheSource(cacheKey);
  return { cacheKey, pack, resolved };
}

async function ensureHealthy() {
  const res = await fetch(`${BASE_URL}/health`, { signal: AbortSignal.timeout(3_000) });
  if (!res.ok) throw new Error(`TurboQuant health ${res.status}`);
}

async function streamChat(prompt) {
  const startedAt = performance.now();
  let firstTokenMs = null;
  let outputTokens = 0;
  let promptTokens = null;
  let completionTokens = null;
  let content = '';

  const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: MODEL,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 128,
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
  const dec = new TextDecoder();
  let buf = '';
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    const lines = buf.split(/\r?\n/);
    buf = lines.pop() ?? '';
    for (const line of lines) {
      if (!line.startsWith('data: ')) continue;
      const data = line.slice(6).trim();
      if (!data || data === '[DONE]') continue;
      try {
        const obj = JSON.parse(data);
        if (obj?.usage) {
          promptTokens = typeof obj.usage.prompt_tokens === 'number' ? obj.usage.prompt_tokens : promptTokens;
          completionTokens = typeof obj.usage.completion_tokens === 'number' ? obj.usage.completion_tokens : completionTokens;
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
  const finalPromptTokens = Number.isFinite(promptTokens) && promptTokens > 0 ? promptTokens : Math.max(1, Math.ceil(prompt.length / 4));
  const finalCompletionTokens = Number.isFinite(completionTokens) && completionTokens > 0 ? completionTokens : outputTokens;
  const tokensPerSecond = finalCompletionTokens > 0 && totalMs > 0 ? (finalCompletionTokens / totalMs) * 1000 : 0;

  return {
    time_to_first_token_ms: Math.round(firstTokenMs ?? totalMs),
    tokens_per_second: Number(tokensPerSecond.toFixed(2)),
    prompt_tokens: finalPromptTokens,
    completion_tokens: finalCompletionTokens,
    total_ms: Math.round(totalMs),
    response_preview: content.trim().slice(0, 160),
  };
}

async function persistReport(report) {
  await ensureDir(LOG_DIR);
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outPath = path.join(LOG_DIR, `bench-cache-matrix-${stamp}.json`);
  const latestPath = path.join(LOG_DIR, 'bench-cache-matrix-latest.json');
  const payload = `${JSON.stringify(report, null, 2)}\n`;
  await fs.writeFile(outPath, payload, 'utf8');
  await fs.writeFile(latestPath, payload, 'utf8');
  return { outPath, latestPath };
}

async function main() {
  await ensureDir(CACHE_DIR);
  await ensureHealthy();

  const results = [];
  for (const scenario of SCENARIOS) {
    const prompt =
      scenario.cacheSource === 'miss'
        ? BASE_PROMPT
        : `${BASE_PROMPT}\n\nContext pack provenance for ${scenario.id}:\n- cache source: ${scenario.cacheSource}\n- cause: ${scenario.cause}`;

    const { cacheKey, resolved } = await prepareScenario(scenario, prompt);
    const generation = await streamChat(prompt);

    results.push({
      scenario: scenario.id,
      cache_key: cacheKey,
      cache_source: resolved,
      cache_cause: scenario.cause,
      prompt_preview: prompt.slice(0, 120),
      ...generation,
    });
  }

  const report = {
    model: MODEL,
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    results,
  };

  const paths = await persistReport(report);
  console.log(JSON.stringify({ ...report, paths }, null, 2));
}

main().catch((err) => {
  console.error(JSON.stringify({ status: 'fail', error: String(err) }, null, 2));
  process.exit(1);
});
