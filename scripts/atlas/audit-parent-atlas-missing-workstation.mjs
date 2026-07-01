#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Pool } from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-missing-workstation-audit.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-missing-workstation-audit.md');

function pct(part, total) {
  const p = Number(part ?? 0);
  const t = Number(total ?? 0);
  if (!Number.isFinite(p) || !Number.isFinite(t) || t <= 0) return 0;
  return Number(((p / t) * 100).toFixed(2));
}

async function readJson(relativePath) {
  try {
    return JSON.parse(await fs.readFile(path.join(REPO_ROOT, relativePath), 'utf8'));
  } catch {
    return null;
  }
}

function statusFromPct(value, passAt = 95, warnAt = 50) {
  if (value >= passAt) return 'PASS';
  if (value >= warnAt) return 'WARN';
  return 'FAIL';
}

async function main() {
  const env = loadRepoEnv(process.env);
  const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });
  let counts;
  try {
    const result = await pool.query(`
      select
        (select count(*)::int from atlas_packets) as atlas_packets,
        (select count(*)::int from atlas_packets where nullif(feature_id,'') is not null) as packets_feature_id,
        (select count(*)::int from atlas_packets where nullif(source_ref,'') is not null) as packets_source_ref,
        (select count(*)::int from atlas_packets where nullif(qdrant_point_id,'') is not null) as packets_qdrant_point_id,
        (select count(*)::int from atlas_summary_layers) as summary_rows,
        (select count(distinct packet_key)::int from atlas_summary_layers where length(trim(coalesce(summary, summary_text, ''))) > 0) as summarized_packets,
        (select count(*)::int from atlas_summary_layers where embedding is not null) as summary_embeddings,
        (select count(*)::int from atlas_feature_envelopes) as feature_envelopes,
        (select count(*)::int from packet_features) as packet_features
    `);
    counts = result.rows[0];
  } finally {
    await pool.end();
  }

  const qdrant = await readJson('docs/reports/verify-qdrant-packet-payload.json');
  const graphDensity = await readJson('docs/reports/graph-density-check.json');
  const conceptReachability = await readJson('docs/reports/concept-reachability-check.json');
  const bitfrost = await readJson('docs/reports/bitfrost-semantic-cache-audit.json');
  const hyperrag = await readJson('docs/reports/hyperrag-runtime-proof.json');
  const onnx = await readJson('docs/reports/onnx-embedding-server-audit.json');
  const summaryStorage = await readJson('docs/reports/summary-storage-proof-validation.json');

  const summaryCoverage = pct(counts.summarized_packets, counts.atlas_packets);
  const summaryEmbeddingCoverage = pct(counts.summary_embeddings, counts.atlas_packets);
  const qdrantPointCoverage = pct(counts.packets_qdrant_point_id, counts.atlas_packets);
  const featureEnvelopeCoverage = pct(counts.feature_envelopes, counts.atlas_packets);
  const packetFeatureCoverage = pct(counts.packet_features, counts.atlas_packets);

  const lanes = [
    {
      lane: 'identity_spine',
      status: counts.packets_feature_id === counts.atlas_packets && counts.packets_source_ref === counts.atlas_packets ? 'PASS' : 'FAIL',
      completion_pct: Math.min(pct(counts.packets_feature_id, counts.atlas_packets), pct(counts.packets_source_ref, counts.atlas_packets)),
      evidence: 'atlas_packets feature_id/source_ref counts',
      missing: 'none if 100%',
      next_action: 'Keep packet_key/source_ref/feature_id immutable.',
    },
    {
      lane: 'summary_coverage',
      status: statusFromPct(summaryCoverage),
      completion_pct: summaryCoverage,
      evidence: 'atlas_summary_layers distinct packet_key rows with non-empty summary',
      missing: `${counts.atlas_packets - counts.summarized_packets} packets still need clean summaries`,
      next_action: 'Import completed Colab Gemma4 summary shards, then rerun this audit.',
    },
    {
      lane: 'summary_embedding_coverage',
      status: statusFromPct(summaryEmbeddingCoverage),
      completion_pct: summaryEmbeddingCoverage,
      evidence: 'atlas_summary_layers.embedding count',
      missing: `${counts.atlas_packets - counts.summary_embeddings} packet-level summary embeddings still missing`,
      next_action: 'Run EmbeddingGemma batch worker against ONNX /v1/embeddings after summary import.',
    },
    {
      lane: 'feature_envelope_storage',
      status: featureEnvelopeCoverage >= 95 && packetFeatureCoverage >= 95 ? 'PASS' : 'FAIL',
      completion_pct: Math.min(featureEnvelopeCoverage, packetFeatureCoverage),
      evidence: 'atlas_feature_envelopes and packet_features row counts',
      missing: 'feature envelopes may need refresh after new summaries, even though row coverage is high',
      next_action: 'Re-materialize feature envelopes from newly imported summaries.',
    },
    {
      lane: 'qdrant_payload_mirror',
      status: qdrant?.pass ? 'PASS' : 'FAIL',
      completion_pct: qdrant?.coverage?.packet_key_pct ?? 0,
      evidence: 'docs/reports/verify-qdrant-packet-payload.json',
      missing: 'Qdrant payload sample currently lacks packet_key/feature_id/canonicalSourceRef/file_path',
      next_action: 'Run qdrant payload sync/tag mirror after embeddings and packet-qdrant link repair.',
    },
    {
      lane: 'packet_qdrant_linkage',
      status: statusFromPct(qdrantPointCoverage),
      completion_pct: qdrantPointCoverage,
      evidence: 'atlas_packets.qdrant_point_id coverage',
      missing: `${counts.atlas_packets - counts.packets_qdrant_point_id} atlas_packets rows lack qdrant_point_id`,
      next_action: 'Run packet-qdrant link backfill against restored Qdrant points.',
    },
    {
      lane: 'redis_bitfrost_hot_cache',
      status: bitfrost?.status === 'PASS' && Number(bitfrost?.summary?.bifrostKeys ?? 0) > 0 ? 'WARN' : 'FAIL',
      completion_pct: Number(bitfrost?.summary?.bifrostKeys ?? 0) > 0 ? 35 : 0,
      evidence: 'docs/reports/bitfrost-semantic-cache-audit.json',
      missing: 'semantic bifrost:* families are not warmed from canonical rows',
      next_action: 'Run warm-bitfrost-semantic-cache.mjs --apply after summary and payload mirror.',
    },
    {
      lane: 'neo4j_feature_concept_reachability',
      status: conceptReachability?.status ?? 'FAIL',
      completion_pct: Number(conceptReachability?.counts?.packet_feature_edges ?? 0) > 0 ? 80 : 10,
      evidence: 'docs/reports/concept-reachability-check.json',
      missing: 'Neo4j has Packet nodes but no Feature/Concept reachability edges in current proof',
      next_action: 'Project feature envelopes to Neo4j, then rerun concept reachability check.',
    },
    {
      lane: 'neo4j_graph_density',
      status: graphDensity?.status ?? 'FAIL',
      completion_pct: graphDensity?.status === 'PASS' ? 90 : 0,
      evidence: 'docs/reports/graph-density-check.json',
      missing: 'feature/concept edge semantics still missing even though Packet graph density exists',
      next_action: 'Keep density check as read-only GDS proof gate.',
    },
    {
      lane: 'hyperrag_runtime_proof',
      status: hyperrag?.pass ? 'PASS' : 'FAIL',
      completion_pct: hyperrag?.pass ? 95 : 30,
      evidence: 'docs/reports/hyperrag-runtime-proof.json',
      missing: hyperrag?.fail_reasons ?? ['runtime proof did not pass'],
      next_action: 'Rerun after Qdrant payload mirror and summary embeddings are refreshed.',
    },
    {
      lane: 'onnx_embedding_server',
      status: onnx?.status ?? 'FAIL',
      completion_pct: onnx?.status === 'PASS' ? 80 : 0,
      evidence: 'docs/reports/onnx-embedding-server-audit.json',
      missing: onnx?.health?.providers_active?.includes('CPUExecutionProvider') ? 'GPU provider not active; current path is CPU ONNX batching' : 'unknown',
      next_action: 'Use current ONNX batching now; install DirectML/CUDA provider later if needed.',
    },
    {
      lane: 'summary_storage_contract',
      status: summaryStorage?.status ?? 'FAIL',
      completion_pct: summaryStorage?.status === 'PASS' ? 90 : 0,
      evidence: 'docs/reports/summary-storage-proof-validation.json',
      missing: 'storage contract passes, but coverage is not complete',
      next_action: 'Do not reopen schema; widen data coverage.',
    },
  ];

  const blockers = lanes.filter((lane) => lane.status === 'FAIL');
  const warnings = lanes.filter((lane) => lane.status === 'WARN');
  const overall = Math.round(lanes.reduce((sum, lane) => sum + lane.completion_pct, 0) / lanes.length);
  const report = {
    generated_at: new Date().toISOString(),
    overall_completion_pct: overall,
    counts,
    lanes,
    blockers: blockers.map((lane) => lane.lane),
    warnings: warnings.map((lane) => lane.lane),
    next_patch: blockers[0]?.next_action ?? warnings[0]?.next_action ?? 'All audited lanes pass.',
  };

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(
    REPORT_MD,
    [
      '# Parent Atlas Missing Workstation Audit',
      '',
      `Generated: ${report.generated_at}`,
      `Overall completion: ${report.overall_completion_pct}%`,
      '',
      '## Lanes',
      '',
      '| Lane | Status | Completion | Missing | Next action |',
      '|---|---:|---:|---|---|',
      ...lanes.map((lane) => `| ${lane.lane} | ${lane.status} | ${lane.completion_pct}% | ${Array.isArray(lane.missing) ? lane.missing.join('; ') : lane.missing} | ${lane.next_action} |`),
      '',
      '## Current Counts',
      '',
      '```json',
      JSON.stringify(counts, null, 2),
      '```',
      '',
      '## Next Patch',
      '',
      report.next_patch,
    ].join('\n'),
    'utf8',
  );
  console.log(JSON.stringify(report, null, 2));
  if (blockers.length) process.exitCode = 1;
}

main();
