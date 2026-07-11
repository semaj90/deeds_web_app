#!/usr/bin/env node
/**
 * Domain classification readiness audit.
 *
 * Checks whether the current indexed corpus is ready for:
 * - semantic feature export
 * - Naive Bayes training / application
 * - XGBoost reranker training / application
 * - EmbeddingGemma + Qdrant / top-k retrieval
 * - RRF activation in the canonical retrieval path
 *
 * Outputs JSON + Markdown reports under docs/reports/.
 */

import fs from 'node:fs';
import fsPromises from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const TMP_DIR = path.join(REPO_ROOT, '.tmp');

const REPORT_JSON = path.join(REPORTS_DIR, 'domain-classification-readiness-audit.json');
const REPORT_MD = path.join(REPORTS_DIR, 'domain-classification-readiness-audit.md');

const env = loadRepoEnv(process.env);
const pool = new Pool({ connectionString: resolveDatabaseUrl(env) });

function pct(value, total) {
  return total > 0 ? Number(((value / total) * 100).toFixed(2)) : 0;
}

function ratio(value, total, threshold) {
  return total > 0 && value / total >= threshold;
}

function text(value) {
  return String(value ?? '').trim();
}

async function tableExists(client, tableName) {
  const { rows } = await client.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [`public.${tableName}`]);
  return rows[0]?.exists === true;
}

async function getColumns(client, tableName) {
  const { rows } = await client.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = $1
  `, [tableName]);
  return new Set(rows.map((row) => row.column_name));
}

function fieldExpr(kind, columnName) {
  if (kind === 'array') {
    return `COALESCE(CARDINALITY(${columnName}), 0) > 0`;
  }
  if (kind === 'value') {
    return `${columnName} IS NOT NULL`;
  }
  return `NULLIF(BTRIM(${columnName}::text), '') IS NOT NULL`;
}

async function countCoverage(client, tableName, fields) {
  const exists = await tableExists(client, tableName);
  if (!exists) {
    const row = { total: 0 };
    for (const field of fields) row[field.key] = 0;
    return { exists: false, row, columns: [] };
  }

  const columns = await getColumns(client, tableName);
  const select = ['COUNT(*)::int AS total'];

  for (const field of fields) {
    const columnName = field.candidates.find((candidate) => columns.has(candidate));
    if (!columnName) {
      select.push(`0::int AS ${field.key}`);
      continue;
    }
    select.push(`COUNT(*) FILTER (WHERE ${fieldExpr(field.kind, columnName)})::int AS ${field.key}`);
  }

  const { rows } = await client.query(`SELECT ${select.join(', ')} FROM ${tableName}`);
  return { exists: true, row: rows[0], columns: [...columns] };
}

async function existsFile(relPath) {
  try {
    await fsPromises.access(path.join(REPO_ROOT, relPath));
    return true;
  } catch {
    return false;
  }
}

async function readText(relPath) {
  try {
    return await fsPromises.readFile(path.join(REPO_ROOT, relPath), 'utf8');
  } catch {
    return '';
  }
}

function renderMarkdown(report) {
  return [
    '# Domain Classification Readiness Audit',
    '',
    `Generated: ${report.generated_at}`,
    `Status: ${report.overall_status}`,
    '',
    '## Coverage',
    '',
    '| Lane | Coverage | Threshold | Status |',
    '|---|---:|---:|---|',
    ...report.gates.map((gate) => `| ${gate.name} | ${gate.evidence} | ${gate.target ?? ''} | ${gate.status} |`),
    '',
    '## Model Artifacts',
    '',
    `- Naive Bayes model: ${report.artifacts.naive_bayes_model ? 'present' : 'missing'}`,
    `- Naive Bayes report: ${report.artifacts.naive_bayes_report ? 'present' : 'missing'}`,
    `- XGBoost features CSV: ${report.artifacts.xgboost_features_csv ? 'present' : 'missing'}`,
    `- XGBoost training report: ${report.artifacts.xgboost_training_report ? 'present' : 'missing'}`,
    `- XGBoost reranker model: ${report.artifacts.xgboost_reranker_model ? 'present' : 'missing'}`,
    '',
    '## RRF Status',
    '',
    `- Helper modules present: ${report.rrf.helper_present ? 'yes' : 'no'}`,
    `- Canonical lane wired: ${report.rrf.canonical_lane_wired ? 'yes' : 'no'}`,
    `- Activation blocker: ${report.rrf.blocker}`,
    '',
    '## Top-K Domain Mapping Samples',
    '',
    ...report.topk_samples.map((row, idx) => (
      `${idx + 1}. ${row.packet_key} | ${row.domain_class || 'n/a'} | ${row.feature_id || 'n/a'} | ${row.title_id || 'n/a'} | ` +
      `evidence=${row.evidence_score}`
    )),
    '',
    '## Next Steps',
    '',
    ...report.next_actions.map((item, idx) => `${idx + 1}. ${item}`),
    '',
  ].join('\n');
}

function readBoolFile(relPath) {
  return fs.existsSync(path.join(REPO_ROOT, relPath));
}

function evidenceScore(row) {
  let score = 0;
  if (text(row.domain_class)) score += 1;
  if (text(row.feature_id)) score += 1;
  if (text(row.title_id)) score += 1;
  if (text(row.tree_node_id)) score += 1;
  if (text(row.qdrant_point_id)) score += 1;
  if (Number.isFinite(Number(row.page_rank_score ?? row.pagerank))) score += 1;
  if (Number.isFinite(Number(row.som_row)) && Number.isFinite(Number(row.som_col))) score += 1;
  if (Array.isArray(row.used_concepts) && row.used_concepts.filter(Boolean).length > 0) score += 1;
  if (Array.isArray(row.lexical_features) && row.lexical_features.filter(Boolean).length > 0) score += 1;
  if (Array.isArray(row.ast_symbols) && row.ast_symbols.filter(Boolean).length > 0) score += 1;
  return score;
}

async function main() {
  const client = await pool.connect();
  try {
    const packetCols = await getColumns(client, 'atlas_packets');
    const featureExists = await tableExists(client, 'atlas_packet_features');
    const metricExists = await tableExists(client, 'atlas_packet_metrics');
    const featureCols = featureExists ? await getColumns(client, 'atlas_packet_features') : new Set();
    const metricCols = metricExists ? await getColumns(client, 'atlas_packet_metrics') : new Set();
    const chunkExists = await tableExists(client, 'codebase_chunk_index');
    const chunkCols = chunkExists ? await getColumns(client, 'codebase_chunk_index') : new Set();

    const packets = await countCoverage(client, 'atlas_packets', [
      { key: 'source_ref', kind: 'text', candidates: ['source_ref', 'sourceRef'] },
      { key: 'feature_id', kind: 'text', candidates: ['feature_id', 'featureId'] },
      { key: 'title_id', kind: 'text', candidates: ['title_id', 'titleId'] },
      { key: 'tree_node_id', kind: 'text', candidates: ['tree_node_id', 'treeNodeId'] },
      { key: 'domain_class', kind: 'text', candidates: ['domain_class', 'domainClass'] },
      { key: 'qdrant_point_id', kind: 'text', candidates: ['qdrant_point_id', 'qdrantPointId'] },
      { key: 'summary', kind: 'text', candidates: ['summary'] },
      { key: 'pagerank', kind: 'value', candidates: ['page_rank_score', 'pagerank'] },
      { key: 'som', kind: 'value', candidates: ['som_row', 'som_col', 'som_index'] },
      { key: 'latent_64', kind: 'value', candidates: ['latent_64', 'latent64'] },
    ]);

    const features = featureExists
      ? await countCoverage(client, 'atlas_packet_features', [
          { key: 'used_concepts', kind: 'array', candidates: ['used_concepts', 'concept_ids'] },
          { key: 'lexical_features', kind: 'array', candidates: ['lexical_features'] },
          { key: 'ast_symbols', kind: 'array', candidates: ['ast_symbols'] },
          { key: 'entities', kind: 'array', candidates: ['entities'] },
        ])
      : { exists: false, row: { total: 0, used_concepts: 0, lexical_features: 0, ast_symbols: 0, entities: 0 }, columns: [] };

    const metrics = metricExists
      ? await countCoverage(client, 'atlas_packet_metrics', [
          { key: 'naive_bayes_predictions', kind: 'value', candidates: ['naive_bayes_predictions'] },
          { key: 'jepa_similarity', kind: 'value', candidates: ['packet_jepa_similarity', 'jepa_similarity'] },
          { key: 'kmeans_cluster', kind: 'value', candidates: ['kmeans_cluster'] },
          { key: 'som', kind: 'value', candidates: ['som_row', 'som_col'] },
          { key: 'pagerank_score', kind: 'value', candidates: ['pagerank_score', 'page_rank_score'] },
          { key: 'graph_community_id', kind: 'value', candidates: ['graph_community_id', 'community_id'] },
        ])
      : { exists: false, row: { total: 0, naive_bayes_predictions: 0, jepa_similarity: 0, kmeans_cluster: 0, som: 0, pagerank_score: 0, graph_community_id: 0 }, columns: [] };

    const chunkEmbeddings = chunkExists
      ? await countCoverage(client, 'codebase_chunk_index', [
          { key: 'relative_path', kind: 'text', candidates: ['relative_path', 'file_path'] },
          { key: 'content_embedding', kind: 'value', candidates: ['content_embedding', 'content_embedding_384'] },
          { key: 'qdrant_id', kind: 'text', candidates: ['qdrant_id', 'qdrantId'] },
        ])
      : { exists: false, row: { total: 0, relative_path: 0, content_embedding: 0, qdrant_id: 0 }, columns: [] };

    const packetTotal = Number(packets.row.total ?? 0);
    const featureTotal = Number(features.row.total ?? 0);
    const metricTotal = Number(metrics.row.total ?? 0);
    const chunkTotal = Number(chunkEmbeddings.row.total ?? 0);

    const identityReady =
      ratio(Number(packets.row.source_ref ?? 0), packetTotal, 0.95) &&
      ratio(Number(packets.row.feature_id ?? 0), packetTotal, 0.95) &&
      ratio(Number(packets.row.title_id ?? 0), packetTotal, 0.95) &&
      ratio(Number(packets.row.tree_node_id ?? 0), packetTotal, 0.95) &&
      ratio(Number(packets.row.domain_class ?? 0), packetTotal, 0.95);

    const featureReady =
      featureExists &&
      ratio(Number(features.row.used_concepts ?? 0), featureTotal, 0.95) &&
      ratio(Number(features.row.lexical_features ?? 0), featureTotal, 0.95) &&
      ratio(Number(features.row.ast_symbols ?? 0), featureTotal, 0.95);

    const metricReady =
      metricExists &&
      ratio(Number(metrics.row.naive_bayes_predictions ?? 0), metricTotal, 0.10) &&
      ratio(Number(metrics.row.kmeans_cluster ?? 0), metricTotal, 0.95) &&
      ratio(Number(metrics.row.som ?? 0), metricTotal, 0.95) &&
      ratio(Number(metrics.row.pagerank_score ?? 0), metricTotal, 0.95);

    const embeddingReady = chunkExists && ratio(Number(chunkEmbeddings.row.content_embedding ?? 0), chunkTotal, 0.95);
    const qdrantReady = ratio(Number(packets.row.qdrant_point_id ?? 0), packetTotal, 0.95);
    const topologyReady = ratio(Number(packets.row.som ?? 0), packetTotal, 0.95);
    const latentReady = ratio(Number(packets.row.latent_64 ?? 0), packetTotal, 0.95);
    const summaryReady = ratio(Number(packets.row.summary ?? 0), packetTotal, 0.95);
    const pagerankReady = ratio(Number(packets.row.pagerank ?? 0), packetTotal, 0.95);

    const nbModelExists = fs.existsSync(path.join(TMP_DIR, 'semantic-naive-bayes-model.json'));
    const nbReportExists = fs.existsSync(path.join(REPORTS_DIR, 'semantic-naive-bayes-train-report.json'));
    const nbPredictionsExist = fs.existsSync(path.join(REPORTS_DIR, 'naive-bayes-predictions.json'));
    const xgboostCsvExists = fs.existsSync(path.join(REPORTS_DIR, 'xgboost-features.csv'));
    const xgboostMetaExists = fs.existsSync(path.join(REPORTS_DIR, 'xgboost-features-meta.json'));
    const xgboostReportExists = fs.existsSync(path.join(REPORTS_DIR, 'xgboost-training-report.json'));
    const xgboostModelExists = fs.existsSync(path.join(REPO_ROOT, 'models', 'xgboost-reranker.ubj'));

    const helperRrfExists = fs.existsSync(path.join(REPO_ROOT, 'scripts', 'atlas', 'lib', 'phase89-rrf.mjs'));
    const computeRrfExists = fs.existsSync(path.join(FRONTEND_ROOT, 'src', 'lib', 'server', 'retrieval', 'compute-rrf-score.ts'));
    const multiVectorExists = fs.existsSync(path.join(FRONTEND_ROOT, 'src', 'lib', 'server', 'retrieval', 'multi-vector-orchestrator.ts'));
    const unifiedOrchestratorPath = path.join(FRONTEND_ROOT, 'src', 'lib', 'server', 'retrieval', 'unified-orchestrator.ts');
    const unifiedOrchestratorText = fs.existsSync(unifiedOrchestratorPath)
      ? await fsPromises.readFile(unifiedOrchestratorPath, 'utf8')
      : '';
    const canonicalLaneRrfWired = helperRrfExists && computeRrfExists && !unifiedOrchestratorText.includes('TODO: RRF fusion');

    const topk = [];
    const topkRes = await client.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.feature_id,
        ap.title_id,
        ap.domain_class,
        ap.tree_node_id,
        ap.qdrant_point_id,
        ap.page_rank_score,
        ap.pagerank,
        ap.som_row,
        ap.som_col,
        ap.latent_64,
        COALESCE(apf.used_concepts, ARRAY[]::text[]) AS used_concepts,
        COALESCE(apf.lexical_features, ARRAY[]::text[]) AS lexical_features,
        COALESCE(apf.ast_symbols, ARRAY[]::text[]) AS ast_symbols,
        COALESCE(apf.entities, ARRAY[]::text[]) AS entities
      FROM atlas_packets ap
      LEFT JOIN atlas_packet_features apf ON apf.packet_key = ap.packet_key
      WHERE ap.packet_key IS NOT NULL
      ORDER BY COALESCE(ap.page_rank_score, ap.pagerank, 0) DESC NULLS LAST, ap.packet_key ASC
      LIMIT 50
    `);
    for (const row of topkRes.rows) {
      topk.push({ ...row, evidence_score: evidenceScore(row) });
    }
    topk.sort((a, b) => b.evidence_score - a.evidence_score || String(a.packet_key).localeCompare(String(b.packet_key)));

    const gates = [
      {
        name: 'identity spine',
        status: identityReady ? 'PASS' : 'FAIL',
        evidence: `${pct(Number(packets.row.source_ref ?? 0), packetTotal)}% source_ref, ${pct(Number(packets.row.tree_node_id ?? 0), packetTotal)}% tree_node_id`,
        target: '>=95%',
      },
      {
        name: 'feature envelope',
        status: featureReady ? 'PASS' : 'FAIL',
        evidence: `used_concepts=${pct(Number(features.row.used_concepts ?? 0), featureTotal)}%, lexical=${pct(Number(features.row.lexical_features ?? 0), featureTotal)}%, ast=${pct(Number(features.row.ast_symbols ?? 0), featureTotal)}%`,
        target: '>=95%',
      },
      {
        name: 'metric lane',
        status: metricReady ? 'PASS' : 'PARTIAL',
        evidence: `nb=${pct(Number(metrics.row.naive_bayes_predictions ?? 0), metricTotal)}%, jepa=${pct(Number(metrics.row.jepa_similarity ?? 0), metricTotal)}%, kmeans=${pct(Number(metrics.row.kmeans_cluster ?? 0), metricTotal)}%, som=${pct(Number(metrics.row.som ?? 0), metricTotal)}%`,
        target: '>=95%',
      },
      {
        name: 'embedding corpus',
        status: embeddingReady ? 'PASS' : 'FAIL',
        evidence: `${pct(Number(chunkEmbeddings.row.content_embedding ?? 0), chunkTotal)}% content_embedding`,
        target: '>=95%',
      },
      {
        name: 'retrieval mirror',
        status: qdrantReady ? 'PASS' : 'FAIL',
        evidence: `${pct(Number(packets.row.qdrant_point_id ?? 0), packetTotal)}% qdrant_point_id`,
        target: '>=95%',
      },
      {
        name: 'topology readiness',
        status: topologyReady && latentReady ? 'PASS' : 'FAIL',
        evidence: `som=${pct(Number(packets.row.som ?? 0), packetTotal)}%, latent_64=${pct(Number(packets.row.latent_64 ?? 0), packetTotal)}%, pagerank=${pct(Number(packets.row.pagerank ?? 0), packetTotal)}%`,
        target: '>=95%',
      },
      {
        name: 'Naive Bayes lane',
        status: nbModelExists ? 'PASS' : 'FAIL',
        evidence: `${nbModelExists ? 'model present' : 'model missing'}; report=${nbReportExists ? 'present' : 'missing'}`,
        target: 'train + apply',
      },
      {
        name: 'XGBoost lane',
        status: xgboostModelExists && xgboostCsvExists ? 'PASS' : 'PARTIAL',
        evidence: `csv=${xgboostCsvExists ? 'present' : 'missing'}, meta=${xgboostMetaExists ? 'present' : 'missing'}, report=${xgboostReportExists ? 'present' : 'missing'}, model=${xgboostModelExists ? 'present' : 'missing'}`,
        target: 'export + train + serve',
      },
      {
        name: 'RRF activation',
        status: canonicalLaneRrfWired ? 'FAIL' : 'PARTIAL',
        evidence: helperRrfExists
          ? `helpers present; unified-orchestrator TODO=${unifiedOrchestratorText.includes('TODO: RRF fusion') ? 'yes' : 'no'}`
          : 'RRF helper missing',
        target: 'wire canonical lane',
      },
    ];

    const overallReady =
      identityReady &&
      featureReady &&
      embeddingReady &&
      qdrantReady &&
      topologyReady &&
      nbModelExists &&
      xgboostModelExists &&
      canonicalLaneRrfWired;

    const nextActions = [];
    if (!identityReady) {
      nextActions.push('Raise canonical identity coverage for feature_id, title_id, tree_node_id, source_ref, and domain_class before training or ranking.');
    }
    if (!featureReady) {
      nextActions.push('Backfill atlas_packet_features.ast_symbols, lexical_features, and used_concepts, then rerun the progressive semantic compiler gate.');
    }
    if (!embeddingReady) {
      nextActions.push('Backfill codebase_chunk_index.content_embedding with EmbeddingGemma vectors before widening any top-k mapping.');
    }
    if (!qdrantReady) {
      nextActions.push('Materialize the packet_key → qdrant_point_id bridge before any payload mutation or RRF fan-out.');
    }
    if (!topologyReady || !latentReady) {
      nextActions.push('Recompute latent_64, KMeans, SOM, and pagerank/community metrics after the feature lane stabilizes.');
    }
    if (!nbModelExists) {
      nextActions.push('Export semantic training rows, train the Naive Bayes packet-features model, and apply soft-evidence predictions to atlas_packet_metrics.');
    }
    if (!xgboostModelExists) {
      nextActions.push('Export the XGBoost feature dataset and train the reranker so domain classification can influence final ranking.');
    }
    if (!canonicalLaneRrfWired) {
      nextActions.push('Wire the canonical retrieval path to the RRF helper modules so Qdrant, lexical, and graph lanes can actually fuse.');
    }
    if (nextActions.length === 0) {
      nextActions.push('Proceed to Phase 5 domain classification and use the fused ranking stack for packet mapping.');
    }

    const report = {
      generated_at: new Date().toISOString(),
      overall_status: overallReady ? 'READY' : 'READY_WITH_GAPS',
      tables: {
        atlas_packets: packets.exists,
        atlas_packet_features: featureExists,
        atlas_packet_metrics: metricExists,
        codebase_chunk_index: chunkExists,
      },
      coverage_percent: {
        source_ref: pct(Number(packets.row.source_ref ?? 0), packetTotal),
        feature_id: pct(Number(packets.row.feature_id ?? 0), packetTotal),
        title_id: pct(Number(packets.row.title_id ?? 0), packetTotal),
        tree_node_id: pct(Number(packets.row.tree_node_id ?? 0), packetTotal),
        domain_class: pct(Number(packets.row.domain_class ?? 0), packetTotal),
        qdrant_point_id: pct(Number(packets.row.qdrant_point_id ?? 0), packetTotal),
        summary: pct(Number(packets.row.summary ?? 0), packetTotal),
        pagerank: pct(Number(packets.row.pagerank ?? 0), packetTotal),
        som: pct(Number(packets.row.som ?? 0), packetTotal),
        latent_64: pct(Number(packets.row.latent_64 ?? 0), packetTotal),
        used_concepts: pct(Number(features.row.used_concepts ?? 0), featureTotal),
        lexical_features: pct(Number(features.row.lexical_features ?? 0), featureTotal),
        ast_symbols: pct(Number(features.row.ast_symbols ?? 0), featureTotal),
        entities: pct(Number(features.row.entities ?? 0), featureTotal),
        content_embedding: pct(Number(chunkEmbeddings.row.content_embedding ?? 0), chunkTotal),
        naive_bayes_predictions: pct(Number(metrics.row.naive_bayes_predictions ?? 0), metricTotal),
        jepa_similarity: pct(Number(metrics.row.jepa_similarity ?? 0), metricTotal),
        kmeans_cluster: pct(Number(metrics.row.kmeans_cluster ?? 0), metricTotal),
      },
      artifacts: {
        naive_bayes_model: nbModelExists,
        naive_bayes_report: nbReportExists,
        naive_bayes_predictions: nbPredictionsExist,
        xgboost_features_csv: xgboostCsvExists,
        xgboost_features_meta: xgboostMetaExists,
        xgboost_training_report: xgboostReportExists,
        xgboost_reranker_model: xgboostModelExists,
      },
      rrf: {
        helper_present: helperRrfExists || computeRrfExists || multiVectorExists,
        canonical_lane_wired: canonicalLaneRrfWired,
        blocker: canonicalLaneRrfWired
          ? 'none'
          : 'unified-orchestrator still contains the RRF TODO; canonical lane is not fully activated',
      },
      gates,
      topk_samples: topk.slice(0, 10).map((row) => ({
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        title_id: row.title_id,
        domain_class: row.domain_class,
        evidence_score: row.evidence_score,
      })),
      next_actions: nextActions,
    };

    await fsPromises.mkdir(REPORTS_DIR, { recursive: true });
    await fsPromises.writeFile(REPORT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
    await fsPromises.writeFile(REPORT_MD, `${renderMarkdown(report)}\n`, 'utf8');

    console.log(JSON.stringify({
      status: report.overall_status,
      coverage_percent: report.coverage_percent,
      artifacts: report.artifacts,
      rrf: report.rrf,
      next_actions: report.next_actions,
      topk_samples: report.topk_samples,
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
  console.error('[domain-classification-readiness-audit] failed:', error?.stack || error?.message || String(error));
  process.exitCode = 1;
});
