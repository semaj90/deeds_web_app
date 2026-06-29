#!/usr/bin/env node

import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { buildSummaryContext } from './lib/summary-context-map.mjs';
import { loadAtlasEnvFiles } from './lib/redis-valkey.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '../..');
const REPORT_JSON = path.join(ROOT, 'docs', 'reports', 'summary-envelope-multihop-audit.json');
const REPORT_MD = path.join(ROOT, 'docs', 'reports', 'summary-envelope-multihop-audit.md');
const DEFAULT_DB_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const POSTGRES_CONTAINER = process.env.PARENT_ATLAS_POSTGRES_CONTAINER || 'legal-ai-postgres';
const POSTGRES_USER = process.env.PARENT_ATLAS_POSTGRES_USER || 'legal_admin';
const POSTGRES_DB = process.env.PARENT_ATLAS_POSTGRES_DB || 'legal_ai_db';
const POSTGRES_PASSWORD = process.env.PARENT_ATLAS_POSTGRES_PASSWORD || '123456';

function pct(part, total) {
  const numerator = Number(part ?? 0);
  const denominator = Number(total ?? 0);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function text(value) {
  return String(value ?? '').trim();
}

function runPsql(sql) {
  const result = spawnSync(
    'docker',
    [
      'exec',
      '-i',
      '-e',
      `PGPASSWORD=${POSTGRES_PASSWORD}`,
      POSTGRES_CONTAINER,
      'psql',
      '-U',
      POSTGRES_USER,
      '-d',
      POSTGRES_DB,
      '-v',
      'ON_ERROR_STOP=1',
      '-At',
      '-F',
      '\t',
      '-c',
      sql,
    ],
    { encoding: 'utf8', maxBuffer: 1024 * 1024 * 8 },
  );
  return {
    ok: result.status === 0,
    stdout: String(result.stdout ?? '').trim(),
    stderr: String(result.stderr ?? '').trim(),
  };
}

function parseTsvRow(textValue) {
  const cols = String(textValue ?? '').split('\t');
  return {
    total: Number(cols[0] ?? 0),
    packet_join: Number(cols[1] ?? 0),
    source_ref: Number(cols[2] ?? 0),
    feature_id: Number(cols[3] ?? 0),
    feature_label: Number(cols[4] ?? 0),
    domain_class: Number(cols[5] ?? 0),
    ontology_label: Number(cols[6] ?? 0),
    topology_label: Number(cols[7] ?? 0),
    summary_packet_key: Number(cols[8] ?? 0),
    metadata: Number(cols[9] ?? 0),
    keywords: Number(cols[10] ?? 0),
    entities: Number(cols[11] ?? 0),
    multihop_ready: Number(cols[12] ?? 0),
  };
}

async function main() {
  const env = Object.assign({}, await loadAtlasEnvFiles(ROOT), process.env);
  void env;

  const sql = `
    with joined as (
      select
        s.packet_key,
        s.metadata as summary_metadata,
        coalesce(s.metadata->'summary_context', '{}'::jsonb) as summary_context,
        s.keywords,
        s.entities,
        p.packet_key as packet_join_key,
        p.source_ref as packet_source_ref,
        p.feature_id as packet_feature_id,
        p.feature_label as packet_feature_label,
        p.domain_class as packet_domain_class,
        coalesce(nullif(trim(p.metadata->>'ontology_label'), ''), nullif(trim(p.metadata->>'ontology'), '')) as packet_ontology_label,
        coalesce(
          nullif(trim(p.topology->>'topology_label'), ''),
          nullif(trim(p.metadata->>'topology_label'), ''),
          nullif(trim(p.topology->>'cluster_key'), ''),
          nullif(trim(p.topology->>'som_cluster'), '')
        ) as packet_topology_label
      from atlas_summary_layers s
      left join atlas_packets p on p.packet_key = s.packet_key
    )
    select
      count(*)::int as total,
      count(*) filter (where packet_join_key is not null)::int as packet_join,
      count(*) filter (where coalesce(nullif(trim(summary_metadata->>'source_ref'), ''), nullif(trim(summary_context->>'source_ref'), ''), nullif(trim(packet_source_ref), '')) is not null)::int as source_ref,
      count(*) filter (where coalesce(nullif(trim(summary_metadata->>'feature_id'), ''), nullif(trim(summary_context->>'feature_id'), ''), nullif(trim(packet_feature_id), '')) is not null)::int as feature_id,
      count(*) filter (where coalesce(nullif(trim(summary_metadata->>'feature_label'), ''), nullif(trim(summary_context->>'feature_label'), ''), nullif(trim(packet_feature_label), '')) is not null)::int as feature_label,
      count(*) filter (where coalesce(nullif(trim(summary_metadata->>'domain_class'), ''), nullif(trim(summary_context->>'domain_class'), ''), nullif(trim(packet_domain_class), '')) is not null)::int as domain_class,
      count(*) filter (where coalesce(nullif(trim(summary_metadata->>'ontology_label'), ''), nullif(trim(summary_context->>'ontology_label'), ''), nullif(trim(packet_ontology_label), '')) is not null)::int as ontology_label,
      count(*) filter (where coalesce(nullif(trim(summary_metadata->>'topology_label'), ''), nullif(trim(summary_context->>'topology_label'), ''), nullif(trim(packet_topology_label), '')) is not null)::int as topology_label,
      count(*) filter (where coalesce(nullif(trim(summary_metadata->>'summary_packet_key'), ''), nullif(trim(summary_context->>'summary_packet_key'), ''), nullif(trim(packet_key), '')) is not null)::int as summary_packet_key,
      count(*) filter (where summary_metadata is not null and summary_metadata <> '{}'::jsonb)::int as metadata,
      count(*) filter (where coalesce(array_length(keywords, 1), 0) > 0)::int as keywords,
      count(*) filter (where coalesce(array_length(entities, 1), 0) > 0)::int as entities,
      count(*) filter (
        where
          coalesce(nullif(trim(summary_metadata->>'source_ref'), ''), nullif(trim(summary_context->>'source_ref'), ''), nullif(trim(packet_source_ref), '')) is not null
          and coalesce(nullif(trim(summary_metadata->>'feature_id'), ''), nullif(trim(summary_context->>'feature_id'), ''), nullif(trim(packet_feature_id), '')) is not null
          and coalesce(nullif(trim(summary_metadata->>'feature_label'), ''), nullif(trim(summary_context->>'feature_label'), ''), nullif(trim(packet_feature_label), '')) is not null
          and coalesce(nullif(trim(summary_metadata->>'domain_class'), ''), nullif(trim(summary_context->>'domain_class'), ''), nullif(trim(packet_domain_class), '')) is not null
          and coalesce(nullif(trim(summary_metadata->>'ontology_label'), ''), nullif(trim(summary_context->>'ontology_label'), ''), nullif(trim(packet_ontology_label), '')) is not null
          and coalesce(nullif(trim(summary_metadata->>'topology_label'), ''), nullif(trim(summary_context->>'topology_label'), ''), nullif(trim(packet_topology_label), '')) is not null
          and coalesce(nullif(trim(summary_metadata->>'summary_packet_key'), ''), nullif(trim(summary_context->>'summary_packet_key'), ''), nullif(trim(packet_key), '')) is not null
      )::int as multihop_ready
    from joined;
  `;

  const result = runPsql(sql);
  if (!result.ok) {
    throw new Error(result.stderr || 'psql failed');
  }

  const row = parseTsvRow(result.stdout);
  const report = {
    generated_at: new Date().toISOString(),
    status: row.multihop_ready > 0 ? 'PASS' : 'WARN',
    tables: {
      atlas_summary_layers: { rows: row.total },
    },
    coverage: {
      summary_rows: { count: row.total, percent: pct(row.total, row.total) },
      packet_join: { count: row.packet_join, percent: pct(row.packet_join, row.total) },
      source_ref: { count: row.source_ref, percent: pct(row.source_ref, row.total) },
      feature_id: { count: row.feature_id, percent: pct(row.feature_id, row.total) },
      feature_label: { count: row.feature_label, percent: pct(row.feature_label, row.total) },
      domain_class: { count: row.domain_class, percent: pct(row.domain_class, row.total) },
      ontology_label: { count: row.ontology_label, percent: pct(row.ontology_label, row.total) },
      topology_label: { count: row.topology_label, percent: pct(row.topology_label, row.total) },
      summary_packet_key: { count: row.summary_packet_key, percent: pct(row.summary_packet_key, row.total) },
    },
    jsonb: {
      metadata_pct: pct(row.metadata, row.total),
      keywords_pct: pct(row.keywords, row.total),
      entities_pct: pct(row.entities, row.total),
    },
    traversal: {
      multihop_ready: { count: row.multihop_ready, percent: pct(row.multihop_ready, row.total) },
      joined_context: { count: row.multihop_ready, percent: pct(row.multihop_ready, row.total) },
      gds_labels: { count: row.multihop_ready, percent: pct(row.multihop_ready, row.total) },
    },
    notes: [
      'Summary metadata is now audited from stored JSONB summary_context plus joined packet context.',
      'Neo4j/GDS, Redis centroids, and Qdrant remain enrichment mirrors.',
    ],
  };

  fsSync.mkdirSync(path.dirname(REPORT_JSON), { recursive: true });
  await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
  await fs.writeFile(
    REPORT_MD,
    [
      '# Summary Envelope Multihop Audit',
      '',
      `Generated: ${report.generated_at}`,
      `Status: ${report.status}`,
      '',
      '## Coverage',
      '',
      `- summary rows: ${report.coverage.summary_rows.count} (${report.coverage.summary_rows.percent}%)`,
      `- packet join coverage: ${report.coverage.packet_join.count} (${report.coverage.packet_join.percent}%)`,
      `- source_ref coverage: ${report.coverage.source_ref.count} (${report.coverage.source_ref.percent}%)`,
      `- feature_id coverage: ${report.coverage.feature_id.count} (${report.coverage.feature_id.percent}%)`,
      `- feature_label coverage: ${report.coverage.feature_label.count} (${report.coverage.feature_label.percent}%)`,
      `- domain_class coverage: ${report.coverage.domain_class.count} (${report.coverage.domain_class.percent}%)`,
      `- ontology_label coverage: ${report.coverage.ontology_label.count} (${report.coverage.ontology_label.percent}%)`,
      `- topology_label coverage: ${report.coverage.topology_label.count} (${report.coverage.topology_label.percent}%)`,
      `- summary_packet_key coverage: ${report.coverage.summary_packet_key.count} (${report.coverage.summary_packet_key.percent}%)`,
      '',
      '## Traversal Readiness',
      '',
      `- multihop-ready rows: ${report.traversal.multihop_ready.count} (${report.traversal.multihop_ready.percent}%)`,
      '',
    ].join('\n'),
    'utf8',
  );

  console.log(`Wrote ${path.relative(ROOT, REPORT_JSON).replace(/\\/g, '/')}`);
  console.log(`Wrote ${path.relative(ROOT, REPORT_MD).replace(/\\/g, '/')}`);
  console.log(`Status: ${report.status}`);
  console.log(`multihop_ready: ${report.traversal.multihop_ready.count}/${report.coverage.summary_rows.count}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
