#!/usr/bin/env node
/**
 * Parent Atlas workstation status
 *
 * Read-only recovery and indexing boundary report.
 * This separates the Parent Atlas workstation packet/summarization spine from
 * legal-app runtime mirrors such as Qdrant, Redis/BitFrost, and Neo4j.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const { Pool } = pg;

const ENV = loadRepoEnv(process.env);
Object.assign(process.env, ENV);

const REPORT_JSON = path.join(REPO_ROOT, 'docs/reports/parent-atlas-workstation-status.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs/reports/parent-atlas-workstation-status.md');

const TABLES = [
  'atlas_packets',
  'atlas_packet_registry',
  'atlas_summary_layers',
  'atlas_artifacts',
  'codebase_chunk_index',
  'parent_atlas_documents',
  'atlas_feature_envelopes',
  'atlas_retrieval_eval_times',
  'atlas_provenance_tree',
];

async function tableExists(pool, tableName) {
  const { rows } = await pool.query(`SELECT to_regclass($1) IS NOT NULL AS exists`, [`public.${tableName}`]);
  return Boolean(rows[0]?.exists);
}

async function countRows(pool, tableName) {
  if (!(await tableExists(pool, tableName))) return null;
  const { rows } = await pool.query(`SELECT count(*)::bigint AS count FROM ${tableName}`);
  return Number(rows[0]?.count ?? 0);
}

async function scalar(pool, sql) {
  const { rows } = await pool.query(sql);
  return Number(rows[0]?.value ?? 0);
}

function statusFromCounts(counts, metrics) {
  const packets = counts.atlas_packets ?? 0;
  const registry = counts.atlas_packet_registry ?? 0;
  const summaryLayers = counts.atlas_summary_layers ?? 0;
  const packetSummaries = metrics.packetSummaries ?? 0;

  return {
    canonicalSpine: packets > 0 && registry === packets ? 'READY' : 'NEEDS_REBUILD',
    summaries: packetSummaries > 0 ? 'STARTED' : 'EMPTY',
    summaryLayers: summaryLayers > 0 ? 'STARTED' : 'EMPTY',
    mirrors: packetSummaries > 100 ? 'READY_FOR_MIRROR_REFRESH' : 'WAIT_FOR_SUMMARY_BATCH',
  };
}

function buildMarkdown(report) {
  const rows = Object.entries(report.tables)
    .map(([name, count]) => `| ${name} | ${count === null ? 'missing' : count} |`)
    .join('\n');

  return `# Parent Atlas Workstation Status

Generated: ${report.generated_at}

## Boundary

Parent Atlas workstation logic is the canonical indexing lane:

1. Rebuild packet spine in Postgres.
2. Generate Gemma4 summaries into \`atlas_packets.summary\`.
3. Materialize file-level rows into \`atlas_summary_layers\`.
4. Only after summaries exist, refresh feature envelopes, Qdrant, Redis/BitFrost, and Neo4j.

Legal-app runtime stores are mirrors/caches, not truth.

## Status

| Lane | Status |
|---|---|
| canonical_spine | ${report.status.canonicalSpine} |
| summaries | ${report.status.summaries} |
| summary_layers | ${report.status.summaryLayers} |
| mirrors | ${report.status.mirrors} |

## Tables

| Table | Rows |
|---|---:|
${rows}

## Metrics

| Metric | Value |
|---|---:|
| packet_summaries | ${report.metrics.packetSummaries} |
| summary_layers_populated | ${report.metrics.summaryLayersPopulated} |
| json_shaped_packet_summaries | ${report.metrics.jsonShapedPacketSummaries} |
| json_shaped_summary_layers | ${report.metrics.jsonShapedSummaryLayers} |
| missing_packet_registry_rows | ${report.metrics.missingPacketRegistryRows} |

## Next Commands

\`\`\`powershell
npm run atlas:workstation:status
npm run atlas:workstation:summaries:100
npm run atlas:workstation:status
\`\`\`

After summary coverage is meaningful:

\`\`\`powershell
npm run atlas:feature-metadata:verify
npm run atlas:qdrant-payload:verify:verbose
npm run atlas:bitfrost-semantic-cache:audit
\`\`\`
`;
}

async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl(ENV), max: 1 });
  try {
    const context = (await pool.query(`
      SELECT current_database() AS database, current_user AS username, current_schema() AS schema
    `)).rows[0];

    const tables = {};
    for (const table of TABLES) {
      tables[table] = await countRows(pool, table);
    }

    const metrics = {
      packetSummaries: tables.atlas_packets === null ? 0 : await scalar(pool, `
        SELECT count(*) FILTER (WHERE summary IS NOT NULL AND summary <> '') AS value FROM atlas_packets
      `),
      summaryLayersPopulated: tables.atlas_summary_layers === null ? 0 : await scalar(pool, `
        SELECT count(*) FILTER (WHERE COALESCE(summary, summary_text, '') <> '') AS value FROM atlas_summary_layers
      `),
      jsonShapedPacketSummaries: tables.atlas_packets === null ? 0 : await scalar(pool, `
        SELECT count(*) FILTER (WHERE ltrim(summary) LIKE '{%') AS value FROM atlas_packets
      `),
      jsonShapedSummaryLayers: tables.atlas_summary_layers === null ? 0 : await scalar(pool, `
        SELECT count(*) FILTER (WHERE ltrim(COALESCE(summary, summary_text, '')) LIKE '{%') AS value FROM atlas_summary_layers
      `),
      missingPacketRegistryRows: tables.atlas_packets === null || tables.atlas_packet_registry === null ? 0 : await scalar(pool, `
        SELECT count(*) AS value
        FROM atlas_packets p
        LEFT JOIN atlas_packet_registry r ON r.packet_key = p.packet_key
        WHERE r.packet_key IS NULL
      `),
    };

    const report = {
      generated_at: new Date().toISOString(),
      database: context,
      boundary: {
        canonical_truth: ['atlas_packets', 'atlas_packet_registry', 'atlas_summary_layers'],
        derived_mirrors: ['qdrant', 'redis_bitfrost', 'neo4j', 'turbovec'],
        rule: 'Postgres packet and summary spine first; mirrors are refreshed after canonical summaries exist.',
      },
      tables,
      metrics,
      status: statusFromCounts(tables, metrics),
      next_actions: [
        'Promote already-generated Gemma4 chunk summaries into atlas_summary_layers with atlas:workstation:summaries:100.',
        'Do not mirror to Qdrant/Redis/Neo4j until summary coverage is intentionally advanced.',
        'Use atlas_summary_layers as the canonical envelope source for downstream feature extraction.',
      ],
    };

    await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
    await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
    await fs.writeFile(REPORT_MD, buildMarkdown(report), 'utf8');

    console.log(JSON.stringify({
      status: report.status,
      tables: report.tables,
      metrics: report.metrics,
      report: REPORT_JSON,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[parent-atlas-workstation-status] ${error.message}`);
  process.exit(1);
});
