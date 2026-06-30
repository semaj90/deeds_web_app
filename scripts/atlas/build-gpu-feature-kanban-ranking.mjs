#!/usr/bin/env node
/**
 * Build a GPU-aware 0-100 feature consolidation ranking for Parent Atlas.
 *
 * Postgres remains canonical. This script reads atlas_packets and
 * atlas_summary_layers, derives feature-level readiness, optionally clusters the
 * feature metric vectors through the local CUDA bridge, and writes a Kanban-style
 * report. It does not mutate packet identity or mirror stores.
 *
 * Outputs:
 *   docs/reports/gpu-feature-kanban-ranking.{json,md}
 *   .tmp/gpu-feature-kanban-tasks.jsonl
 */

import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const env = loadRepoEnv(process.env);
const DATABASE_URL = resolveDatabaseUrl(env);

const LIMIT = Number(argValue('--limit') ?? 500);
const APPLY = process.argv.includes('--apply');
const REPORT_JSON = path.join(REPO_ROOT, 'docs/reports/gpu-feature-kanban-ranking.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs/reports/gpu-feature-kanban-ranking.md');
const TASKS_JSONL = path.join(REPO_ROOT, '.tmp/gpu-feature-kanban-tasks.jsonl');

function argValue(name) {
  const arg = process.argv.find((value) => value.startsWith(`${name}=`));
  return arg ? arg.slice(name.length + 1) : null;
}

function clamp(value, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function pct(part, total) {
  const denominator = Number(total) || 0;
  if (!denominator) return 0;
  return Number(part || 0) / denominator;
}

function scoreFromCoverage(feature) {
  const qdrant = pct(feature.qdrant_links, feature.packet_count);
  const summary = pct(feature.summary_rows, feature.packet_count);
  const summaryEmb = pct(feature.summary_embeddings, feature.summary_rows || feature.packet_count);
  const featureLabel = feature.feature_label ? 1 : 0;
  const ontology = pct(feature.ontology_labels, feature.packet_count);
  const topology = pct(feature.topology_labels, feature.packet_count);
  const domain = pct(feature.domain_classes, feature.packet_count);
  const som = pct(feature.som_rows, feature.packet_count);
  const kmeans = pct(feature.kmeans_rows, feature.packet_count);

  const score =
    qdrant * 20 +
    summary * 18 +
    summaryEmb * 14 +
    featureLabel * 10 +
    domain * 8 +
    ontology * 8 +
    topology * 8 +
    som * 7 +
    kmeans * 7;

  return Math.round(clamp(score));
}

function statusFor(score) {
  if (score >= 90) return 'READY';
  if (score >= 70) return 'NEAR_READY';
  if (score >= 45) return 'PARTIAL';
  return 'BLOCKED';
}

function recommendedAction(feature) {
  const missing = [];
  if (pct(feature.summary_rows, feature.packet_count) < 0.9) missing.push('summaries');
  if (pct(feature.summary_embeddings, feature.summary_rows || feature.packet_count) < 0.9) missing.push('EmbeddingGemma vectors');
  if (!feature.feature_label) missing.push('feature_label');
  if (pct(feature.qdrant_links, feature.packet_count) < 0.9) missing.push('Qdrant mirror links');
  if (pct(feature.domain_classes, feature.packet_count) < 0.9) missing.push('domain_class');
  if (pct(feature.ontology_labels, feature.packet_count) < 0.9) missing.push('ontology_label');
  if (pct(feature.topology_labels, feature.packet_count) < 0.9) missing.push('topology_label');
  if (pct(feature.som_rows, feature.packet_count) < 0.9) missing.push('SOM labels');
  if (pct(feature.kmeans_rows, feature.packet_count) < 0.9) missing.push('k-means cluster');

  if (!missing.length) return 'Keep in retrieval proof lane; no immediate backfill needed.';
  return `Backfill ${missing.slice(0, 4).join(', ')}${missing.length > 4 ? '...' : ''}.`;
}

function loadGpuBridge() {
  const candidates = [
    path.join(REPO_ROOT, 'simd-bridge/cpp/build-x64-cuda/Release/tensorrt_bridge.node'),
    path.join(REPO_ROOT, 'simd-bridge/cpp/build/Release/tensorrt_bridge.node'),
    path.join(REPO_ROOT, 'simd-bridge/cpp/build-x64-cuda-cublas/Release/tensorrt_bridge.node'),
  ];

  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue;
    try {
      const addon = require(candidate);
      const cudaAvailable = Number(addon?.checkCudaAvailable?.() ?? 0) === 1;
      return {
        addon,
        path: candidate,
        cudaAvailable,
        exports: Object.keys(addon || {}).filter((key) => typeof addon[key] === 'function').sort(),
      };
    } catch {
      // try next candidate
    }
  }
  return { addon: null, path: null, cudaAvailable: false, exports: [] };
}

function clusterFeaturesWithGpu(gpu, features) {
  const dim = 8;
  const rows = features.map((feature) => [
    pct(feature.qdrant_links, feature.packet_count),
    pct(feature.summary_rows, feature.packet_count),
    pct(feature.summary_embeddings, feature.summary_rows || feature.packet_count),
    feature.feature_label ? 1 : 0,
    pct(feature.domain_classes, feature.packet_count),
    pct(feature.ontology_labels, feature.packet_count),
    pct(feature.topology_labels, feature.packet_count),
    Math.max(pct(feature.som_rows, feature.packet_count), pct(feature.kmeans_rows, feature.packet_count)),
  ]);

  if (!rows.length) return { backend: 'none', clusters: [] };
  const k = Math.max(1, Math.min(12, Math.ceil(Math.sqrt(rows.length))));

  if (gpu.addon?.kmeansWithCentroids && gpu.cudaAvailable) {
    try {
      const flat = new Float32Array(rows.length * dim);
      for (let i = 0; i < rows.length; i += 1) {
        flat.set(rows[i], i * dim);
      }
      const result = gpu.addon.kmeansWithCentroids(flat, rows.length, dim, k, 30);
      const assignments = Array.from(result?.assignments ?? []);
      if (assignments.length === rows.length) return { backend: 'cuda-kmeans', clusters: assignments };
    } catch (error) {
      return { backend: `cpu-fallback:${error.message}`, clusters: cpuCluster(rows, k) };
    }
  }

  return { backend: 'cpu', clusters: cpuCluster(rows, k) };
}

function cpuCluster(rows, k) {
  return rows.map((row) => {
    const readiness = row.reduce((sum, value) => sum + value, 0) / row.length;
    return Math.min(k - 1, Math.floor(readiness * k));
  });
}

async function loadFeatures(pool) {
  const { rows } = await pool.query(
    `
      WITH packet_features AS (
        SELECT
          coalesce(nullif(feature_id, ''), 'feature.unlabeled') AS feature_id,
          max(nullif(feature_label, '')) AS feature_label,
          count(*)::int AS packet_count,
          count(*) FILTER (WHERE source_ref IS NOT NULL AND source_ref <> '')::int AS source_refs,
          count(*) FILTER (WHERE source_ref_key IS NOT NULL AND source_ref_key <> '')::int AS source_ref_keys,
          count(*) FILTER (WHERE qdrant_point_id IS NOT NULL AND qdrant_point_id <> '')::int AS qdrant_links,
          count(*) FILTER (WHERE domain_class IS NOT NULL AND domain_class <> '')::int AS domain_classes,
          count(*) FILTER (
            WHERE coalesce(
              nullif(metadata->'feature_envelope'->>'ontology_label', ''),
              nullif(metadata->>'ontology_label', ''),
              feature_label
            ) IS NOT NULL
          )::int AS ontology_labels,
          count(*) FILTER (
            WHERE coalesce(
              nullif(metadata->'feature_envelope'->>'topology_label', ''),
              nullif(metadata->>'topology_label', ''),
              'unknown'
            ) <> 'unknown'
          )::int AS topology_labels,
          count(*) FILTER (WHERE som_cluster IS NOT NULL OR som_index IS NOT NULL)::int AS som_rows,
          count(*) FILTER (WHERE kmeans_cluster IS NOT NULL)::int AS kmeans_rows,
          min(coalesce(source_ref, source_ref_key, file_path, payload->>'canonical_source_ref', metadata->>'canonical_source_ref')) AS canonical_source_ref_sample,
          max(updated_at) AS last_packet_update
        FROM atlas_packets
        GROUP BY coalesce(nullif(feature_id, ''), 'feature.unlabeled')
      ),
      summary_features AS (
        SELECT
          coalesce(nullif(feature_id, ''), 'feature.unlabeled') AS feature_id,
          count(*)::int AS summary_rows,
          count(*) FILTER (WHERE embedding IS NOT NULL)::int AS summary_embeddings,
          count(*) FILTER (WHERE keywords IS NOT NULL AND cardinality(keywords) > 0)::int AS keyword_rows,
          count(*) FILTER (WHERE entities IS NOT NULL AND cardinality(entities) > 0)::int AS entity_rows
        FROM atlas_summary_layers
        GROUP BY coalesce(nullif(feature_id, ''), 'feature.unlabeled')
      )
      SELECT
        p.*,
        coalesce(s.summary_rows, 0)::int AS summary_rows,
        coalesce(s.summary_embeddings, 0)::int AS summary_embeddings,
        coalesce(s.keyword_rows, 0)::int AS keyword_rows,
        coalesce(s.entity_rows, 0)::int AS entity_rows
      FROM packet_features p
      LEFT JOIN summary_features s ON s.feature_id = p.feature_id
      ORDER BY p.packet_count DESC, p.feature_id
      LIMIT $1
    `,
    [LIMIT],
  );
  return rows.map((row) => ({
    ...row,
    packet_count: Number(row.packet_count),
    source_refs: Number(row.source_refs),
    source_ref_keys: Number(row.source_ref_keys),
    qdrant_links: Number(row.qdrant_links),
    domain_classes: Number(row.domain_classes),
    ontology_labels: Number(row.ontology_labels),
    topology_labels: Number(row.topology_labels),
    som_rows: Number(row.som_rows),
    kmeans_rows: Number(row.kmeans_rows),
    summary_rows: Number(row.summary_rows),
    summary_embeddings: Number(row.summary_embeddings),
    keyword_rows: Number(row.keyword_rows),
    entity_rows: Number(row.entity_rows),
  }));
}

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 2 });
  try {
    const features = await loadFeatures(pool);
    const gpu = loadGpuBridge();
    const cluster = clusterFeaturesWithGpu(gpu, features);
    const ranked = features.map((feature, index) => {
      const completion = scoreFromCoverage(feature);
      return {
        rank: 0,
        feature_id: feature.feature_id,
        feature_label: feature.feature_label,
        canonical_source_ref_sample: feature.canonical_source_ref_sample,
        completion_pct: completion,
        status: statusFor(completion),
        gpu_cluster: cluster.clusters[index] ?? null,
        packet_count: feature.packet_count,
        summary_rows: feature.summary_rows,
        summary_embeddings: feature.summary_embeddings,
        qdrant_links: feature.qdrant_links,
        source_refs: feature.source_refs,
        source_ref_keys: feature.source_ref_keys,
        domain_classes: feature.domain_classes,
        ontology_labels: feature.ontology_labels,
        topology_labels: feature.topology_labels,
        som_rows: feature.som_rows,
        kmeans_rows: feature.kmeans_rows,
        keyword_rows: feature.keyword_rows,
        entity_rows: feature.entity_rows,
        recommended_action: recommendedAction(feature),
      };
    }).sort((left, right) => {
      if (left.completion_pct !== right.completion_pct) return left.completion_pct - right.completion_pct;
      return right.packet_count - left.packet_count;
    }).map((feature, index) => ({ ...feature, rank: index + 1 }));

    const totals = ranked.reduce((acc, feature) => {
      acc.packet_count += feature.packet_count;
      acc.summary_rows += feature.summary_rows;
      acc.summary_embeddings += feature.summary_embeddings;
      acc.qdrant_links += feature.qdrant_links;
      return acc;
    }, { packet_count: 0, summary_rows: 0, summary_embeddings: 0, qdrant_links: 0 });

    const report = {
      generated_at: new Date().toISOString(),
      mode: APPLY ? 'apply' : 'dry-run',
      source_of_truth: 'postgres.atlas_packets',
      mirror_policy: {
        qdrant: 'dense vector mirror',
        weaviate: 'benchmark candidate only; not canonical',
        cuvs: 'GPU ANN/clustering accelerator only; not canonical',
      },
      gpu: {
        bridge_path: gpu.path,
        cuda_available: gpu.cudaAvailable,
        kmeans_backend: cluster.backend,
        relevant_exports: gpu.exports.filter((name) => /kmeans|som|cosine|topk|page|rank|pca|autoencoder|json/i.test(name)),
      },
      totals,
      feature_count: ranked.length,
      status_counts: ranked.reduce((acc, feature) => {
        acc[feature.status] = (acc[feature.status] ?? 0) + 1;
        return acc;
      }, {}),
      features: ranked,
    };

    fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
    fs.mkdirSync(path.dirname(TASKS_JSONL), { recursive: true });
    fs.writeFileSync(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    fs.writeFileSync(REPORT_MD, renderMarkdown(report), 'utf8');
    fs.writeFileSync(TASKS_JSONL, ranked.slice(0, 50).map((feature) => JSON.stringify({
      task_id: `gpu-feature-rank-${String(feature.rank).padStart(3, '0')}`,
      title: `[${feature.status}] ${feature.feature_id}`,
      completion_pct: feature.completion_pct,
      feature_id: feature.feature_id,
      source_ref: feature.canonical_source_ref_sample,
      recommended_action: feature.recommended_action,
      evidence: ['docs/reports/gpu-feature-kanban-ranking.json'],
      accelerator: cluster.backend,
      canonical_truth: 'Postgres atlas_packets',
    })).join('\n') + '\n', 'utf8');

    console.log(JSON.stringify({
      status: 'PASS',
      mode: report.mode,
      feature_count: report.feature_count,
      status_counts: report.status_counts,
      gpu: report.gpu,
      outputs: {
        json: REPORT_JSON,
        markdown: REPORT_MD,
        kanban_tasks: TASKS_JSONL,
      },
    }, null, 2));
  } finally {
    await pool.end();
  }
}

function renderMarkdown(report) {
  const lines = [
    '# GPU Feature Kanban Ranking',
    '',
    `- generated_at: ${report.generated_at}`,
    `- source_of_truth: ${report.source_of_truth}`,
    `- feature_count: ${report.feature_count}`,
    `- qdrant_policy: ${report.mirror_policy.qdrant}`,
    `- weaviate_policy: ${report.mirror_policy.weaviate}`,
    `- cuvs_policy: ${report.mirror_policy.cuvs}`,
    `- gpu_bridge: ${report.gpu.bridge_path ?? 'not loaded'}`,
    `- cuda_available: ${report.gpu.cuda_available}`,
    `- kmeans_backend: ${report.gpu.kmeans_backend}`,
    '',
    '## Status Counts',
    '',
    ...Object.entries(report.status_counts).map(([status, count]) => `- ${status}: ${count}`),
    '',
    '## Lowest-Readiness Features',
    '',
    '| Rank | Feature | Completion | Packets | Summaries | Qdrant links | GPU cluster | Next action |',
    '|---:|---|---:|---:|---:|---:|---:|---|',
    ...report.features.slice(0, 40).map((feature) => (
      `| ${feature.rank} | \`${feature.feature_id}\` | ${feature.completion_pct}% | ${feature.packet_count} | ${feature.summary_rows} | ${feature.qdrant_links} | ${feature.gpu_cluster ?? ''} | ${feature.recommended_action} |`
    )),
    '',
    '## Boundary',
    '',
    '- `canonical_source_ref` is derived from `source_ref`, `source_ref_key`, `file_path`, or JSONB metadata/payload when no scalar column exists.',
    '- Qdrant and Weaviate are vector mirrors/benchmarks, not truth stores.',
    '- cuVS/CAGRA/Vamana can accelerate ANN index construction and clustering, but ranked packet identity still comes from Postgres.',
    '',
  ];
  return `${lines.join('\n')}\n`;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
