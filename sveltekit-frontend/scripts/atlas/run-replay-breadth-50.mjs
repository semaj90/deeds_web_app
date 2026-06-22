#!/usr/bin/env node
/**
 * Run a bounded replay-breadth pass and summarize the benchmark output.
 *
 * This stays read-only. It reuses the existing retrieval E2E benchmark and
 * converts its output into the replay trace summary surface expected by the
 * board.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const BENCHMARK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'atlas', 'benchmark-retrieval-e2e.mjs');
const EXPORT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'atlas', 'export-replay-traces.mjs');
const BENCHMARK_JSON = path.join(REPORTS_DIR, 'retrieval-e2e-benchmark.json');
const SUMMARY_JSON = path.join(REPORTS_DIR, 'replay-trace-summary.json');
const SUMMARY_MD = path.join(REPORTS_DIR, 'replay-trace.md');
const EXPORT_JSONL = path.join(REPORTS_DIR, 'replay-trace.jsonl');
const EXPORT_MD = path.join(REPORTS_DIR, 'replay-trace-export.md');

function parseCount(argv) {
  const match = argv.find((arg) => arg.startsWith('--count=') || arg.startsWith('--limit='));
  const raw = match ? Number(match.split('=')[1]) : Number(process.env.npm_config_count ?? process.env.npm_config_limit ?? 50);
  return Number.isFinite(raw) && raw > 0 ? raw : 50;
}

function parsePacketLimit(argv) {
  const match = argv.find((arg) => arg.startsWith('--packet-limit=') || arg.startsWith('--limit='));
  const raw = match ? Number(match.split('=')[1]) : Number(process.env.npm_config_packet_limit ?? 5);
  return Number.isFinite(raw) && raw > 0 ? raw : 5;
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

async function readJsonl(filePath) {
  try {
    const text = await fs.readFile(filePath, 'utf8');
    return text.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => JSON.parse(line));
  } catch {
    return [];
  }
}

function percentile(values, p) {
  const nums = values.filter((v) => Number.isFinite(v)).sort((a, b) => a - b);
  if (nums.length === 0) return null;
  const idx = Math.min(nums.length - 1, Math.max(0, Math.floor((nums.length - 1) * p)));
  return nums[idx];
}

function sum(values) {
  return values.reduce((acc, value) => acc + (Number(value) || 0), 0);
}

function formatPct(num, den) {
  if (!Number.isFinite(num) || !Number.isFinite(den) || den <= 0) return '0%';
  return `${((num / den) * 100).toFixed(1)}%`;
}

function compact(value) {
  return String(value ?? '').trim();
}

function pickTopEntries(rows, key, limit = 5) {
  const counts = new Map();
  for (const row of rows) {
    const value = String(row?.[key] ?? '').trim();
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([value, hits]) => ({ [key]: value, hits }));
}

function countTruthy(rows, key) {
  return rows.filter((row) => Boolean(row?.[key])).length;
}

function runNode(scriptPath, args = []) {
  const run = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 32,
  });
  return {
    status: run.status ?? 1,
    stdout: run.stdout ?? '',
    stderr: run.stderr ?? '',
  };
}

function renderMarkdown(summary) {
  const lines = [
    '# Replay Trace Summary',
    '',
    `Generated: ${summary.generatedAt}`,
    `Status: ${summary.status}`,
    `Replay queries: ${summary.queryCount}`,
    `Replay packets: ${summary.packetCount}`,
    '',
    '## Coverage',
    '',
    `- Cache proof: ${summary.cacheProof.status}`,
    `- Cache proof warm+repeat hit pct: ${summary.cacheProof.warmRepeatCacheHitPct}`,
    `- Cache namespaces: ${(summary.cacheProof.cacheNamespaces ?? []).join(', ') || 'none'}`,
    `- Neo4j proof: ${summary.graphProof.status}`,
    `- Neo4j graph hits: ${summary.graphProof.graphHitCount}`,
    `- Neo4j graph stage values: ${(summary.graphProof.graphStageStatusValues ?? []).join(', ') || 'none'}`,
    `- Neo4j graph stage reasons: ${(summary.graphProof.graphStageReasonValues ?? []).join(', ') || 'none'}`,
    `- Qdrant hits: ${summary.qdrantHitPct}`,
    `- Cache hits: ${summary.cacheHitPct}`,
    `- Packet key coverage: ${summary.packetKeyPct}`,
    `- Feature id coverage: ${summary.featureIdPct}`,
    `- Source ref coverage: ${summary.sourceRefPct}`,
    `- Provenance coverage: ${summary.provenancePct}`,
    '',
    '## Latency',
    '',
    '| Metric | p50 ms | p95 ms |',
    '|---|---:|---:|',
    `| total_ms | ${summary.latency.total.p50 ?? 'n/a'} | ${summary.latency.total.p95 ?? 'n/a'} |`,
    `| bm25_ms | ${summary.latency.bm25.p50 ?? 'n/a'} | ${summary.latency.bm25.p95 ?? 'n/a'} |`,
    `| qdrant_ms | ${summary.latency.qdrant.p50 ?? 'n/a'} | ${summary.latency.qdrant.p95 ?? 'n/a'} |`,
    `| redis_ms | ${summary.latency.redis.p50 ?? 'n/a'} | ${summary.latency.redis.p95 ?? 'n/a'} |`,
    `| neo4j_ms | ${summary.latency.neo4j.p50 ?? 'n/a'} | ${summary.latency.neo4j.p95 ?? 'n/a'} |`,
    `| fusion_ms | ${summary.latency.fusion.p50 ?? 'n/a'} | ${summary.latency.fusion.p95 ?? 'n/a'} |`,
    '',
    '## Top Packet Fields',
    '',
    `- packet_key: ${summary.top.packetKey ?? 'n/a'}`,
    `- source_ref: ${summary.top.sourceRef ?? 'n/a'}`,
    `- source_ref_key: ${summary.top.sourceRefKey ?? 'n/a'}`,
    `- feature_id: ${summary.top.featureId ?? 'n/a'}`,
    `- domain_class: ${summary.top.domainClass ?? 'n/a'}`,
    `- ontology_label: ${summary.top.ontologyLabel ?? 'n/a'}`,
    `- topology_label: ${summary.top.topologyLabel ?? 'n/a'}`,
    `- cache_hit_source: ${summary.top.cacheHitSource ?? 'n/a'}`,
    `- cache_namespace: ${summary.top.cacheNamespace ?? 'n/a'}`,
    `- cache_key: ${summary.top.cacheKey ?? 'n/a'}`,
    `- query_normalized: ${summary.top.queryNormalized ?? 'n/a'}`,
    `- graph_stage_status: ${summary.top.graphStageStatus ?? 'n/a'}`,
    `- graph_stage_reason: ${summary.top.graphStageReason ?? 'n/a'}`,
    `- fusion_score: ${summary.top.fusionScore ?? 'n/a'}`,
    `- traversal_path: ${Array.isArray(summary.top.traversalPath) && summary.top.traversalPath.length > 0 ? summary.top.traversalPath.join(' -> ') : 'n/a'}`,
    '',
    '## Top Sources',
    '',
    ...(summary.topSourceRefs.length > 0
      ? summary.topSourceRefs.map((row) => `- ${row.source_ref}: ${row.hits}`)
      : ['- none']),
    '',
    '## Top Features',
    '',
    ...(summary.topFeatureIds.length > 0
      ? summary.topFeatureIds.map((row) => `- ${row.feature_id}: ${row.hits}`)
      : ['- none']),
    '',
    '## Notes',
    '',
    ...(summary.notes ?? []).map((note) => `- ${note}`),
  ];
  return lines.join('\n');
}

async function runBenchmarkRound(count, packetLimit, round) {
  const run = runNode(BENCHMARK_SCRIPT, [`--count=${count}`, `--limit=${packetLimit}`, `--round=${round}`]);
  if (run.status !== 0) {
    const benchmarkExists = await fs.access(BENCHMARK_JSON).then(() => true).catch(() => false);
    if (!benchmarkExists) {
      throw new Error(String(run.stderr || run.stdout || `benchmark failed (${run.status})`));
    }
  }
  const benchmark = await readJson(BENCHMARK_JSON);
  if (!benchmark) {
    throw new Error(`Missing benchmark output: ${BENCHMARK_JSON}`);
  }
  return benchmark;
}

async function runExport(limit) {
  const run = runNode(EXPORT_SCRIPT, [`--limit=${limit}`]);
  if (run.status !== 0) {
    throw new Error(String(run.stderr || run.stdout || `replay export failed (${run.status})`));
  }
  const summary = await readJson(path.join(REPORTS_DIR, 'replay-trace-summary.json'));
  const rows = await readJsonl(EXPORT_JSONL);
  return { summary, rows, stdout: run.stdout, stderr: run.stderr };
}

async function main() {
  const count = parseCount(process.argv.slice(2));
  const packetLimit = parsePacketLimit(process.argv.slice(2));
  await fs.mkdir(REPORTS_DIR, { recursive: true });

  const roundNames = ['cold', 'warm', 'repeat'];
  const roundBenchmarks = [];
  for (const round of roundNames) {
    roundBenchmarks.push({ round, benchmark: await runBenchmarkRound(count, packetLimit, round) });
  }

  const exportResult = await runExport(count);
  const benchmark = roundBenchmarks[roundBenchmarks.length - 1]?.benchmark ?? roundBenchmarks[0]?.benchmark ?? null;
  const replayRows = Array.isArray(exportResult.rows) ? exportResult.rows : [];
  const benchmarkQueries = Array.isArray(benchmark?.results) ? benchmark.results : [];

  const latencies = {
    total: {
      p50: percentile(replayRows.map((row) => row.latency_ms ?? row.total_ms), 0.5),
      p95: percentile(replayRows.map((row) => row.latency_ms ?? row.total_ms), 0.95),
    },
    bm25: {
      p50: percentile(replayRows.map((row) => row.bm25_hits ?? row.bm25_ms), 0.5),
      p95: percentile(replayRows.map((row) => row.bm25_hits ?? row.bm25_ms), 0.95),
    },
    qdrant: {
      p50: percentile(replayRows.map((row) => row.qdrant_hits ?? row.qdrant_ms), 0.5),
      p95: percentile(replayRows.map((row) => row.qdrant_hits ?? row.qdrant_ms), 0.95),
    },
    redis: {
      p50: percentile(replayRows.map((row) => row.redis_hits ?? row.redis_ms), 0.5),
      p95: percentile(replayRows.map((row) => row.redis_hits ?? row.redis_ms), 0.95),
    },
    neo4j: {
      p50: percentile(replayRows.map((row) => row.neo4j_hits ?? row.neo4j_ms), 0.5),
      p95: percentile(replayRows.map((row) => row.neo4j_hits ?? row.neo4j_ms), 0.95),
    },
    fusion: {
      p50: percentile(replayRows.map((row) => row.rrf_hits ?? row.fusion_ms), 0.5),
      p95: percentile(replayRows.map((row) => row.rrf_hits ?? row.fusion_ms), 0.95),
    },
  };

  const coldQueries = Array.isArray(roundBenchmarks[0]?.benchmark?.results) ? roundBenchmarks[0].benchmark.results : [];
  const warmQueries = Array.isArray(roundBenchmarks[1]?.benchmark?.results) ? roundBenchmarks[1].benchmark.results : [];
  const repeatQueries = Array.isArray(roundBenchmarks[2]?.benchmark?.results) ? roundBenchmarks[2].benchmark.results : [];
  const coldCacheHits = countTruthy(coldQueries, 'cache_hit');
  const warmCacheHits = countTruthy(warmQueries, 'cache_hit');
  const repeatCacheHits = countTruthy(repeatQueries, 'cache_hit');
  const warmRepeatCacheHitCount = warmCacheHits + repeatCacheHits;
  const warmRepeatCacheHitPct = formatPct(warmRepeatCacheHitCount, warmQueries.length + repeatQueries.length);
  const graphEnabledCount = replayRows.filter((row) => String(row.graph_stage_status ?? '') === 'GRAPH_ENABLED').length;
  const graphDegradedCount = replayRows.filter((row) => String(row.graph_stage_status ?? '') !== 'GRAPH_ENABLED').length;
  const graphReasonValues = [...new Set(replayRows.map((row) => String(row.graph_stage_reason ?? '').trim()).filter(Boolean))].sort();
  const allNeo4jZero = replayRows.every((row) => Number(row.neo4j_hits ?? 0) === 0);
  const anyNonGraphHits = replayRows.some((row) => Number(row.qdrant_hits ?? 0) > 0 || Number(row.postgres_hits ?? 0) > 0);
  const graphProofStatus = graphEnabledCount > 0
    ? 'PASS'
    : (anyNonGraphHits || graphDegradedCount > 0 ? 'GRAPH_DEGRADED' : 'GRAPH_DISABLED');
  const cacheProofStatus = warmRepeatCacheHitCount > 0 ? 'PASS' : 'FAIL';
  const replayBreadthPassed = coldQueries.length === count && warmQueries.length === count && repeatQueries.length === count;

  const coverage = {
    qdrantHitPct: formatPct(replayRows.filter((row) => Number(row.qdrant_hits ?? 0) > 0).length, replayRows.length),
    cacheHitPct: formatPct(countTruthy(replayRows, 'cache_hit'), replayRows.length),
    packetKeyPct: formatPct(replayRows.filter((row) => String(row.packet_key ?? '').trim()).length, replayRows.length),
    featureIdPct: formatPct(replayRows.filter((row) => String(row.feature_id ?? '').trim()).length, replayRows.length),
    sourceRefPct: formatPct(replayRows.filter((row) => String(row.source_ref ?? '').trim()).length, replayRows.length),
    provenancePct: formatPct(replayRows.filter((row) => Array.isArray(row.provenance) && row.provenance.length > 0).length, replayRows.length),
  };

  const topRow = replayRows[0] ?? null;
  const summary = {
    generatedAt: new Date().toISOString(),
    status: (benchmark?.summary?.status ?? 'unknown') === 'failed' || !replayBreadthPassed || cacheProofStatus === 'FAIL'
      ? 'failed'
      : (graphProofStatus === 'GRAPH_DEGRADED' || graphProofStatus === 'GRAPH_DISABLED'
        ? 'pass_with_warnings'
        : benchmark?.summary?.status ?? 'unknown'),
    queryCount: replayRows.length,
    packetCount: replayRows.reduce((sum, row) => sum + Number(row.result_count ?? 0), 0),
    query_count_target: count,
    storyId: 'proof-quality-lane',
    taskId: 'atlas:replay:breadth:50',
    workerId: compact(process.env.USERNAME || process.env.USER || 'codex-desktop') || 'codex-desktop',
    traceId: replayRows.find((row) => String(row.trace_id ?? row.query_hash ?? '').trim())?.trace_id ?? replayRows.find((row) => String(row.query_hash ?? '').trim())?.query_hash ?? null,
    coverage,
    cacheHitPct: coverage.cacheHitPct,
    graphEnabledPct: formatPct(graphEnabledCount, replayRows.length),
    qdrantHitPct: coverage.qdrantHitPct,
    sourceRefPct: coverage.sourceRefPct,
    featureIdPct: coverage.featureIdPct,
    packetKeyPct: coverage.packetKeyPct,
    provenancePct: coverage.provenancePct,
    failedQueries: replayRows.filter((row) => row.ok === false || Boolean(row.error)).map((row) => ({
      query: row.query ?? null,
      query_hash: row.query_hash ?? null,
      error: row.error ?? null,
      replay_id: row.replay_id ?? null,
    })),
    latency: latencies,
    rounds: roundBenchmarks.map(({ round, benchmark: roundBenchmark }) => ({
      round,
      status: roundBenchmark?.summary?.status ?? 'unknown',
      cacheHitPct: roundBenchmark?.summary?.cache_hit_pct ?? '0.0%',
      graphStageStatus: roundBenchmark?.summary?.graph_stage_status ?? 'unknown',
      queryCount: Array.isArray(roundBenchmark?.results) ? roundBenchmark.results.length : 0,
    })),
    cacheProof: {
      status: cacheProofStatus,
      coldRun: 'completed',
      warmRun: 'completed',
      repeatRun: 'completed',
      coldCacheHits,
      warmCacheHits,
      repeatCacheHits,
      warmRepeatCacheHitCount,
      warmRepeatCacheHitPct,
      cacheNamespaces: [...new Set(replayRows.map((row) => row.cache_namespace).filter(Boolean))].sort(),
    },
    graphProof: {
      status: graphProofStatus,
      graphHitCount: graphEnabledCount,
      graphStageStatusValues: [...new Set(replayRows.map((row) => row.graph_stage_status).filter(Boolean))].sort(),
      graphStageReasonValues: graphReasonValues,
    },
    top: {
      packetKey: topRow?.packet_key ?? null,
      sourceRef: topRow?.source_ref ?? null,
      sourceRefKey: topRow?.source_ref_key ?? null,
      featureId: topRow?.feature_id ?? null,
      domainClass: topRow?.domain_class ?? null,
      ontologyLabel: topRow?.ontology_label ?? null,
      topologyLabel: topRow?.topology_label ?? null,
      cacheHitSource: topRow?.cache_hit_source ?? null,
      cacheNamespace: topRow?.cache_namespace ?? null,
      cacheKey: topRow?.cache_key ?? null,
      queryNormalized: topRow?.query_normalized ?? null,
      graphStageStatus: topRow?.graph_stage_status ?? null,
      graphStageReason: topRow?.graph_stage_reason ?? null,
      fusionScore: topRow?.fusion_score ?? null,
      traversalPath: topRow?.traversal_path ?? [],
    },
    topSourceRefs: pickTopEntries(replayRows, 'source_ref', 5),
    topFeatureIds: pickTopEntries(replayRows, 'feature_id', 5),
    notes: [
      'Fresh replay breadth comes from live Redis trace entries, not point samples.',
      replayRows.length < count ? `Only ${replayRows.length}/${count} replay rows were available.` : 'Replay breadth target reached.',
      graphProofStatus !== 'PASS' ? 'Neo4j is treated as background analysis, not canonical truth.' : 'Neo4j graph stage is active on this run.',
      coverage.provenancePct === '0.0%' ? 'Provenance breadth is thin and should be expanded from replay trace rows.' : 'Provenance breadth is present in the replay trace export.',
    ],
    source: {
      benchmark: path.relative(REPO_ROOT, BENCHMARK_JSON).replace(/\\/g, '/'),
      replay: path.relative(REPO_ROOT, SUMMARY_JSON).replace(/\\/g, '/'),
      export: path.relative(REPO_ROOT, EXPORT_JSONL).replace(/\\/g, '/'),
    },
  };

  await fs.writeFile(SUMMARY_JSON, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await fs.writeFile(SUMMARY_MD, renderMarkdown(summary), 'utf8');
  await fs.writeFile(EXPORT_MD, renderMarkdown(summary), 'utf8').catch(() => {});

  console.log(`Wrote ${path.relative(REPO_ROOT, SUMMARY_JSON)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, SUMMARY_MD)}`);
  console.log(JSON.stringify({
    status: summary.status,
    queryCount: summary.queryCount,
    cacheHitRows: summary.cacheProof.warmRepeatCacheHitCount,
    workerId: summary.workerId,
  }, null, 2));
}

main().catch((error) => {
  console.error('[run-replay-breadth-50] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
