import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { mkdir, readFile } from 'node:fs/promises';
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import {
  adaptWorkspaceBindingsToSourceSelectionV1,
  adaptSealedSnapshotSourcesToRepositoryQualifiedMembershipV2,
  recordRepositoryQualifiedSourceSelectionStageV2,
  openExecution,
  recordInventoryStage,
  recordStructuralStage,
  completeExecution,
  acquireCoordinatorLock,
  releaseCoordinatorLock,
} from '../../src/lib/server/atlas/indexing/graphify-daily-coordinator-v1.js';
import {
  buildGraphifyStructuralStageReceiptsV1,
  compileGraphifyStructuralIntelligence,
} from '../../src/lib/server/atlas/indexing/graphify-structural-intelligence-adapter.js';
import { GraphifyStructuralMaterializer, create8095AstProvider } from '../../src/lib/server/atlas/indexing/graphify-structural-materializer.js';

loadAtlasEnv();
const DATABASE_URL = process.env.DATABASE_URL?.trim();
const WORKSPACE_ID = process.env.ATLAS_GRAPHIFY_CANARY_WORKSPACE_ID?.trim() ?? '';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const fullMode = process.argv.includes('--full');
if (fullMode) {
  // BLOCKED (2026-09-13, GRAPHIFY-STRUCTURAL-CODE-CANARY-02 finding): --full changes
  // SOURCE_SELECTION/INVENTORY membership to ALL snapshot sources (24,205+), but AST_PARSE/
  // STRUCTURAL_EXTRACT still only ever test ONE source (`structuralBinding = bindings.find(...)
  // ?? bindings[0]`, unchanged by --full). A --full run would mark `status: COMPLETED` after
  // structurally proving exactly 1/24,205 sources -- a large membership count labeled COMPLETED
  // with no corresponding structural proof, which is misleading, not a "full Graphify run".
  // Do not remove this block without first making structural materialization iterate every
  // selected source (or accepting a materially different, honestly-labeled completion contract).
  throw new Error(
    'GRAPHIFY_COORDINATOR_CANARY_FULL_MODE_BLOCKED: --full membership selection is real, but ' +
    'AST_PARSE/STRUCTURAL_EXTRACT still test only 1 source regardless of membership size -- a ' +
    '24k-membership run would falsely read as a proven full structural pass. Use --source-ref=<path> ' +
    '(GRAPHIFY-STRUCTURAL-CODE-CANARY-02, built 2026-09-13, see below) to target an explicit, ' +
    'sealed-snapshot code source instead until structural materialization is made to iterate the ' +
    'full selection.',
  );
}
const limitArg = process.argv.find((arg) => arg.startsWith('--limit='))?.slice('--limit='.length);
const requestedLimit = Number(limitArg ?? process.env.GRAPHIFY_CANARY_SOURCE_LIMIT ?? '3');
if (!fullMode && (!Number.isInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 50)) {
  throw new Error('GRAPHIFY_COORDINATOR_CANARY_LIMIT_MUST_BE_AN_INTEGER_FROM_1_TO_50');
}
const confirmation = fullMode
  ? 'AUTHORIZE_GRAPHIFY_FULL_WORKSPACE_SOURCE_SELECTION_V1'
  : requestedLimit === 50
  ? 'AUTHORIZE_GRAPHIFY_50_SOURCE_CANARY_V1'
  : 'AUTHORIZE_GRAPHIFY_COMMITTED_BOUNDED_CANARY_V1';

if (process.env.GRAPHIFY_COMMITTED_CANARY !== '1') {
  throw new Error('GRAPHIFY_COMMITTED_CANARY=1 is required for the bounded committed canary');
}
if (process.env.ATLAS_NON_PRODUCTION_DATABASE !== '1') {
  throw new Error('ATLAS_NON_PRODUCTION_DATABASE=1 is required for the bounded committed canary');
}
if (process.env.GRAPHIFY_COMMITTED_CANARY_CONFIRM !== confirmation) {
  throw new Error(`GRAPHIFY_COMMITTED_CANARY_CONFIRM=${confirmation} is required for the bounded committed canary`);
}
if (!DATABASE_URL) throw new Error('DATABASE_URL is required for the bounded committed canary');
if (!UUID_RE.test(WORKSPACE_ID)) throw new Error('ATLAS_GRAPHIFY_CANARY_WORKSPACE_ID must be an existing non-production workspace UUID');

const client = new Client({
  connectionString: DATABASE_URL,
});
const reportPath = resolve(process.cwd(), '..', 'docs', 'reports', 'graphify-daily-coordinator-canary-v1.json');
const workspaceRoot = resolve(process.cwd(), '..');
const admissionPath = resolve(workspaceRoot, 'docs', 'reports', 'workspace-revision-tournament-admission-v1.json');
const admission = JSON.parse(await readFile(admissionPath, 'utf8')) as {
  status?: string; authority?: boolean; workspaceRevision?: string; snapshotRevision?: string;
};
if (admission.status !== 'WORKSPACE_REVISION_TOURNAMENT_ADMITTED' || admission.authority !== true
  || typeof admission.workspaceRevision !== 'string') {
  throw new Error('GRAPHIFY_COORDINATOR_CANARY_WORKSPACE_REVISION_ADMISSION_REQUIRED');
}
const snapshotPath = resolve(workspaceRoot, 'docs', 'reports', 'workspace-source-snapshots', `${admission.snapshotRevision?.replace(/^sha256:/, '')}.json`);
const snapshot = JSON.parse(await readFile(snapshotPath, 'utf8')) as {
  snapshotRevision?: string;
  repositories?: Array<{ relativePath: string; head: string }>;
  sources?: Array<{ repositoryId: string; repositoryRelativePath: string; sourceRef: string; sourceRevision: string; contentDigest: string; byteLength: number }>;
};
if (snapshot.snapshotRevision !== admission.snapshotRevision || !Array.isArray(snapshot.sources) || !Array.isArray(snapshot.repositories)) {
  throw new Error('GRAPHIFY_COORDINATOR_CANARY_SEALED_SNAPSHOT_MISMATCH');
}
let locked = false;
let executionId: string | undefined;

try {
  await client.connect();
  await acquireCoordinatorLock(client);
  locked = true;

const workspaceRevision = admission.workspaceRevision;
const rootSources = snapshot.sources.filter((source) => source.repositoryId === 'repo:root');
const rootRepositoryHead = snapshot.repositories.find((repository) => repository.relativePath === '')?.head;
if (!rootRepositoryHead || !/^[0-9a-f]{40}$/i.test(rootRepositoryHead)) {
  throw new Error('GRAPHIFY_COORDINATOR_CANARY_ROOT_REPOSITORY_HEAD_MISSING');
}
// GRAPHIFY-STRUCTURAL-CODE-CANARY-02: first-class `--source-ref=<path>` CLI flag. Supersedes the
// ad hoc ATLAS_GRAPHIFY_CANARY_SOURCE_REFS env-var override used earlier this session -- that
// override is no longer read. Repeatable (pass --source-ref=<a> --source-ref=<b> ... for more
// than one). Every value is validated against the SEALED SNAPSHOT's real repo:root sources
// (`rootSources`, loaded from the admitted workspace-revision's snapshot file above) -- it is
// never treated as an arbitrary filesystem path, and never read from disk before that lookup
// succeeds. Structural materialization is TypeScript-compiler-based (AST_PARSE/STRUCTURAL_EXTRACT
// always run with `language: 'typescript'`), so each resolved source must also carry a code file
// extension; a markdown/json/text sourceRef reaching --source-ref is a caller error, not silently
// accepted and structurally no-op'd. The FIRST --source-ref value becomes the structural
// (AST_PARSE/STRUCTURAL_EXTRACT) sample, same as element [0] of the default slice would be. Never
// applies in --full mode (which is itself blocked above).
const CODE_SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs']);
const sourceRefArgs = process.argv
  .filter((arg) => arg.startsWith('--source-ref='))
  .map((arg) => arg.slice('--source-ref='.length).trim())
  .filter(Boolean);
const explicitSourceRefs = sourceRefArgs.length > 0 ? sourceRefArgs : null;
if (explicitSourceRefs && fullMode) {
  throw new Error('GRAPHIFY_COORDINATOR_CANARY_SOURCE_REF_NOT_VALID_WITH_FULL');
}
const selectedSnapshotSources = fullMode
  ? snapshot.sources
  : explicitSourceRefs
  ? explicitSourceRefs.map((ref) => {
      const found = rootSources.find((source) => source.sourceRef === ref);
      if (!found) throw new Error(`GRAPHIFY_COORDINATOR_CANARY_SOURCE_REF_NOT_FOUND_IN_SEALED_SNAPSHOT:${ref}`);
      const ext = ref.slice(ref.lastIndexOf('.')).toLowerCase();
      if (!CODE_SOURCE_EXTENSIONS.has(ext)) {
        throw new Error(`GRAPHIFY_COORDINATOR_CANARY_SOURCE_REF_NOT_A_CODE_SOURCE:${ref}`);
      }
      return found;
    })
  : rootSources.slice(0, requestedLimit);
  const expectedCount = selectedSnapshotSources.length;
  if (expectedCount === 0) throw new Error('GRAPHIFY_COORDINATOR_CANARY_NO_ROOT_SNAPSHOT_SOURCES');
  const selectedBindings = selectedSnapshotSources.map((source, index) => ({
    schema: 'atlas.workspace-source-binding.v1' as const,
    workspaceRevision,
    sourceRef: source.sourceRef,
    sourceRevision: source.sourceRevision,
    contentDigest: source.contentDigest,
    byteLength: source.byteLength,
    gitObjectFormat: 'sha1' as const,
    baseCommitOid: rootRepositoryHead,
    gitBlobOid: null,
    trackedAtBaseCommit: false,
    dirtyRelativeToBaseCommit: true,
    sourceManifestOrdinal: index,
    readOnlyObservation: true as const,
    canonicalAuthority: false as const,
    producerRevision: 'workspace-snapshot.v1',
    checksum: source.contentDigest,
  }));
  if (selectedBindings.length !== expectedCount) {
    throw new Error(`Expected ${expectedCount} qualified source bindings from fresh materialization, got ${selectedBindings.length}`);
  }
  const bindings = adaptWorkspaceBindingsToSourceSelectionV1(workspaceRevision, selectedBindings);
  const repositoryBindings = adaptSealedSnapshotSourcesToRepositoryQualifiedMembershipV2(
    workspaceRevision,
    selectedSnapshotSources,
  );

  const workspaceResult = await client.query('SELECT id FROM public.workspaces WHERE id = $1::uuid', [WORKSPACE_ID]);
  const workspaceId = workspaceResult.rows[0]?.id as string | undefined;
  if (!workspaceId) throw new Error('GRAPHIFY_COORDINATOR_CANARY_WORKSPACE_NOT_FOUND');

  const opened = await openExecution(client, {
    workspaceId,
    workspaceRevision,
    parserContractVersion: 'graphify.parser.v1',
    extractionContractVersion: 'graphify.extraction.v1',
    graphAlgorithmRevision: 'graphify.graph.v1',
    triggerKind: fullMode ? 'CURRENT_WORKSPACE_SOURCE_SELECTION' : 'BOUNDED_COMMITTED_CANARY',
    schedulerRevision: 'atlas.graphify-daily-coordinator.v1',
    environmentRevision: 'operator-authorized-canary',
  });
  executionId = opened.executionId;
  const selection = await recordRepositoryQualifiedSourceSelectionStageV2(client, executionId, workspaceRevision, repositoryBindings, {
    selectionPolicyRevision: fullMode ? 'graphify-current-workspace-source-selection:v1' : 'committed-canary-fresh-materialization-v1',
  });
  const orderedInventoryBindings = [...bindings].sort((a, b) => a.sourceRef.localeCompare(b.sourceRef));
  const inventoryOutputChecksum = `sha256:${createHash('sha256')
    .update(JSON.stringify(orderedInventoryBindings.map((binding) => ({
      sourceRef: binding.sourceRef,
      codeSourceRevision: binding.codeSourceRevision,
      contentHash: binding.contentHash,
      byteLength: binding.byteLength,
      workspaceRevision,
    }))))
    .digest('hex')}`;
  const inventory = await recordInventoryStage(client, executionId, {
    inputChecksum: selection.outputChecksum,
    outputChecksum: inventoryOutputChecksum,
    receiptRef: 'docs/reports/graphify-daily-coordinator-canary-v1.json',
  });
  const structuralBinding = bindings.find((binding) => binding.sourceRef === rootSources[0]?.sourceRef) ?? bindings[0];
  const materializedSourceRoot = process.env.ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT?.trim()
    ? resolve(process.env.ATLAS_GRAPHIFY_SOURCE_SNAPSHOT_ROOT)
    : resolve(process.cwd(), '..');
  const structuralSourcePath = resolve(materializedSourceRoot, structuralBinding.sourceRef);
  const structuralSourceBuffer = await readFile(structuralSourcePath);
  const structuralSource = structuralSourceBuffer.toString('utf8');
  const observedSourceRevision = `sha256:${createHash('sha256').update(structuralSourceBuffer).digest('hex')}`;
  if (observedSourceRevision !== structuralBinding.codeSourceRevision) {
    throw new Error(`GRAPHIFY_COORDINATOR_CANARY_STRUCTURAL_SOURCE_REVISION_MISMATCH:${structuralBinding.sourceRef}`);
  }
  const materialization = await new GraphifyStructuralMaterializer(
    create8095AstProvider('http://127.0.0.1:8095'),
  ).materialize({
    sourceRef: structuralBinding.sourceRef,
    sourceRevision: structuralBinding.codeSourceRevision,
    sourceVersionAnchor: `base-commit:${selectedBindings[0].baseCommitOid}`,
    sourceRevisionAuthority: 'PROVEN',
    language: 'typescript',
    source: structuralSource,
  });
  const structuralResult = compileGraphifyStructuralIntelligence({
    source: structuralSource,
    workspaceRevision,
    materialization,
    revisions: {
      chunker: 'treesitter-chunker-live',
      astGrep: 'ast-grep-live',
      langExtract: 'langextract-live',
      adapter: 'atlas.graphify-structural-intelligence-adapter.v1',
      fabric: 'atlas.structural-extraction-fabric.v1',
    },
  });
  const structuralStages = buildGraphifyStructuralStageReceiptsV1({ result: structuralResult });
  await recordStructuralStage(client, executionId, 'AST_PARSE', {
    ...structuralStages.astParse,
    receiptRef: 'docs/reports/graphify-daily-coordinator-canary-v1.json',
  });
  await recordStructuralStage(client, executionId, 'STRUCTURAL_EXTRACT', {
    ...structuralStages.structuralExtract,
    receiptRef: 'docs/reports/graphify-daily-coordinator-canary-v1.json',
  });
  await completeExecution(client, executionId, { status: 'COMPLETED' });

  const readback = await client.query(
    `SELECT e.execution_id, e.workspace_revision, e.status, e.completed_at,
            (SELECT count(*)::int FROM public.graphify_execution_file_membership_v2 f WHERE f.execution_id = e.execution_id) AS file_count,
            (SELECT count(*)::int FROM public.graphify_execution_stages s WHERE s.execution_id = e.execution_id AND s.status = 'COMPLETED') AS completed_stage_count
       FROM public.graphify_executions e
      WHERE e.execution_id = $1`,
    [executionId],
  );
  const row = readback.rows[0];
  const readbackOk = row?.status === 'COMPLETED' && row?.completed_at
    && Number(row.file_count) === expectedCount && Number(row.completed_stage_count) === 5;
  const report = {
    gate: explicitSourceRefs ? 'GRAPHIFY-STRUCTURAL-CODE-CANARY-02' : 'GRAPHIFY-DAILY-COORDINATOR-01',
    status: !readbackOk
      ? 'READBACK_FAILED'
      : fullMode
      ? 'PROVEN_CURRENT_WORKSPACE_SOURCE_SELECTION'
      : explicitSourceRefs
      ? 'PROVEN_STRUCTURAL_CODE_CANARY'
      : 'PROVEN_COMMITTED_BOUNDED_CANARY',
    executionId,
    workspaceRevision: row?.workspace_revision ?? null,
    workspaceRevisionSource: 'WORKSPACE_REVISION_TOURNAMENT_ADMISSION_RECEIPT',
    workspaceRevisionSourceCount: rootSources.length,
    sourceCount: selection.sourceCount,
    sourceSelectionChecksum: selection.outputChecksum,
    inventoryInputChecksum: inventory.inputChecksum,
    inventoryOutputChecksum: inventory.outputChecksum,
    // Structural (AST_PARSE/STRUCTURAL_EXTRACT) proof is per-run always exactly ONE source --
    // structuralSourceRef names it explicitly. When explicitSourceRefs has more than one entry,
    // membership/inventory cover all of them but only requestedSourceRefs[0] gets structural
    // proof this run -- requestedSourceRefs makes that scope visible instead of implying every
    // selected source was structurally proven (the exact honesty gap --full had at 24k scale).
    requestedSourceRefs: explicitSourceRefs ?? null,
    structuralSourceRef: structuralBinding.sourceRef,
    structuralProviderStatus: materialization.status,
    structuralProvenanceStatus: materialization.provenanceReadiness.status,
    canonicalPromotionMayBeAttempted: false,
    fileCount: Number(row?.file_count ?? 0),
    completedStageCount: Number(row?.completed_stage_count ?? 0),
    completedAt: row?.completed_at ?? null,
    historicalGraphifyRunsChanged: false,
    broadGraphifyRun: fullMode,
    canonicalAuthority: false,
    writesPerformed: true,
  };
  await mkdir(resolve(process.cwd(), '..', 'docs', 'reports'), { recursive: true });
  // Sync write, not fs/promises writeFile: async fs.promises.open on Windows intermittently
  // throws a bare "UNKNOWN: unknown error" against this exact path (observed live, reproducible
  // across repeat runs) while a synchronous write to the same path succeeds every time.
  writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));
} finally {
  if (locked) await releaseCoordinatorLock(client);
  await client.end();
}
