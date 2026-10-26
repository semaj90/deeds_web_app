#!/usr/bin/env node
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { fileURLToPath } from 'node:url';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { computeOpenSpecWorkspaceRevisionV1 } from './audit-openspec-evidence-fabric-v1.mjs';
import { blockHash, taskBlock } from './lib/wfu-metadata.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const MIGRATION = path.join(ROOT, 'sveltekit-frontend/drizzle/manual/20261018_openspec_task_source_index_v1.sql');
const DEFAULT_OUTPUT = path.join(ROOT, '.tmp/openspec-task-source-index-v1/receipt.json');
const MAX_SOURCE_ROWS_PER_SNAPSHOT = 10_000;

function assertSnapshotSize(sourceRowCount) {
  if (!Number.isSafeInteger(sourceRowCount) || sourceRowCount < 0) throw new Error('INVALID_SOURCE_ROW_COUNT');
  if (sourceRowCount > MAX_SOURCE_ROWS_PER_SNAPSHOT) throw new Error('APPLY_BLOCKED_SOURCE_ROW_CAP');
}

function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}

function sha256(value) {
  return `sha256:${crypto.createHash('sha256').update(value).digest('hex')}`;
}

function relative(filePath) {
  return path.relative(ROOT, filePath).replaceAll('\\', '/');
}

function validateCensusChecksum(census) {
  if (census?.schema !== 'atlas.openspec-evidence-portfolio-census.v2') throw new Error('CENSUS_SCHEMA_UNSUPPORTED');
  const { checksum, ...unsigned } = census;
  if (!checksum || checksum !== sha256(canonicalJson(unsigned))) throw new Error('CENSUS_CHECKSUM_MISMATCH');
}

function buildSourceRows(census, root = ROOT) {
  validateCensusChecksum(census);
  const workspaceRevision = census.workspaceRevision;
  if (!/^sha256:[a-f0-9]{64}$/.test(workspaceRevision ?? '')) throw new Error('WORKSPACE_SNAPSHOT_CHECKSUM_REQUIRED');
  const realRoot = fs.realpathSync(root);
  if (computeOpenSpecWorkspaceRevisionV1(root) !== workspaceRevision) throw new Error('WORKSPACE_SNAPSHOT_STALE');
  const rows = [];
  const invalid = [];
  for (const task of census.tasks ?? []) {
    if (task.archived || task.declaredChecked) continue;
    const match = /^(.*tasks\.md)#L([1-9][0-9]*)$/.exec(task.taskRef ?? '');
    const sourcePath = match ? match[1] : '';
    const sourceLine = match ? Number(match[2]) : 0;
    const absolute = sourcePath ? path.resolve(root, sourcePath) : '';
    const rel = absolute ? path.relative(root, absolute) : '..';
    const identityStatus = task.taskIdentity?.identityState;
    const issues = [];
    if (!match || path.isAbsolute(sourcePath) || rel === '..' || rel.startsWith(`..${path.sep}`)) issues.push('SOURCE_REF_INVALID_OR_OUTSIDE_ROOT');
    if (!Number.isInteger(task.sourceLine) || task.sourceLine !== sourceLine) issues.push('SOURCE_LINE_MISMATCH');
    if (!fs.existsSync(absolute)) issues.push('SOURCE_FILE_MISSING');
    if (fs.existsSync(absolute)) {
      const realSource = fs.realpathSync(absolute);
      const realRelative = path.relative(realRoot, realSource);
      if (realRelative === '..' || realRelative.startsWith(`..${path.sep}`) || path.isAbsolute(realRelative)) {
        issues.push('SOURCE_SYMLINK_ESCAPES_ROOT');
      }
    }
    if (!['DECLARED_ID', 'DERIVED_ID', 'AMBIGUOUS'].includes(identityStatus)) issues.push('IDENTITY_STATUS_UNSUPPORTED');
    if (typeof task.taskText !== 'string' || !task.taskText.trim()) issues.push('TASK_TEXT_MISSING');
    if (!/^sha256:[a-f0-9]{64}$/.test(task.taskHash ?? '')) issues.push('TASK_HASH_INVALID');
    if (issues.length) {
      invalid.push({ taskRef: task.taskRef ?? null, issues });
      continue;
    }
    const lines = fs.readFileSync(absolute, 'utf8').split(/\r?\n/);
    const sourceLineText = lines[sourceLine - 1] ?? '';
    if (!/^\s*-\s*\[ \]\s+/.test(sourceLineText)) {
      invalid.push({ taskRef: task.taskRef, issues: ['SOURCE_REF_NOT_UNCHECKED_TASK_LINE'] });
      continue;
    }
    if (!sourceLineText.includes(task.taskText.trim())) {
      invalid.push({ taskRef: task.taskRef, issues: ['SOURCE_TEXT_DOES_NOT_MATCH_CENSUS'] });
      continue;
    }
    if (blockHash(taskBlock(lines, sourceLine - 1)) !== task.taskHash) {
      invalid.push({ taskRef: task.taskRef, issues: ['SOURCE_TASK_HASH_MISMATCH'] });
      continue;
    }
    rows.push({
      sourceRef: task.taskRef.replaceAll('\\', '/'),
      changeId: task.changeId,
      sourceLine,
      taskText: task.taskText,
      taskHash: task.taskHash,
      taskStatus: 'OPEN',
      identityStatus,
      canonicalTaskKeyCandidate: task.canonicalTaskRef ?? null,
      archived: false,
    });
  }
  const refs = rows.map((row) => row.sourceRef);
  if (new Set(refs).size !== refs.length) throw new Error('DUPLICATE_SOURCE_REF_IN_SNAPSHOT');
  const rowManifestChecksum = sha256(canonicalJson(rows));
  const snapshotId = sha256(canonicalJson({ workspaceRevision, rowManifestChecksum }));
  return {
    snapshotId,
    workspaceRevision,
    rowManifestChecksum,
    rows: rows.map((row) => ({ ...row, snapshotId })),
    invalid,
  };
}

function buildReport(censusPath, census, plan) {
  const report = {
    schema: 'atlas.openspec-task-source-index-plan.v1',
    generatedAt: new Date().toISOString(),
    mode: 'READ_ONLY_DRY_RUN',
    status: plan.invalid.length
      ? 'BLOCKED_SOURCE_ROWS_INVALID'
      : plan.rows.length > MAX_SOURCE_ROWS_PER_SNAPSHOT
        ? 'BLOCKED_SOURCE_ROW_CAP'
        : 'READY_FOR_BOUNDED_APPLY',
    source: relative(censusPath),
    workspaceSnapshot: plan.snapshotId,
    workspaceRevision: plan.workspaceRevision,
    sourceCensusChecksum: census.checksum,
    sourceRowCount: plan.rows.length,
    maxSourceRowsPerSnapshot: MAX_SOURCE_ROWS_PER_SNAPSHOT,
    invalidRowCount: plan.invalid.length,
    rowManifestChecksum: plan.rowManifestChecksum,
    identityStates: Object.fromEntries(['DECLARED_ID', 'DERIVED_ID', 'AMBIGUOUS'].map((state) => [state, plan.rows.filter((row) => row.identityStatus === state).length])),
    sourceRefIndex: { column: 'source_ref', method: 'btree', uniquePerSnapshot: true },
    semantics: {
      sourceAuthority: 'repository tasks.md source lines',
      projectionRole: 'immutable source locator/search index only',
      canonicalTaskIdentity: 'not admitted; canonicalTaskKeyCandidate is advisory only',
      executableKanban: 'not written',
      sourceRevision: 'deferred and not populated',
    },
    invalidSamples: plan.invalid.slice(0, 20),
    writesPerformed: false,
    likely_cause: 'Open task sources are spread across board projections; canonical SourceRef indexing must retain exact source locators without promoting unresolved task identities.',
    evidence: [relative(censusPath), relative(MIGRATION)],
    patch_targets: ['sveltekit-frontend/drizzle/manual/20261018_openspec_task_source_index_v1.sql', 'sveltekit-frontend/src/lib/server/db/schema/openspec-task-source-index.ts', 'scripts/atlas/index-openspec-task-sources-v1.mjs'],
    safe_next_command: `node scripts/atlas/index-openspec-task-sources-v1.mjs --input=${relative(censusPath)}`,
    smoke_command: 'node --test scripts/atlas/index-openspec-task-sources-v1.test.mjs',
    report_path: relative(DEFAULT_OUTPUT),
    checksum: null,
  };
  const { checksum: _checksum, ...unsigned } = report;
  report.checksum = sha256(canonicalJson(unsigned));
  return report;
}

async function applySnapshot(census, plan, report) {
  if (plan.invalid.length) throw new Error('APPLY_BLOCKED_INVALID_SOURCE_ROWS');
  assertSnapshotSize(plan.rows.length);
  if (plan.rows.length !== census.summary.uncheckedTasks) throw new Error('SOURCE_ROW_COUNT_DOES_NOT_MATCH_CENSUS');
  const expectedReadback = [...plan.rows]
    .sort((a, b) => a.sourceRef < b.sourceRef ? -1 : a.sourceRef > b.sourceRef ? 1 : 0)
    .map((row) => ({
      source_ref: row.sourceRef,
      change_id: row.changeId,
      source_line: row.sourceLine,
      task_text: row.taskText,
      task_hash: row.taskHash,
      task_status: row.taskStatus,
      identity_status: row.identityStatus,
      canonical_task_key_candidate: row.canonicalTaskKeyCandidate,
      archived: row.archived,
    }));
  const env = loadRepoEnv();
  const databaseUrl = resolveDatabaseUrl(env);
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 2, application_name: 'openspec-task-source-index-v1' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN ISOLATION LEVEL SERIALIZABLE');
    await client.query("SET LOCAL statement_timeout = '60s'");
    const version = await client.query('SHOW server_version_num');
    if (Number(version.rows[0]?.server_version_num) < 180000) throw new Error('POSTGRESQL_18_REQUIRED');
    await client.query(fs.readFileSync(MIGRATION, 'utf8'));
    const sourceCount = plan.rows.length;
    await client.query(
      `INSERT INTO public.openspec_task_source_snapshots_v1
        (snapshot_id, workspace_revision, input_checksum, source_row_count, snapshot_status)
       VALUES ($1, $2, $3, $4, 'COMPLETE')
       ON CONFLICT (snapshot_id) DO NOTHING`,
      [plan.snapshotId, census.workspaceRevision, plan.rowManifestChecksum, sourceCount],
    );
    const snapshot = await client.query(
      `SELECT workspace_revision, input_checksum, source_row_count, snapshot_status
       FROM public.openspec_task_source_snapshots_v1 WHERE snapshot_id = $1 FOR SHARE`,
      [plan.snapshotId],
    );
    const current = snapshot.rows[0];
    if (!current || current.workspace_revision !== census.workspaceRevision || current.input_checksum !== plan.rowManifestChecksum
      || Number(current.source_row_count) !== sourceCount || current.snapshot_status !== 'COMPLETE') {
      throw new Error('EXISTING_SNAPSHOT_MANIFEST_MISMATCH');
    }
    const batchSize = 250;
    for (let offset = 0; offset < plan.rows.length; offset += batchSize) {
      const batch = plan.rows.slice(offset, offset + batchSize);
      const columns = ['sourceRef', 'changeId', 'sourceLine', 'taskText', 'taskHash', 'taskStatus', 'identityStatus', 'canonicalTaskKeyCandidate', 'archived'];
      const arrays = columns.map((key) => batch.map((row) => row[key]));
      await client.query(
        `INSERT INTO public.openspec_task_source_index_v1
          (snapshot_id, source_ref, change_id, source_line, task_text, task_hash, task_status,
           identity_status, canonical_task_key_candidate, archived)
         SELECT $1, row.source_ref, row.change_id, row.source_line, row.task_text, row.task_hash,
                row.task_status, row.identity_status, row.canonical_task_key_candidate, row.archived
         FROM unnest($2::text[], $3::text[], $4::integer[], $5::text[], $6::text[], $7::text[], $8::text[], $9::text[], $10::boolean[])
           AS row(source_ref, change_id, source_line, task_text, task_hash, task_status, identity_status, canonical_task_key_candidate, archived)
         ON CONFLICT (snapshot_id, source_ref) DO NOTHING`,
        [plan.snapshotId, ...arrays],
      );
    }
    const rows = await client.query(
      `SELECT count(*)::int AS count,
              count(*) FILTER (WHERE source_ref IS NULL OR source_ref = '')::int AS missing_source_refs,
              count(*) FILTER (WHERE task_status <> 'OPEN')::int AS non_open,
              count(*) FILTER (WHERE identity_status = 'AMBIGUOUS')::int AS ambiguous
       FROM public.openspec_task_source_index_v1 WHERE snapshot_id = $1`,
      [plan.snapshotId],
    );
    const observed = rows.rows[0];
    if (observed.count !== sourceCount || observed.missing_source_refs || observed.non_open) throw new Error('IN_TRANSACTION_READBACK_MISMATCH');
    const transactionalReadback = await client.query(
      `SELECT source_ref, change_id, source_line, task_text, task_hash, task_status,
              identity_status, canonical_task_key_candidate, archived
       FROM public.openspec_task_source_index_v1 WHERE snapshot_id = $1 ORDER BY source_ref COLLATE "C"`,
      [plan.snapshotId],
    );
    if (canonicalJson(transactionalReadback.rows) !== canonicalJson(expectedReadback)) {
      throw new Error('IN_TRANSACTION_ROW_MANIFEST_MISMATCH');
    }
    await client.query('COMMIT');
    const independent = await pool.query(
      `SELECT source_ref, change_id, source_line, task_text, task_hash, task_status,
              identity_status, canonical_task_key_candidate, archived
       FROM public.openspec_task_source_index_v1 WHERE snapshot_id = $1 ORDER BY source_ref COLLATE "C"`,
      [plan.snapshotId],
    );
    if (canonicalJson(independent.rows) !== canonicalJson(expectedReadback)) throw new Error('POST_COMMIT_READBACK_PARITY_FAILED');
    report.mode = 'APPLIED_WITH_POST_COMMIT_READBACK';
    report.status = 'SOURCE_INDEX_READBACK_PROVEN';
    report.writesPerformed = true;
    report.postCommitReadback = {
      rows: independent.rowCount,
      rowManifestChecksum: plan.rowManifestChecksum,
      ambiguousRowsRetainedAsAmbiguous: observed.ambiguous,
      canonicalTaskPromotionCount: 0,
      executableKanbanWrites: 0,
    };
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch {}
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

function parseArgs(args) {
  const parsed = { input: null, output: DEFAULT_OUTPUT, apply: false, expectedSnapshot: null };
  for (const arg of args) {
    if (arg === '--apply') parsed.apply = true;
    else if (arg.startsWith('--input=')) parsed.input = path.resolve(ROOT, arg.slice('--input='.length));
    else if (arg.startsWith('--output=')) parsed.output = path.resolve(ROOT, arg.slice('--output='.length));
    else if (arg.startsWith('--expected-snapshot=')) parsed.expectedSnapshot = arg.slice('--expected-snapshot='.length);
    else throw new Error(`UNKNOWN_ARGUMENT:${arg}`);
  }
  if (!parsed.input) throw new Error('INPUT_CENSUS_REQUIRED');
  if (parsed.apply && !parsed.expectedSnapshot) throw new Error('APPLY_REQUIRES_EXPECTED_SNAPSHOT');
  return parsed;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const census = JSON.parse(fs.readFileSync(args.input, 'utf8'));
  const plan = buildSourceRows(census);
  if (args.apply && plan.snapshotId !== args.expectedSnapshot) throw new Error('EXPECTED_SNAPSHOT_MISMATCH');
  const report = buildReport(args.input, census, plan);
  if (args.apply) await applySnapshot(census, plan, report);
  fs.mkdirSync(path.dirname(args.output), { recursive: true });
  fs.writeFileSync(args.output, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({ status: report.status, mode: report.mode, sourceRowCount: report.sourceRowCount, invalidRowCount: report.invalidRowCount, snapshotId: report.workspaceSnapshot, writesPerformed: report.writesPerformed, output: relative(args.output) }, null, 2));
  if (report.status === 'BLOCKED_SOURCE_ROWS_INVALID' || report.status === 'BLOCKED_SOURCE_ROW_CAP') process.exitCode = 2;
}

export { assertSnapshotSize, buildSourceRows, canonicalJson, validateCensusChecksum };

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
