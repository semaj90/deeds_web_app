#!/usr/bin/env node
/**
 * Read-only reconciliation of current OpenSpec task bindings against the isolated PG18 Kanban scratch DB.
 * No claim, migration, prefill, completion, or receipt write is performed.
 */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const EXPECTED_DB = 'legal_ai_live_integration_scratch';
const EXPECTED_PORT = 5434;
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '::1', '[::1]']);
const BINDINGS_PATH = path.join(ROOT, '.tmp/atlas/openspec-cohort-6527-current-source-bindings-v1.jsonl');
const BINDINGS_REPORT_PATH = path.join(ROOT, 'docs/reports/openspec-cohort-6527-current-source-bindings-v1.json');
const REPORT_PATH = path.join(ROOT, '.tmp/atlas/openspec-cohort-6527-scratch-reconciliation-v1.json');

const sha256 = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = {
  schema: 'atlas.openspec-cohort-6527-scratch-reconciliation.v1',
  generatedAt: new Date().toISOString(),
  status: 'NOT_RUN',
  canonicalAuthority: false,
  writesPerformed: false,
  database: null,
  sourceBindingRevision: null,
  sourceBindingRows: null,
  inventory: null,
};

function getScratchUrl() {
  const env = loadRepoEnv(process.env);
  const configured = env.ATLAS_SCRATCH_PG18_URL || env.ATLAS_SCRATCH_DB_URL || env.SCRATCH_DATABASE_URL;
  const url = new URL(configured || resolveDatabaseUrl(env));
  if (!configured) url.pathname = `/${EXPECTED_DB}`;
  if (!LOOPBACK.has(url.hostname.toLowerCase()) || Number(url.port || 5432) !== EXPECTED_PORT ||
      url.pathname.replace(/^\/+/, '') !== EXPECTED_DB) {
    throw new Error('SCRATCH_TARGET_GUARD_FAILED: expected loopback :5434/legal_ai_live_integration_scratch');
  }
  return url;
}

let client;
try {
  if (!fs.existsSync(BINDINGS_PATH) || !fs.existsSync(BINDINGS_REPORT_PATH)) {
    throw new Error('CURRENT_SOURCE_BINDING_ARTIFACT_MISSING');
  }
  const bindingReport = JSON.parse(fs.readFileSync(BINDINGS_REPORT_PATH, 'utf8'));
  const bindingBytes = fs.readFileSync(BINDINGS_PATH);
  const bindingLines = bindingBytes.toString('utf8').trim().split(/\r?\n/);
  const bindings = bindingLines.map((line) => JSON.parse(line));
  const digest = sha256(bindingBytes);
  const keys = new Set(bindings.map((binding) => binding.canonical_task_key));
  if (bindingReport.status !== 'PASS_CURRENT_SOURCE_BINDING' ||
      bindingReport.sourceBindings?.rowCount !== 6527 || bindingReport.sourceBindings?.sha256 !== digest ||
      bindings.length !== 6527 || keys.size !== 6527 ||
      bindings.some((binding) => binding.canonical_authority !== false || binding.task_completion_authorized !== false)) {
    throw new Error('CURRENT_SOURCE_BINDING_INTEGRITY_OR_AUTHORITY_CHECK_FAILED');
  }
  report.sourceBindingRevision = bindingReport.sourceBindingRevision;
  report.sourceBindingRows = bindings.length;

  const url = getScratchUrl();
  client = new pg.Client({
    connectionString: url.toString(),
    connectionTimeoutMillis: 5000,
    options: '-c default_transaction_read_only=on',
  });
  await client.connect();
  await client.query('BEGIN READ ONLY');
  const identity = (await client.query(`
    SELECT current_database() AS database,
           current_setting('server_version_num')::int AS server_version_num,
           inet_server_port() AS server_port
  `)).rows[0];
  if (identity.database !== EXPECTED_DB || Number(identity.server_version_num) < 180000 || Number(url.port || 5432) !== EXPECTED_PORT) {
    throw new Error('CONNECTED_DATABASE_IDENTITY_OR_PG18_GUARD_FAILED');
  }
  identity.clientPort = Number(url.port || 5432);
  report.database = identity;

  const tables = (await client.query(`
    SELECT table_name
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY($1::text[])
    ORDER BY table_name
  `, [['kanban_tasks', 'kanban_task_dependencies', 'atlas_kanban_dag_prefill_v1']])).rows.map((row) => row.table_name);
  report.tables = tables;
  report.kanbanTaskColumns = (await client.query(`
    SELECT column_name, data_type
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'kanban_tasks'
    ORDER BY ordinal_position
  `)).rows;
  const required = ['kanban_tasks', 'kanban_task_dependencies', 'atlas_kanban_dag_prefill_v1'];
  if (required.some((table) => !tables.includes(table))) {
    report.status = 'BLOCKED_SCRATCH_SCHEMA_INCOMPLETE';
    report.missingTables = required.filter((table) => !tables.includes(table));
  } else {
    const payload = JSON.stringify(bindings.map((binding) => ({
      task_ordinal: binding.task_ordinal,
      canonical_task_key: binding.canonical_task_key,
      source_ref: binding.source_ref,
      source_claim_hash: binding.source_claim_hash,
      cohort_revision: binding.cohort_revision,
      change_id: binding.canonical_task_key.split('#', 1)[0],
    })));
    const result = await client.query(`
      WITH bindings AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS b(
          task_ordinal integer,
          canonical_task_key text,
          source_ref text,
          source_claim_hash text,
          cohort_revision text,
          change_id text
        )
      ), joined AS (
        SELECT b.*, t.task_id AS kanban_task_id, t.feature_id, t.lane, t.status AS task_status,
               t.source_revision AS task_source_revision,
               p.task_id AS prefill_task_id, p.canonical_task_key AS prefill_canonical_task_key,
               p.cohort_ordinal AS prefill_ordinal, p.cohort_revision AS prefill_cohort_revision,
               p.source_revision AS prefill_source_revision, p.source_sha256 AS prefill_source_sha256,
               p.canonical_authority AS prefill_canonical_authority
          FROM bindings b
          LEFT JOIN public.kanban_tasks t ON t.task_id = b.canonical_task_key
          LEFT JOIN public.atlas_kanban_dag_prefill_v1 p ON p.task_id = b.canonical_task_key
      )
      SELECT
        count(*)::int AS source_rows,
        count(DISTINCT canonical_task_key)::int AS unique_source_keys,
        count(kanban_task_id)::int AS exact_kanban_task_id_matches,
        count(*) FILTER (WHERE kanban_task_id IS NULL)::int AS unmatched_kanban_tasks,
        count(*) FILTER (WHERE prefill_task_id IS NOT NULL)::int AS exact_prefill_task_id_matches,
        count(*) FILTER (WHERE prefill_canonical_task_key = canonical_task_key)::int AS prefill_key_matches,
        count(*) FILTER (WHERE prefill_ordinal = task_ordinal)::int AS prefill_ordinal_matches,
        count(*) FILTER (WHERE prefill_cohort_revision = cohort_revision)::int AS prefill_rank_cohort_revision_matches,
        count(*) FILTER (WHERE prefill_source_revision = source_claim_hash)::int AS prefill_source_revision_matches,
        count(*) FILTER (WHERE prefill_source_sha256 = source_claim_hash)::int AS prefill_source_sha256_matches,
        count(*) FILTER (WHERE prefill_canonical_authority IS FALSE)::int AS noncanonical_prefill_rows,
        count(*) FILTER (WHERE task_source_revision = source_claim_hash)::int AS kanban_source_revision_matches,
        count(*) FILTER (WHERE task_status = 'completed' OR lane = 'done')::int AS kanban_completed_or_done_rows
      FROM joined
    `, [payload]);
    report.inventory = result.rows[0];

    const revisionDiagnostics = await client.query(`
      WITH bindings AS (
        SELECT * FROM jsonb_to_recordset($1::jsonb) AS b(
          task_ordinal integer,
          canonical_task_key text,
          source_claim_hash text,
          cohort_revision text
        )
      ), joined AS (
        SELECT b.*, p.source_revision AS stored_source_revision,
               p.source_sha256 AS stored_source_sha256,
               p.cohort_revision AS stored_cohort_revision
          FROM bindings b
          LEFT JOIN public.atlas_kanban_dag_prefill_v1 p
            ON p.task_id = b.canonical_task_key
      )
      SELECT count(*) FILTER (
               WHERE stored_source_revision IS DISTINCT FROM source_claim_hash
             )::int AS source_revision_mismatches,
             count(*) FILTER (
               WHERE stored_source_sha256 IS DISTINCT FROM source_claim_hash
             )::int AS source_sha256_mismatches,
             count(*) FILTER (
               WHERE stored_cohort_revision IS DISTINCT FROM cohort_revision
             )::int AS cohort_revision_mismatches,
             (SELECT coalesce(jsonb_agg(sample), '[]'::jsonb) FROM (
                SELECT task_ordinal, canonical_task_key,
                       source_claim_hash AS expected_source_revision,
                       stored_source_revision,
                       stored_source_sha256,
                       cohort_revision AS expected_cohort_revision,
                       stored_cohort_revision
                  FROM joined
                 WHERE stored_source_revision IS DISTINCT FROM source_claim_hash
                    OR stored_source_sha256 IS DISTINCT FROM source_claim_hash
                    OR stored_cohort_revision IS DISTINCT FROM cohort_revision
                 ORDER BY task_ordinal
                 LIMIT 5
              ) sample) AS mismatch_examples
        FROM joined
    `, [JSON.stringify(bindings.map((binding) => ({
      task_ordinal: binding.task_ordinal,
      canonical_task_key: binding.canonical_task_key,
      source_claim_hash: binding.source_claim_hash,
      cohort_revision: binding.cohort_revision,
    })))]);
    report.revisionDiagnostics = revisionDiagnostics.rows[0];

    report.boardInventory = (await client.query(`
      SELECT count(*)::int AS total_tasks,
             count(*) FILTER (WHERE feature_id LIKE 'openspec:%')::int AS openspec_namespace_tasks,
             count(*) FILTER (WHERE feature_id LIKE 'nextsteps:%')::int AS nextsteps_namespace_tasks,
             count(*) FILTER (WHERE task_id LIKE '%#%')::int AS hash_keyed_task_ids
        FROM public.kanban_tasks
    `)).rows[0];

    if (report.kanbanTaskColumns.some((column) => column.column_name === 'source_refs')) {
      const sourceRefCandidates = await client.query(`
        WITH bindings AS (
          SELECT * FROM jsonb_to_recordset($1::jsonb) AS b(canonical_task_key text, source_ref text)
        ), candidates AS (
          SELECT b.canonical_task_key,
                 count(t.task_id)::int AS candidate_rows,
                 array_agg(t.task_id ORDER BY t.task_id) FILTER (WHERE t.task_id IS NOT NULL) AS candidate_task_ids
            FROM bindings b
            LEFT JOIN public.kanban_tasks t ON t.source_refs::text LIKE '%' || b.source_ref || '%'
           GROUP BY b.canonical_task_key
        )
        SELECT count(*) FILTER (WHERE candidate_rows = 1)::int AS unique_source_ref_candidates,
               count(*) FILTER (WHERE candidate_rows > 1)::int AS ambiguous_source_ref_candidates,
               count(*) FILTER (WHERE candidate_rows = 0)::int AS unmatched_source_refs,
               (SELECT coalesce(jsonb_agg(jsonb_build_object('canonicalTaskKey', sample.canonical_task_key,
                 'candidateTaskIds', sample.candidate_task_ids) ORDER BY sample.canonical_task_key), '[]'::jsonb)
                  FROM (SELECT canonical_task_key, candidate_task_ids FROM candidates
                         WHERE candidate_rows > 0 ORDER BY canonical_task_key LIMIT 20) sample) AS candidate_examples
          FROM candidates
      `, [JSON.stringify(bindings.map((binding) => ({
        canonical_task_key: binding.canonical_task_key,
        source_ref: binding.source_ref,
      })))]);
      report.sourceRefCandidateAudit = sourceRefCandidates.rows[0];
    }

    const edges = await client.query(`
      WITH source_keys AS (SELECT jsonb_array_elements_text($1::jsonb) AS task_id)
      SELECT count(*)::int AS cohort_dependency_rows,
             count(*) FILTER (WHERE parent.task_id IS NULL)::int AS missing_dependency_targets,
             count(*) FILTER (WHERE parent.task_id IS NOT NULL AND target.task_id IS NULL)::int AS external_dependency_targets
        FROM public.kanban_task_dependencies d
        JOIN source_keys child ON child.task_id = d.child_task_id
        LEFT JOIN source_keys target ON target.task_id = d.parent_task_id
        LEFT JOIN public.kanban_tasks parent ON parent.task_id = d.parent_task_id
    `, [JSON.stringify(bindings.map((binding) => binding.canonical_task_key))]);
    report.dependencies = edges.rows[0];
    report.status = 'PASS_READONLY_SCRATCH_RECONCILIATION';
  }
} catch (error) {
  report.status = report.database ? 'FAIL_SCRATCH_RECONCILIATION' : 'BLOCKED_SCRATCH_CONNECT_OR_SOURCE_BINDING';
  report.error = error instanceof Error ? error.message : String(error);
} finally {
  if (client) {
    try { await client.query('ROLLBACK'); } catch { /* BEGIN may not have completed. */ }
    await client.end().catch(() => {});
  }
  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
}

process.stdout.write(`${JSON.stringify({
  status: report.status,
  database: report.database,
  sourceBindingRevision: report.sourceBindingRevision,
  sourceBindingRows: report.sourceBindingRows,
  inventory: report.inventory,
  boardInventory: report.boardInventory,
  sourceRefCandidateAudit: report.sourceRefCandidateAudit,
  revisionDiagnostics: report.revisionDiagnostics,
  dependencies: report.dependencies,
  missingTables: report.missingTables,
  error: report.error,
  reportPath: '.tmp/atlas/openspec-cohort-6527-scratch-reconciliation-v1.json'
}, null, 2)}\n`);
if (!report.status.startsWith('PASS_')) process.exitCode = 1;
