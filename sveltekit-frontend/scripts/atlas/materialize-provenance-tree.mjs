#!/usr/bin/env node
/**
 * Materialize a deterministic provenance tree from replay evidence.
 *
 * This is read-only. It consumes the replay breadth summary and replay trace
 * export and emits a stable per-query provenance surface that can be replayed
 * idempotently without sampling raw Qdrant points.
 */

import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'provenance-tree.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'provenance-tree.md');
const BENCHMARK_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'replay-trace-summary.json');
const REPLAY_JSONL = path.join(REPO_ROOT, 'docs', 'reports', 'replay-trace.jsonl');

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

function sha256(text) {
  return crypto.createHash('sha256').update(String(text)).digest('hex');
}

function compact(value) {
  return String(value ?? '').trim();
}

function renderMarkdown(report) {
  const lines = [
    '# Provenance Tree',
    '',
    `Generated: ${report.generatedAt}`,
    `Status: ${report.status}`,
    '',
    '## Summary',
    '',
    `- queries: ${report.summary.queryCount}`,
    `- pass rows: ${report.summary.passRows}`,
    `- degraded rows: ${report.summary.degradedRows}`,
    `- failed rows: ${report.summary.failedRows}`,
    `- cache hit rows: ${report.summary.cacheHitRows}`,
    `- cache hit source families: ${report.summary.cacheHitSources.join(', ') || 'none'}`,
    `- cache namespaces: ${report.summary.cacheNamespaces.join(', ') || 'none'}`,
    `- replay rows: ${report.summary.replayRows}`,
    '',
    '## Nodes',
    '',
    '| provenance_id | query_id | replay_id | task_id | story_id | worker_id | packet_key | source_ref_key | feature_id | graph_stage_status | graph_stage_reason | cache_namespace | cache_hit_source | verdict |',
    '|---|---|---|---|---|---|---|---|---|---|---|---|---|---|',
  ];

  for (const node of report.nodes) {
    lines.push(
      `| ${node.provenance_id} | ${node.query_id || 'n/a'} | ${node.replay_id || 'n/a'} | ${node.task_id} | ${node.story_id ?? 'n/a'} | ${node.worker_id} | ${node.packet_key || 'n/a'} | ${node.source_ref_key || 'n/a'} | ${node.feature_id || 'n/a'} | ${node.graph_stage_status || 'n/a'} | ${node.graph_stage_reason || 'n/a'} | ${node.cache_namespace || 'n/a'} | ${node.cache_hit_source || 'n/a'} | ${node.verdict} |`,
    );
  }

  lines.push('', '## Idempotency', '', `- deterministic seed strategy: ${report.idempotency.seedStrategy}`, `- stable hash sample: ${report.idempotency.sampleHash}`, '', '## Next Safe Action', '', report.nextSafeAction);

  return `${lines.join('\n')}\n`;
}

async function main() {
  const benchmark = await readJson(BENCHMARK_JSON);
  const replayRows = await readJsonl(REPLAY_JSONL);
  const rows = replayRows.length > 0 ? replayRows : Array.isArray(benchmark?.results) ? benchmark.results : [];
  const workerId = compact(process.env.USERNAME || process.env.USER || 'codex-desktop') || 'codex-desktop';
  const taskId = compact(benchmark?.taskId ?? 'atlas:replay:breadth:50') || 'atlas:replay:breadth:50';
  const storyId = compact(benchmark?.storyId ?? 'proof-quality-lane') || 'proof-quality-lane';
  const replayId = compact(benchmark?.replayId ?? 'atlas:replay:breadth:50') || 'atlas:replay:breadth:50';

  const nodes = rows.map((row, index) => {
    const packetKey = compact(row.packet_key);
    const sourceRef = compact(row.source_ref);
    const sourceRefKey = compact(row.source_ref_key || sourceRef.split('#')[0]);
    const featureId = compact(row.feature_id);
    const taskIdValue = compact(row.task_id ?? taskId) || taskId;
    const workerIdValue = compact(row.worker_id ?? workerId) || workerId;
    const qdrantPointId = compact(row.qdrant_point_id);
    const qdrantCollection = compact(row.qdrant_collection);
    const cacheHitSource = compact(row.cache_hit_source);
    const cacheNamespace = compact(row.cache_namespace);
    const cacheKey = compact(row.cache_key);
    const cacheNormalizedQuery = compact(row.query_normalized);
    const graphStageStatus = compact(row.graph_stage_status);
    const traversalPath = Array.isArray(row.traversal_path) ? row.traversal_path.map((value) => compact(value)).filter(Boolean) : [];
    const provenanceSeed = [
      row.query_hash,
      packetKey,
      sourceRef,
      sourceRefKey,
      featureId,
      cacheHitSource,
      graphStageStatus,
      taskId,
      storyId,
      index,
    ].join('|');

    return {
      provenance_id: sha256(provenanceSeed).slice(0, 24),
      query_id: compact(row.query_hash) || null,
      replay_id: compact(row.replay_id ?? replayId) || null,
      task_id: taskIdValue,
      story_id: storyId,
      worker_id: workerIdValue,
      trace_id: compact(row.trace_id ?? row.query_hash) || null,
      packet_key: packetKey || null,
      feature_id: featureId || null,
      feature_label: compact(row.feature_label) || null,
      source_ref: sourceRef || null,
      source_ref_key: sourceRefKey || null,
      qdrant_point_id: qdrantPointId || null,
      qdrant_collection: qdrantCollection || null,
      qdrant_payload_key: packetKey || null,
      graph_hit_count: Number.isFinite(Number(row.graph_hit_count)) ? Number(row.graph_hit_count) : Number(row.graph_stage_status === 'GRAPH_ENABLED' ? 1 : 0),
      graph_rank_contribution: Number.isFinite(Number(row.graph_rank_contribution)) ? Number(row.graph_rank_contribution) : null,
      domain_class: compact(row.domain_class) || null,
      ontology_label: compact(row.ontology_label) || null,
      topology_label: compact(row.topology_label) || null,
      retrieval_strategy: compact(row.retrieval_strategy) || 'qdrant+postgres+redis+neo4j+rrf',
      cache_strategy: cacheHitSource || 'valkey',
      cache_namespace: cacheNamespace || null,
      cache_key: cacheKey || null,
      cache_normalized_query: cacheNormalizedQuery || null,
      graph_stage_status: graphStageStatus || null,
      graph_stage_reason: compact(row.graph_stage_reason) || null,
      retrieval_path: Array.isArray(row.retrieval_path) ? row.retrieval_path.map((value) => compact(value)).filter(Boolean) : traversalPath,
      reranker: compact(row.reranker) || (cacheHitSource ? 'redis-hot-cache' : 'rrf'),
      eval_id: compact(row.query_hash) || null,
      confidence: row.ok === false ? 0.2 : (cacheHitSource ? 0.95 : 0.75),
      cache_hit_source: cacheHitSource || null,
      traversal_path: traversalPath,
      fusion_score: Number.isFinite(Number(row.fusion_score)) ? Number(row.fusion_score) : null,
      total_ms: Number.isFinite(Number(row.latency_ms ?? row.total_ms)) ? Number(row.latency_ms ?? row.total_ms) : null,
      result_count: Number.isFinite(Number(row.result_count)) ? Number(row.result_count) : null,
      verdict: row.ok === false ? 'failed' : (cacheHitSource ? 'pass' : 'pass_with_warnings'),
    };
  });

  const summary = {
    queryCount: nodes.length,
    passRows: nodes.filter((node) => node.verdict === 'pass').length,
    degradedRows: nodes.filter((node) => node.verdict === 'pass_with_warnings').length,
    failedRows: nodes.filter((node) => node.verdict === 'failed').length,
    cacheHitRows: nodes.filter((node) => Boolean(node.cache_hit_source)).length,
    cacheNamespaces: [...new Set(nodes.map((node) => node.cache_namespace).filter(Boolean))].sort(),
    graphEnabledRows: nodes.filter((node) => String(node.graph_stage_status ?? '') === 'GRAPH_ENABLED').length,
    graphDegradedRows: nodes.filter((node) => String(node.graph_stage_status ?? '').startsWith('GRAPH_') && String(node.graph_stage_status ?? '') !== 'GRAPH_ENABLED').length,
    cacheHitSources: [...new Set(nodes.map((node) => node.cache_hit_source).filter(Boolean))].sort(),
    replayRows: replayRows.length,
  };

  const idempotency = {
    seedStrategy: 'sha256(query_hash|packet_key|source_ref|source_ref_key|feature_id|cache_hit_source|graph_stage_status|task_id|story_id|index)',
    sampleHash: nodes.length > 0 ? sha256(JSON.stringify(nodes[0])) : null,
  };

  const report = {
    generatedAt: new Date().toISOString(),
    status: summary.failedRows > 0 ? 'PROOF_WITH_ERRORS' : (summary.graphEnabledRows > 0 || summary.cacheHitRows > 0 ? 'PROOF_WITH_WARNINGS' : 'PROOF_WITH_WARNINGS'),
    taskId,
    storyId,
    replayId,
    workerId,
    source: {
      benchmark: path.relative(REPO_ROOT, BENCHMARK_JSON).replace(/\\/g, '/'),
      replay: path.relative(REPO_ROOT, REPLAY_JSONL).replace(/\\/g, '/'),
    },
    summary,
    idempotency,
    nodes,
    nextSafeAction: summary.cacheHitRows > 0
      ? 'Use the cache-hit namespaces as the proof source, then expand provenance breadth only if new warmed rows are added.'
      : 'Cache-hit proof is still thin; warm the exact benchmark source refs or continue with replay breadth and telemetry depth.',
  };

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, renderMarkdown(report), 'utf8');

  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_JSON)}`);
  console.log(`Wrote ${path.relative(REPO_ROOT, REPORT_MD)}`);
  console.log(JSON.stringify({
    status: report.status,
    queryCount: report.summary.queryCount,
    cacheHitRows: report.summary.cacheHitRows,
    workerId: report.workerId,
  }, null, 2));
}

main().catch((error) => {
  console.error('[materialize-provenance-tree] failed:', error?.stack || error?.message || String(error));
  process.exit(1);
});
