import pg from 'pg';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '../..');
const DATABASE_URL = process.env.DATABASE_URL?.trim()
  ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const admissionPath = resolve(ROOT, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const reportPath = resolve(ROOT, 'docs/reports/graphify-snapshot-native-readback-v1.json');

type SnapshotSource = {
  repositoryId: string;
  repositoryRelativePath: string;
  sourceRef: string;
  sourceRevision: string;
  contentDigest: string;
  byteLength: number;
};

function identity(repositoryId: string, repositoryRelativePath: string): string {
  return `${repositoryId}:${repositoryRelativePath.replaceAll('\\', '/')}`;
}

async function main() {
  const admission = JSON.parse(await readFile(admissionPath, 'utf8')) as {
    authority?: boolean;
    status?: string;
    workspaceRevision?: string;
    snapshotRevision?: string;
  };
  const snapshotPath = resolve(ROOT, 'docs/reports/workspace-source-snapshots', `${String(admission.snapshotRevision ?? '').replace(/^sha256:/, '')}.json`);
  const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as { sources?: SnapshotSource[] };
  const sources = snapshot.sources ?? [];
  const blockers: string[] = [];
  if (admission.authority !== true || admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED') blockers.push('SNAPSHOT_ADMISSION_NOT_ACTIVE');
  if (!admission.workspaceRevision || !admission.snapshotRevision) blockers.push('SNAPSHOT_ADMISSION_REVISION_MISSING');

  const pool = new pg.Pool({ connectionString: DATABASE_URL, max: 1 });
  let execution: Record<string, unknown> | undefined;
  let members: Array<Record<string, unknown>> = [];
  try {
    const executions = await pool.query(
      `SELECT execution_id, workspace_revision, status, started_at, completed_at
         FROM public.graphify_executions
        WHERE workspace_revision = $1 AND status IN ('COMPLETED', 'COMPLETED_REUSED')
        ORDER BY completed_at DESC NULLS LAST, execution_id DESC
        LIMIT 2`,
      [admission.workspaceRevision ?? null],
    );
    if (executions.rows.length !== 1) {
      if (executions.rows.length === 0) blockers.push('NO_TERMINAL_EXECUTION_MATCHES_ADMITTED_SNAPSHOT');
      else blockers.push('MULTIPLE_TERMINAL_EXECUTIONS_MATCH_ADMITTED_SNAPSHOT');
    } else {
      execution = executions.rows[0];
      const result = await pool.query(
        `SELECT execution_id, repository_id, repository_relative_path, source_ref,
                workspace_revision, code_source_revision, content_hash, byte_length
           FROM public.graphify_execution_file_membership_v2
          WHERE execution_id = $1`,
        [execution.execution_id],
      );
      members = result.rows;
    }
  } finally {
    await pool.end();
  }

  const expected = new Map(sources.map((source) => [identity(source.repositoryId, source.repositoryRelativePath), source]));
  const actual = new Map<string, Record<string, unknown>>();
  const duplicateKeys: string[] = [];
  for (const member of members) {
    const key = identity(String(member.repository_id), String(member.repository_relative_path));
    if (actual.has(key)) duplicateKeys.push(key);
    actual.set(key, member);
  }
  const missing = [...expected.keys()].filter((key) => !actual.has(key));
  const unexpected = [...actual.keys()].filter((key) => !expected.has(key));
  const sourceRevisionMismatches: string[] = [];
  const contentChecksumMismatches: string[] = [];
  const byteLengthMismatches: string[] = [];
  const workspaceRevisionMismatches: string[] = [];
  for (const [key, source] of expected) {
    const member = actual.get(key);
    if (!member) continue;
    if (member.source_ref !== source.sourceRef) sourceRevisionMismatches.push(`${key}:source_ref`);
    if (member.code_source_revision !== source.sourceRevision) sourceRevisionMismatches.push(key);
    if (String(member.content_hash).replace(/^sha256:/, '') !== source.contentDigest.replace(/^sha256:/, '')) contentChecksumMismatches.push(key);
    if (Number(member.byte_length) !== source.byteLength) byteLengthMismatches.push(key);
    if (member.workspace_revision !== admission.workspaceRevision) workspaceRevisionMismatches.push(key);
  }
  if (duplicateKeys.length) blockers.push('DUPLICATE_REPOSITORY_QUALIFIED_MEMBERSHIP');
  if (missing.length) blockers.push('SNAPSHOT_MEMBERSHIP_MISSING');
  if (unexpected.length) blockers.push('SNAPSHOT_MEMBERSHIP_UNEXPECTED');
  if (sourceRevisionMismatches.length) blockers.push('SOURCE_REVISION_MISMATCH');
  if (contentChecksumMismatches.length) blockers.push('CONTENT_CHECKSUM_MISMATCH');
  if (byteLengthMismatches.length) blockers.push('BYTE_LENGTH_MISMATCH');
  if (workspaceRevisionMismatches.length) blockers.push('WORKSPACE_REVISION_MISMATCH');

  const report = {
    schema: 'atlas.graphify-snapshot-native-readback.v1',
    gate: 'GRAPHIFY-SNAPSHOT-BINDING-READBACK-01',
    mode: 'READ_ONLY',
    status: blockers.length === 0 ? 'SNAPSHOT_NATIVE_READBACK_PROVEN' : 'SNAPSHOT_NATIVE_READBACK_BLOCKED',
    proofLevel: blockers.length === 0 ? 'LIVE_PROVEN' : 'PARTIAL_PROVEN',
    authority: false,
    writesPerformed: false,
    workspaceRevision: admission.workspaceRevision ?? null,
    snapshotRevision: admission.snapshotRevision ?? null,
    executionId: execution?.execution_id ?? null,
    terminalStatus: execution?.status ?? null,
    selectedSourceCount: sources.length,
    membershipV2Count: members.length,
    repositoryCount: new Set(sources.map((source) => source.repositoryId)).size,
    duplicateMembershipKeys: duplicateKeys.slice(0, 100),
    duplicateMembershipKeyCount: duplicateKeys.length,
    missingMemberships: missing.slice(0, 100),
    missingMembershipCount: missing.length,
    unexpectedMemberships: unexpected.slice(0, 100),
    unexpectedMembershipCount: unexpected.length,
    sourceRevisionMismatches: sourceRevisionMismatches.slice(0, 100),
    sourceRevisionMismatchCount: sourceRevisionMismatches.length,
    contentChecksumMismatches: contentChecksumMismatches.slice(0, 100),
    contentChecksumMismatchCount: contentChecksumMismatches.length,
    byteLengthMismatches: byteLengthMismatches.slice(0, 100),
    byteLengthMismatchCount: byteLengthMismatches.length,
    workspaceRevisionMismatches: workspaceRevisionMismatches.slice(0, 100),
    workspaceRevisionMismatchCount: workspaceRevisionMismatches.length,
    blockers: [...new Set(blockers)],
    nextGate: blockers.length === 0 ? 'CURRENT-STRUCTURAL-LINEAGE-01' : 'GRAPHIFY-POST-PHASE16-TERMINAL-RUN-01',
  };
  await mkdir(resolve(ROOT, 'docs/reports'), { recursive: true });
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify({
    schema: report.schema,
    gate: report.gate,
    status: report.status,
    proofLevel: report.proofLevel,
    executionId: report.executionId,
    selectedSourceCount: report.selectedSourceCount,
    membershipV2Count: report.membershipV2Count,
    missingMembershipCount: report.missingMembershipCount,
    blockers: report.blockers,
    reportPath,
  }));
  if (blockers.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error(`GRAPHIFY_SNAPSHOT_NATIVE_READBACK_FAILED: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});
