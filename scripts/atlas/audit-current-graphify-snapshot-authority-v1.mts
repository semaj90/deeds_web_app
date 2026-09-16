import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';

const root = process.cwd();
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const producerRevision = 'atlas.current-graphify-snapshot-authority.v1';
const authorityPath = resolve(root, 'docs/reports/current-graphify-snapshot-authority-v1.json');
const selectionPath = resolve(root, 'docs/reports/current-source-selection-input-v1.json');
const admissionPath = resolve(root, 'docs/reports/workspace-revision-tournament-admission-v1.json');
const ownerPlanPath = resolve(root, 'docs/reports/current-graphify-execution-owner-resolution-v1.json');
const ownerPreflightPath = resolve(root, 'docs/reports/selected-graphify-execution-owner-v1.json');
const executionIdArgIndex = process.argv.indexOf('--execution-id');
const requestedExecutionId = executionIdArgIndex >= 0
  ? process.argv[executionIdArgIndex + 1]?.trim() || null
  : null;

const digest = (value: string) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const objectDigest = (value: unknown) => digest(JSON.stringify(value));
const stableSourceRefChecksum = (refs: string[]) => digest([...refs].sort().join(''));
const admission = JSON.parse(await readFile(admissionPath, 'utf8')) as {
  status?: string;
  authority?: boolean;
  workspaceRevision?: string;
  snapshotRevision?: string;
  manifestPath?: string;
};
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true) {
  throw new Error('ADMITTED_WORKSPACE_REVISION_REQUIRED');
}
const admittedWorkspaceRevision = admission.workspaceRevision;
if (!/^sha256:[0-9a-f]{64}$/i.test(admittedWorkspaceRevision ?? '')) {
  throw new Error('ADMITTED_WORKSPACE_REVISION_INVALID');
}
const snapshotManifestPath = resolve(root, process.env.ATLAS_SNAPSHOT_MANIFEST?.trim() || admission.manifestPath || '');
if (!snapshotManifestPath || snapshotManifestPath === root) throw new Error('ADMITTED_SNAPSHOT_MANIFEST_REQUIRED');
const snapshot = JSON.parse(await readFile(snapshotManifestPath, 'utf8')) as {
  schema?: string;
  snapshotRevision?: string;
  workspaceRevision?: string | null;
  workspaceId?: string;
  sourceMembershipChecksum?: string;
  sourceContentChecksum?: string;
  status?: string;
  canonicalAuthority?: boolean;
  datastoreWritesPerformed?: boolean;
  violations?: string[];
  sources?: Array<{
    sourceRef?: string;
    sourceIdentityKey?: string;
    sourceRevision?: string;
    contentDigest?: string;
    byteLength?: number;
  }>;
};
if (snapshot.schema !== 'atlas.workspace-source-snapshot-capture.v1'
  || snapshot.snapshotRevision !== admission.snapshotRevision
  || snapshot.status !== 'CAPTURE_VERIFIED_REQUIRES_PROCESSING_READBACK'
  || snapshot.canonicalAuthority !== false
  || snapshot.datastoreWritesPerformed !== false
  || (snapshot.violations?.length ?? 0) > 0
  || !Array.isArray(snapshot.sources)
  || objectDigest((({ schema: _schema, snapshotRevision: _revision, workspaceRevision: _workspaceRevision, status: _status, canonicalAuthority: _authority, datastoreWritesPerformed: _writes, ...body }) => body)(snapshot)) !== snapshot.snapshotRevision) {
  throw new Error('ADMITTED_SNAPSHOT_MANIFEST_INVALID');
}
const snapshotSources = snapshot.sources;
const workspace = {
  workspaceId: snapshot.workspaceId ?? null,
  sourceCount: snapshotSources.length,
  sourceManifestDigest: snapshot.sourceContentChecksum ?? null,
  checksum: snapshot.snapshotRevision ?? null,
};
const bindingByRef = new Map(snapshotSources.map((source) => [String(source.sourceRef), source]));
if (bindingByRef.size !== snapshotSources.length) throw new Error('ADMITTED_SNAPSHOT_SOURCE_REF_AMBIGUOUS');
const snapshotSourceRefChecksum = stableSourceRefChecksum(snapshotSources.map((source) => String(source.sourceRef)));
// The Graphify SOURCE_SELECTION stage records the historical identity-set
// checksum as a sorted concatenation (not the JSON-array checksum used by the
// sealed snapshot's sourceMembershipChecksum field). Keep both forms explicit
// so a stage checksum is compared with the representation it actually owns.
const snapshotIdentityChecksum = digest(snapshotSources.map((source) => String(source.sourceIdentityKey)).sort().join(''));
const snapshotContentChecksum = objectDigest(snapshotSources.map((source) => [
  source.sourceIdentityKey,
  source.sourceRevision,
  source.byteLength,
]));

let ownerSelection: {
  requestedExecutionId: string;
  preflightStatus: string;
  ownerPlanChecksum: string;
  validated: boolean;
  reason: string | null;
} | null = null;
if (requestedExecutionId) {
  const ownerPlan = JSON.parse(await readFile(ownerPlanPath, 'utf8')) as Record<string, unknown>;
  const ownerPlanForChecksum = { ...ownerPlan };
  delete ownerPlanForChecksum.generatedAt;
  delete ownerPlanForChecksum.reportPath;
  const currentOwnerPlanChecksum = digest(JSON.stringify(ownerPlanForChecksum));
  const preflight = JSON.parse(await readFile(ownerPreflightPath, 'utf8')) as {
    selectedExecutionId?: string;
    status?: string;
    ownerPlanChecksum?: string;
    candidateFound?: boolean;
    candidate?: { sourceMembershipExact?: boolean };
    writesPerformed?: boolean;
    canonicalAuthority?: boolean;
  };
  const validated = preflight.selectedExecutionId === requestedExecutionId
    && preflight.status === 'OWNER_SELECTION_VALIDATED_NOT_APPLIED'
    && preflight.ownerPlanChecksum === currentOwnerPlanChecksum
    && preflight.candidateFound === true
    && preflight.candidate?.sourceMembershipExact === true
    && preflight.writesPerformed === false
    && preflight.canonicalAuthority === false;
  ownerSelection = {
    requestedExecutionId,
    preflightStatus: preflight.status ?? 'UNKNOWN',
    ownerPlanChecksum: currentOwnerPlanChecksum,
    validated,
    reason: validated ? null : 'OWNER_PREFLIGHT_MISSING_OR_STALE',
  };
  if (!validated) throw new Error('SELECTED_GRAPHIFY_OWNER_PREFLIGHT_REQUIRED');
}

const client = new Client({ connectionString: databaseUrl, statement_timeout: 30_000 });
const authorityCandidates: Array<Record<string, unknown>> = [];
let workspaceId: string | null = process.env.ATLAS_WORKSPACE_ID?.trim() || null;

try {
  await client.connect();
  if (!workspaceId) {
    const workspaceResult = await client.query('SELECT id::text AS id FROM public.workspaces ORDER BY id LIMIT 1');
    workspaceId = (workspaceResult.rows[0]?.id as string | undefined) ?? null;
  }

  if (workspaceId) {
    const executions = await client.query(
      `SELECT execution_id::text, workspace_id::text, workspace_revision, status,
              canonical_authority, started_at, completed_at, trigger_kind
         FROM public.graphify_executions
        WHERE workspace_id = $1
          AND workspace_revision = $2
          AND status IN ('COMPLETED', 'COMPLETED_REUSED')
        ORDER BY execution_id`,
      [workspaceId, admittedWorkspaceRevision],
    );

    for (const execution of executions.rows) {
      const stageResult = await client.query(
        `SELECT status, output_checksum, receipt_ref
           FROM public.graphify_execution_stages
          WHERE execution_id = $1 AND stage = 'SOURCE_SELECTION'`,
        [execution.execution_id],
      );
      const stage = stageResult.rows[0] ?? null;
      const v2MembersResult = await client.query(
        `SELECT source_ref, workspace_revision, code_source_revision, content_hash, byte_length
           FROM public.graphify_execution_file_membership_v2
          WHERE execution_id = $1
          ORDER BY source_ref`,
        [execution.execution_id],
      ).catch(() => ({ rows: [] as Array<Record<string, unknown>> }));
      const membershipSource = v2MembersResult.rows.length > 0
        ? 'GRAPHIFY_EXECUTION_FILE_MEMBERSHIP_V2'
        : 'GRAPHIFY_EXECUTION_FILES_LEGACY_BRIDGE';
      const membersResult = v2MembersResult.rows.length > 0
        ? v2MembersResult
        : await client.query(
          `SELECT source_ref, workspace_revision, code_source_revision, content_hash, byte_length
             FROM public.graphify_execution_files
            WHERE execution_id = $1
            ORDER BY source_ref`,
          [execution.execution_id],
        );
      const members = membersResult.rows;
      const sourceRefSetChecksum = stableSourceRefChecksum(members.map((row) => String(row.source_ref)));
      const workspaceRevisionMatches = members.every((row) => row.workspace_revision === admittedWorkspaceRevision);
      const sourceCountMatches = members.length === workspace.sourceCount;
      const sourceBindingsMatch = members.every((row) => {
        const binding = bindingByRef.get(String(row.source_ref));
        return Boolean(binding)
          && row.code_source_revision === binding.sourceRevision
          && String(row.content_hash).replace(/^sha256:/, '') === String(binding.contentDigest)
          && Number(row.byte_length) === binding.byteLength;
      });
      const sourceRefSetChecksumMatches = sourceRefSetChecksum === snapshotSourceRefChecksum;
      const sourceIdentitySetChecksumMatches = stage?.output_checksum === snapshotIdentityChecksum;
      // The sealed snapshot's content checksum follows its source-ref order.
      // Reuse that exact order rather than sorting the execution rows by a
      // different identity key; otherwise an equivalent multi-repository
      // membership can appear changed solely because the serialization order
      // differs.
      const executionByRef = new Map<string, { code_source_revision?: unknown; byte_length?: unknown }>(
        members.map((row) => [String(row.source_ref), row] as const),
      );
      const executionContentChecksum = objectDigest(snapshotSources.map((binding) => {
        const row = executionByRef.get(String(binding.sourceRef));
        return [binding.sourceIdentityKey, row?.code_source_revision, Number(row?.byte_length)];
      }));
      const snapshotContentChecksumMatches = executionContentChecksum === snapshotContentChecksum;
      const selectionPolicyIsNonCanary = typeof stage?.receipt_ref === 'string'
        && !/canary|bounded/i.test(stage.receipt_ref);
      const eligible = stage?.status === 'COMPLETED'
        && Boolean(stage.output_checksum)
        && Boolean(stage.receipt_ref)
        && selectionPolicyIsNonCanary
        && workspaceRevisionMatches
        && sourceCountMatches
        && sourceBindingsMatch
        && sourceRefSetChecksumMatches
        && sourceIdentitySetChecksumMatches
        && snapshotContentChecksumMatches;
      authorityCandidates.push({
        executionId: execution.execution_id,
        membershipSource,
        status: execution.status,
        canonicalAuthority: execution.canonical_authority,
        triggerKind: execution.trigger_kind,
        sourceSelectionStatus: stage?.status ?? null,
        selectionPolicyRevision: stage?.receipt_ref ?? null,
        selectionPolicyIsNonCanary,
        sourceSelectionOutputChecksum: stage?.output_checksum ?? null,
        sourceRefSetChecksum,
        snapshotSourceRefChecksum,
        sourceIdentitySetChecksum: snapshotIdentityChecksum,
        executionContentChecksum,
        snapshotContentChecksum,
        sourceCount: members.length,
        expectedSourceCount: workspace.sourceCount,
        workspaceRevisionMatches,
        sourceCountMatches,
        sourceBindingsMatch,
        sourceRefSetChecksumMatches,
        sourceIdentitySetChecksumMatches,
        snapshotContentChecksumMatches,
        eligible,
        members,
      });
    }
  }
} finally {
  await client.end().catch(() => undefined);
}

const eligible = authorityCandidates.filter((candidate) => candidate.eligible === true);
const selected = requestedExecutionId
  ? eligible.find((candidate) => candidate.executionId === requestedExecutionId) ?? null
  : eligible.length === 1 ? eligible[0] : null;
let sourceStatus = 'CURRENT_WORKSPACE_NOT_GRAPHIFIED';
if (!workspaceId) sourceStatus = 'NO_WORKSPACE_ID';
else if (requestedExecutionId && !selected) sourceStatus = 'SELECTED_EXECUTION_NOT_CURRENT_SNAPSHOT_PROVEN';
else if (authorityCandidates.length === 0) sourceStatus = 'NO_TERMINAL_EXECUTION_FOR_CURRENT_WORKSPACE';
else if (!requestedExecutionId && eligible.length > 1) sourceStatus = 'AMBIGUOUS_QUALIFYING_EXECUTIONS';
else if (selected) sourceStatus = 'CURRENT_SNAPSHOT_PROVEN';
else if (authorityCandidates.some((candidate) => candidate.sourceSelectionStatus !== 'COMPLETED' || candidate.selectionPolicyIsNonCanary === false)) sourceStatus = 'SOURCE_SELECTION_INCOMPLETE';
else if (authorityCandidates.some((candidate) => candidate.sourceCountMatches === false)) sourceStatus = 'SOURCE_COUNT_MISMATCH';
else if (authorityCandidates.some((candidate) => candidate.sourceRefSetChecksumMatches === false || candidate.sourceIdentitySetChecksumMatches === false)) sourceStatus = 'SOURCE_SET_CHECKSUM_MISMATCH';
else if (authorityCandidates.some((candidate) => candidate.sourceBindingsMatch === false)) sourceStatus = 'SOURCE_BINDING_MISMATCH';
else if (authorityCandidates.some((candidate) => candidate.snapshotContentChecksumMatches === false)) sourceStatus = 'SNAPSHOT_CONTENT_CHECKSUM_MISMATCH';

const authorityReport = {
  schema: 'atlas.current-graphify-snapshot-authority.v1',
  status: sourceStatus,
  sourceSnapshot: {
    workspaceId,
    workspaceRevision: admittedWorkspaceRevision,
    sourceManifestDigest: workspace.sourceManifestDigest,
    sourceCount: workspace.sourceCount,
    sourceManifestChecksum: workspace.checksum,
    workspaceRevisionRecordChecksum: workspace.checksum,
    snapshotManifestPath,
    snapshotRevision: snapshot.snapshotRevision,
    snapshotSourceMembershipChecksum: snapshot.sourceMembershipChecksum,
    snapshotSourceContentChecksum: snapshot.sourceContentChecksum,
    observedAt: new Date().toISOString(),
  },
  qualifyingExecutionIds: eligible.map((candidate) => candidate.executionId),
  ownerSelection,
  candidates: authorityCandidates.map(({ members: _members, ...candidate }) => candidate),
  graphSnapshot: {
    status: authorityCandidates.some((candidate) => candidate.canonicalAuthority === true)
      ? 'GRAPH_CANONICAL_AUTHORITY_PROVEN'
      : 'GRAPH_CANONICAL_AUTHORITY_UNPROVEN',
    canonicalAuthorityTrueExecutions: authorityCandidates.filter((candidate) => candidate.canonicalAuthority === true).length,
  },
  canonicalAuthority: false,
  readOnly: true,
  writesPerformed: false,
  producerRevision,
};

const selectionReport = {
  schema: 'atlas.current-source-selection-input.v1',
  status: selected ? 'CURRENT_SNAPSHOT_PROVEN' : 'NOT_EMITTED_SNAPSHOT_NOT_PROVEN',
  executionId: selected?.executionId ?? null,
  ownerSelection,
  workspaceId,
  workspaceRevision: admittedWorkspaceRevision,
  workspaceRevisionRecordChecksum: workspace.checksum,
  snapshotManifestPath,
  snapshotRevision: snapshot.snapshotRevision,
  selectionPolicyRevision: selected?.selectionPolicyRevision ?? null,
  sourceRefSetChecksum: selected?.sourceRefSetChecksum ?? null,
  sourceCount: selected?.sourceCount ?? 0,
  bindings: selected?.members ?? [],
  canonicalAuthority: false,
  readOnly: true,
  writesPerformed: false,
  downstreamPlannerInput: selected ? 'existing source registry reconciliation planner' : null,
};

await mkdir(resolve(root, 'docs/reports'), { recursive: true });
const authorityTempPath = `${authorityPath}.${process.pid}.tmp`;
const selectionTempPath = `${selectionPath}.${process.pid}.tmp`;
await writeFile(authorityTempPath, `${JSON.stringify(authorityReport, null, 2)}\n`, 'utf8');
await writeFile(selectionTempPath, `${JSON.stringify(selectionReport, null, 2)}\n`, 'utf8');
await rename(authorityTempPath, authorityPath);
await rename(selectionTempPath, selectionPath);
console.log(JSON.stringify({ status: sourceStatus, workspaceRevision: admittedWorkspaceRevision, workspaceId, qualifyingExecutions: eligible.length, reports: [authorityPath, selectionPath] }, null, 2));
if (sourceStatus !== 'CURRENT_SNAPSHOT_PROVEN') process.exitCode = 3;
