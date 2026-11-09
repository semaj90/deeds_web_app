#!/usr/bin/env node
/**
 * Read-only preflight for the nextsteps closed-loop rehearsal.
 * This canonical scripts/atlas check is hard-bound to PG18 on loopback :5434
 * and the exact legal_ai_live_integration_scratch database.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXPECTED_DB = 'legal_ai_live_integration_scratch';
const EXPECTED_PORT = 5434;
const LOOPBACK = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const REQUIRED_TABLES = [
  'kanban_tasks',
  'kanban_task_dependencies',
  'kanban_task_attempts',
  'kanban_task_events',
  'atlas_kanban_dag_prefill_v1',
  'atlas_recommendation_outcome_receipts',
];
const outputArg = process.argv.slice(2).find((arg) => arg.startsWith('--report='))?.slice(9)
  ?? '.tmp/atlas/nextsteps-scratch-readiness-v1.json';
const outputPath = path.resolve(ROOT, outputArg);
if (!outputPath.startsWith(`${path.resolve(ROOT, '.tmp')}${path.sep}`)) {
  throw new Error('REPORT_PATH_MUST_BE_UNDER_REPO_TMP');
}

function scratchUrl() {
  const configured = process.env.SCRATCH_DATABASE_URL;
  const url = new URL(configured ?? resolveDatabaseUrl(loadRepoEnv(process.env)));
  url.pathname = `/${EXPECTED_DB}`;
  if (!LOOPBACK.has(url.hostname) || Number(url.port || 5432) !== EXPECTED_PORT) {
    throw new Error('SCRATCH_ENDPOINT_MUST_BE_LOOPBACK_PORT_5434');
  }
  return url;
}

const url = scratchUrl();
const client = new pg.Client({ connectionString: url.toString(), connectionTimeoutMillis: 5000 });
const report = {
  schema: 'atlas.nextsteps-scratch-readiness.v1',
  generatedAt: new Date().toISOString(),
  status: 'NOT_RUN',
  database: null,
  serverVersionNum: null,
  tables: [],
  columns: {},
  counts: {},
  candidateTasks: [],
  nextstepsInventory: null,
  prefillBindingInventory: null,
  outcomeProofInventory: null,
  canonicalAuthority: false,
  writesPerformed: false,
};

try {
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const identity = (await client.query(`
    SELECT current_database() AS database,
           current_setting('server_version_num')::int AS server_version_num,
           inet_server_port() AS server_port,
           inet_server_addr()::text AS server_address
  `)).rows[0];
  if (identity.database !== EXPECTED_DB || Number(identity.server_version_num) < 180000) {
    throw new Error('SCRATCH_DATABASE_IDENTITY_OR_PG18_CHECK_FAILED');
  }
  report.database = identity.database;
  report.serverVersionNum = Number(identity.server_version_num);
  report.serverPort = Number(identity.server_port);
  report.clientPort = Number(url.port);

  const tableRows = (await client.query(`
    SELECT table_name
      FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name
  `, [REQUIRED_TABLES])).rows;
  report.tables = tableRows.map((row) => row.table_name);

  const columnRows = (await client.query(`
    SELECT table_name, column_name, data_type, is_nullable
      FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = ANY($1::text[])
     ORDER BY table_name, ordinal_position
  `, [REQUIRED_TABLES])).rows;
  for (const row of columnRows) {
    (report.columns[row.table_name] ??= []).push({
      name: row.column_name,
      type: row.data_type,
      nullable: row.is_nullable === 'YES',
    });
  }

  const available = new Set(report.tables);
  for (const table of REQUIRED_TABLES) {
    if (!available.has(table)) continue;
    const result = await client.query(`SELECT count(*)::int AS count FROM public.${table}`);
    report.counts[table] = result.rows[0].count;
  }
  if (available.has('kanban_tasks')) {
    report.candidateTasks = (await client.query(`
      SELECT task_id, feature_id, feature_label, lane, status,
             source_revision, validation_command, source_refs
        FROM public.kanban_tasks
       WHERE feature_id LIKE 'nextsteps:%'
         AND (task_id ILIKE '%turbovec%' OR feature_label ILIKE '%turbovec%'
              OR feature_label ILIKE '%quant%')
       ORDER BY task_id
       LIMIT 12
    `)).rows;
    report.nextstepsInventory = (await client.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE source_revision ~ '^sha256:[0-9a-f]{64}$')::int AS sha256_source_revision,
             count(*) FILTER (WHERE validation_command IS NOT NULL AND btrim(validation_command) <> '')::int AS has_validation_command,
             count(*) FILTER (WHERE lane = 'todo' AND status = 'pending' AND claim_token IS NULL)::int AS pending_unclaimed,
             count(*) FILTER (WHERE lane = 'in_progress' OR status = 'active')::int AS active
        FROM public.kanban_tasks
       WHERE feature_id LIKE 'nextsteps:%'
    `)).rows[0];
    if (available.has('atlas_kanban_dag_prefill_v1')) {
      report.prefillBindingInventory = (await client.query(`
        SELECT count(*)::int AS nextsteps_tasks,
               count(p.task_id)::int AS exact_task_id_prefill_matches,
               count(*) FILTER (WHERE p.source_revision = t.source_revision)::int AS source_revision_matches,
               count(*) FILTER (WHERE p.cohort_revision IS NOT NULL AND btrim(p.cohort_revision) <> '')::int AS with_cohort_revision
          FROM public.kanban_tasks t
          LEFT JOIN public.atlas_kanban_dag_prefill_v1 p ON p.task_id = t.task_id
         WHERE t.feature_id LIKE 'nextsteps:%'
      `)).rows[0];
    }
  }
  if (available.has('atlas_recommendation_outcome_receipts')) {
    report.outcomeProofInventory = (await client.query(`
      SELECT count(*)::int AS total,
             count(*) FILTER (WHERE downstream_success IS TRUE)::int AS downstream_success_true,
             count(*) FILTER (WHERE downstream_success IS FALSE)::int AS downstream_success_false,
             count(*) FILTER (WHERE receipt_json ? 'lease_id' AND receipt_json ? 'source_revision')::int AS lease_and_source_bound,
             count(*) FILTER (WHERE receipt_json ? 'verification_command' AND receipt_json ? 'exit_code')::int AS command_and_exit_bound
        FROM public.atlas_recommendation_outcome_receipts
    `)).rows[0];
  }
  report.status = REQUIRED_TABLES.every((table) => available.has(table))
    ? 'SCRATCH_SCHEMA_READY_READ_ONLY'
    : 'SCRATCH_SCHEMA_INCOMPLETE';

  const executionBlockers = [];
  if (!available.has('kanban_tasks') || !report.nextstepsInventory) {
    executionBlockers.push('TASK_INVENTORY_UNAVAILABLE');
  } else if (Number(report.nextstepsInventory.has_validation_command) === 0) {
    executionBlockers.push('NO_REVIEWED_RUNNABLE_VALIDATION_COMMANDS');
  }
  if (!available.has('atlas_kanban_dag_prefill_v1') || !report.prefillBindingInventory) {
    executionBlockers.push('PREFILL_INVENTORY_UNAVAILABLE');
  } else {
    if (Number(report.prefillBindingInventory.exact_task_id_prefill_matches) === 0) {
      executionBlockers.push('NO_EXACT_TASK_ID_PREFILL_BINDINGS');
    }
    if (Number(report.prefillBindingInventory.source_revision_matches) === 0) {
      executionBlockers.push('NO_SOURCE_REVISION_MATCHING_PREFILL_BINDINGS');
    }
    if (Number(report.prefillBindingInventory.with_cohort_revision) === 0) {
      executionBlockers.push('NO_COHORT_REVISION_BOUND_PREFILL_ROWS');
    }
  }
  report.executionReadiness = {
    status: executionBlockers.length === 0 ? 'READY_FOR_CANDIDATE_REVIEW' : 'BLOCKED',
    blockers: executionBlockers,
    canonicalAuthority: false,
  };

  const outcomeBlockers = [];
  if (!available.has('atlas_recommendation_outcome_receipts') || !report.outcomeProofInventory) {
    outcomeBlockers.push('OUTCOME_RECEIPT_INVENTORY_UNAVAILABLE');
  } else {
    if (Number(report.outcomeProofInventory.lease_and_source_bound) === 0) {
      outcomeBlockers.push('NO_LEASE_AND_SOURCE_BOUND_OUTCOME_RECEIPTS');
    }
    if (Number(report.outcomeProofInventory.command_and_exit_bound) === 0) {
      outcomeBlockers.push('NO_VERIFICATION_COMMAND_AND_EXIT_CODE_BOUND_OUTCOME_RECEIPTS');
    }
    if (Number(report.outcomeProofInventory.downstream_success_true) > 0 &&
        Number(report.outcomeProofInventory.lease_and_source_bound) === 0) {
      outcomeBlockers.push('SUCCESS_RECEIPTS_LACK_CLAIM_AND_SOURCE_BINDING');
    }
  }
  report.outcomeReceiptIntegrity = {
    status: outcomeBlockers.length === 0 ? 'PROOF_FIELDS_PRESENT_REQUIRES_INDEPENDENT_REVIEW' : 'BLOCKED',
    blockers: outcomeBlockers,
    canonicalAuthority: false,
  };
  await client.query('ROLLBACK');
} catch (error) {
  report.status = 'SCRATCH_PREFLIGHT_FAILED';
  report.error = error instanceof Error ? error.message : String(error);
  try { await client.query('ROLLBACK'); } catch { /* read-only transaction may not have started */ }
} finally {
  await client.end().catch(() => {});
}

await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
process.stdout.write(`${JSON.stringify({
  schema: report.schema,
  status: report.status,
  database: report.database,
  serverVersionNum: report.serverVersionNum,
  tableCount: report.tables.length,
  missingTables: REQUIRED_TABLES.filter((table) => !report.tables.includes(table)),
  counts: report.counts,
  executionReadiness: report.executionReadiness,
  outcomeReceiptIntegrity: report.outcomeReceiptIntegrity,
  writesPerformed: false,
  reportPath: path.relative(ROOT, outputPath),
}, null, 2)}\n`);
if (report.status !== 'SCRATCH_SCHEMA_READY_READ_ONLY') process.exitCode = 1;
