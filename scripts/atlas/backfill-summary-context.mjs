#!/usr/bin/env node
/**
 * Backfill missing summary_context JSONB on atlas_summary_layers.
 *
 * The summary envelope contract is already present on part of the table.
 * This script normalizes the remaining rows using the shared Parent Atlas
 * summary context builder so multihop traversal fields stay consistent.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { buildSummaryContext } from './lib/summary-context-map.mjs';
import { loadRepoEnv, resolveDatabaseUrl, REPO_ROOT } from './connection-config.mjs';

const { Pool } = pg;
const ENV = loadRepoEnv(process.env);
Object.assign(process.env, ENV);

const APPLY = process.argv.includes('--apply');
const LIMIT = Number(process.argv.find((arg) => arg.startsWith('--limit='))?.split('=')[1] ?? 1000);
const REPORT_JSON = path.join(REPO_ROOT, 'docs', 'reports', 'summary-context-backfill.json');
const REPORT_MD = path.join(REPO_ROOT, 'docs', 'reports', 'summary-context-backfill.md');

function pct(part, total) {
  const numerator = Number(part ?? 0);
  const denominator = Number(total ?? 0);
  if (!Number.isFinite(numerator) || !Number.isFinite(denominator) || denominator <= 0) return 0;
  return Number(((numerator / denominator) * 100).toFixed(2));
}

function isNonEmpty(value) {
  return String(value ?? '').trim().length > 0;
}

function hasSummaryContext(metadata) {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  const summaryContext = metadata.summary_context;
  if (!summaryContext || typeof summaryContext !== 'object' || Array.isArray(summaryContext)) return false;
  const context = summaryContext;
  return (
    isNonEmpty(context.source_ref) &&
    isNonEmpty(context.feature_id) &&
    isNonEmpty(context.feature_label) &&
    isNonEmpty(context.domain_class) &&
    isNonEmpty(context.ontology_label) &&
    isNonEmpty(context.topology_label)
  );
}

async function main() {
  const pool = new Pool({ connectionString: resolveDatabaseUrl(ENV), max: 1 });
  try {
    const preload = await pool.query(`
      select
        s.packet_key,
        s.metadata,
        p.source_ref,
        p.directory_path,
        p.file_path,
        p.feature_id,
        p.feature_label,
        p.domain_class,
        p.community_id,
        p.cluster_id,
        p.som_cluster,
        p.pagerank,
        p.function_symbol,
        coalesce(
          nullif(trim(p.metadata->>'ontology_label'), ''),
          nullif(trim(p.payload->>'ontology_label'), ''),
          nullif(trim(p.topology->>'ontology_label'), ''),
          nullif(trim(p.metadata->>'ontology'), ''),
          nullif(trim(p.payload->>'ontology'), '')
        ) as ontology_label,
        coalesce(
          nullif(trim(p.metadata->>'topology_label'), ''),
          nullif(trim(p.payload->>'topology_label'), ''),
          nullif(trim(p.topology->>'topology_label'), ''),
          nullif(trim(p.topology->>'cluster_key'), ''),
          nullif(trim(p.topology->>'som_cluster'), '')
        ) as topology_label,
        p.payload,
        p.topology
      from atlas_summary_layers s
      left join atlas_packets p on p.packet_key = s.packet_key
      where not (
        s.metadata ? 'summary_context'
        and jsonb_typeof(s.metadata->'summary_context') = 'object'
        and coalesce(nullif(trim(s.metadata->'summary_context'->>'source_ref'), ''), '') <> ''
        and coalesce(nullif(trim(s.metadata->'summary_context'->>'feature_id'), ''), '') <> ''
        and coalesce(nullif(trim(s.metadata->'summary_context'->>'feature_label'), ''), '') <> ''
        and coalesce(nullif(trim(s.metadata->'summary_context'->>'domain_class'), ''), '') <> ''
        and coalesce(nullif(trim(s.metadata->'summary_context'->>'ontology_label'), ''), '') <> ''
        and coalesce(nullif(trim(s.metadata->'summary_context'->>'topology_label'), ''), '') <> ''
      )
      order by s.packet_key asc
      limit $1
    `, [LIMIT]);

    const candidates = preload.rows.map((row) => ({
      packet_key: row.packet_key,
      metadata: row.metadata,
      source_ref: row.source_ref,
      directory_path: row.directory_path,
      file_path: row.file_path,
      feature_id: row.feature_id,
      feature_label: row.feature_label,
      domain_class: row.domain_class,
      ontology_label: row.ontology_label,
      topology_label: row.topology_label,
      community_id: row.community_id,
      cluster_id: row.cluster_id,
      som_cluster: row.som_cluster,
      pagerank: row.pagerank,
      function_symbol: row.function_symbol,
      payload: row.payload,
      topology: row.topology,
    }));

    const enriched = candidates.map((row) => ({
      ...row,
      summary_context: buildSummaryContext(row),
    }));

    let updated = 0;
    if (APPLY && enriched.length > 0) {
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        for (const row of enriched) {
          const context = row.summary_context;
          const result = await client.query(
            `
              update atlas_summary_layers
              set metadata = jsonb_set(
                coalesce(metadata, '{}'::jsonb),
                '{summary_context}',
                $2::jsonb,
                true
              ),
              updated_at = now()
              where packet_key = $1
            `,
            [row.packet_key, JSON.stringify(context)],
          );
          updated += result.rowCount ?? 0;
        }
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      } finally {
        client.release();
      }
    }

    const verify = await pool.query(`
      select
        count(*)::int as total_rows,
        count(*) filter (where s.metadata ? 'summary_context')::int as with_context,
        count(*) filter (
          where
            coalesce(nullif(trim(s.metadata->'summary_context'->>'source_ref'), ''), nullif(trim(p.source_ref), '')) is not null
            and coalesce(nullif(trim(s.metadata->'summary_context'->>'feature_id'), ''), nullif(trim(p.feature_id), '')) is not null
            and coalesce(nullif(trim(s.metadata->'summary_context'->>'feature_label'), ''), nullif(trim(p.feature_label), '')) is not null
            and coalesce(nullif(trim(s.metadata->'summary_context'->>'domain_class'), ''), nullif(trim(p.domain_class), '')) is not null
            and coalesce(nullif(trim(s.metadata->'summary_context'->>'ontology_label'), ''), nullif(trim(coalesce(nullif(trim(p.metadata->>'ontology_label'), ''), nullif(trim(p.payload->>'ontology_label'), ''), nullif(trim(p.topology->>'ontology_label'), ''), nullif(trim(p.metadata->>'ontology'), ''), nullif(trim(p.payload->>'ontology'), ''))), '')) is not null
            and coalesce(nullif(trim(s.metadata->'summary_context'->>'topology_label'), ''), nullif(trim(coalesce(nullif(trim(p.metadata->>'topology_label'), ''), nullif(trim(p.payload->>'topology_label'), ''), nullif(trim(p.topology->>'topology_label'), ''), nullif(trim(p.topology->>'cluster_key'), ''), nullif(trim(p.topology->>'som_cluster'), ''))), '')) is not null
        )::int as multihop_ready
      from atlas_summary_layers s
      left join atlas_packets p on p.packet_key = s.packet_key
    `);

    const report = {
      generated_at: new Date().toISOString(),
      apply: APPLY,
      limit: LIMIT,
      candidates: candidates.length,
      updated,
      status: (verify.rows[0]?.multihop_ready ?? 0) > 0 ? 'PASS' : 'WARN',
      coverage: {
        total_rows: Number(verify.rows[0]?.total_rows ?? 0),
        with_context: Number(verify.rows[0]?.with_context ?? 0),
        multihop_ready: Number(verify.rows[0]?.multihop_ready ?? 0),
      },
      notes: [
        'Backfills summary_context JSONB on atlas_summary_layers using the shared Parent Atlas summary context builder.',
        'This preserves packet_key joins and keeps Postgres canonical for traversal metadata.',
      ],
    };

    await fs.mkdir(path.dirname(REPORT_JSON), { recursive: true });
    await fs.writeFile(REPORT_JSON, JSON.stringify(report, null, 2), 'utf8');
    await fs.writeFile(
      REPORT_MD,
      [
        '# Summary Context Backfill',
        '',
        `Generated: ${report.generated_at}`,
        `Apply: ${report.apply ? 'yes' : 'no'}`,
        `Status: ${report.status}`,
        '',
        '## Counts',
        '',
        `- candidates: ${report.candidates}`,
        `- updated: ${report.updated}`,
        `- total rows: ${report.coverage.total_rows}`,
        `- rows with summary_context: ${report.coverage.with_context}`,
        `- multihop ready: ${report.coverage.multihop_ready}`,
        '',
      ].join('\n'),
      'utf8',
    );

    console.log(JSON.stringify(report, null, 2));
    if (!APPLY) {
      console.log('Dry run only. Re-run with --apply to write metadata.summary_context.');
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
