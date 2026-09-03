import { z } from 'zod';
import { buildKnowledgeGenerationRunV1, canFinishKnowledgeGenerationRunV1, knowledgeGenerationRunV1Schema, nextPendingKnowledgePageV1, type KnowledgeGenerationRunV1 } from './knowledge-generation-run-v1.js';
import { sha256HexV1 } from './stable-json-v1.js';

const id = z.string().trim().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);
const evidenceChecksumsSchema = z.array(sha256Hex).min(1);

export const KNOWLEDGE_RUN_OPERATION_VALUES = ['BEGIN', 'PLAN', 'NEXT_PAGE', 'INSPECT', 'SUBMIT', 'FINISH'] as const;
export const knowledgeRunOperationV1Schema = z.enum(KNOWLEDGE_RUN_OPERATION_VALUES);
export type KnowledgeRunOperationV1 = z.infer<typeof knowledgeRunOperationV1Schema>;

export const KNOWLEDGE_RUN_STAGE_VALUES = ['BEGUN', 'PLANNED', 'PAGE_ACTIVE', 'FINISHED'] as const;
export const knowledgeRunStageV1Schema = z.enum(KNOWLEDGE_RUN_STAGE_VALUES);
export type KnowledgeRunStageV1 = z.infer<typeof knowledgeRunStageV1Schema>;

export const knowledgeRunOperationReceiptV1Schema = z.object({
  schema: z.literal('atlas.knowledge-run-operation-receipt.v1').default('atlas.knowledge-run-operation-receipt.v1'),
  runId: id,
  operation: knowledgeRunOperationV1Schema,
  jobId: id.nullable(),
  stageBefore: knowledgeRunStageV1Schema.nullable(),
  stageAfter: knowledgeRunStageV1Schema,
  previousRunChecksum: sha256Hex,
  nextRunChecksum: sha256Hex,
  evidenceChecksums: evidenceChecksumsSchema,
  operationChecksum: sha256Hex,
  canonicalAuthority: z.literal(false).default(false),
}).strict();
export type KnowledgeRunOperationReceiptV1 = z.infer<typeof knowledgeRunOperationReceiptV1Schema>;

export const knowledgeGenerationLifecycleV1Schema = z.object({
  schema: z.literal('atlas.knowledge-generation-lifecycle.v1').default('atlas.knowledge-generation-lifecycle.v1'),
  run: knowledgeGenerationRunV1Schema,
  stage: knowledgeRunStageV1Schema,
  activeJobId: id.nullable(),
  activeJobInspected: z.boolean(),
  operationReceipts: z.array(knowledgeRunOperationReceiptV1Schema).min(1),
  stateChecksum: sha256Hex,
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((state, ctx) => {
  if (state.stage === 'PAGE_ACTIVE' && state.activeJobId === null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['activeJobId'], message: 'PAGE_ACTIVE requires activeJobId' });
  }
  if (state.stage !== 'PAGE_ACTIVE' && state.activeJobId !== null) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['activeJobId'], message: `${state.stage} forbids activeJobId` });
  }
  if (state.activeJobId !== null) {
    const active = state.run.pageJobs.find((job) => job.jobId === state.activeJobId);
    if (!active || active.status !== 'PENDING') {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['activeJobId'], message: 'Active job must be a pending run job' });
    }
  }
  if (state.stage === 'FINISHED' && !canFinishKnowledgeGenerationRunV1(state.run)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['stage'], message: 'FINISHED requires all jobs COMPLETE or SKIPPED' });
  }
});
export type KnowledgeGenerationLifecycleV1 = z.infer<typeof knowledgeGenerationLifecycleV1Schema>;

function normalizedChecksums(checksums: string[]): string[] {
  const values = [...new Set(checksums)].sort();
  evidenceChecksumsSchema.parse(values);
  return values;
}

function rebuildRun(run: KnowledgeGenerationRunV1, patch: Partial<Pick<KnowledgeGenerationRunV1, 'phase' | 'pageJobs'>>): KnowledgeGenerationRunV1 {
  return buildKnowledgeGenerationRunV1({
    runId: run.runId,
    mode: run.mode,
    phase: patch.phase ?? run.phase,
    startedAt: run.startedAt,
    workspaceRevision: run.workspaceRevision,
    sourceSnapshotRevision: run.sourceSnapshotRevision,
    sourceSetChecksum: run.sourceSetChecksum,
    dagRevision: run.dagRevision,
    plannerRevision: run.plannerRevision,
    programRevision: run.programRevision,
    modelRevision: run.modelRevision,
    pageJobs: patch.pageJobs ?? run.pageJobs,
  });
}

function sealOperationReceipt(input: Omit<KnowledgeRunOperationReceiptV1, 'schema' | 'canonicalAuthority' | 'operationChecksum'>): KnowledgeRunOperationReceiptV1 {
  const body = {
    schema: 'atlas.knowledge-run-operation-receipt.v1' as const,
    ...input,
    evidenceChecksums: normalizedChecksums(input.evidenceChecksums),
    canonicalAuthority: false as const,
  };
  return knowledgeRunOperationReceiptV1Schema.parse({ ...body, operationChecksum: sha256HexV1(body) });
}

function sealLifecycle(input: Omit<KnowledgeGenerationLifecycleV1, 'schema' | 'stateChecksum' | 'canonicalAuthority'>): KnowledgeGenerationLifecycleV1 {
  const body = { schema: 'atlas.knowledge-generation-lifecycle.v1' as const, ...input, canonicalAuthority: false as const };
  const checksumBody = {
    runChecksum: input.run.runChecksum,
    stage: input.stage,
    activeJobId: input.activeJobId,
    activeJobInspected: input.activeJobInspected,
    operationChecksums: input.operationReceipts.map((receipt) => receipt.operationChecksum),
  };
  return knowledgeGenerationLifecycleV1Schema.parse({ ...body, stateChecksum: sha256HexV1(checksumBody) });
}

export function beginKnowledgeGenerationLifecycleV1(input: { run: KnowledgeGenerationRunV1; evidenceChecksums: string[] }): KnowledgeGenerationLifecycleV1 {
  const run = knowledgeGenerationRunV1Schema.parse(input.run);
  if (run.phase !== 'PLANNING') throw new Error(`KNOWLEDGE_RUN_BEGIN_PHASE_INVALID:${run.phase}`);
  const receipt = sealOperationReceipt({
    runId: run.runId,
    operation: 'BEGIN',
    jobId: null,
    stageBefore: null,
    stageAfter: 'BEGUN',
    previousRunChecksum: run.runChecksum,
    nextRunChecksum: run.runChecksum,
    evidenceChecksums: input.evidenceChecksums,
  });
  return sealLifecycle({ run, stage: 'BEGUN', activeJobId: null, activeJobInspected: false, operationReceipts: [receipt] });
}

export function advanceKnowledgeGenerationLifecycleV1(input: {
  state: KnowledgeGenerationLifecycleV1;
  operation: Exclude<KnowledgeRunOperationV1, 'BEGIN'>;
  evidenceChecksums: string[];
  submitStatus?: 'COMPLETE' | 'SKIPPED';
  completedBy?: string;
}): KnowledgeGenerationLifecycleV1 {
  const state = knowledgeGenerationLifecycleV1Schema.parse(input.state);
  const evidenceChecksums = normalizedChecksums(input.evidenceChecksums);
  let run = state.run;
  let stage = state.stage;
  let activeJobId = state.activeJobId;
  let activeJobInspected = state.activeJobInspected;
  let jobId: string | null = activeJobId;

  if (input.operation === 'PLAN') {
    if (stage !== 'BEGUN') throw new Error(`KNOWLEDGE_RUN_PLAN_STAGE_INVALID:${stage}`);
    run = rebuildRun(run, { phase: 'GENERATING' });
    stage = 'PLANNED';
    activeJobId = null;
    activeJobInspected = false;
    jobId = null;
  } else if (input.operation === 'NEXT_PAGE') {
    if (stage !== 'PLANNED') throw new Error(`KNOWLEDGE_RUN_NEXT_PAGE_STAGE_INVALID:${stage}`);
    const next = nextPendingKnowledgePageV1(run);
    if (!next) throw new Error('KNOWLEDGE_RUN_NO_PENDING_PAGE');
    stage = 'PAGE_ACTIVE';
    activeJobId = next.jobId;
    activeJobInspected = false;
    jobId = next.jobId;
  } else if (input.operation === 'INSPECT') {
    if (stage !== 'PAGE_ACTIVE' || !activeJobId) throw new Error(`KNOWLEDGE_RUN_INSPECT_STAGE_INVALID:${stage}`);
    activeJobInspected = true;
    jobId = activeJobId;
  } else if (input.operation === 'SUBMIT') {
    if (stage !== 'PAGE_ACTIVE' || !activeJobId) throw new Error(`KNOWLEDGE_RUN_SUBMIT_STAGE_INVALID:${stage}`);
    if (!input.completedBy?.trim()) throw new Error('KNOWLEDGE_RUN_SUBMIT_COMPLETED_BY_REQUIRED');
    const submitStatus = input.submitStatus ?? 'COMPLETE';
    const pageJobs = run.pageJobs.map((job) => job.jobId === activeJobId ? { ...job, status: submitStatus, completedBy: input.completedBy! } : job);
    run = rebuildRun(run, { pageJobs });
    jobId = activeJobId;
    stage = 'PLANNED';
    activeJobId = null;
    activeJobInspected = false;
  } else if (input.operation === 'FINISH') {
    if (stage !== 'PLANNED') throw new Error(`KNOWLEDGE_RUN_FINISH_STAGE_INVALID:${stage}`);
    if (!canFinishKnowledgeGenerationRunV1(run)) throw new Error('KNOWLEDGE_RUN_FINISH_INCOMPLETE_JOBS');
    stage = 'FINISHED';
    activeJobId = null;
    activeJobInspected = false;
    jobId = null;
  }

  const receipt = sealOperationReceipt({
    runId: run.runId,
    operation: input.operation,
    jobId,
    stageBefore: state.stage,
    stageAfter: stage,
    previousRunChecksum: state.run.runChecksum,
    nextRunChecksum: run.runChecksum,
    evidenceChecksums,
  });
  return sealLifecycle({
    run,
    stage,
    activeJobId,
    activeJobInspected,
    operationReceipts: [...state.operationReceipts, receipt],
  });
}
