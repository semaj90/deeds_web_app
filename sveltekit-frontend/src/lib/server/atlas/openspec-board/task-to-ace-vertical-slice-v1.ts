import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type pg from 'pg';
import { readOpenSpecTaskReceiptView } from './task-receipt-view-v1.js';
import { buildAcpErrorFixProposalWithReceiptV1 } from './error-fix-task-receipt-v1.js';
import { classifyDomainTaxonomy } from '../domain-taxonomy.js';
import { buildOkfDomainClassificationBatchV1 } from '../domain-classification-adapter-v1.js';
import { materializeCandidateOrdinalMap } from '../features/canonical-candidate-v1.js';
import { admitCurrentCandidateFeatureSnapshotV1 } from '../features/candidate-feature-snapshot-v1.js';
import { admitCurrentAceContextManifestV1 } from '../context/ace-context-manifest-admission-v1.js';
import {
  acceptAgentPlanV1,
  buildAgentActionProposalV1,
  buildAgentReplayManifestV1,
  buildCapabilityRegistryV1,
  contextManifestChecksumV1,
  PrimeAgentRuntimeV1Schema,
  runReadOnlyAgentReplayV1,
} from '../agentic/agent-execution-spine-v1.js';
import { resolveErrorNeighborhood } from '../agentic/error-neighborhood-resolver-v1.js';

export interface TaskToAceVerticalSliceInputV1 {
  taskKey: string;
  targetSourceRef?: string;
  onlyTargetSourceRef?: boolean;
  tokenBudget?: number;
  errorSignature?: string;
  reportDirectory?: string;
  repoRoot?: string;
  pool: pg.Pool;
}

export interface ProvenChunkReadbackV1 {
  sourceRef: string;
  packetKey: string;
  canonicalChunkId: string;
  chunkRowId: string;
  sourceRevision: string;
  workspaceRevision: string;
  representationRevision: string | null;
  contentHash: string;
  diskSha256Matched: boolean;
}

export interface CurrentGraphSnapshotReadbackV1 {
  status: string;
  workspace_revision: string | null;
  source_inventory_revision: string | null;
  graph_revision: string | null;
  revision_checksum: string | null;
  node_count: number | string;
  edge_count: number | string;
}

export interface TaskSourceIndexReadbackV1 {
  source_ref: string;
  change_id: string;
  source_line: number | string;
  task_hash: string;
  identity_status: string;
}

export function matchesCurrentTaskSourceIndexRowV1(
  row: TaskSourceIndexReadbackV1 | null,
  expected: { sourceRef: string; changeId: string; sourceLine: number; taskRevision: string },
): boolean {
  return Boolean(row)
    && row!.source_ref === expected.sourceRef
    && row!.change_id === expected.changeId
    && Number(row!.source_line) === expected.sourceLine
    && row!.task_hash === expected.taskRevision
    && ['DECLARED_ID', 'DERIVED_ID'].includes(row!.identity_status);
}

/** Accept only a sealed, validated graph snapshot bound to this exact workspace. */
export function resolveCurrentGraphRevisionForWorkspaceV1(
  rows: readonly CurrentGraphSnapshotReadbackV1[],
  workspaceRevision: string,
): string | null {
  const sha256 = /^sha256:[a-f0-9]{64}$/;
  const digest = /^[a-f0-9]{64}$/;
  const match = rows.find((row) =>
    row.status === 'VALIDATED'
    && row.workspace_revision === workspaceRevision
    && sha256.test(row.workspace_revision ?? '')
    && sha256.test(row.source_inventory_revision ?? '')
    && digest.test(row.graph_revision ?? '')
    && digest.test(row.revision_checksum ?? '')
    && Number(row.node_count) > 0
    && Number(row.edge_count) > 0,
  );
  return match?.graph_revision ? `sha256:${match.graph_revision}` : null;
}

function sha256OfBuffer(buf: Buffer | string): string {
  return `sha256:${createHash('sha256').update(buf).digest('hex')}`;
}

export async function runTaskToAceVerticalSliceV1(input: TaskToAceVerticalSliceInputV1) {
  const repoRoot = input.repoRoot ?? path.resolve(process.cwd(), '..');
  const taskView = await readOpenSpecTaskReceiptView(input.taskKey, input.reportDirectory);
  if (taskView.status !== 'FOUND') {
    return {
      schema: 'atlas.task-to-ace-vertical-slice.v1' as const,
      status: 'BLOCKED_TASK_NOT_CURRENT' as const,
      blocker: taskView.status,
      task: null,
      taskSourceIndexRow: null,
      provenChunks: [] as ProvenChunkReadbackV1[],
      contextManifest: null,
      errorAgentReplay: null,
      acpProposal: null,
      canonicalAuthority: false as const,
      writesPerformed: false as const,
    };
  }

  // 1. Read back the canonical task-source index row from PostgreSQL 18 (openspec_task_source_index_v1)
  const taskIndexRes = await input.pool.query<{
    snapshot_id: string;
    source_ref: string;
    change_id: string;
    source_line: number;
    task_hash: string;
    identity_status: string;
    canonical_task_key_candidate: string | null;
  }>(
    `SELECT i.snapshot_id, i.source_ref, i.change_id, i.source_line, i.task_hash, i.identity_status, i.canonical_task_key_candidate
     FROM public.openspec_task_source_index_v1 i
     JOIN public.openspec_task_source_snapshots_v1 s ON s.snapshot_id = i.snapshot_id
     WHERE i.source_ref = $1 AND i.archived = false
     ORDER BY s.created_at DESC
     LIMIT 1`,
    [taskView.task.sourceRef],
  );
  const taskSourceIndexRow = taskIndexRes.rows[0] ?? null;

  const taskLineMatch = /#L(\d+)$/.exec(taskView.task.sourceRef);
  const expectedChangeId = taskView.identity.logicalTaskKey.split(':', 1)[0];
  if (!matchesCurrentTaskSourceIndexRowV1(taskSourceIndexRow, {
    sourceRef: taskView.identity.sourceRef,
    changeId: expectedChangeId,
    sourceLine: Number(taskLineMatch?.[1] ?? 0),
    taskRevision: taskView.task.revision,
  })) {
    return {
      schema: 'atlas.task-to-ace-vertical-slice.v1' as const,
      status: 'BLOCKED_TASK_SOURCE_INDEX_MISMATCH' as const,
      blocker: 'NO_EXACT_NONAMBIGUOUS_TASK_SOURCE_INDEX_ROW_MATCHES_CURRENT_WORKBOARD_REVISION',
      task: taskView.task,
      taskIdentity: taskView.identity,
      taskSourceIndexRow,
      provenChunks: [] as ProvenChunkReadbackV1[],
      contextManifest: null,
      errorAgentReplay: null,
      acpProposal: null,
      canonicalAuthority: false as const,
      writesPerformed: false as const,
    };
  }

  // 2. Domain classification proposal bound to exact task revision
  const classification = classifyDomainTaxonomy({
    sourceRef: taskView.task.sourceRef,
    title: 'OpenSpec task',
    summary: taskView.task.text,
  });
  const domainTupleProposal = buildOkfDomainClassificationBatchV1({
    classification,
    subjectRef: taskView.identity.stableKey,
    subjectKind: 'task',
    sourceRevision: taskView.task.revision,
  });

  // 3. Determine candidate sourceRef(s) to read back from codebase_chunk_index + atlas_packet_chunk_lineage
  const candidateRefs = new Set<string>();
  if (input.targetSourceRef) candidateRefs.add(input.targetSourceRef);
  if (!input.onlyTargetSourceRef) {
    candidateRefs.add(taskView.identity.sourceRef);
    const pathMatches = taskView.task.text.match(/[a-zA-Z0-9_./-]+\.(?:ts|mts|mjs|js|py|md|rs|sql)/g) ?? [];
    for (const m of pathMatches) candidateRefs.add(m);
  }

  const chunkQueryRes = await input.pool.query<{
    source_ref: string;
    packet_key: string;
    canonical_chunk_id: string;
    chunk_row_id: string;
    source_revision: string;
    workspace_revision: string;
    representation_revision: string | null;
    content_hash: string;
  }>(
    `SELECT DISTINCT ON (l.canonical_chunk_id)
            l.source_ref,
            l.packet_key,
            l.canonical_chunk_id,
            l.chunk_row_id::text AS chunk_row_id,
            l.source_revision,
            b.workspace_revision,
            c.representation_revision,
            c.content_hash
     FROM public.atlas_packet_chunk_lineage l
     JOIN public.atlas_workspace_source_bindings b
       ON b.canonical_source_ref = l.source_ref
      AND b.source_revision = l.source_revision
     JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
     WHERE l.revision_status = 'PROVEN'
       AND c.content_embedding_768 IS NOT NULL
       AND l.source_ref = ANY($1::text[])
     ORDER BY l.canonical_chunk_id, b.observed_at DESC
     LIMIT 8`,
    [[...candidateRefs]],
  );

  const provenChunks: ProvenChunkReadbackV1[] = [];
  for (const row of chunkQueryRes.rows) {
    const absPath = path.resolve(repoRoot, row.source_ref);
    let diskSha256Matched = false;
    try {
      const diskBytes = await fs.readFile(absPath);
      diskSha256Matched = sha256OfBuffer(diskBytes) === row.source_revision;
    } catch {
      diskSha256Matched = false;
    }
    if (diskSha256Matched) {
      provenChunks.push({
        sourceRef: row.source_ref,
        packetKey: row.packet_key,
        canonicalChunkId: row.canonical_chunk_id,
        chunkRowId: row.chunk_row_id,
        sourceRevision: row.source_revision,
        workspaceRevision: row.workspace_revision,
        representationRevision: row.representation_revision,
        contentHash: row.content_hash,
        diskSha256Matched,
      });
    }
  }

  if (provenChunks.length === 0) {
    return {
      schema: 'atlas.task-to-ace-vertical-slice.v1' as const,
      status: 'BLOCKED_NO_ADMITTED_SOURCE_CHUNKS' as const,
      blocker: 'NO_PROVEN_DISK_VERIFIED_CHUNKS_IN_CODEBASE_CHUNK_INDEX',
      checkedRefs: [...candidateRefs],
      task: taskView.task,
      taskIdentity: taskView.identity,
      taskSourceIndexRow,
      domainTupleProposal,
      provenChunks,
      contextManifest: null,
      errorAgentReplay: null,
      acpProposal: null,
      canonicalAuthority: false as const,
      writesPerformed: false as const,
    };
  }

  // 4. Admit candidates through existing Atlas owners (CandidateOrdinalMap -> FeatureSnapshot -> ContextManifest)
  const primary = provenChunks[0]!;
  const workspaceRevision = primary.workspaceRevision;
  if (!/^sha256:[a-f0-9]{64}$/.test(workspaceRevision)
    || provenChunks.some((chunk) => chunk.workspaceRevision !== workspaceRevision)) {
    return {
      schema: 'atlas.task-to-ace-vertical-slice.v1' as const,
      status: 'BLOCKED_WORKSPACE_REVISION_MISMATCH' as const,
      blocker: 'PROVEN_CHUNKS_DO_NOT_SHARE_A_QUALIFIED_WORKSPACE_REVISION',
      checkedRefs: [...candidateRefs],
      task: taskView.task,
      taskIdentity: taskView.identity,
      taskSourceIndexRow,
      domainTupleProposal,
      provenChunks,
      contextManifest: null,
      errorAgentReplay: null,
      acpProposal: null,
      canonicalAuthority: false as const,
      writesPerformed: false as const,
    };
  }

  let graphRevision: string | null = null;
  try {
    const graphSnapshotRes = await input.pool.query<CurrentGraphSnapshotReadbackV1>(
      `SELECT status, workspace_revision, source_inventory_revision, graph_revision,
              revision_checksum, node_count, edge_count
       FROM public.atlas_graph_snapshots_v2
       WHERE status = 'VALIDATED'
         AND workspace_revision = $1
         AND graph_revision IS NOT NULL
         AND source_inventory_revision IS NOT NULL
         AND revision_checksum IS NOT NULL
         AND node_count > 0
         AND edge_count > 0
       ORDER BY finalized_at DESC NULLS LAST, created_at DESC
       LIMIT 5`,
      [workspaceRevision],
    );
    graphRevision = resolveCurrentGraphRevisionForWorkspaceV1(graphSnapshotRes.rows, workspaceRevision);
  } catch {
    graphRevision = null;
  }
  if (!graphRevision) {
    return {
      schema: 'atlas.task-to-ace-vertical-slice.v1' as const,
      status: 'BLOCKED_NO_CURRENT_GRAPH_SNAPSHOT' as const,
      blocker: 'NO_VALIDATED_GRAPH_SNAPSHOT_MATCHES_THE_PROVEN_CHUNK_WORKSPACE_REVISION',
      checkedRefs: [...candidateRefs],
      task: taskView.task,
      taskIdentity: taskView.identity,
      taskSourceIndexRow,
      domainTupleProposal,
      provenChunks,
      contextManifest: null,
      errorAgentReplay: null,
      acpProposal: null,
      canonicalAuthority: false as const,
      writesPerformed: false as const,
    };
  }

  const representationRevisions = new Set(
    provenChunks.map((chunk) => chunk.representationRevision).filter((value): value is string => Boolean(value)),
  );
  if (representationRevisions.size !== 1
    || provenChunks.some((chunk) => !chunk.representationRevision || !/^sha256:[a-f0-9]{64}$/.test(chunk.representationRevision))) {
    return {
      schema: 'atlas.task-to-ace-vertical-slice.v1' as const,
      status: 'BLOCKED_REPRESENTATION_REVISION_UNQUALIFIED' as const,
      blocker: 'PROVEN_CHUNKS_DO_NOT_SHARE_A_NONEMPTY_REPRESENTATION_REVISION',
      checkedRefs: [...candidateRefs],
      task: taskView.task,
      taskIdentity: taskView.identity,
      taskSourceIndexRow,
      domainTupleProposal,
      provenChunks,
      contextManifest: null,
      errorAgentReplay: null,
      acpProposal: null,
      canonicalAuthority: false as const,
      writesPerformed: false as const,
    };
  }
  const representationRevision = [...representationRevisions][0]!;

  const ordinalMap = materializeCandidateOrdinalMap({
    candidates: provenChunks.map((chunk) => ({
      canonicalId: chunk.canonicalChunkId,
      packetKey: chunk.packetKey,
      sourceRef: chunk.sourceRef,
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision,
      sourceRevision: chunk.sourceRevision,
      graphRevision,
      semanticRevision: representationRevision,
      degradedIdentity: false,
      evidenceRefs: [chunk.sourceRef, taskView.task.sourceRef],
      representationBindings: [{
        representationId: 'semantic_768',
        family: 'EMBEDDINGGEMMA_MRL',
        dimensions: 768,
        modelRevision: 'embeddinggemma:latest',
        projectionKind: 'NONE',
        sourceRepresentationId: null,
        projectionRevision: null,
        normalized: true,
        available: true,
        availabilityReason: null,
      }],
    })),
    candidateSnapshotRevision: sha256OfBuffer(JSON.stringify({
      schema: 'atlas.task-to-ace-candidate-snapshot.v1',
      taskRevision: taskView.task.revision,
      workspaceRevision,
      graphRevision,
      representationRevision,
      canonicalChunkIds: provenChunks.map((chunk) => chunk.canonicalChunkId),
    })),
    workspaceRevision,
    producerRevision: 'task-to-ace-vertical-slice-v1',
  });

  const featureRevision = sha256OfBuffer(JSON.stringify({
    schema: 'atlas.task-to-ace-feature-snapshot.v1',
    taskRevision: taskView.task.revision,
    workspaceRevision,
    graphRevision,
    representationRevision,
    sourceRevisions: provenChunks.map((chunk) => chunk.sourceRevision),
    candidateSetChecksum: createHash('sha256').update(provenChunks.map((c) => c.canonicalChunkId).join(',')).digest('hex'),
  }));
  const sourceRevChecksum = createHash('sha256')
    .update(provenChunks.map((c) => c.sourceRevision).join(','))
    .digest('hex');
  const candidateSetChecksum = createHash('sha256')
    .update(provenChunks.map((c) => c.canonicalChunkId).join(','))
    .digest('hex');

  const featureAdmission = admitCurrentCandidateFeatureSnapshotV1({
    ordinalMap,
    rows: provenChunks.map((chunk, idx) => ({
      schema: 'atlas.candidate-feature-row.v1',
      candidateOrdinal: idx,
      canonicalId: chunk.canonicalChunkId,
      packetKey: chunk.packetKey,
      sourceRef: chunk.sourceRef,
      treeNodeId: null,
      symbolVersionId: null,
      workspaceRevision,
      sourceRevision: chunk.sourceRevision,
      graphRevision,
      semanticRevision: representationRevision,
      featureRevision,
      laneMask: ['semantic', 'lexical'],
      evidenceRefs: [chunk.sourceRef, taskView.task.sourceRef],
    })),
    featureRevision,
    producerRevision: 'task-to-ace-vertical-slice-v1',
    sourceRevisionSetChecksum: sourceRevChecksum,
    candidateSetChecksum,
    sourceChunkCohortStatus: 'REVISION_QUALIFIED',
    semanticCohortStatus: 'ADMITTED',
    graphFeatureStatus: 'ADMITTED',
  });

  const contextAdmission = admitCurrentAceContextManifestV1({
    featureAdmission,
    requestId: `request:${taskView.identity.stableKey}`,
    tokenBudget: input.tokenBudget ?? 512,
    retrievalPolicyRevision: 'retrieval-policy-v1',
    acePlaybookRevision: 'ace-playbook-v1',
    representationRevision,
    modelRevision: 'gemma4-legal-iq4xs-direct',
    promptTemplateRevision: 'error-agent-prompt-v1',
    graphRevision,
  });
  if (contextAdmission.status !== 'ADMITTED' || contextAdmission.manifest === null) {
    throw new Error(`ACE_CONTEXT_MANIFEST_BLOCKED:${contextAdmission.reason ?? 'UNKNOWN'}`);
  }
  const contextManifest = contextAdmission.manifest;
  const contextChecksum = contextManifestChecksumV1(contextManifest);

  // 5. P1: Bounded Error-Agent Workflow + Tool Execution Receipt + ACP Task Receipt Binding
  const registry = buildCapabilityRegistryV1();
  const capability = registry.entries[0]!;
  const policy = {
    policyRevision: 'read-only-policy-v1',
    allowedCapabilityIds: [capability.capabilityId],
    allowedMutationClasses: ['READ_ONLY'] as const,
    maxToolCalls: 1,
  };
  const executionId = `execution:${taskView.identity.stableKey}`;
  const runtime = PrimeAgentRuntimeV1Schema.parse({
    schema: 'atlas.prime-agent-runtime.v1',
    requestId: `request:${taskView.identity.stableKey}`,
    executionId,
    contextManifestChecksum: contextChecksum,
    policyRevision: policy.policyRevision,
    capabilityRegistryRevision: registry.registryRevision,
    toolRegistryRevision: registry.toolRegistryRevision,
    maxSteps: 1,
    maxToolCalls: 1,
    maxTokens: 512,
    state: 'PLAN',
    canonicalAuthority: false,
  });

  const planReceipt = acceptAgentPlanV1({
    requestId: runtime.requestId,
    executionId,
    planRevision: 'plan-v1',
    planChecksum: sha256OfBuffer(`${taskView.task.revision}:${contextChecksum}`),
    consumedActionIds: ['PLAN_STEP_0'],
    planningActionIds: ['PLAN_STEP_0'],
    allowedNextActionIds: [capability.capabilityId],
  });

  const proposal = buildAgentActionProposalV1({
    executionId,
    stepOrdinal: 0,
    capability,
    registry,
    arguments: { sourceRef: primary.sourceRef, sourceSymbol: 'slice_target' },
    evidenceRefs: [primary.sourceRef],
    proposerModelRevision: 'gemma4-legal-iq4xs-direct',
    contextManifestChecksum: contextChecksum,
  });

  const replayManifest = buildAgentReplayManifestV1({
    workspaceRevision,
    sourceSnapshotChecksum: `sha256:${contextManifest.identityInput.evidenceRevisions.sourceRevision}`,
    contextManifestChecksum: contextChecksum,
    capabilityRegistryRevision: registry.registryRevision,
    toolRegistryRevision: registry.toolRegistryRevision,
    primeAgentRevision: 'prime-agent-v1',
    plannerRevision: 'deterministic-planner-v1',
    modelRevision: 'gemma4-legal-iq4xs-direct',
    adapterRevision: 'no-adapter-v1',
    tokenizerRevision: 'gemma4-tokenizer-v1',
    policyRevision: policy.policyRevision,
    expectedSequence: [{
      stepOrdinal: 0,
      capabilityId: capability.capabilityId,
      capabilityRevision: capability.capabilityRevision,
      toolId: capability.toolId,
      toolRevision: capability.toolRevision,
      transport: 'local',
    }],
  });

  const resolvedNeighborhood = resolveErrorNeighborhood({
    errorId: `error:${taskView.identity.stableKey}`,
    errorClass: 'TS2345',
    sourceOrdinal: 0,
    symbolOrdinal: 1,
    domainOrdinal: 2,
    topologyCell: [0, 0, 0, 0],
    callerOrdinals: [3],
    testOrdinals: [4],
  });

  const replay = await runReadOnlyAgentReplayV1({
    manifest: replayManifest,
    runtime,
    proposal,
    registry,
    policy,
    contextAdmission,
    fixture: {
      sourceRef: primary.sourceRef,
      sourceSymbol: 'slice_target',
      directCallers: ['caller:vertical_slice_0'],
      tests: ['test:vertical_slice_0'],
      neighborhood: resolvedNeighborhood,
    },
    now: () => '2026-11-22T18:30:00.000Z',
  });

  const acpProposal = await buildAcpErrorFixProposalWithReceiptV1({
    relativePath: primary.sourceRef,
    errorSignature: input.errorSignature ?? 'TS2345: vertical-slice-repair-proposal',
    targetAgent: 'a2a-error-fixer',
    workboardTaskRef: {
      schema: 'atlas.openspec-workboard-task-ref.v1',
      workboardTaskId: taskView.identity.workboardTaskId,
      stableKey: taskView.identity.stableKey,
      logicalTaskKey: taskView.identity.logicalTaskKey,
      taskRevision: taskView.task.revision,
      sourceRef: taskView.identity.sourceRef,
      sourceFileSha256: taskView.identity.sourceFileSha256,
      workboardSnapshotSha256: taskView.identity.workboardSnapshotSha256,
      workboardGeneratedAt: new Date().toISOString(),
      currentHead: 'HEAD',
      status: 'CAPTURE_ASSERTED_SOURCE_CURRENT_LINK',
      dispatchRevalidation: 'REQUIRED',
      authority: 'PROPOSAL_REFERENCE_ONLY',
      canonicalAuthority: false,
    },
  }, 'task-to-ace-vertical-slice-v1');

  return {
    schema: 'atlas.task-to-ace-vertical-slice.v1' as const,
    status: 'ADMITTED_AND_REPLAYED' as const,
    task: taskView.task,
    taskIdentity: taskView.identity,
    taskSourceIndexRow,
    domainTupleProposal,
    provenChunks,
    contextManifest,
    planReceipt,
    errorAgentReplay: {
      receiptOutputChecksum: replay.receipts[0]!.outputChecksum,
      receiptEnvelopeChecksum: replay.receipts[0]!.envelopeChecksum,
      closedStatus: replay.finalState,
      completedSteps: replay.completedSteps,
    },
    acpProposal,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
}
