#!/usr/bin/env node
/**
 * Materialize the canonical feature recommendation index.
 *
 * Source of truth:
 *   atlas_feature_envelopes
 *
 * Derived index:
 *   atlas_feature_recommendation_index
 *
 * This lane is intentionally deterministic and resumable:
 *   - default mode is dry-run
 *   - apply mode requires an explicit limit
 *   - supports limit/offset batching
 */

import pg from 'pg';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const APPLY = process.argv.includes('--apply');
const DRY_RUN = process.argv.includes('--dry-run') || !APPLY;

function argValue(name) {
  const direct = process.argv.find((value) => value.startsWith(`--${name}=`));
  return direct ? direct.slice(name.length + 3) : null;
}

const hasLimitArg = process.argv.some((value) => value === '--limit' || value.startsWith('--limit='));
const LIMIT = Number(argValue('limit') ?? 500);
const OFFSET = Number(argValue('offset') ?? 0);

if (APPLY && !hasLimitArg) {
  console.error('❌ Apply mode requires --limit=<n> so the materializer stays resumable.');
  process.exit(1);
}

const OUT_DIR = path.join(ROOT, 'docs', 'reports');
const OUT_JSON = path.join(OUT_DIR, 'atlas-feature-recommendation-index.json');
const OUT_MD = path.join(OUT_DIR, 'atlas-feature-recommendation-index.md');
const OUT_NDJSON = path.join(ROOT, '.tmp', 'atlas-feature-recommendation-index.ndjson');

const env = loadRepoEnv(process.env);
const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env), max: 4 });

function toInt(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : fallback;
}

function toFloat(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function jsonArrayLength(value) {
  if (Array.isArray(value)) return value.length;
  return 0;
}

function deriveFeatureRecommendation(row) {
  const packetCount = toInt(row.packet_count);
  const summaryCount = toInt(row.summary_count);
  const rankReadyCount = toInt(row.rank_ready_count);
  const entityCount = toInt(row.entity_count);
  const treeLinkedCount = toInt(row.tree_linked_count);
  const lexicallyRichCount = toInt(row.lexically_rich_count);
  const bitfrostKeyedCount = toInt(row.bitfrost_keyed_count, packetCount);
  const missingSummaryCount = Math.max(0, packetCount - summaryCount);
  const communityCoverageCount = toInt(row.community_coverage_count);
  const somCoverageCount = toInt(row.som_coverage_count);
  const pagerankCoverageCount = toInt(row.pagerank_coverage_count);
  const missingCommunityCount = Math.max(0, packetCount - communityCoverageCount);
  const missingSomCount = Math.max(0, packetCount - somCoverageCount);
  const missingPagerankCount = Math.max(0, packetCount - pagerankCoverageCount);
  const missingTreeCount = Math.max(0, packetCount - treeLinkedCount);
  const summaryCoverage = packetCount > 0 ? summaryCount / packetCount : 0;
  const rankCoverage = packetCount > 0 ? rankReadyCount / packetCount : 0;
  const pagerankCoverage = packetCount > 0 ? toInt(row.pagerank_coverage_count) / packetCount : 0;
  const somCoverage = packetCount > 0 ? toInt(row.som_coverage_count) / packetCount : 0;
  const communityCoverage = packetCount > 0 ? communityCoverageCount / packetCount : 0;

  const todoScore = Math.round(
    missingSummaryCount * 5 +
    missingPagerankCount * 2 +
    missingCommunityCount * 1 +
    missingSomCount * 1 +
    (entityCount === 0 && summaryCount > 0 ? 15 : 0) +
    missingTreeCount +
    Math.max(0, 30 - Math.round((toFloat(row.avg_page_rank, 0) ?? 0) * 10))
  );

  return {
    feature_id: row.feature_id,
    feature_label: row.feature_label,
    domain_class: row.domain_class,
    title_id: row.title_id,
    packet_count: packetCount,
    summary_count: summaryCount,
    missing_summary_count: missingSummaryCount,
    rank_ready_count: rankReadyCount,
    avg_page_rank: toFloat(row.avg_page_rank, null),
    max_page_rank: toFloat(row.max_page_rank, null),
    community_id: row.community_id !== null && row.community_id !== undefined ? Number(row.community_id) : null,
    som_cluster: row.som_cluster !== null && row.som_cluster !== undefined ? Number(row.som_cluster) : null,
    entity_count: entityCount,
    bitfrost_keyed_count: bitfrostKeyedCount,
    tree_linked_count: treeLinkedCount,
    lexically_rich_count: lexicallyRichCount,
    missing_community_count: missingCommunityCount,
    missing_som_count: missingSomCount,
    missing_pagerank_count: missingPagerankCount,
    community_coverage_count: communityCoverageCount,
    som_coverage_count: somCoverageCount,
    pagerank_coverage_count: pagerankCoverageCount,
    summary_coverage: Number(summaryCoverage.toFixed(4)),
    rank_coverage: Number(rankCoverage.toFixed(4)),
    pagerank_coverage: Number(pagerankCoverage.toFixed(4)),
    som_coverage: Number(somCoverage.toFixed(4)),
    community_coverage: Number(communityCoverage.toFixed(4)),
    todo_score: todoScore,
    used_concepts: row.used_concepts ?? [],
    lexical_nouns: row.lexical_nouns ?? [],
    lexical_verbs: row.lexical_verbs ?? [],
    lexical_adverbs_ly: row.lexical_adverbs_ly ?? [],
    tree_node_id: row.tree_node_id ?? null,
    packet_key: row.packet_key,
    source_ref: row.source_ref,
    updated_at: new Date().toISOString(),
  };
}

async function ensureTable() {
  const relationCheck = await pool.query(`
    SELECT relkind
    FROM pg_class
    WHERE relname = 'atlas_feature_recommendation_index'
    LIMIT 1
  `);
  if (relationCheck.rows[0]?.relkind === 'm') {
    await pool.query('DROP MATERIALIZED VIEW atlas_feature_recommendation_index');
  }

  await pool.query(`
    CREATE TABLE IF NOT EXISTS atlas_feature_recommendation_index (
      feature_id TEXT PRIMARY KEY,
      feature_label TEXT,
      domain_class TEXT,
      title_id TEXT,
      packet_count INTEGER NOT NULL DEFAULT 0,
      summary_count INTEGER NOT NULL DEFAULT 0,
      missing_summary_count INTEGER NOT NULL DEFAULT 0,
      rank_ready_count INTEGER NOT NULL DEFAULT 0,
      avg_page_rank REAL,
      max_page_rank REAL,
      community_id INTEGER,
      som_cluster INTEGER,
      entity_count INTEGER NOT NULL DEFAULT 0,
      bitfrost_keyed_count INTEGER NOT NULL DEFAULT 0,
      tree_linked_count INTEGER NOT NULL DEFAULT 0,
      lexically_rich_count INTEGER NOT NULL DEFAULT 0,
      missing_community_count INTEGER NOT NULL DEFAULT 0,
      missing_som_count INTEGER NOT NULL DEFAULT 0,
      missing_pagerank_count INTEGER NOT NULL DEFAULT 0,
      summary_coverage REAL NOT NULL DEFAULT 0,
      rank_coverage REAL NOT NULL DEFAULT 0,
      pagerank_coverage REAL NOT NULL DEFAULT 0,
      som_coverage REAL NOT NULL DEFAULT 0,
      community_coverage REAL NOT NULL DEFAULT 0,
      todo_score INTEGER NOT NULL DEFAULT 0,
      used_concepts JSONB DEFAULT '[]'::jsonb,
      lexical_nouns JSONB DEFAULT '[]'::jsonb,
      lexical_verbs JSONB DEFAULT '[]'::jsonb,
      lexical_adverbs_ly JSONB DEFAULT '[]'::jsonb,
      tree_node_id TEXT,
      packet_key TEXT,
      source_ref TEXT,
      updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    ALTER TABLE atlas_feature_recommendation_index
      ADD COLUMN IF NOT EXISTS feature_label TEXT,
      ADD COLUMN IF NOT EXISTS domain_class TEXT,
      ADD COLUMN IF NOT EXISTS title_id TEXT,
      ADD COLUMN IF NOT EXISTS packet_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS summary_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS missing_summary_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS rank_ready_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS avg_page_rank REAL,
      ADD COLUMN IF NOT EXISTS max_page_rank REAL,
      ADD COLUMN IF NOT EXISTS community_id INTEGER,
      ADD COLUMN IF NOT EXISTS som_cluster INTEGER,
      ADD COLUMN IF NOT EXISTS entity_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS bitfrost_keyed_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS tree_linked_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS lexically_rich_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS missing_community_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS missing_som_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS missing_pagerank_count INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS summary_coverage REAL NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS rank_coverage REAL NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS pagerank_coverage REAL NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS som_coverage REAL NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS community_coverage REAL NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS todo_score INTEGER NOT NULL DEFAULT 0,
      ADD COLUMN IF NOT EXISTS used_concepts JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS lexical_nouns JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS lexical_verbs JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS lexical_adverbs_ly JSONB DEFAULT '[]'::jsonb,
      ADD COLUMN IF NOT EXISTS tree_node_id TEXT,
      ADD COLUMN IF NOT EXISTS packet_key TEXT,
      ADD COLUMN IF NOT EXISTS source_ref TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW();

    CREATE INDEX IF NOT EXISTS idx_feature_recommendation_index_todo_score
      ON atlas_feature_recommendation_index(todo_score DESC);
    CREATE INDEX IF NOT EXISTS idx_feature_recommendation_index_feature_id
      ON atlas_feature_recommendation_index(feature_id);
    CREATE INDEX IF NOT EXISTS idx_feature_recommendation_index_title_id
      ON atlas_feature_recommendation_index(title_id);
  `);
}

async function readRows() {
  const { rows } = await pool.query(
    `
    WITH rollup AS (
      SELECT
        afe.feature_id,
        MAX(NULLIF(afe.feature_label, '')) AS feature_label,
        MAX(NULLIF(afe.domain_class, '')) AS domain_class,
        MAX(NULLIF(afe.title_id, '')) AS title_id,
        COUNT(*)::int AS packet_count,
        COUNT(*) FILTER (WHERE COALESCE(NULLIF(afe.summary_text, ''), '') <> '')::int AS summary_count,
        COUNT(*) FILTER (WHERE afe.summary_rank_status IN ('READY', 'NEAR_READY'))::int AS rank_ready_count,
        AVG(afe.pagerank) AS avg_page_rank,
        MAX(afe.pagerank) AS max_page_rank,
        MAX(afe.community_id) AS community_id,
        MAX(afe.som_cluster) AS som_cluster,
        COUNT(*) FILTER (WHERE COALESCE(array_length(afe.entities, 1), 0) > 0)::int AS entity_count,
        COUNT(*) FILTER (WHERE afe.packet_key IS NOT NULL)::int AS bitfrost_keyed_count,
        COUNT(*) FILTER (WHERE NULLIF(afe.tree_node_id, '') IS NOT NULL)::int AS tree_linked_count,
        COUNT(*) FILTER (
          WHERE COALESCE(jsonb_array_length(COALESCE(afe.lexical_nouns, '[]'::jsonb)), 0) >= 3
            AND COALESCE(jsonb_array_length(COALESCE(afe.lexical_verbs, '[]'::jsonb)), 0) >= 1
            AND COALESCE(jsonb_array_length(COALESCE(afe.used_concepts, '[]'::jsonb)), 0) >= 3
        )::int AS lexically_rich_count,
        COUNT(*) FILTER (WHERE afe.community_id IS NULL)::int AS missing_community_count,
        COUNT(*) FILTER (WHERE afe.som_cluster IS NULL)::int AS missing_som_count,
        COUNT(*) FILTER (WHERE afe.pagerank IS NULL)::int AS missing_pagerank_count,
        COUNT(*) FILTER (WHERE afe.community_id IS NOT NULL)::int AS community_coverage_count,
        COUNT(*) FILTER (WHERE afe.som_cluster IS NOT NULL)::int AS som_coverage_count,
        COUNT(*) FILTER (WHERE afe.pagerank IS NOT NULL)::int AS pagerank_coverage_count,
        COALESCE(
          (ARRAY_AGG(COALESCE(afe.used_concepts, '[]'::jsonb) ORDER BY COALESCE(afe.summary_rank_score, 0) DESC NULLS LAST, afe.packet_key ASC))[1],
          '[]'::jsonb
        ) AS used_concepts,
        COALESCE(
          (ARRAY_AGG(COALESCE(afe.lexical_nouns, '[]'::jsonb) ORDER BY COALESCE(afe.summary_rank_score, 0) DESC NULLS LAST, afe.packet_key ASC))[1],
          '[]'::jsonb
        ) AS lexical_nouns,
        COALESCE(
          (ARRAY_AGG(COALESCE(afe.lexical_verbs, '[]'::jsonb) ORDER BY COALESCE(afe.summary_rank_score, 0) DESC NULLS LAST, afe.packet_key ASC))[1],
          '[]'::jsonb
        ) AS lexical_verbs,
        COALESCE(
          (ARRAY_AGG(COALESCE(afe.lexical_adverbs_ly, '[]'::jsonb) ORDER BY COALESCE(afe.summary_rank_score, 0) DESC NULLS LAST, afe.packet_key ASC))[1],
          '[]'::jsonb
        ) AS lexical_adverbs_ly,
        (ARRAY_AGG(NULLIF(afe.tree_node_id, '') ORDER BY COALESCE(afe.summary_rank_score, 0) DESC NULLS LAST, afe.packet_key ASC))[1] AS tree_node_id,
        (ARRAY_AGG(NULLIF(afe.packet_key, '') ORDER BY COALESCE(afe.summary_rank_score, 0) DESC NULLS LAST, afe.packet_key ASC))[1] AS packet_key,
        (ARRAY_AGG(NULLIF(afe.source_ref, '') ORDER BY COALESCE(afe.summary_rank_score, 0) DESC NULLS LAST, afe.packet_key ASC))[1] AS source_ref
      FROM atlas_feature_envelopes afe
      WHERE afe.feature_id IS NOT NULL AND afe.feature_id <> ''
      GROUP BY afe.feature_id
    )
    SELECT *
    FROM rollup
    ORDER BY
      (
        (packet_count - summary_count) * 5 +
        missing_pagerank_count * 2 +
        missing_community_count +
        missing_som_count +
        CASE WHEN entity_count = 0 AND summary_count > 0 THEN 15 ELSE 0 END +
        (packet_count - tree_linked_count)
      ) DESC,
      packet_count DESC,
      feature_id ASC
    OFFSET $1
    LIMIT $2
    `,
    [OFFSET, LIMIT]
  );
  return rows.map(deriveFeatureRecommendation);
}

async function upsertRows(rows) {
  if (!rows.length) return 0;
  const sql = `
    INSERT INTO atlas_feature_recommendation_index (
      feature_id,
      feature_label,
      domain_class,
      title_id,
      packet_count,
      summary_count,
      missing_summary_count,
      rank_ready_count,
      avg_page_rank,
      max_page_rank,
      community_id,
      som_cluster,
      entity_count,
      bitfrost_keyed_count,
      tree_linked_count,
      lexically_rich_count,
      missing_community_count,
      missing_som_count,
      missing_pagerank_count,
      summary_coverage,
      rank_coverage,
      pagerank_coverage,
      som_coverage,
      community_coverage,
      todo_score,
      used_concepts,
      lexical_nouns,
      lexical_verbs,
      lexical_adverbs_ly,
      tree_node_id,
      packet_key,
      source_ref,
      updated_at
    )
    VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
      $11, $12, $13, $14, $15, $16, $17, $18, $19, $20,
      $21, $22, $23, $24, $25, $26::jsonb, $27::jsonb, $28::jsonb, $29::jsonb,
      $30, $31, $32, NOW()
    )
    ON CONFLICT (feature_id) DO UPDATE SET
      feature_label = EXCLUDED.feature_label,
      domain_class = EXCLUDED.domain_class,
      title_id = EXCLUDED.title_id,
      packet_count = EXCLUDED.packet_count,
      summary_count = EXCLUDED.summary_count,
      missing_summary_count = EXCLUDED.missing_summary_count,
      rank_ready_count = EXCLUDED.rank_ready_count,
      avg_page_rank = EXCLUDED.avg_page_rank,
      max_page_rank = EXCLUDED.max_page_rank,
      community_id = EXCLUDED.community_id,
      som_cluster = EXCLUDED.som_cluster,
      entity_count = EXCLUDED.entity_count,
      bitfrost_keyed_count = EXCLUDED.bitfrost_keyed_count,
      tree_linked_count = EXCLUDED.tree_linked_count,
      lexically_rich_count = EXCLUDED.lexically_rich_count,
      missing_community_count = EXCLUDED.missing_community_count,
      missing_som_count = EXCLUDED.missing_som_count,
      missing_pagerank_count = EXCLUDED.missing_pagerank_count,
      summary_coverage = EXCLUDED.summary_coverage,
      rank_coverage = EXCLUDED.rank_coverage,
      pagerank_coverage = EXCLUDED.pagerank_coverage,
      som_coverage = EXCLUDED.som_coverage,
      community_coverage = EXCLUDED.community_coverage,
      todo_score = EXCLUDED.todo_score,
      used_concepts = EXCLUDED.used_concepts,
      lexical_nouns = EXCLUDED.lexical_nouns,
      lexical_verbs = EXCLUDED.lexical_verbs,
      lexical_adverbs_ly = EXCLUDED.lexical_adverbs_ly,
      tree_node_id = EXCLUDED.tree_node_id,
      packet_key = EXCLUDED.packet_key,
      source_ref = EXCLUDED.source_ref,
      updated_at = NOW()
    RETURNING feature_id
  `;

  let written = 0;
  for (const row of rows) {
    const values = [
      row.feature_id,
      row.feature_label,
      row.domain_class,
      row.title_id,
      row.packet_count,
      row.summary_count,
      row.missing_summary_count,
      row.rank_ready_count,
      row.avg_page_rank,
      row.max_page_rank,
      row.community_id,
      row.som_cluster,
      row.entity_count,
      row.bitfrost_keyed_count,
      row.tree_linked_count,
      row.lexically_rich_count,
      row.missing_community_count,
      row.missing_som_count,
      row.missing_pagerank_count,
      row.summary_coverage,
      row.rank_coverage,
      row.pagerank_coverage,
      row.som_coverage,
      row.community_coverage,
      row.todo_score,
      JSON.stringify(row.used_concepts),
      JSON.stringify(row.lexical_nouns),
      JSON.stringify(row.lexical_verbs),
      JSON.stringify(row.lexical_adverbs_ly),
      row.tree_node_id,
      row.packet_key,
      row.source_ref,
    ];
    await pool.query(sql, values);
    written += 1;
  }
  return written;
}

async function writeReports(rows) {
  const report = {
    generated_at: new Date().toISOString(),
    apply_mode: APPLY ? 'apply' : 'dry-run',
    limit: LIMIT,
    offset: OFFSET,
    total: rows.length,
    top: rows.slice(0, 50),
  };

  await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
  await fs.mkdir(path.dirname(OUT_NDJSON), { recursive: true });
  await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2) + '\n', 'utf8');
  await fs.writeFile(OUT_NDJSON, rows.map((row) => JSON.stringify(row)).join('\n') + (rows.length ? '\n' : ''), 'utf8');
  await fs.writeFile(
    OUT_MD,
    [
      '# Atlas Feature Recommendation Index',
      '',
      `Generated: ${report.generated_at}`,
      `Mode: ${report.apply_mode}`,
      `Batch: limit=${LIMIT} offset=${OFFSET}`,
      `Rows: ${rows.length}`,
      '',
      '## Top Features',
      '',
      ...rows.slice(0, 20).map((row, index) => [
        `### ${index + 1}. ${row.feature_id}`,
        `- Feature: ${row.feature_label ?? row.feature_id}`,
        `- Domain: ${row.domain_class ?? 'n/a'}`,
        `- Packets: ${row.packet_count}`,
        `- Summaries: ${row.summary_count}`,
        `- Todo score: ${row.todo_score}`,
        `- title_id: ${row.title_id ?? 'n/a'}`,
        `- source_ref: ${row.source_ref ?? 'n/a'}`,
        '',
      ].join('\n')),
    ].join('\n'),
    'utf8'
  );

  return report;
}

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Atlas Feature Recommendation Index                           ║');
  console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN'.padEnd(56)}║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');
  console.log(`Batch: limit=${LIMIT} offset=${OFFSET}`);

  const rows = await readRows();
  console.log(`Rows selected: ${rows.length}`);
  if (rows[0]) {
    console.log(`Top feature: ${rows[0].feature_id} (todo_score=${rows[0].todo_score})`);
  }

  const report = await writeReports(rows);

  if (DRY_RUN) {
    console.log(`Reports written: ${path.relative(ROOT, OUT_JSON)}, ${path.relative(ROOT, OUT_MD)}, ${path.relative(ROOT, OUT_NDJSON)}`);
    await pool.end();
    return;
  }

  await ensureTable();
  const written = await upsertRows(rows);
  console.log(`Upserted rows: ${written}`);
  console.log(`Reports written: ${path.relative(ROOT, OUT_JSON)}, ${path.relative(ROOT, OUT_MD)}, ${path.relative(ROOT, OUT_NDJSON)}`);
  await pool.end();
  return report;
}

main().catch(async (err) => {
  console.error('❌ Feature recommendation materializer failed:', err);
  try { await pool.end(); } catch {}
  process.exit(1);
});
