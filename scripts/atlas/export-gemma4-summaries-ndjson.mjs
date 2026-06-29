#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { buildSummaryContext } from '../../packages/parent-atlas/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const OUT_NDJSON = path.join(ROOT, '.tmp', 'gemma4-summary-packets.ndjson');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'gemma4-summary-packets-export.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'gemma4-summary-packets-export.md');

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const LIMIT_ARG = argv.find((arg) => arg.startsWith('--limit='));
const LIMIT = Number.parseInt(LIMIT_ARG ? LIMIT_ARG.split('=', 2)[1] : '0', 10);
const PATH_PREFIX_ARG = argv.find((arg) => arg.startsWith('--path-prefix='));
const PATH_PREFIXES = PATH_PREFIX_ARG
  ? PATH_PREFIX_ARG.split('=', 2)[1].split(',').map((value) => value.trim()).filter(Boolean)
  : [];

function pct(part, total) {
  const numerator = Number(part ?? 0);
  const denominator = Number(total ?? 0);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function stableJson(value) {
  if (Array.isArray(value)) return value.map((item) => stableJson(item));
  if (value && typeof value === 'object') {
    return Object.keys(value).sort().reduce((acc, key) => {
      const normalized = stableJson(value[key]);
      if (normalized !== undefined) acc[key] = normalized;
      return acc;
    }, {});
  }
  return value;
}

function stableStringify(value) {
  return JSON.stringify(stableJson(value ?? null));
}

function normalizeText(value) {
  return String(value ?? '').trim();
}

function normalizeFeatureId(value) {
  return normalizeText(value).replace(/[^a-zA-Z0-9._:-]+/g, '.');
}

function matchesPrefix(sourceRef) {
  if (!PATH_PREFIXES.length) return true;
  return PATH_PREFIXES.some((prefix) => normalizeText(sourceRef).startsWith(prefix));
}

async function getTableColumns(pool, tableName = 'atlas_packets') {
  const { rows } = await pool.query(`
    SELECT column_name
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = $1
  `, [tableName]);
  return new Set(rows.map((row) => String(row.column_name)));
}

async function main() {
  const env = loadRepoEnv(process.env);
  const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(env) });
  const columns = await getTableColumns(pool, 'atlas_packets');

  const whereClauses = [
    `summary IS NOT NULL AND summary <> ''`,
    `source_ref IS NOT NULL AND source_ref <> ''`,
    `source_ref NOT LIKE 'feature:%'`,
    `source_ref NOT LIKE 'backups/%'`,
    `source_ref NOT LIKE 'artifacts/%'`,
    `source_ref NOT LIKE '.tmp/%'`,
    `source_ref NOT LIKE 'archive/logs/%'`,
    `source_ref NOT LIKE 'archive/tmp/%'`,
  ];
  if (PATH_PREFIXES.length) {
    whereClauses.push(`(${PATH_PREFIXES.map((prefix) => `source_ref LIKE '${prefix.replace(/'/g, "''")}%'`).join(' OR ')})`);
  }

  const params = [];
  const limitSql = LIMIT > 0 ? `LIMIT $1` : '';
  if (LIMIT > 0) params.push(LIMIT);

  const query = `
    SELECT
      packet_key,
      source_ref,
      feature_id,
      ${columns.has('feature_label') ? 'feature_label,' : 'NULL::text AS feature_label,'}
      ${columns.has('domain_class') ? 'domain_class,' : 'NULL::text AS domain_class,'}
      ${columns.has('ontology_label') ? 'ontology_label,' : 'NULL::text AS ontology_label,'}
      ${columns.has('topology_label') ? 'topology_label,' : 'NULL::text AS topology_label,'}
      summary,
      ${columns.has('tags') ? 'tags,' : "ARRAY[]::text[] AS tags,"}
      ${columns.has('metadata') ? 'metadata,' : "'{}'::jsonb AS metadata,"}
      ${columns.has('payload') ? 'payload,' : "'{}'::jsonb AS payload,"}
      ${columns.has('topology') ? 'topology,' : "'{}'::jsonb AS topology,"}
      ${columns.has('community_id') ? 'community_id,' : 'NULL::int AS community_id,'}
      ${columns.has('cluster_id') ? 'cluster_id,' : 'NULL::int AS cluster_id,'}
      ${columns.has('som_cluster') ? 'som_cluster,' : 'NULL::text AS som_cluster,'}
      ${columns.has('pagerank') ? 'pagerank,' : 'NULL::real AS pagerank,'}
      ${columns.has('updated_at') ? 'updated_at' : 'now() AS updated_at'}
    FROM atlas_packets
    WHERE ${whereClauses.join('\n      AND ')}
    ORDER BY updated_at DESC NULLS LAST, source_ref ASC
    ${limitSql}
  `;

  const { rows } = await pool.query(query, params);
  const ndjsonRows = rows.map((row) => {
    const summaryContext = buildSummaryContext(row);
    return {
      packet_type: 'gemma4_summary_packet',
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      feature_label: row.feature_label ?? summaryContext.feature_label ?? null,
      domain_class: row.domain_class ?? summaryContext.domain_class ?? null,
      ontology_label: row.ontology_label ?? summaryContext.ontology_label ?? null,
      topology_label: row.topology_label ?? summaryContext.topology_label ?? null,
      summary: row.summary,
      tags: Array.isArray(row.tags) ? row.tags : [],
      packet_context: summaryContext,
      provenance: {
        source: 'atlas_packets',
        generated_at: new Date().toISOString(),
        worker: 'export-gemma4-summaries-ndjson',
        model: 'gemma4-legal-iq4xs-direct.gguf',
      },
      summary_packet_key: `${row.packet_key}:summary`,
      qdrant_payload: {
        packet_key: row.packet_key,
        source_ref: row.source_ref,
        feature_id: row.feature_id,
        feature_label: row.feature_label ?? summaryContext.feature_label ?? null,
        domain_class: row.domain_class ?? summaryContext.domain_class ?? null,
        ontology_label: row.ontology_label ?? summaryContext.ontology_label ?? null,
        topology_label: row.topology_label ?? summaryContext.topology_label ?? null,
      },
    };
  });

  if (APPLY) {
    fs.mkdirSync(path.dirname(OUT_NDJSON), { recursive: true });
    fs.writeFileSync(OUT_NDJSON, ndjsonRows.map((row) => stableStringify(row)).join('\n') + '\n', 'utf8');
  }

  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    limit: LIMIT || null,
    path_prefixes: PATH_PREFIXES,
    source_count: rows.length,
    output_ndjson: path.relative(ROOT, OUT_NDJSON).replace(/\\/g, '/'),
    summary_coverage_pct: pct(rows.length, rows.length),
    sample: ndjsonRows.slice(0, 5).map((row) => ({
      packet_key: row.packet_key,
      source_ref: row.source_ref,
      feature_id: row.feature_id,
      summary_length: normalizeText(row.summary).length,
    })),
    note: 'This export is a handoff stream for chrom97 / Rust JSON parsing and downstream cache warmers. It does not replace atlas_packets or atlas_summary_layers.',
  };

  fs.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  fs.writeFileSync(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  fs.writeFileSync(
    REPORT_MD,
    [
      '# Gemma4 Summary Packet Export',
      '',
      `Generated: ${report.generated_at}`,
      `Mode: ${report.mode}`,
      `Rows: ${report.source_count}`,
      `NDJSON: \`${report.output_ndjson}\``,
      '',
      '## Sample',
      '',
      ...report.sample.map((row) => `- ${row.source_ref} | ${row.feature_id} | ${row.summary_length} chars`),
      '',
      '## Note',
      '',
      report.note,
    ].join('\n'),
    'utf8',
  );

  console.log(`Wrote ${path.relative(ROOT, OUT_NDJSON).replace(/\\/g, '/')}`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_JSON).replace(/\\/g, '/')}`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_MD).replace(/\\/g, '/')}`);

  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
