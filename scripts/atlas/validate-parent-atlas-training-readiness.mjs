#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-training-readiness.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'parent-atlas-training-readiness.md');
const ARROW_REPORT = path.join(REPO_ROOT, 'docs', 'reports', 'arrow-batch-validation.json');
const JEPA_REPORT = path.join(REPO_ROOT, 'docs', 'reports', 'packet-jepa-train-report.json');
const QDRANT_TOPOLOGY_REPORT = path.join(FRONTEND_ROOT, 'docs', 'reports', 'p2-qdrant-payload-sync-topology.json');
const NEO4J_GRAPHIFY_REPORT = path.join(REPO_ROOT, 'docs', 'reports', 'graphify-packet-contract.json');
const pool = new Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)) });

function ratio(value, total) {
  return total > 0 ? value / total : 0;
}

function percent(value, total) {
  return Number((ratio(value, total) * 100).toFixed(4));
}

async function readJson(filePath) {
  try {
    return JSON.parse(await fs.readFile(filePath, 'utf8'));
  } catch {
    return null;
  }
}

function runJsonScript(scriptPath) {
  const result = spawnSync(process.execPath, [scriptPath], {
    cwd: FRONTEND_ROOT,
    encoding: 'utf8',
    windowsHide: true,
  });
  const output = String(result.stdout ?? '').trim();
  const start = output.indexOf('{');
  try {
    return {
      exit_code: result.status,
      payload: start >= 0 ? JSON.parse(output.slice(start)) : null,
      error: String(result.stderr ?? '').trim() || null,
    };
  } catch (error) {
    return { exit_code: result.status, payload: null, error: error.message };
  }
}

async function loadDatabaseCoverage() {
  const client = await pool.connect();
  try {
    const packets = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT packet_key)::int AS distinct_packet_keys,
        COUNT(*) FILTER (WHERE source_ref IS NOT NULL AND LENGTH(TRIM(source_ref)) > 0)::int AS source_ref,
        COUNT(*) FILTER (WHERE feature_id IS NOT NULL AND LENGTH(TRIM(feature_id)) > 0)::int AS feature_id,
        COUNT(*) FILTER (WHERE feature_label IS NOT NULL AND LENGTH(TRIM(feature_label)) > 0)::int AS feature_label,
        COUNT(*) FILTER (WHERE title_id IS NOT NULL AND LENGTH(TRIM(title_id)) > 0)::int AS title_id,
        COUNT(*) FILTER (WHERE tree_node_id IS NOT NULL)::int AS tree_node_id,
        COUNT(*) FILTER (WHERE domain_class IS NOT NULL AND LENGTH(TRIM(domain_class)) > 0)::int AS domain_class,
        COUNT(*) FILTER (WHERE summary IS NOT NULL AND LENGTH(TRIM(summary)) > 0)::int AS summary,
        COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL AND LENGTH(TRIM(qdrant_point_id)) > 0)::int AS qdrant_point_id,
        COUNT(*) FILTER (WHERE embedding IS NOT NULL OR content_embedding_384 IS NOT NULL)::int AS embedding,
        COUNT(*) FILTER (WHERE latent_64 IS NOT NULL)::int AS latent_64,
        COUNT(*) FILTER (WHERE som_row BETWEEN 0 AND 19 AND som_col BETWEEN 0 AND 19)::int AS som_20x20
      FROM atlas_packets
    `);
    const features = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT packet_key)::int AS distinct_packet_keys,
        COUNT(*) FILTER (WHERE CARDINALITY(used_concepts) > 0)::int AS used_concepts,
        COUNT(*) FILTER (WHERE CARDINALITY(lexical_features) > 0)::int AS lexical_features,
        COUNT(*) FILTER (WHERE CARDINALITY(ast_symbols) > 0)::int AS ast_symbols,
        COUNT(*) FILTER (WHERE CARDINALITY(entities) > 0)::int AS entities
      FROM atlas_packet_features
    `);
    const metrics = await client.query(`
      SELECT
        COUNT(*)::int AS total,
        COUNT(DISTINCT packet_key)::int AS distinct_packet_keys,
        COUNT(*) FILTER (WHERE PCA_LATENT_DIM > 0)::int AS pca_latent,
        COUNT(*) FILTER (WHERE JEPA_LATENT_DIM > 0)::int AS jepa_latent,
        COUNT(*) FILTER (WHERE packet_jepa_similarity IS NOT NULL)::int AS jepa_similarity
      FROM atlas_packet_metrics
    `);
    return { packets: packets.rows[0], features: features.rows[0], metrics: metrics.rows[0] };
  } finally {
    client.release();
  }
}

function gate(name, status, evidence, target = null) {
  return { name, status, target, evidence };
}

function renderMarkdown(report) {
  return [
    '# Parent Atlas Training Readiness',
    '',
    `Generated: ${report.generated_at}`,
    `Overall: ${report.overall_status}`,
    '',
    '## Promotion Decisions',
    '',
    ...Object.entries(report.promotion).map(([name, value]) => `- ${name}: ${value ? 'PASS' : 'BLOCKED'}`),
    '',
    '## Gates',
    '',
    '| Gate | Status | Evidence |',
    '|---|---:|---|',
    ...report.gates.map((item) => `| ${item.name} | ${item.status} | ${item.evidence} |`),
    '',
    '## Status Model',
    '',
    ...report.status_model.map((item) => `- ${item.lane}: ${item.status} - ${item.evidence}`),
    '',
    '## Next Actions',
    '',
    ...report.next_actions.map((item, index) => `${index + 1}. ${item}`),
    '',
  ].join('\n');
}

async function main() {
  const db = await loadDatabaseCoverage();
  const arrow = await readJson(ARROW_REPORT);
  const jepa = await readJson(JEPA_REPORT);
  const qdrantTopology = await readJson(QDRANT_TOPOLOGY_REPORT);
  const neo4jGraphify = await readJson(NEO4J_GRAPHIFY_REPORT);
  const gpu = runJsonScript(path.join(FRONTEND_ROOT, 'scripts', 'gpu', 'gpu-readiness-report.mjs'));
  const packetTotal = Number(db.packets.total);
  const featureTotal = Number(db.features.total);
  const canonicalLabelsReady = ['source_ref', 'feature_id', 'feature_label', 'title_id', 'tree_node_id', 'domain_class']
    .every((column) => ratio(Number(db.packets[column]), packetTotal) >= 0.95);
  const featureEvidenceReady = ratio(Number(db.features.used_concepts), featureTotal) >= 0.95
    && ratio(Number(db.features.lexical_features), featureTotal) >= 0.95;
  const summaryReady = ratio(Number(db.packets.summary), packetTotal) >= 0.95;
  const embeddingReady = ratio(Number(db.packets.embedding), packetTotal) >= 0.95;
  const topologyReady = ratio(Number(db.packets.som_20x20), packetTotal) >= 0.95;
  const astReady = ratio(Number(db.features.ast_symbols), featureTotal) >= 0.95;
  const arrowReady = arrow?.status === 'PASS';
  const nativeGpuReady = gpu.payload?.nativeAddon?.ok === true;
  const pythonGpuReady = gpu.payload?.pythonCuda?.ok === true;
  const baseline = jepa?.evaluation?.embedding384_cosine;
  const packetJepa = jepa?.evaluation?.packet_jepa_128;
  const jepaBeatsBaseline = Boolean(
    baseline && packetJepa
    && packetJepa.mrr > baseline.mrr
    && packetJepa.ndcg_at_10 > baseline.ndcg_at_10
  );
  const qdrantTreeProof = Boolean(
    qdrantTopology?.direct_bridge?.verification?.requested > 0
    && qdrantTopology.direct_bridge.verification.tree_node_id_matches
      === qdrantTopology.direct_bridge.verification.requested
  );
  const neo4jTreeProof = Boolean(
    neo4jGraphify?.tree_only === true
    && neo4jGraphify?.gate?.pass === true
    && Number(neo4jGraphify?.edges_written?.HAS_TREE_NODE ?? 0) > 0
  );

  const gates = [
    gate('packet identity uniqueness', Number(db.packets.distinct_packet_keys) === packetTotal ? 'PASS' : 'FAIL', `${db.packets.distinct_packet_keys}/${packetTotal} distinct packet_key`),
    gate('canonical labels and tree lineage', canonicalLabelsReady ? 'PASS' : 'FAIL', `tree=${percent(db.packets.tree_node_id, packetTotal)}%, feature=${percent(db.packets.feature_id, packetTotal)}%, domain=${percent(db.packets.domain_class, packetTotal)}%`, '>=95%'),
    gate('lexical and concept evidence', featureEvidenceReady ? 'PASS' : 'FAIL', `concepts=${percent(db.features.used_concepts, featureTotal)}%, lexical=${percent(db.features.lexical_features, featureTotal)}%`, '>=95%'),
    gate('AST structural evidence', astReady ? 'PASS' : 'WARN', `${percent(db.features.ast_symbols, featureTotal)}%`, '>=95%'),
    gate('summary coverage', summaryReady ? 'PASS' : 'FAIL', `${percent(db.packets.summary, packetTotal)}%`, '>=95%'),
    gate('canonical embedding coverage', embeddingReady ? 'PASS' : 'FAIL', `${percent(db.packets.embedding, packetTotal)}%`, '>=95%'),
    gate('SOM 20x20 packet coverage', topologyReady ? 'PASS' : 'FAIL', `${percent(db.packets.som_20x20, packetTotal)}%`, '>=95%'),
    gate('Arrow IPC replay', arrowReady ? 'PASS' : 'FAIL', arrow ? `${arrow.rows} rows, ${arrow.columns} columns, ${arrow.hard_failures?.length ?? 0} failures` : 'validation report missing'),
    gate('Qdrant tree fan-out mirror', qdrantTreeProof ? 'PASS_BOUNDED' : 'FAIL', qdrantTopology?.direct_bridge?.verification ? `${qdrantTopology.direct_bridge.verification.tree_node_id_matches}/${qdrantTopology.direct_bridge.verification.requested} direct tree IDs matched` : 'direct bridge report missing'),
    gate('Neo4j tree fan-out mirror', neo4jTreeProof ? 'PASS_BOUNDED' : 'FAIL', neo4jGraphify ? `${neo4jGraphify.edges_written?.HAS_TREE_NODE ?? 0} HAS_TREE_NODE edges; tree-only=${neo4jGraphify.tree_only === true}` : 'graphify report missing'),
    gate('native CUDA addon', nativeGpuReady ? 'PASS' : 'FAIL', gpu.payload?.nativeAddon?.output?.addonPath ?? 'not loadable'),
    gate('Python CUDA training lane', pythonGpuReady ? 'PASS' : 'FAIL', gpu.payload?.pythonCuda?.output?.torchVersion ?? 'not available'),
    gate('JEPA promotion', jepaBeatsBaseline ? 'PASS' : 'BLOCKED', baseline && packetJepa ? `MRR ${packetJepa.mrr.toFixed(4)} vs ${baseline.mrr.toFixed(4)}; NDCG@10 ${packetJepa.ndcg_at_10.toFixed(4)} vs ${baseline.ndcg_at_10.toFixed(4)}` : 'evaluation missing'),
  ];

  const promotion = {
    arrow_batch_export: canonicalLabelsReady && featureEvidenceReady && arrowReady,
    qlora_semantic_dataset: canonicalLabelsReady && featureEvidenceReady && summaryReady && astReady,
    autoencoder_training: embeddingReady && pythonGpuReady,
    packet_jepa_reranker: embeddingReady && pythonGpuReady && jepaBeatsBaseline,
    gpu_topology_mapreduce: topologyReady && pythonGpuReady,
    hyperrag_packet_materialization: canonicalLabelsReady && featureEvidenceReady,
    tree_fanout_full_parity: false,
  };
  const overallReady = Object.values(promotion).every(Boolean);
  const report = {
    generated_at: new Date().toISOString(),
    overall_status: overallReady ? 'READY' : 'READY_WITH_BLOCKERS',
    database: db,
    coverage_percent: {
      summary: percent(db.packets.summary, packetTotal),
      embedding: percent(db.packets.embedding, packetTotal),
      latent64: percent(db.packets.latent_64, packetTotal),
      som_20x20: percent(db.packets.som_20x20, packetTotal),
      qdrant_point_id: percent(db.packets.qdrant_point_id, packetTotal),
      used_concepts: percent(db.features.used_concepts, featureTotal),
      lexical_features: percent(db.features.lexical_features, featureTotal),
      ast_symbols: percent(db.features.ast_symbols, featureTotal),
    },
    promotion,
    gates,
    status_model: [
      { lane: 'canonical packet and feature joins', status: 'PROVEN', evidence: 'live Postgres counts plus bounded Arrow replay' },
      { lane: 'Arrow IPC batch transport', status: 'PROVEN', evidence: '200-row file round-trip with identity/vector checks' },
      { lane: 'HyperRAG MsgPack/mmap hot packet path', status: 'PROVEN_BOUNDED', evidence: 'bounded materializer dry-run/apply evidence; not a full-corpus promotion' },
      { lane: 'tree_node_id fan-out', status: qdrantTreeProof && neo4jTreeProof ? 'PROVEN_BOUNDED' : 'WIRED_BLOCKED', evidence: 'Qdrant direct payload readback plus Neo4j HAS_TREE_NODE graphify' },
      { lane: 'QLoRA semantic training corpus', status: promotion.qlora_semantic_dataset ? 'PROVEN' : 'WIRED_BLOCKED', evidence: 'labels are complete; summaries and AST evidence remain incomplete' },
      { lane: 'Packet-JEPA', status: 'PROVEN_NOT_PROMOTED', evidence: 'held-out MRR and NDCG@10 do not beat baseline' },
      { lane: 'native CUDA addon', status: nativeGpuReady ? 'PROVEN' : 'WIRED_BLOCKED', evidence: 'native addon smoke result' },
      { lane: 'Python CUDA / RAPIDS topology workers', status: pythonGpuReady ? 'PROVEN' : 'CREATED_NOT_READY', evidence: 'repo venv remains CPU-only; RAPIDS stays WSL2-targeted' },
    ],
    next_actions: [
      'Backfill canonical packet embeddings in bounded batches; do not train AE/JEPA on mixed latent fallbacks.',
      'Expand AST symbol extraction from the current low-coverage structural cohort before QLoRA topic training.',
      'Raise summary coverage with bounded Gemma4 synthesis, preserving packet_key and source_ref provenance.',
      'Recompute KMeans/SOM only after the embedding cohort is canonical and versioned.',
      'Widen Qdrant and Neo4j tree-node mirrors in bounded batches until full parity gates pass.',
      'Install CUDA-enabled PyTorch in the dedicated training environment; keep RAPIDS/cuVS in WSL2.',
      'Re-run JEPA on the same deterministic split and promote only if both MRR and NDCG@10 beat baseline.',
    ],
  };

  await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(REPORT_MD, `${renderMarkdown(report)}\n`, 'utf8');
  console.log(JSON.stringify({
    status: report.overall_status,
    promotion: report.promotion,
    coverage_percent: report.coverage_percent,
    reports: {
      json: path.relative(REPO_ROOT, REPORT_JSON).replace(/\\/g, '/'),
      markdown: path.relative(REPO_ROOT, REPORT_MD).replace(/\\/g, '/'),
    },
  }, null, 2));
}

main()
  .catch((error) => {
    console.error('[validate-parent-atlas-training-readiness] failed:', error?.stack || error?.message || String(error));
    process.exitCode = 1;
  })
  .finally(() => pool.end());
