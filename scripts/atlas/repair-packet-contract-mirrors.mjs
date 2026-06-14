#!/usr/bin/env node
/**
 * Additive repair runner for packet contract mirrors.
 *
 * This script aligns live Postgres with the current packet contract mirror
 * expectations for the Parent Atlas packet spine. It is safe to re-run:
 * all statements are IF NOT EXISTS / idempotent and dry-run is the default.
 *
 * Covered tables:
 * - task_semantic_packets
 * - atlas_packets
 * - nes_chrom_packets
 * - route_runtime_packets
 *
 * Outputs:
 * - docs/reports/packet-contract-mirror-repair.json
 * - docs/reports/packet-contract-mirror-repair.md
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const { Pool } = pg;

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');
const FRONTEND_ROOT = path.join(REPO_ROOT, 'sveltekit-frontend');
const REPORTS_DIR = path.join(REPO_ROOT, 'docs', 'reports');
const OUT_JSON = path.join(REPORTS_DIR, 'packet-contract-mirror-repair.json');
const OUT_MD = path.join(REPORTS_DIR, 'packet-contract-mirror-repair.md');

const APPLY = process.argv.includes('--apply');
const JSON_MODE = process.argv.includes('--json');

const REPAIR_PLAN = [
  {
    tableName: 'task_semantic_packets',
    columns: [
      `ALTER TABLE public.task_semantic_packets ADD COLUMN IF NOT EXISTS canonical_source_ref text`,
      `ALTER TABLE public.task_semantic_packets ADD COLUMN IF NOT EXISTS source_ref_hash text`,
    ],
    indexes: [
      `CREATE INDEX IF NOT EXISTS tsp_source_ref_hash_idx ON public.task_semantic_packets (source_ref_hash)`,
    ],
  },
  {
    tableName: 'atlas_packets',
    columns: [
      `ALTER TABLE public.atlas_packets ADD COLUMN IF NOT EXISTS packet_key text`,
      `ALTER TABLE public.atlas_packets ADD COLUMN IF NOT EXISTS metadata jsonb DEFAULT '{}'::jsonb`,
      `ALTER TABLE public.atlas_packets ADD COLUMN IF NOT EXISTS source_kind text`,
      `ALTER TABLE public.atlas_packets ADD COLUMN IF NOT EXISTS source_path text`,
      `ALTER TABLE public.atlas_packets ADD COLUMN IF NOT EXISTS reward_prior double precision DEFAULT 0`,
      `ALTER TABLE public.atlas_packets ADD COLUMN IF NOT EXISTS source_ref_key text`,
      `ALTER TABLE public.atlas_packets ADD COLUMN IF NOT EXISTS community_source text`,
      `ALTER TABLE public.atlas_packets ADD COLUMN IF NOT EXISTS community_confidence double precision`,
      `ALTER TABLE public.atlas_packets ADD COLUMN IF NOT EXISTS updated_at timestamptz DEFAULT now()`,
    ],
    indexes: [
      `CREATE UNIQUE INDEX IF NOT EXISTS atlas_packets_identity_idx ON public.atlas_packets (packet_key, source_ref, feature_id, community_id)`,
      `CREATE INDEX IF NOT EXISTS atlas_packets_metadata_gin_idx ON public.atlas_packets USING gin (metadata jsonb_path_ops)`,
      `CREATE INDEX IF NOT EXISTS atlas_packets_metadata_path_idx ON public.atlas_packets ((metadata->>'path'))`,
      `CREATE INDEX IF NOT EXISTS atlas_packets_metadata_hash_idx ON public.atlas_packets ((metadata->>'hash'))`,
      `CREATE INDEX IF NOT EXISTS atlas_packets_payload_hash_idx ON public.atlas_packets ((payload->>'hash'))`,
      `CREATE INDEX IF NOT EXISTS idx_atlas_packets_payload_path ON public.atlas_packets ((payload->>'path'))`,
      `CREATE INDEX IF NOT EXISTS idx_atlas_packets_payload_file_url ON public.atlas_packets ((payload->>'file_url'))`,
      `CREATE INDEX IF NOT EXISTS idx_atlas_packets_feature_id ON public.atlas_packets (feature_id)`,
      `CREATE INDEX IF NOT EXISTS idx_atlas_packets_community_id ON public.atlas_packets (community_id)`,
      `CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_ref_key ON public.atlas_packets (source_ref_key)`,
      `CREATE INDEX IF NOT EXISTS idx_atlas_packets_concept_ids ON public.atlas_packets USING gin (concept_ids)`,
      `CREATE INDEX IF NOT EXISTS idx_atlas_packets_summary_fts ON public.atlas_packets USING gin (to_tsvector('english', coalesce(summary, '')))`,
    ],
  },
  {
    tableName: 'nes_chrom_packets',
    columns: [
      `ALTER TABLE public.nes_chrom_packets ADD COLUMN IF NOT EXISTS feature_ids text[]`,
      `ALTER TABLE public.nes_chrom_packets ADD COLUMN IF NOT EXISTS som_cluster text`,
      `ALTER TABLE public.nes_chrom_packets ADD COLUMN IF NOT EXISTS lane_ids text[]`,
      `ALTER TABLE public.nes_chrom_packets ADD COLUMN IF NOT EXISTS source_ref_id integer`,
      `ALTER TABLE public.nes_chrom_packets ADD COLUMN IF NOT EXISTS feature_code integer`,
      `ALTER TABLE public.nes_chrom_packets ADD COLUMN IF NOT EXISTS som_code smallint`,
      `ALTER TABLE public.nes_chrom_packets ADD COLUMN IF NOT EXISTS confidence_score smallint`,
      `ALTER TABLE public.nes_chrom_packets ADD COLUMN IF NOT EXISTS packet_zstd bytea`,
    ],
    indexes: [
      `CREATE EXTENSION IF NOT EXISTS pg_trgm`,
      `CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_feature_ids_gin ON public.nes_chrom_packets USING gin (feature_ids)`,
      `CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_lane_ids_gin ON public.nes_chrom_packets USING gin (lane_ids)`,
      `CREATE INDEX IF NOT EXISTS idx_nes_chrom_packets_som_cluster ON public.nes_chrom_packets (som_cluster)`,
      `CREATE INDEX IF NOT EXISTS nes_chrom_packets_source_ref_id_idx ON public.nes_chrom_packets (source_ref_id)`,
      `CREATE INDEX IF NOT EXISTS nes_chrom_packets_feature_code_idx ON public.nes_chrom_packets (feature_code)`,
      `CREATE INDEX IF NOT EXISTS nes_chrom_packets_som_code_idx ON public.nes_chrom_packets (som_code)`,
      `CREATE INDEX IF NOT EXISTS nes_chrom_packets_source_ref_trgm_idx ON public.nes_chrom_packets USING gin (source_ref gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS nes_chrom_packets_norm_source_ref_trgm_idx ON public.nes_chrom_packets USING gin (lower(source_ref) gin_trgm_ops)`,
      `CREATE INDEX IF NOT EXISTS nes_chrom_packets_summary_trgm_idx ON public.nes_chrom_packets USING gin (summary gin_trgm_ops)`,
    ],
  },
  {
    tableName: 'route_runtime_packets',
    columns: [
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS raw jsonb NOT NULL DEFAULT '{}'::jsonb`,
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS prompt_hash text`,
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS reward numeric`,
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS packet_uuid uuid DEFAULT gen_random_uuid()`,
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS route_state text`,
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS feature_id text`,
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS packet_version integer`,
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS supersedes_packet_uuid uuid`,
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS superseded_by uuid`,
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS git_sha text`,
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS git_diff_rank numeric`,
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS source_ref_quality numeric`,
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS repair_reason text`,
      `ALTER TABLE public.route_runtime_packets ADD COLUMN IF NOT EXISTS repair_method text`,
    ],
    indexes: [
      `CREATE UNIQUE INDEX IF NOT EXISTS rrp_packet_uuid_uidx ON public.route_runtime_packets (packet_uuid)`,
      `CREATE INDEX IF NOT EXISTS rrp_raw_gin ON public.route_runtime_packets USING gin (raw jsonb_path_ops)`,
      `CREATE INDEX IF NOT EXISTS rrp_state_idx ON public.route_runtime_packets (route_state, captured_at DESC)`,
      `CREATE INDEX IF NOT EXISTS rrp_feature_idx ON public.route_runtime_packets (feature_id, captured_at DESC)`,
      `CREATE INDEX IF NOT EXISTS idx_route_runtime_packets_feature_id ON public.route_runtime_packets (feature_id)`,
      `CREATE INDEX IF NOT EXISTS idx_route_runtime_packets_feature_ids_gin ON public.route_runtime_packets USING gin (feature_ids)`,
      `CREATE INDEX IF NOT EXISTS idx_route_runtime_packets_source_refs_gin ON public.route_runtime_packets USING gin (source_refs)`,
      `CREATE INDEX IF NOT EXISTS idx_route_runtime_packets_raw_gin ON public.route_runtime_packets USING gin (raw jsonb_path_ops)`,
      `CREATE INDEX IF NOT EXISTS idx_rrp_git_sha ON public.route_runtime_packets (git_sha)`,
      `CREATE INDEX IF NOT EXISTS idx_rrp_packet_version ON public.route_runtime_packets (packet_version)`,
      `CREATE INDEX IF NOT EXISTS idx_rrp_source_ref_quality ON public.route_runtime_packets (source_ref_quality)`,
      `CREATE INDEX IF NOT EXISTS idx_rrp_superseded_by ON public.route_runtime_packets (superseded_by)`,
    ],
  },
];

function rel(filePath) {
  return path.relative(REPO_ROOT, filePath).replace(/\\/g, '/');
}

async function loadTableState(pool, tableName) {
  const existsRes = await pool.query(
    `SELECT to_regclass($1) IS NOT NULL AS exists`,
    [`public.${tableName}`],
  );
  const tableExists = Boolean(existsRes.rows[0]?.exists);
  const columnsRes = await pool.query(
    `SELECT column_name
       FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name = $1
      ORDER BY ordinal_position`,
    [tableName],
  );
  const indexesRes = await pool.query(
    `SELECT indexname
       FROM pg_indexes
      WHERE schemaname = 'public'
        AND tablename = $1
      ORDER BY indexname`,
    [tableName],
  );
  return {
    tableExists,
    columns: columnsRes.rows.map((row) => String(row.column_name)),
    indexes: indexesRes.rows.map((row) => String(row.indexname)),
  };
}

function makeReportRow(plan, live, executed) {
  const liveColumnSet = new Set(live.columns);
  const liveIndexSet = new Set(live.indexes);
  const desiredColumnNames = plan.columns.map((sql) => sql.match(/ADD COLUMN IF NOT EXISTS\s+("?)([A-Za-z0-9_]+)\1/i)?.[2]).filter(Boolean);
  const desiredIndexNames = plan.indexes.map((sql) => sql.match(/INDEX IF NOT EXISTS\s+("?)([A-Za-z0-9_]+)\1/i)?.[2]).filter(Boolean);

  return {
    tableName: plan.tableName,
    tableExists: live.tableExists,
    desiredColumns: desiredColumnNames,
    desiredIndexes: desiredIndexNames,
    missingColumns: desiredColumnNames.filter((name) => !liveColumnSet.has(name)),
    missingIndexes: desiredIndexNames.filter((name) => !liveIndexSet.has(name)),
    executed,
  };
}

function buildMarkdown(report) {
  const lines = [];
  lines.push('# Packet Contract Mirror Repair');
  lines.push('');
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push(`Mode: ${report.mode}`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- tables checked: ${report.summary.tablesChecked}`);
  lines.push(`- statements executed: ${report.summary.statementsExecuted}`);
  lines.push(`- statements skipped: ${report.summary.statementsSkipped}`);
  lines.push(`- errors: ${report.summary.errors.length}`);
  lines.push('');

  for (const table of report.tables) {
    lines.push(`## ${table.tableName}`);
    lines.push('');
    lines.push(`- exists: ${table.tableExists ? 'yes' : 'no'}`);
    lines.push(`- desired columns: ${table.desiredColumns.join(', ') || 'none'}`);
    lines.push(`- missing columns: ${table.missingColumns.join(', ') || 'none'}`);
    lines.push(`- desired indexes: ${table.desiredIndexes.join(', ') || 'none'}`);
    lines.push(`- missing indexes: ${table.missingIndexes.join(', ') || 'none'}`);
    lines.push(`- executed statements: ${table.executed.length}`);
    lines.push('');
  }

  if (report.summary.errors.length > 0) {
    lines.push('## Errors');
    lines.push('');
    for (const error of report.summary.errors) {
      lines.push(`- ${error}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

async function main() {
  const env = loadRepoEnv(process.env);
  const dbUrl = resolveDatabaseUrl(env);
  const pool = new Pool({
    connectionString: dbUrl,
    max: 1,
    connectionTimeoutMillis: 5000,
    idleTimeoutMillis: 1000,
  });

  const mode = APPLY ? 'apply' : 'dry-run';
  const generatedAt = new Date().toISOString();
  const report = {
    generatedAt,
    mode,
    tables: [],
    summary: {
      tablesChecked: REPAIR_PLAN.length,
      statementsExecuted: 0,
      statementsSkipped: 0,
      errors: [],
    },
  };

  try {
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await pool.query(`CREATE EXTENSION IF NOT EXISTS pg_trgm`);

    for (const plan of REPAIR_PLAN) {
      const live = await loadTableState(pool, plan.tableName);
      const executed = [];

      for (const sqlText of plan.columns) {
        const matches = sqlText.match(/ADD COLUMN IF NOT EXISTS\s+("?)([A-Za-z0-9_]+)\1/i);
        const columnName = matches?.[2] ?? sqlText;
        if (live.columns.includes(columnName)) {
          report.summary.statementsSkipped += 1;
          continue;
        }
        if (APPLY) {
          await pool.query(sqlText);
          executed.push(sqlText);
          report.summary.statementsExecuted += 1;
        }
      }

      for (const sqlText of plan.indexes) {
        const matches = sqlText.match(/INDEX IF NOT EXISTS\s+("?)([A-Za-z0-9_]+)\1/i);
        const indexName = matches?.[2] ?? sqlText;
        if (live.indexes.includes(indexName)) {
          report.summary.statementsSkipped += 1;
          continue;
        }
        if (APPLY) {
          await pool.query(sqlText);
          executed.push(sqlText);
          report.summary.statementsExecuted += 1;
        }
      }

      report.tables.push(makeReportRow(plan, live, executed));
    }
  } catch (error) {
    report.summary.errors.push(error instanceof Error ? error.message : String(error));
  } finally {
    await pool.end().catch(() => {});
  }

  await fs.mkdir(REPORTS_DIR, { recursive: true });
  await fs.writeFile(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  await fs.writeFile(OUT_MD, buildMarkdown(report), 'utf8');

  if (JSON_MODE) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log(`Wrote ${rel(OUT_JSON)} and ${rel(OUT_MD)}`);
    console.log(`Mode: ${mode}; statements executed: ${report.summary.statementsExecuted}; skipped: ${report.summary.statementsSkipped}`);
  }

  process.exit(report.summary.errors.length > 0 ? 1 : 0);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
