#!/usr/bin/env node
/**
 * Read-only audit for source_ref -> feature_id -> domain/ontology/topology/cluster mapping.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';
import { buildSummaryContext } from './lib/summary-context-map.mjs';

const { Pool } = pg;
const ENV = loadRepoEnv(process.env);
Object.assign(process.env, ENV);

const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 5000);
const OUT_JSON = path.join(REPO_ROOT, 'docs/reports/parent-atlas-summary-context-map.json');
const OUT_MD = path.join(REPO_ROOT, 'docs/reports/parent-atlas-summary-context-map.md');

function pct(part, total) {
  return total > 0 ? Math.round((part / total) * 1000) / 10 : 0;
}

function inc(map, key) {
  const value = String(key ?? 'unknown');
  map[value] = (map[value] ?? 0) + 1;
}

function topEntries(map, limit = 15) {
  return Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function mdCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|');
}

function markdown(report) {
  const domains = topEntries(report.distributions.domain_class)
    .map(([key, count]) => `| ${key} | ${count} |`).join('\n');
  const topology = topEntries(report.distributions.topology_label)
    .map(([key, count]) => `| ${key} | ${count} |`).join('\n');
  const samples = report.samples.map((row) => (
    `| ${mdCell(row.source_ref)} | ${mdCell(row.feature_id)} | ${mdCell(row.feature_label)} | ${mdCell(row.domain_class)} | ${mdCell(row.ontology_label)} | ${mdCell(row.topology_label)} | ${mdCell(row.cluster_key)} | ${row.identity_required_complete ? 'yes' : 'no'} |`
  )).join('\n');
  const missingRequired = topEntries(report.distributions.identity_missing_required)
    .map(([key, count]) => `| ${key} | ${count} |`).join('\n');

  return `# Parent Atlas Summary Context Map

Generated: ${report.generated_at}

Rows sampled: ${report.rows_sampled}

## Coverage

| Field | Count | Percent |
|---|---:|---:|
| source_ref | ${report.coverage.source_ref.count} | ${report.coverage.source_ref.percent}% |
| directory_path | ${report.coverage.directory_path.count} | ${report.coverage.directory_path.percent}% |
| file_path | ${report.coverage.file_path.count} | ${report.coverage.file_path.percent}% |
| function_symbol | ${report.coverage.function_symbol.count} | ${report.coverage.function_symbol.percent}% |
| packet_key | ${report.coverage.packet_key.count} | ${report.coverage.packet_key.percent}% |
| feature_id | ${report.coverage.feature_id.count} | ${report.coverage.feature_id.percent}% |
| feature_label | ${report.coverage.feature_label.count} | ${report.coverage.feature_label.percent}% |
| domain_class | ${report.coverage.domain_class.count} | ${report.coverage.domain_class.percent}% |
| ontology_label | ${report.coverage.ontology_label.count} | ${report.coverage.ontology_label.percent}% |
| topology_label | ${report.coverage.topology_label.count} | ${report.coverage.topology_label.percent}% |
| cluster_key | ${report.coverage.cluster_key.count} | ${report.coverage.cluster_key.percent}% |
| identity_required_complete | ${report.coverage.identity_required_complete.count} | ${report.coverage.identity_required_complete.percent}% |
| identity_chain_complete | ${report.coverage.identity_chain_complete.count} | ${report.coverage.identity_chain_complete.percent}% |

## Top Domains

| Domain | Count |
|---|---:|
${domains}

## Top Topology Labels

| Topology | Count |
|---|---:|
${topology}

## Missing Required Identity Fields

| Field | Count |
|---|---:|
${missingRequired || '| none | 0 |'}

## Samples

| source_ref | feature_id | feature_label | domain | ontology | topology | cluster | required identity |
|---|---|---|---|---|---|---|---|
${samples}
`;
}

async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl(ENV), max: 1 });
  try {
    const { rows } = await pool.query(`
      SELECT
        packet_key,
        source_ref,
        directory_path,
        file_path,
        feature_id,
        feature_label,
        community_id,
        cluster_id,
        som_cluster,
        kmeans_cluster,
        pagerank,
        metadata,
        payload,
        topology,
        summary,
        function_symbol
      FROM atlas_packets
      WHERE source_ref IS NOT NULL
        AND source_ref <> ''
        AND (source_ref LIKE '%.%' OR source_ref LIKE '%/%')
        AND source_ref NOT LIKE 'backups/%'
        AND source_ref NOT LIKE 'artifacts/%'
        AND source_ref NOT LIKE '.tmp/%'
      ORDER BY source_ref ASC
      LIMIT $1
    `, [LIMIT]);

    const coverage = {
      directory_path: 0,
      source_ref: 0,
      file_path: 0,
      function_symbol: 0,
      packet_key: 0,
      feature_id: 0,
      feature_label: 0,
      domain_class: 0,
      ontology_label: 0,
      topology_label: 0,
      cluster_key: 0,
      identity_required_complete: 0,
      identity_chain_complete: 0,
    };
    const distributions = {
      domain_class: {},
      ontology_label: {},
      topology_label: {},
      cluster_key: {},
      identity_missing_required: {},
    };
    const samples = [];

    for (const row of rows) {
      const context = buildSummaryContext(row);
      for (const key of Object.keys(coverage)) {
        if (context[key] || row[key]) coverage[key] += 1;
      }
      inc(distributions.domain_class, context.domain_class);
      inc(distributions.ontology_label, context.ontology_label);
      inc(distributions.topology_label, context.topology_label);
      inc(distributions.cluster_key, context.cluster_key);
      for (const missing of context.identity_missing_required ?? []) {
        inc(distributions.identity_missing_required, missing);
      }
      if (samples.length < 20) samples.push(context);
    }

    const total = rows.length;
    const report = {
      generated_at: new Date().toISOString(),
      rows_sampled: total,
      limit: LIMIT,
      coverage: Object.fromEntries(
        Object.entries(coverage).map(([key, count]) => [key, { count, percent: pct(count, total) }]),
      ),
      distributions,
      samples,
      notes: [
        'This is a deterministic mapping audit for enhanced Gemma4 summaries.',
        'Domain/ontology/topology may be inferred when explicit LangExtract/GDS fields are not yet repopulated.',
        'Postgres atlas_packets remains canonical; Qdrant/Redis/Neo4j should mirror this context later.',
      ],
    };

    await fs.mkdir(path.dirname(OUT_JSON), { recursive: true });
    await fs.writeFile(OUT_JSON, JSON.stringify(report, null, 2), 'utf8');
    await fs.writeFile(OUT_MD, markdown(report), 'utf8');
    console.log(JSON.stringify({
      rows_sampled: report.rows_sampled,
      coverage: report.coverage,
      report: OUT_JSON,
    }, null, 2));
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(`[summary-context-map] ${error.message}`);
  process.exit(1);
});
