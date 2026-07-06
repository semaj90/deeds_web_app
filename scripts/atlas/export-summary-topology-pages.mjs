#!/usr/bin/env node
/**
 * Export ranked summary pages and topology clusters.
 *
 * Purpose:
 *   - paginate all summary rows deterministically
 *   - validate each row against the canonical feature envelope contract
 *   - rank summaries for top-k promotion
 *   - cluster by domain/topology/feature for DAG/KAG/RAG review
 *   - write JSON/NDJSON page files for downstream fan-out
 *
 * Inputs:
 *   atlas_summary_layers
 *   atlas_packets
 *
 * Outputs:
 *   .tmp/summary-topology-pages/page-XXXX.json
 *   .tmp/summary-topology-pages/page-XXXX.ndjson
 *   docs/reports/summary-topology-pages/index.json
 *   docs/reports/summary-topology-pages.md
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildCanonicalFeatureEnvelope, reportValidation } from './lib/envelope-builder.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function argValue(name) {
  const direct = process.argv.find((value) => value.startsWith(`--${name}=`));
  return direct ? direct.slice(name.length + 3) : null;
}

function cliValue(name, fallback = null) {
  const arg = argValue(name);
  if (arg !== null && arg !== undefined) return arg;
  const envKey = `npm_config_${name.replace(/-/g, '_')}`;
  const fromEnv = process.env[envKey];
  return fromEnv !== undefined && String(fromEnv).length > 0 ? fromEnv : fallback;
}

const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;
const LIMIT = Number(cliValue('limit', '1000'));
const OFFSET = Number(cliValue('offset', '0'));
const PAGE_SIZE = Number(cliValue('page-size', String(LIMIT)));
const TOP_K = Number(cliValue('top-k', '20'));
const MAX_PAGES = Number(cliValue('max-pages', DRY_RUN ? '1' : '0'));
const VERBOSE = process.argv.includes('--verbose');

if (APPLY && !process.argv.some((value) => value === '--limit' || value.startsWith('--limit='))) {
  console.error('❌ Apply mode requires --limit=<n> so the export stays resumable.');
  process.exit(1);
}

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({
  connectionString: resolveDatabaseUrl(env),
  max: 2,
});

const OUT_DIR = path.join(REPO_ROOT, '.tmp', 'summary-topology-pages');
const REPORT_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const INDEX_JSON = path.join(REPORT_DIR, 'summary-topology-pages.json');
const INDEX_MD = path.join(REPORT_DIR, 'summary-topology-pages.md');

function cleanText(value) {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function hash(value) {
  return crypto.createHash('sha256').update(String(value ?? '')).digest('hex');
}

function slugify(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/['"`]/g, '')
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/\.{2,}/g, '.')
    .replace(/^\./, '')
    .replace(/\.$/, '') || 'unknown';
}

function toArray(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}

function deriveUsedConcepts(row) {
  const base = [
    row.feature_id,
    row.feature_label,
    row.title_id,
    row.domain_class,
    row.ontology_label,
    row.topology_label,
    ...toArray(row.used_concepts),
    ...toArray(row.feature_used_concepts),
    ...toArray(row.keywords),
    ...toArray(row.entities),
    ...toArray(row.tags),
    ...toArray(row.routing_hints),
  ]
    .map((value) => cleanText(value))
    .filter(Boolean);

  const unique = [...new Set(base.map((value) => value.toLowerCase()))];
  return unique.slice(0, 16);
}

function scoreRow(row) {
  const summary = cleanText(row.summary ?? row.summary_text ?? '');
  const words = summary ? summary.split(/\s+/).filter(Boolean).length : 0;
  const keywords = toArray(row.keywords);
  const entities = toArray(row.entities);
  const concepts = toArray(row.used_concepts);
  const pagerank = Number(row.pagerank ?? row.page_rank_score ?? 0) || 0;
  const hasCommunity = row.community_id !== null && row.community_id !== undefined;
  const hasSom = row.som_cluster !== null && row.som_cluster !== undefined;
  const hasTree = Boolean(cleanText(row.tree_node_id));
  const hasQdrant = Boolean(cleanText(row.qdrant_point_id));

  const score =
    Math.min(words / 32, 1) * 18 +
    Math.min(keywords.length / 8, 1) * 18 +
    Math.min(entities.length / 8, 1) * 12 +
    Math.min(concepts.length / 8, 1) * 12 +
    (pagerank > 0 ? Math.min(pagerank / 10, 1) * 18 : 0) +
    (hasCommunity ? 8 : 0) +
    (hasSom ? 8 : 0) +
    (hasTree ? 4 : 0) +
    (hasQdrant ? 2 : 0);

  return {
    score: Math.round(score),
    words,
    keywords_count: keywords.length,
    entities_count: entities.length,
    concepts_count: concepts.length,
    has_community: hasCommunity,
    has_som: hasSom,
    has_tree_node: hasTree,
    has_qdrant_point: hasQdrant,
    status: score >= 80 ? 'READY' : score >= 60 ? 'NEAR_READY' : score >= 35 ? 'PARTIAL' : 'BLOCKED',
  };
}

function clusterKey(row) {
  return [
    slugify(row.domain_class || 'unknown-domain'),
    slugify(row.topology_label || row.som_cluster || row.community_id || 'unknown-topology'),
    slugify(row.feature_id || 'unknown-feature'),
  ].join('::');
}

function dagKagRagHits(row) {
  const bits = {
    dag_hits: 0,
    kag_hits: 0,
    rag_hits: 0,
  };

  const haystack = [
    row.summary,
    row.summary_text,
    row.feature_label,
    row.feature_id,
    row.domain_class,
    row.topology_label,
    row.ontology_label,
    JSON.stringify(row.tags ?? []),
    JSON.stringify(row.routing_hints ?? []),
  ]
    .map((value) => cleanText(value).toLowerCase())
    .join(' | ');

  if (haystack.includes('dag')) bits.dag_hits++;
  if (haystack.includes('kag')) bits.kag_hits++;
  if (haystack.includes('rag')) bits.rag_hits++;
  return bits;
}

async function readPage(limit, offset) {
  const { rows } = await pool.query(
    `
      SELECT
        asl.packet_key,
        asl.summary AS summary_text,
        asl.summary_text AS summary_text_legacy,
        asl.summary AS summary,
        asl.keywords,
        asl.entities,
        asl.generated_at,
        asl.updated_at,
        ap.packet_id,
        ap.source_ref,
        ap.canonical_source_ref,
        ap.source_ref_key,
        ap.file_path,
        COALESCE(afe.feature_id, ap.feature_id) AS feature_id,
        COALESCE(afe.feature_label, ap.feature_label) AS feature_label,
        COALESCE(afe.title_id, ap.title_id) AS title_id,
        COALESCE(afe.domain_class, ap.domain_class) AS domain_class,
        COALESCE(array_to_string(afe.ontology_label, '.'), ap.domain_class, 'unknown') AS ontology_label,
        COALESCE(array_to_string(afe.topology_label, ':'), ap.community_id::text, ap.som_cluster::text) AS topology_label,
        ap.tree_node_id,
        ap.qdrant_point_id,
        ap.community_id,
        ap.som_cluster,
        ap.som_row,
        ap.som_col,
        ap.page_rank_score,
        COALESCE(ap.concept_ids::text[], ARRAY[]::text[]) AS packet_concept_ids,
        afe.used_concepts AS feature_used_concepts,
        ap.tags,
        ap.routing_hints,
        ap.metadata,
        ap.payload
      FROM atlas_summary_layers asl
      LEFT JOIN atlas_packets ap
        ON ap.packet_key = asl.packet_key
      LEFT JOIN atlas_feature_envelopes afe
        ON afe.packet_key = asl.packet_key
      WHERE COALESCE(NULLIF(asl.summary, ''), NULLIF(asl.summary_text, '')) IS NOT NULL
      ORDER BY COALESCE(ap.page_rank_score, ap.pagerank, 0) DESC,
               COALESCE(asl.updated_at, ap.updated_at, NOW()) DESC,
               asl.packet_key ASC
      OFFSET $1
      LIMIT $2
    `,
    [offset, limit],
  );
  return rows;
}

function normalizeRow(row) {
  const packet = {
    packet_key: row.packet_key,
    source_ref: row.source_ref,
    source_ref_key: row.source_ref_key || row.source_ref,
    feature_id: row.feature_id || row.feature_label || row.packet_key,
    title_id: row.title_id || row.feature_label || row.feature_id || row.packet_key,
    tree_node_id: row.tree_node_id,
    feature_label: row.feature_label,
    domain_class: row.domain_class,
    ontology_label: row.ontology_label,
    topology_label: row.topology_label,
    used_concepts: deriveUsedConcepts({ ...row, used_concepts: row.packet_concept_ids }),
    qdrant_point_id: row.qdrant_point_id,
    community_id: row.community_id,
    som_cluster: row.som_cluster,
    som_row: row.som_row,
    som_col: row.som_col,
    page_rank_score: row.page_rank_score,
    created_at: row.generated_at,
    updated_at: row.updated_at,
    summary: cleanText(row.summary ?? row.summary_text ?? row.summary_text_legacy),
    metadata: row.metadata,
    payload: row.payload,
  };
  const { envelope, validation } = buildCanonicalFeatureEnvelope(packet);
  return { packet, envelope, validation };
}

function rankRows(rows) {
  return rows.map((row) => {
    const normalized = normalizeRow(row);
    const score = scoreRow(row);
    const hits = dagKagRagHits(row);
    return {
      ...row,
      ...normalized.envelope,
      validation: normalized.validation,
      rank_score: score.score,
      rank_status: score.status,
      rank_fingerprint: hash(`${row.packet_key}:${normalized.envelope.title_id}:${cleanText(row.summary ?? row.summary_text)}`),
      dag_hits: hits.dag_hits,
      kag_hits: hits.kag_hits,
      rag_hits: hits.rag_hits,
      cluster_key: clusterKey(row),
    };
  }).sort((a, b) => {
    if (b.rank_score !== a.rank_score) return b.rank_score - a.rank_score;
    const br = Number(b.page_rank_score ?? b.pagerank ?? -1);
    const ar = Number(a.page_rank_score ?? a.pagerank ?? -1);
    if (br !== ar) return br - ar;
    return String(a.packet_key).localeCompare(String(b.packet_key));
  }).map((row, idx) => ({ ...row, rank: idx + 1 }));
}

function clusterRows(rows) {
  const clusters = new Map();
  for (const row of rows) {
    const key = row.cluster_key;
    if (!clusters.has(key)) {
      clusters.set(key, {
        cluster_key: key,
        domain_class: row.domain_class || null,
        ontology_label: row.ontology_label || null,
        topology_label: row.topology_label || row.som_cluster || row.community_id || null,
        feature_id: row.feature_id || null,
        title_id: row.title_id || null,
        count: 0,
        top_rows: [],
        dag_hits: 0,
        kag_hits: 0,
        rag_hits: 0,
      });
    }
    const cluster = clusters.get(key);
    cluster.count += 1;
    cluster.dag_hits += row.dag_hits;
    cluster.kag_hits += row.kag_hits;
    cluster.rag_hits += row.rag_hits;
    if (cluster.top_rows.length < TOP_K) {
      cluster.top_rows.push({
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        title_id: row.title_id,
        domain_class: row.domain_class,
        topology_label: row.topology_label || row.som_cluster || row.community_id || null,
        rank: row.rank,
        rank_score: row.rank_score,
        rank_status: row.rank_status,
        dag_hits: row.dag_hits,
        kag_hits: row.kag_hits,
        rag_hits: row.rag_hits,
        summary: cleanText(row.summary ?? row.summary_text).slice(0, 400),
      });
    }
  }
  return [...clusters.values()].sort((a, b) => b.count - a.count || a.cluster_key.localeCompare(b.cluster_key));
}

async function writePageFiles(pageIndex, rows) {
  const pageLabel = String(pageIndex).padStart(4, '0');
  const pageJson = {
    page: pageIndex,
    limit: LIMIT,
    offset: OFFSET + (pageIndex - 1) * LIMIT,
    row_count: rows.length,
    generated_at: new Date().toISOString(),
    top_k: TOP_K,
    rows: rows.slice(0, PAGE_SIZE),
    clusters: clusterRows(rows),
  };

  const pageJsonPath = path.join(OUT_DIR, `page-${pageLabel}.json`);
  const pageNdjsonPath = path.join(OUT_DIR, `page-${pageLabel}.ndjson`);
  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(pageJsonPath, `${JSON.stringify(pageJson, null, 2)}\n`, 'utf8');
  await fs.writeFile(pageNdjsonPath, `${rows.map((row) => JSON.stringify(row)).join('\n')}${rows.length ? '\n' : ''}`, 'utf8');
  return { pageJsonPath, pageNdjsonPath, pageJson };
}

function renderIndex(report) {
  const lines = [
    '# Summary Topology Pages',
    '',
    `Generated: ${report.generated_at}`,
    `Mode: ${report.mode}`,
    `Rows exported: ${report.rows_exported}`,
    `Pages exported: ${report.pages_exported}`,
    `Valid rows: ${report.valid_rows}`,
    `Rejected rows: ${report.rejected_rows}`,
    '',
    '## Top clusters',
    '',
    '| cluster_key | count | domain_class | ontology_label | topology_label | dag | kag | rag |',
    '|---|---:|---|---|---|---:|---:|---:|',
    ...report.top_clusters.slice(0, 20).map((cluster) => `| ${cluster.cluster_key} | ${cluster.count} | ${cluster.domain_class ?? ''} | ${cluster.ontology_label ?? ''} | ${cluster.topology_label ?? ''} | ${cluster.dag_hits} | ${cluster.kag_hits} | ${cluster.rag_hits} |`),
    '',
  ];
  return lines.join('\n');
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Summary Topology Export Pages                                 ║');
  console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(56)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`Page size=${LIMIT} top_k=${TOP_K} offset=${OFFSET}`);

  const pages = [];
  const topClusters = new Map();
  const rejected = [];
  let totalRows = 0;
  let validRowsTotal = 0;
  let rejectedRowsTotal = 0;
  let pageIndex = 0;
  let currentOffset = OFFSET;

  while (true) {
    if (MAX_PAGES > 0 && pageIndex >= MAX_PAGES) break;
    const pageRows = await readPage(LIMIT, currentOffset);
    if (!pageRows.length) break;

    pageIndex += 1;
    currentOffset += pageRows.length;

    const ranked = rankRows(pageRows);
    const validRows = ranked.filter((row) => row.validation?.isValid);
    const rejectedRows = ranked.filter((row) => !row.validation?.isValid);
    const clusters = clusterRows(validRows);

    totalRows += ranked.length;
    validRowsTotal += validRows.length;
    rejectedRowsTotal += rejectedRows.length;

    for (const cluster of clusters) {
      const existing = topClusters.get(cluster.cluster_key);
      if (!existing) {
        topClusters.set(cluster.cluster_key, cluster);
      } else {
        existing.count += cluster.count;
        existing.dag_hits += cluster.dag_hits;
        existing.kag_hits += cluster.kag_hits;
        existing.rag_hits += cluster.rag_hits;
        existing.top_rows = [...existing.top_rows, ...cluster.top_rows].slice(0, TOP_K);
      }
    }
    rejected.push(...rejectedRows.slice(0, TOP_K).map((row) => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      title_id: row.title_id,
      validation: row.validation,
      hard_failures: row.validation?.hardFailures ?? [],
      soft_warnings: row.validation?.softWarnings ?? [],
    })));

    if (VERBOSE) {
      console.log(`Page ${pageIndex}: rows=${ranked.length} valid=${validRows.length} rejected=${rejectedRows.length} clusters=${clusters.length}`);
    }

    pages.push({
      page: pageIndex,
      offset: currentOffset - pageRows.length,
      row_count: ranked.length,
      valid_count: validRows.length,
      rejected_count: rejectedRows.length,
      clusters: clusters.slice(0, TOP_K),
    });

    if (APPLY) {
      await writePageFiles(pageIndex, ranked);
    }

    if (pageRows.length < LIMIT) break;
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    limit: LIMIT,
    offset: OFFSET,
    page_size: PAGE_SIZE,
    top_k: TOP_K,
    rows_exported: totalRows,
    valid_rows: validRowsTotal,
    rejected_rows: rejectedRowsTotal,
    pages_exported: pages.length,
    top_clusters: [...topClusters.values()].sort((a, b) => b.count - a.count || a.cluster_key.localeCompare(b.cluster_key)).slice(0, TOP_K),
    rejected: rejected.slice(0, TOP_K).map((row) => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      title_id: row.title_id,
      hard_failures: row.hard_failures,
      soft_warnings: row.soft_warnings,
    })),
    pages,
  };

  if (!APPLY) {
    console.log(`Would export ${totalRows} rows across ${pages.length} pages with ${validRowsTotal} valid envelopes and ${rejectedRowsTotal} rejected rows.`);
    console.log(`Top cluster: ${report.top_clusters[0]?.cluster_key ?? '(none)'}`);
    await pool.end();
    return;
  }

  report.page_files = pages.map((page) => ({
    page: page.page,
    json: path.relative(REPO_ROOT, path.join(OUT_DIR, `page-${String(page.page).padStart(4, '0')}.json`)),
    ndjson: path.relative(REPO_ROOT, path.join(OUT_DIR, `page-${String(page.page).padStart(4, '0')}.ndjson`)),
  }));

  await fs.mkdir(REPORT_DIR, { recursive: true });
  await fs.writeFile(INDEX_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(INDEX_MD, renderIndex(report), 'utf8');

  console.log(`Exported ${totalRows} rows to ${path.relative(REPO_ROOT, OUT_DIR)}`);
  console.log(`Report: ${path.relative(REPO_ROOT, INDEX_JSON)}`);
  console.log(`Markdown: ${path.relative(REPO_ROOT, INDEX_MD)}`);

  if (rejectedRowsTotal > 0) {
    try {
      for (const row of rejected.slice(0, 5)) {
        reportValidation(row.validation, row.packet_key);
      }
    } catch (err) {
      console.warn(`[summary-topology] validation note: ${err.message}`);
    }
  }

  await pool.end();
}

main().catch(async (err) => {
  console.error('[summary-topology] fatal:', err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
