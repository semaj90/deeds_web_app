import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { Client } from 'pg';
import { materializeWorkspaceRevisionOriginV1 } from '../../sveltekit-frontend/src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

const root = process.cwd();
const databaseUrl = process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const repositoryId = process.env.ATLAS_REPOSITORY_ID ?? 'semaj90/deeds_web_app';
const producerRevision = 'atlas.current-graphify-snapshot-authority.v1';
const authorityPath = resolve(root, 'docs/reports/current-graphify-snapshot-authority-v1.json');
const selectionPath = resolve(root, 'docs/reports/current-source-selection-input-v1.json');

const digest = (value: string) => `sha256:${createHash('sha256').update(value, 'utf8').digest('hex')}`;
const stableSourceRefChecksum = (refs: string[]) => digest([...refs].sort().join(''));
// Pairs source_ref with its content revision, not source_ref alone -- this is
// what independently detects drift between what the ledger recorded and what
// the live git tree actually contains today, even if the ledger's own
// workspace_revision string and self-referential output_checksum both agree
// with each other (a self-consistent-but-wrong ledger would pass those checks
// but fail this one).
const liveTreeChecksum = (entries: Array<{ sourceRef: string; sourceRevision: string }>) =>
  digest([...entries].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef)).map((e) => `${e.sourceRef}:${e.sourceRevision}`).join('\n'));

const origin = materializeWorkspaceRevisionOriginV1({
  workspaceRoot: root,
  repositoryId,
  producerRevision,
});
const workspace = origin.record;
const bindingByRef = new Map(origin.bindings.map((binding) => [binding.sourceRef, binding]));
const currentLiveTreeChecksum = liveTreeChecksum(origin.bindings.map((b) => ({ sourceRef: b.sourceRef, sourceRevision: b.sourceRevision })));

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
      [workspaceId, workspace.workspaceRevision],
    );

    for (const execution of executions.rows) {
      const stageResult = await client.query(
        `SELECT status, output_checksum, receipt_ref
           FROM public.graphify_execution_stages
          WHERE execution_id = $1 AND stage = 'SOURCE_SELECTION'`,
        [execution.execution_id],
      );
      const stage = stageResult.rows[0] ?? null;
      const membersResult = await client.query(
        `SELECT source_ref, workspace_revision, code_source_revision, content_hash, byte_length
           FROM public.graphify_execution_files
          WHERE execution_id = $1
          ORDER BY source_ref`,
        [execution.execution_id],
      );
      const members = membersResult.rows;
      const sourceRefSetChecksum = stableSourceRefChecksum(members.map((row) => String(row.source_ref)));
      const workspaceRevisionMatches = members.every((row) => row.workspace_revision === workspace.workspaceRevision);
      const sourceCountMatches = members.length === workspace.sourceCount;
      const sourceBindingsMatch = members.every((row) => {
        const binding = bindingByRef.get(String(row.source_ref));
        return Boolean(binding)
          && row.code_source_revision === binding.sourceRevision
          && String(row.content_hash).replace(/^sha256:/, '') === binding.contentDigest
          && Number(row.byte_length) === binding.byteLength;
      });
      const sourceRefSetChecksumMatches = stage?.output_checksum === sourceRefSetChecksum;
      // Independent cross-check against the live git tree (not merely the
      // ledger's own internal self-consistency) -- see liveTreeChecksum above.
      const ledgerLiveTreeChecksum = liveTreeChecksum(members.map((row) => ({ sourceRef: String(row.source_ref), sourceRevision: String(row.code_source_revision) })));
      const liveTreeChecksumMatches = ledgerLiveTreeChecksum === currentLiveTreeChecksum;
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
        && liveTreeChecksumMatches;
      authorityCandidates.push({
        executionId: execution.execution_id,
        status: execution.status,
        canonicalAuthority: execution.canonical_authority,
        triggerKind: execution.trigger_kind,
        sourceSelectionStatus: stage?.status ?? null,
        selectionPolicyRevision: stage?.receipt_ref ?? null,
        selectionPolicyIsNonCanary,
        sourceSelectionOutputChecksum: stage?.output_checksum ?? null,
        sourceRefSetChecksum,
        sourceCount: members.length,
        expectedSourceCount: workspace.sourceCount,
        workspaceRevisionMatches,
        sourceCountMatches,
        sourceBindingsMatch,
        sourceRefSetChecksumMatches,
        liveTreeChecksumMatches,
        eligible,
        members,
      });
    }
  }
} finally {
  await client.end().catch(() => undefined);
}

const eligible = authorityCandidates.filter((candidate) => candidate.eligible === true);
let sourceStatus = 'CURRENT_WORKSPACE_NOT_GRAPHIFIED';
if (!workspaceId) sourceStatus = 'NO_WORKSPACE_ID';
else if (authorityCandidates.length === 0) sourceStatus = 'NO_TERMINAL_EXECUTION_FOR_CURRENT_WORKSPACE';
else if (eligible.length > 1) sourceStatus = 'AMBIGUOUS_QUALIFYING_EXECUTIONS';
else if (eligible.length === 1) sourceStatus = 'CURRENT_SNAPSHOT_PROVEN';
else if (authorityCandidates.some((candidate) => candidate.sourceSelectionStatus !== 'COMPLETED' || candidate.selectionPolicyIsNonCanary === false)) sourceStatus = 'SOURCE_SELECTION_INCOMPLETE';
else if (authorityCandidates.some((candidate) => candidate.sourceCountMatches === false)) sourceStatus = 'SOURCE_COUNT_MISMATCH';
else if (authorityCandidates.some((candidate) => candidate.sourceRefSetChecksumMatches === false)) sourceStatus = 'SOURCE_SET_CHECKSUM_MISMATCH';
else if (authorityCandidates.some((candidate) => candidate.sourceBindingsMatch === false)) sourceStatus = 'SOURCE_BINDING_MISMATCH';
else if (authorityCandidates.some((candidate) => candidate.liveTreeChecksumMatches === false)) sourceStatus = 'LIVE_TREE_CHECKSUM_MISMATCH';

const selected = eligible.length === 1 ? eligible[0] : null;
const authorityReport = {
  schema: 'atlas.current-graphify-snapshot-authority.v1',
  status: sourceStatus,
  sourceSnapshot: {
    workspaceId,
    workspaceRevision: workspace.workspaceRevision,
    sourceManifestDigest: workspace.sourceManifestDigest,
    sourceCount: workspace.sourceCount,
    sourceManifestChecksum: workspace.checksum,
    workspaceRevisionRecordChecksum: workspace.checksum,
    workspaceOriginRuntimeRevision: origin.runtimeRevision,
    observedAt: new Date().toISOString(),
  },
  qualifyingExecutionIds: eligible.map((candidate) => candidate.executionId),
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
  workspaceId,
  workspaceRevision: workspace.workspaceRevision,
  workspaceRevisionRecordChecksum: workspace.checksum,
  workspaceOriginRuntimeRevision: origin.runtimeRevision,
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
await writeFile(authorityPath, `${JSON.stringify(authorityReport, null, 2)}\n`, 'utf8');
await writeFile(selectionPath, `${JSON.stringify(selectionReport, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ status: sourceStatus, workspaceRevision: workspace.workspaceRevision, workspaceId, qualifyingExecutions: eligible.length, reports: [authorityPath, selectionPath] }, null, 2));
if (sourceStatus !== 'CURRENT_SNAPSHOT_PROVEN') process.exitCode = 3;
