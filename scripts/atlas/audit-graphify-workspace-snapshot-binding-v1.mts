#!/usr/bin/env node

/**
 * Read-only comparison of a sealed WorkspaceSnapshotV1 with Graphify's
 * durable execution ledger. This is deliberately an observation gate: it
 * never assigns workspaceRevision and never admits a Graphify execution.
 */
import { mkdir, readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { dirname, extname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadRepoEnv, resolveDatabaseUrl } from './connection-config.mjs';
import { validateSnapshot } from './lib/workspace-snapshot-capture-v1.mts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const REPORT = resolve(ROOT, 'docs/reports/graphify-workspace-snapshot-binding-v1.json');
const normalize = (value: unknown) => String(value ?? '').replaceAll('\\', '/').replace(/^\.\//, '').replace(/^\/+/, '').trim();
const digest = (values: string[]) => JSON.stringify(values.slice().sort());
const checksum = (values: string[]) => `sha256:${createHash('sha256').update(digest(values), 'utf8').digest('hex')}`;

function arg(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function latestManifest() {
  const directory = resolve(ROOT, 'docs/reports/workspace-source-snapshots');
  const names = (await readdir(directory)).filter((name) => extname(name) === '.json');
  const entries = await Promise.all(names.map(async (name) => ({ name, mtime: (await stat(resolve(directory, name))).mtimeMs })));
  const latest = entries.sort((a, b) => b.mtime - a.mtime)[0];
  if (!latest) throw new Error('NO_WORKSPACE_SNAPSHOT_MANIFEST');
  return resolve(directory, latest.name);
}

const manifestPath = resolve(ROOT, arg('--manifest') ?? process.argv[2] ?? await latestManifest());
const workspaceId = arg('--workspace-id') ?? process.env.ATLAS_WORKSPACE_ID?.trim() ?? null;
const snapshot = JSON.parse(await readFile(manifestPath, 'utf8'));
const snapshotReadback = validateSnapshot(snapshot);
const snapshotSources = Array.isArray(snapshot.sources) ? snapshot.sources : [];
const field = (value: any, camel: string, snake: string) => value?.[camel] ?? value?.[snake] ?? null;
const identityKey = (value: any) => {
  const repositoryId = field(value, 'repositoryId', 'repository_id');
  const repositoryRelativePath = field(value, 'repositoryRelativePath', 'repository_relative_path');
  const sourceRef = field(value, 'sourceRef', 'source_ref');
  return repositoryId && repositoryRelativePath
    ? `${normalize(repositoryId)}:${normalize(repositoryRelativePath)}`
    : `repo:root:${normalize(sourceRef)}`;
};
const snapshotByRef = new Map(snapshotSources.map((source: any) => [identityKey(source), source]));

const pool = new pg.Pool({ connectionString: resolveDatabaseUrl(loadRepoEnv(process.env)), max: 1, statement_timeout: 120000 });
let databaseError: string | null = null;
let schema: Record<string, string[]> = {};
let executions: any[] = [];
let filesByExecution = new Map<string, any[]>();
let stagesByExecution = new Map<string, any[]>();

try {
  const tableNames = ['graphify_executions', 'graphify_execution_files', 'graphify_execution_file_membership_v2', 'graphify_execution_stages'];
  const columns = await pool.query(
    `SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = ANY($1::text[])
      ORDER BY table_name, ordinal_position`,
    [tableNames],
  );
  for (const row of columns.rows) (schema[row.table_name] ??= []).push(row.column_name);

  if (!schema.graphify_executions?.length) throw new Error('GRAPHIFY_EXECUTIONS_TABLE_UNAVAILABLE');
  const executionColumns = ['execution_id', 'workspace_id', 'workspace_revision', 'status', 'started_at', 'completed_at', 'canonical_authority', 'trigger_kind']
    .filter((name) => schema.graphify_executions.includes(name));
  const executionResult = await pool.query(
    `SELECT ${executionColumns.map((name) => `"${name}"`).join(', ')}
       FROM public.graphify_executions
      WHERE ($1::uuid IS NULL OR workspace_id = $1::uuid)
        AND status IN ('COMPLETED', 'COMPLETED_REUSED')
      ORDER BY completed_at DESC NULLS LAST, execution_id`,
    [workspaceId],
  );
  executions = executionResult.rows;

  if (schema.graphify_execution_files?.length && schema.graphify_execution_files.includes('execution_id')) {
    const fileColumns = ['execution_id', 'source_ref', 'workspace_revision', 'code_source_revision', 'source_revision', 'content_hash', 'byte_length']
      .filter((name) => schema.graphify_execution_files.includes(name));
    const result = await pool.query(`SELECT ${fileColumns.map((name) => `"${name}"`).join(', ')} FROM public.graphify_execution_files WHERE execution_id = ANY($1::uuid[])`, [executions.map((row) => row.execution_id)]);
    for (const row of result.rows) {
      const key = String(row.execution_id);
      const list = filesByExecution.get(key) ?? [];
      list.push(row);
      filesByExecution.set(key, list);
    }
  }
  if (schema.graphify_execution_file_membership_v2?.length && schema.graphify_execution_file_membership_v2.includes('execution_id')) {
    const v2Columns = ['execution_id', 'repository_id', 'repository_relative_path', 'source_ref', 'workspace_revision', 'code_source_revision', 'content_hash', 'byte_length']
      .filter((name) => schema.graphify_execution_file_membership_v2.includes(name));
    const result = await pool.query(`SELECT ${v2Columns.map((name) => `"${name}"`).join(', ')} FROM public.graphify_execution_file_membership_v2 WHERE execution_id = ANY($1::uuid[])`, [executions.map((row) => row.execution_id)]);
    for (const row of result.rows) {
      const key = String(row.execution_id);
      const list = filesByExecution.get(key) ?? [];
      list.push(row);
      filesByExecution.set(key, list);
    }
  }
  if (schema.graphify_execution_stages?.length && schema.graphify_execution_stages.includes('execution_id')) {
    const stageColumns = ['execution_id', 'stage', 'status', 'output_checksum', 'receipt_ref']
      .filter((name) => schema.graphify_execution_stages.includes(name));
    const result = await pool.query(`SELECT ${stageColumns.map((name) => `"${name}"`).join(', ')} FROM public.graphify_execution_stages WHERE execution_id = ANY($1::uuid[])`, [executions.map((row) => row.execution_id)]);
    for (const row of result.rows) {
      const key = String(row.execution_id);
      const list = stagesByExecution.get(key) ?? [];
      list.push(row);
      stagesByExecution.set(key, list);
    }
  }
} catch (error) {
  databaseError = error instanceof Error ? error.message : String(error);
} finally {
  await pool.end();
}

function compareExecution(execution: any) {
  const executionId = String(execution.execution_id);
  const rows = filesByExecution.get(executionId) ?? [];
  const graphifyByRef = new Map(rows.map((row) => [identityKey(row), row]));
  const missingInGraphify = [...snapshotByRef.keys()].filter((ref) => !graphifyByRef.has(ref));
  const missingInSnapshot = [...graphifyByRef.keys()].filter((ref) => !snapshotByRef.has(ref));
  const sourceRevisionMismatches: string[] = [];
  const contentDigestMismatches: string[] = [];
  const workspaceRevisionMismatches: string[] = [];
  for (const [ref, source] of snapshotByRef) {
    const row = graphifyByRef.get(ref);
    if (!row) continue;
    const graphifyRevision = field(row, 'codeSourceRevision', 'code_source_revision')
      ?? field(row, 'sourceRevision', 'source_revision') ?? null;
    if (graphifyRevision && graphifyRevision !== source.sourceRevision) sourceRevisionMismatches.push(ref);
    const contentHash = field(row, 'contentHash', 'content_hash');
    const graphifyDigest = contentHash ? String(contentHash).replace(/^sha256:/, '') : null;
    if (graphifyDigest && graphifyDigest !== source.contentDigest) contentDigestMismatches.push(ref);
    const rowWorkspaceRevision = field(row, 'workspaceRevision', 'workspace_revision');
    if (rowWorkspaceRevision !== null && rowWorkspaceRevision !== undefined
      && rowWorkspaceRevision !== execution.workspace_revision) workspaceRevisionMismatches.push(ref);
  }
  const refs = [...graphifyByRef.keys()];
  const stages = stagesByExecution.get(executionId) ?? [];
  const sourceStage = stages.find((stage) => stage.stage === 'SOURCE_SELECTION') ?? null;
  const graphifyMembershipChecksum = checksum(refs);
  const membershipMatches = graphifyMembershipChecksum === snapshot.sourceMembershipChecksum;
  return {
    executionId,
    status: execution.status ?? null,
    workspaceId: execution.workspace_id ?? null,
    workspaceRevision: execution.workspace_revision ?? null,
    completedAt: execution.completed_at ?? null,
    canonicalAuthority: execution.canonical_authority ?? null,
    sourceSelectionStage: sourceStage,
    sourceCount: rows.length,
    sourceCountMatches: rows.length === snapshotSources.length,
    graphifyMembershipChecksum,
    snapshotMembershipChecksum: snapshot.sourceMembershipChecksum ?? null,
    membershipMatches,
    missingInGraphify,
    missingInSnapshot,
    sourceRevisionMismatches,
    contentDigestMismatches,
    workspaceRevisionMismatches,
    sourceBytesComparable: rows.some((row) => field(row, 'contentHash', 'content_hash')
      || field(row, 'codeSourceRevision', 'code_source_revision')
      || field(row, 'sourceRevision', 'source_revision')),
    eligibleWithoutAdmission: rows.length === snapshotSources.length && membershipMatches && sourceRevisionMismatches.length === 0 && contentDigestMismatches.length === 0 && workspaceRevisionMismatches.length === 0,
  };
}

const comparisons = executions.map(compareExecution);
const matching = comparisons.filter((row) => row.eligibleWithoutAdmission);
const firstBlockingInvariant = databaseError
  ? 'GRAPHIFY_SCHEMA_OR_DATABASE_UNAVAILABLE'
  : snapshotReadback.status !== 'SNAPSHOT_BYTES_READBACK_PROVEN'
    ? 'SNAPSHOT_READBACK_NOT_PROVEN'
    : matching.length === 0
      ? 'NO_TERMINAL_GRAPHIFY_EXECUTION_MATCHES_SNAPSHOT'
      : matching.length > 1
        ? 'MULTIPLE_GRAPHIFY_EXECUTIONS_MATCH_SNAPSHOT'
        : comparisons[0]?.workspaceRevision === null
          ? 'GRAPHIFY_WORKSPACE_REVISION_UNBOUND'
          : 'WORKSPACE_REVISION_ADMISSION_REQUIRES_TOURNAMENT';
const status = databaseError
  ? 'GRAPHIFY_SNAPSHOT_BINDING_BLOCKED'
  : snapshotReadback.status !== 'SNAPSHOT_BYTES_READBACK_PROVEN'
    ? 'GRAPHIFY_SNAPSHOT_BINDING_BLOCKED_SNAPSHOT_READBACK'
    : matching.length === 1 && matching[0].workspaceRevision
      ? 'GRAPHIFY_SNAPSHOT_BINDING_OBSERVED_NOT_ADMITTED'
      : 'GRAPHIFY_SNAPSHOT_BINDING_BLOCKED';
const report = {
  schema: 'atlas.graphify-workspace-snapshot-binding.v1',
  generatedAt: new Date().toISOString(),
  mode: 'READ_ONLY',
  status,
  proofLevel: snapshotReadback.status === 'SNAPSHOT_BYTES_READBACK_PROVEN' ? 'PARTIAL_PROVEN' : 'BLOCKED',
  authority: false,
  workspaceRevision: null,
  writesPerformed: false,
  datastoreWritesPerformed: false,
  manifestPath,
  snapshotRevision: snapshot.snapshotRevision ?? null,
  snapshotReadback,
  workspaceId,
  schema,
  terminalExecutionCount: executions.length,
  comparisons,
  firstBlockingInvariant,
  nextGate: 'GRAPHIFY-SNAPSHOT-CONSUMPTION-AUTHORIZATION-01',
  safeNextCommand: 'npm run atlas:graphify:source-selection:plan',
  producerRevision: 'atlas.graphify-workspace-snapshot-binding.v1',
};
await mkdir(dirname(REPORT), { recursive: true });
await writeFile(REPORT, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ schema: report.schema, status, proofLevel: report.proofLevel, authority: false, workspaceRevision: null, terminalExecutionCount: executions.length, matchingExecutions: matching.length, firstBlockingInvariant, reportPath: REPORT }, null, 2));
if (status !== 'GRAPHIFY_SNAPSHOT_BINDING_OBSERVED_NOT_ADMITTED') process.exitCode = 3;
