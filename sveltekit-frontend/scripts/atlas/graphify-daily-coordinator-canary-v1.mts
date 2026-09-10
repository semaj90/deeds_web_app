import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import {
  adaptWorkspaceBindingsToSourceSelectionV1,
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
const selectedSnapshotSources = fullMode ? snapshot.sources : rootSources.slice(0, requestedLimit);
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
  const repositoryBindings = selectedSnapshotSources.map((source) => ({
    repositoryId: source.repositoryId,
    repositoryRelativePath: source.repositoryRelativePath,
    sourceRef: source.sourceRef,
    codeSourceRevision: source.sourceRevision,
    contentHash: source.contentDigest,
    byteLength: source.byteLength,
  }));

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
  const structuralSourcePath = resolve(process.cwd(), '..', structuralBinding.sourceRef);
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
  const report = {
    gate: 'GRAPHIFY-DAILY-COORDINATOR-01',
    status: row?.status === 'COMPLETED' && row?.completed_at && Number(row.file_count) === expectedCount && Number(row.completed_stage_count) === 5 ? (fullMode ? 'PROVEN_CURRENT_WORKSPACE_SOURCE_SELECTION' : 'PROVEN_COMMITTED_BOUNDED_CANARY') : 'READBACK_FAILED',
    executionId,
    workspaceRevision: row?.workspace_revision ?? null,
    workspaceRevisionSource: 'WORKSPACE_REVISION_TOURNAMENT_ADMISSION_RECEIPT',
    workspaceRevisionSourceCount: rootSources.length,
    sourceCount: selection.sourceCount,
    sourceSelectionChecksum: selection.outputChecksum,
    inventoryInputChecksum: inventory.inputChecksum,
    inventoryOutputChecksum: inventory.outputChecksum,
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
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8');
  console.log(JSON.stringify(report));
} finally {
  if (locked) await releaseCoordinatorLock(client);
  await client.end();
}
