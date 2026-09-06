import { Client } from 'pg';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadAtlasEnv } from './load-atlas-env.mjs';
import {
  adaptWorkspaceBindingsToSourceSelectionV1,
  openExecution,
  recordSourceSelectionStage,
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
import { materializeWorkspaceRevisionOriginV1 } from '../../src/lib/server/atlas/indexing/workspace-revision-origin-runtime-v1.js';

if (process.env.GRAPHIFY_COMMITTED_CANARY !== '1') {
  throw new Error('GRAPHIFY_COMMITTED_CANARY=1 is required for the bounded committed canary');
}

loadAtlasEnv();
const client = new Client({
  connectionString: process.env.DATABASE_URL ?? 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});
const reportPath = resolve(process.cwd(), '..', 'docs', 'reports', 'graphify-daily-coordinator-canary-v1.json');
const workspaceRoot = resolve(process.cwd(), '..');
let locked = false;
let executionId: string | undefined;

try {
  await client.connect();
  await acquireCoordinatorLock(client);
  locked = true;

  // Freshly materialize the workspace revision from the real git+fs state of the working
  // tree, rather than reading a stale static handoff artifact (closes GRAPHIFY-DAILY-COORDINATOR-01's
  // last open item: "Fresh WorkspaceRevisionRecordV1 generated for this execution").
  const origin = materializeWorkspaceRevisionOriginV1({
    workspaceRoot,
    repositoryId: 'semaj90/deeds_web_app',
    producerRevision: 'graphify.committed-canary.v1',
  });
  const workspaceRevision = origin.record.workspaceRevision;
  const expectedWorkspaceRevision = process.env.GRAPHIFY_EXPECTED_WORKSPACE_REVISION?.trim();
  if (expectedWorkspaceRevision && expectedWorkspaceRevision !== workspaceRevision) {
    throw new Error(`GRAPHIFY_COORDINATOR_CANARY_WORKSPACE_REVISION_MISMATCH:expected=${expectedWorkspaceRevision}:actual=${workspaceRevision}`);
  }
  const selectedBindings = origin.bindings.slice(0, 3);
  if (selectedBindings.length !== 3) {
    throw new Error(`Expected 3 qualified source bindings from fresh materialization, got ${selectedBindings.length}`);
  }
  const bindings = adaptWorkspaceBindingsToSourceSelectionV1(workspaceRevision, selectedBindings);

  const workspaceResult = await client.query('SELECT id FROM public.workspaces LIMIT 1');
  const workspaceId = workspaceResult.rows[0]?.id as string | undefined;
  if (!workspaceId) throw new Error('GRAPHIFY_COORDINATOR_CANARY_NO_WORKSPACE');

  const opened = await openExecution(client, {
    workspaceId,
    workspaceRevision,
    parserContractVersion: 'graphify.parser.v1',
    extractionContractVersion: 'graphify.extraction.v1',
    graphAlgorithmRevision: 'graphify.graph.v1',
    triggerKind: 'BOUNDED_COMMITTED_CANARY',
    schedulerRevision: 'atlas.graphify-daily-coordinator.v1',
    environmentRevision: 'operator-authorized-canary',
  });
  executionId = opened.executionId;
  const selection = await recordSourceSelectionStage(client, executionId, workspaceRevision, bindings, {
    selectionPolicyRevision: 'committed-canary-fresh-materialization-v1',
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
  const structuralBinding = bindings[0];
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
            (SELECT count(*)::int FROM public.graphify_execution_files f WHERE f.execution_id = e.execution_id) AS file_count,
            (SELECT count(*)::int FROM public.graphify_execution_stages s WHERE s.execution_id = e.execution_id AND s.status = 'COMPLETED') AS completed_stage_count
       FROM public.graphify_executions e
      WHERE e.execution_id = $1`,
    [executionId],
  );
  const row = readback.rows[0];
  const report = {
    gate: 'GRAPHIFY-DAILY-COORDINATOR-01',
    status: row?.status === 'COMPLETED' && row?.completed_at && Number(row.file_count) === 3 && Number(row.completed_stage_count) === 5 ? 'PROVEN_COMMITTED_BOUNDED_CANARY' : 'READBACK_FAILED',
    executionId,
    workspaceRevision: row?.workspace_revision ?? null,
    workspaceRevisionSource: 'materializeWorkspaceRevisionOriginV1',
    workspaceRevisionSourceCount: origin.bindings.length,
    sourceCount: selection.sourceCount,
    sourceSelectionChecksum: selection.outputChecksum,
    inventoryInputChecksum: inventory.inputChecksum,
    inventoryOutputChecksum: inventory.outputChecksum,
    structuralSourceRef: structuralBinding.sourceRef,
    structuralProviderStatus: materialization.status,
    structuralProvenanceStatus: materialization.provenanceReadiness.status,
    canonicalPromotionMayBeAttempted: structuralResult.receipt.canonicalPromotionMayBeAttempted,
    fileCount: Number(row?.file_count ?? 0),
    completedStageCount: Number(row?.completed_stage_count ?? 0),
    completedAt: row?.completed_at ?? null,
    historicalGraphifyRunsChanged: false,
    broadGraphifyRun: false,
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
