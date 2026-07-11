#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');

const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'progressive-semantic-compiler.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'progressive-semantic-compiler.md');
const QDRANT_TOPOLOGY_REPORT = path.join(FRONTEND_ROOT, 'docs', 'reports', 'p2-qdrant-payload-sync-topology.json');
const NEO4J_GRAPHIFY_REPORT = path.join(REPO_ROOT, 'docs', 'reports', 'graphify-packet-contract.json');

const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

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

async function getColumns(client, tableName) {
  const { rows } = await client.query(
    `
      SELECT column_name
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = $1
    `,
    [tableName],
  );
  return new Set(rows.map((row) => row.column_name));
}

function hasTextExpr(columnName) {
  return `NULLIF(BTRIM(${columnName}::text), '') IS NOT NULL`;
}

function hasArrayExpr(columnName) {
  return `COALESCE(CARDINALITY(${columnName}), 0) > 0`;
}

function hasValueExpr(columnName) {
  return `${columnName} IS NOT NULL`;
}

function gate(name, status, evidence, target = null) {
  return { name, status, target, evidence };
}

function renderMarkdown(report) {
  return [
    '# Progressive Semantic Compiler Validation',
    '',
    `Generated: ${report.generated_at}`,
    `Overall: ${report.overall_status}`,
    '',
    '## Gate Summary',
    '',
    '| Gate | Status | Evidence |',
    '|---|---:|---|',
    ...report.gates.map((item) => `| ${item.name} | ${item.status} | ${item.evidence} |`),
    '',
    '## Coverage',
    '',
    ...Object.entries(report.coverage_percent).map(([key, value]) => `- ${key}: ${value}%`),
    '',
    '## Fan-Out Proof',
    '',
    ...Object.entries(report.tree_fanout).map(([key, value]) => `- ${key}: ${value ? 'PASS' : 'BLOCKED'}`),
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

async function countCoverage(client, tableName, fields) {
  const columns = await getColumns(client, tableName);
  const selectParts = [
    'COUNT(*)::int AS total',
    columns.has('packet_key')
      ? 'COUNT(DISTINCT packet_key)::int AS distinct_packet_keys'
      : '0::int AS distinct_packet_keys',
  ];

  for (const field of fields) {
    const columnName = field.candidates.find((candidate) => columns.has(candidate));
    if (!columnName) {
      selectParts.push(`0::int AS ${field.key}`);
      continue;
    }

    const expr = field.kind === 'array'
      ? hasArrayExpr(columnName)
      : field.kind === 'value'
        ? hasValueExpr(columnName)
        : hasTextExpr(columnName);

    selectParts.push(`COUNT(*) FILTER (WHERE ${expr})::int AS ${field.key}`);
  }

  const { rows } = await client.query(`SELECT ${selectParts.join(', ')} FROM ${tableName}`);
  return { columns: [...columns], row: rows[0] };
}

async function main() {
  const client = await pool.connect();
  try {
    const packets = await countCoverage(client, 'atlas_packets', [
      { key: 'source_ref', kind: 'text', candidates: ['source_ref', 'sourceRef'] },
      { key: 'feature_id', kind: 'text', candidates: ['feature_id', 'featureId'] },
      { key: 'title_id', kind: 'text', candidates: ['title_id', 'titleId'] },
      { key: 'tree_node_id', kind: 'text', candidates: ['tree_node_id', 'treeNodeId'] },
      { key: 'domain_class', kind: 'text', candidates: ['domain_class', 'domainClass'] },
      { key: 'summary', kind: 'text', candidates: ['summary'] },
      { key: 'qdrant_point_id', kind: 'text', candidates: ['qdrant_point_id', 'qdrantPointId'] },
      { key: 'embedding', kind: 'value', candidates: ['embedding', 'content_embedding_384'] },
      { key: 'latent_64', kind: 'value', candidates: ['latent_64', 'latent64'] },
      { key: 'som_20x20', kind: 'value', candidates: ['som_row', 'som_col'] },
    ]);

    const features = await countCoverage(client, 'atlas_packet_features', [
      { key: 'used_concepts', kind: 'array', candidates: ['used_concepts', 'concept_ids'] },
      { key: 'lexical_features', kind: 'array', candidates: ['lexical_features'] },
      { key: 'ast_symbols', kind: 'array', candidates: ['ast_symbols'] },
      { key: 'entities', kind: 'array', candidates: ['entities'] },
    ]);

    const metrics = await countCoverage(client, 'atlas_packet_metrics', [
      { key: 'feature_density', kind: 'value', candidates: ['feature_density'] },
      { key: 'complexity_score', kind: 'value', candidates: ['complexity_score'] },
      { key: 'semantic_entropy', kind: 'value', candidates: ['semantic_entropy'] },
      { key: 'retrieval_relevance', kind: 'value', candidates: ['retrieval_relevance'] },
      { key: 'authority_score', kind: 'value', candidates: ['authority_score', 'page_rank_score'] },
      { key: 'som_20x20', kind: 'value', candidates: ['som_row', 'som_col'] },
      { key: 'kmeans_cluster', kind: 'value', candidates: ['kmeans_cluster'] },
    ]);

    const qdrantTopology = await readJson(QDRANT_TOPOLOGY_REPORT);
    const neo4jGraphify = await readJson(NEO4J_GRAPHIFY_REPORT);

    const packetTotal = Number(packets.row.total ?? 0);
    const featureTotal = Number(features.row.total ?? 0);
    const metricsTotal = Number(metrics.row.total ?? 0);

    const canonicalReady =
      ratio(Number(packets.row.source_ref ?? 0), packetTotal) >= 0.95 &&
      ratio(Number(packets.row.feature_id ?? 0), packetTotal) >= 0.95 &&
      ratio(Number(packets.row.title_id ?? 0), packetTotal) >= 0.95 &&
      ratio(Number(packets.row.tree_node_id ?? 0), packetTotal) >= 0.95 &&
      ratio(Number(packets.row.domain_class ?? 0), packetTotal) >= 0.95;

    const featureReady =
      ratio(Number(features.row.used_concepts ?? 0), featureTotal) >= 0.95 &&
      ratio(Number(features.row.lexical_features ?? 0), featureTotal) >= 0.95 &&
      ratio(Number(features.row.ast_symbols ?? 0), featureTotal) >= 0.95;

    const metricsReady =
      ratio(Number(metrics.row.feature_density ?? 0), metricsTotal) >= 0.95 &&
      ratio(Number(metrics.row.complexity_score ?? 0), metricsTotal) >= 0.95 &&
      ratio(Number(metrics.row.semantic_entropy ?? 0), metricsTotal) >= 0.95 &&
      ratio(Number(metrics.row.retrieval_relevance ?? 0), metricsTotal) >= 0.95 &&
      ratio(Number(metrics.row.authority_score ?? 0), metricsTotal) >= 0.95 &&
      ratio(Number(metrics.row.som_20x20 ?? 0), metricsTotal) >= 0.95 &&
      ratio(Number(metrics.row.kmeans_cluster ?? 0), metricsTotal) >= 0.95;

    const summaryReady = ratio(Number(packets.row.summary ?? 0), packetTotal) >= 0.95;
    const embeddingReady = ratio(Number(packets.row.embedding ?? 0), packetTotal) >= 0.95;
    const latentReady = ratio(Number(packets.row.latent_64 ?? 0), packetTotal) >= 0.95;
    const topologyReady = ratio(Number(packets.row.som_20x20 ?? 0), packetTotal) >= 0.95;
    const qdrantReady = ratio(Number(packets.row.qdrant_point_id ?? 0), packetTotal) >= 0.95;

    const qdrantTreeProof = Boolean(
      qdrantTopology?.direct_bridge?.verification?.requested > 0 &&
      qdrantTopology.direct_bridge.verification.tree_node_id_matches === qdrantTopology.direct_bridge.verification.requested,
    );
    const neo4jTreeProof = Boolean(
      neo4jGraphify?.tree_only === true &&
      neo4jGraphify?.gate?.pass === true &&
      Number(neo4jGraphify?.edges_written?.HAS_TREE_NODE ?? 0) > 0,
    );
    const treeFanoutReady = qdrantTreeProof && neo4jTreeProof;

    const gates = [
      gate('packet identity spine', canonicalReady ? 'PASS' : 'FAIL', `${percent(packets.row.source_ref, packetTotal)}% source_ref, ${percent(packets.row.tree_node_id, packetTotal)}% tree_node_id`, '>=95%'),
      gate('feature envelope coverage', featureReady ? 'PASS' : 'FAIL', `used_concepts=${percent(features.row.used_concepts, featureTotal)}%, lexical=${percent(features.row.lexical_features, featureTotal)}%, ast=${percent(features.row.ast_symbols, featureTotal)}%`, '>=95%'),
      gate('metric lane coverage', metricsReady ? 'PASS' : 'FAIL', `density=${percent(metrics.row.feature_density, metricsTotal)}%, complexity=${percent(metrics.row.complexity_score, metricsTotal)}%, semantic_entropy=${percent(metrics.row.semantic_entropy, metricsTotal)}%`, '>=95%'),
      gate('summary coverage', summaryReady ? 'PASS' : 'FAIL', `${percent(packets.row.summary, packetTotal)}%`, '>=95%'),
      gate('canonical embedding coverage', embeddingReady ? 'PASS' : 'FAIL', `${percent(packets.row.embedding, packetTotal)}%`, '>=95%'),
      gate('latent_64 coverage', latentReady ? 'PASS' : 'FAIL', `${percent(packets.row.latent_64, packetTotal)}%`, '>=95%'),
      gate('SOM 20x20 packet coverage', topologyReady ? 'PASS' : 'FAIL', `${percent(packets.row.som_20x20, packetTotal)}%`, '>=95%'),
      gate('qdrant_point_id bridge', qdrantReady ? 'PASS' : 'FAIL', `${percent(packets.row.qdrant_point_id, packetTotal)}%`, '>=95%'),
      gate('Qdrant tree fan-out mirror', qdrantTreeProof ? 'PASS_BOUNDED' : 'FAIL', qdrantTopology?.direct_bridge?.verification ? `${qdrantTopology.direct_bridge.verification.tree_node_id_matches}/${qdrantTopology.direct_bridge.verification.requested} direct tree IDs matched` : 'direct bridge report missing'),
      gate('Neo4j tree fan-out mirror', neo4jTreeProof ? 'PASS_BOUNDED' : 'FAIL', neo4jGraphify ? `${neo4jGraphify.edges_written?.HAS_TREE_NODE ?? 0} HAS_TREE_NODE edges; tree-only=${neo4jGraphify.tree_only === true}` : 'graphify report missing'),
    ];

    const overallReady = gates.every((item) => String(item.status).startsWith('PASS'));

    const report = {
      generated_at: new Date().toISOString(),
      overall_status: overallReady ? 'READY' : 'READY_WITH_BLOCKERS',
      coverage_percent: {
        source_ref: percent(packets.row.source_ref, packetTotal),
        feature_id: percent(packets.row.feature_id, packetTotal),
        title_id: percent(packets.row.title_id, packetTotal),
        tree_node_id: percent(packets.row.tree_node_id, packetTotal),
        domain_class: percent(packets.row.domain_class, packetTotal),
        summary: percent(packets.row.summary, packetTotal),
        embedding: percent(packets.row.embedding, packetTotal),
        latent_64: percent(packets.row.latent_64, packetTotal),
        som_20x20: percent(packets.row.som_20x20, packetTotal),
        qdrant_point_id: percent(packets.row.qdrant_point_id, packetTotal),
        used_concepts: percent(features.row.used_concepts, featureTotal),
        lexical_features: percent(features.row.lexical_features, featureTotal),
        ast_symbols: percent(features.row.ast_symbols, featureTotal),
        metric_feature_density: percent(metrics.row.feature_density, metricsTotal),
        metric_complexity_score: percent(metrics.row.complexity_score, metricsTotal),
        metric_semantic_entropy: percent(metrics.row.semantic_entropy, metricsTotal),
        metric_retrieval_relevance: percent(metrics.row.retrieval_relevance, metricsTotal),
        metric_authority_score: percent(metrics.row.authority_score, metricsTotal),
        metric_kmeans_cluster: percent(metrics.row.kmeans_cluster, metricsTotal),
      },
      tree_fanout: {
        qdrant_tree_mirror: qdrantTreeProof,
        neo4j_tree_mirror: neo4jTreeProof,
        tree_node_id_is_fanout_join: true,
      },
      gates,
      status_model: [
        { lane: 'identity spine', status: canonicalReady ? 'PROVEN' : 'WIRED_BLOCKED', evidence: 'packet_key + source_ref + title_id + tree_node_id' },
        { lane: 'feature compiler', status: featureReady ? 'PROVEN' : 'WIRED_BLOCKED', evidence: 'used_concepts + lexical_features + ast_symbols' },
        { lane: 'metrics compiler', status: metricsReady ? 'PROVEN' : 'WIRED_BLOCKED', evidence: 'feature_density + complexity + semantic_entropy + authority' },
        { lane: 'topology ladder', status: topologyReady ? 'PROVEN' : 'WIRED_BLOCKED', evidence: 'latent_64 + SOM 20x20' },
        { lane: 'tree fan-out', status: treeFanoutReady ? 'PROVEN_BOUNDED' : 'WIRED_BLOCKED', evidence: 'Qdrant tree payload mirror + Neo4j tree graph mirror' },
        { lane: 'retrieval readiness', status: qdrantReady && summaryReady && embeddingReady ? 'PROVEN_PARTIAL' : 'WIRED_BLOCKED', evidence: 'Qdrant ids, summaries, embeddings' },
      ],
      next_actions: [
        'Expand AST symbol extraction before promotion of semantic clustering lanes.',
        'Raise summary and canonical embedding coverage before training any downstream reranker.',
        'Widen the qdrant_point_id bridge in bounded batches, then re-run tree fan-out mirroring.',
        'Keep tree_node_id as the packet-level fan-out join for Neo4j GDS, Qdrant payload filtering, and reranking.',
        'Recompute KMeans/SOM only after the canonical embedding cohort is stable and versioned.',
      ],
    };

    await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
    await fs.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fs.writeFile(REPORT_MD, `${renderMarkdown(report)}\n`, 'utf8');

    console.log(JSON.stringify({
      status: report.overall_status,
      coverage_percent: report.coverage_percent,
      tree_fanout: report.tree_fanout,
      reports: {
        json: path.relative(REPO_ROOT, REPORT_JSON).replace(/\\/g, '/'),
        markdown: path.relative(REPO_ROOT, REPORT_MD).replace(/\\/g, '/'),
      },
    }, null, 2));

    process.exitCode = overallReady ? 0 : 1;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error('[validate-progressive-semantic-compiler] failed:', error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
