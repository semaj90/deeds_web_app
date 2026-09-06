import { z } from 'zod';
import { kernelBoundDagExecutionReceiptV1Schema, type KernelBoundDagExecutionReceiptV1 } from '../kernel-bound-dag-executor-v1.js';
import { knowledgePageDagBindingV1Schema, type KnowledgePageDagBindingV1 } from './knowledge-page-dag-binding-v1.js';
import {
  knowledgePageJobV1Schema,
  knowledgePageManifestEntryV1Schema,
  knowledgePageSnapshotV1Schema,
  type KnowledgePageJobV1,
  type KnowledgePageManifestEntryV1,
  type KnowledgePageSnapshotV1,
} from './knowledge-page-v1.js';
import { sha256HexV1 } from './stable-json-v1.js';

const id = z.string().trim().min(1);
const revision = z.string().trim().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const knowledgePagePersistenceReceiptV1Schema = z.object({
  schema: z.literal('atlas.knowledge-page-persistence-receipt.v1').default('atlas.knowledge-page-persistence-receipt.v1'),
  runId: id,
  jobId: id,
  pageId: id,
  pagePath: id,
  workspaceRevision: revision,
  sourceSnapshotRevision: revision,
  sourceSetChecksum: sha256Hex,
  pageRevision: revision,
  pageChecksum: sha256Hex,
  claimSetChecksum: sha256Hex,
  claimCount: z.number().int().nonnegative(),
  verificationReceiptChecksum: sha256Hex,
  pageArtifactRef: id,
  claimArtifactRef: id,
  persistenceOwner: id,
  persistenceRevision: revision,
  readbackVerified: z.literal(true).default(true),
  writesPerformed: z.literal(true).default(true),
  receiptChecksum: sha256Hex,
}).strict();
export type KnowledgePagePersistenceReceiptV1 = z.infer<typeof knowledgePagePersistenceReceiptV1Schema>;

export function buildKnowledgePagePersistenceReceiptV1(
  input: Omit<KnowledgePagePersistenceReceiptV1, 'schema' | 'readbackVerified' | 'writesPerformed' | 'receiptChecksum'>,
): KnowledgePagePersistenceReceiptV1 {
  const body = {
    schema: 'atlas.knowledge-page-persistence-receipt.v1' as const,
    ...input,
    readbackVerified: true as const,
    writesPerformed: true as const,
  };
  return knowledgePagePersistenceReceiptV1Schema.parse({ ...body, receiptChecksum: sha256HexV1(body) });
}

export function verifyKnowledgePagePersistenceReceiptV1(input: KnowledgePagePersistenceReceiptV1): KnowledgePagePersistenceReceiptV1 {
  const receipt = knowledgePagePersistenceReceiptV1Schema.parse(input);
  const { receiptChecksum: _receiptChecksum, ...body } = receipt;
  if (sha256HexV1(body) !== receipt.receiptChecksum) throw new Error('KNOWLEDGE_PAGE_PERSISTENCE_RECEIPT_CHECKSUM_MISMATCH');
  if (!receipt.readbackVerified || receipt.writesPerformed !== true) throw new Error('KNOWLEDGE_PAGE_PERSISTENCE_NOT_PROVEN');
  return receipt;
}

export const knowledgePageCompletionReceiptV1Schema = z.object({
  schema: z.literal('atlas.knowledge-page-completion-receipt.v1').default('atlas.knowledge-page-completion-receipt.v1'),
  runId: id,
  jobId: id,
  pageId: id,
  pagePath: id,
  workspaceRevision: revision,
  sourceSnapshotRevision: revision,
  sourceSetChecksum: sha256Hex,
  pageRevision: revision,
  pageChecksum: sha256Hex,
  claimSetChecksum: sha256Hex,
  claimCount: z.number().int().nonnegative(),
  verificationReceiptChecksum: sha256Hex,
  persistenceReceipt: knowledgePagePersistenceReceiptV1Schema,
  persistenceReceiptChecksum: sha256Hex,
  snapshotChecksum: sha256Hex,
  dagBindingChecksum: sha256Hex,
  dagPlanId: id,
  dagPlanChecksum: sha256Hex,
  dagExecutionReceiptChecksum: sha256Hex,
  manifestEntryChecksum: sha256Hex,
  completedBy: id,
  durablePersistenceVerified: z.literal(true).default(true),
  canonicalAuthority: z.literal(false).default(false),
  writesPerformed: z.literal(false).default(false),
  receiptChecksum: sha256Hex,
}).strict();
export type KnowledgePageCompletionReceiptV1 = z.infer<typeof knowledgePageCompletionReceiptV1Schema>;

export function verifyKnowledgePageCompletionReceiptV1(input: KnowledgePageCompletionReceiptV1): KnowledgePageCompletionReceiptV1 {
  const receipt = knowledgePageCompletionReceiptV1Schema.parse(input);
  const persistence = verifyKnowledgePagePersistenceReceiptV1(receipt.persistenceReceipt);
  if (receipt.persistenceReceiptChecksum !== persistence.receiptChecksum) throw new Error('KNOWLEDGE_PAGE_COMPLETION_PERSISTENCE_CHECKSUM_MISMATCH');
  if (persistence.runId !== receipt.runId || persistence.jobId !== receipt.jobId || persistence.pageId !== receipt.pageId || persistence.pagePath !== receipt.pagePath) throw new Error('KNOWLEDGE_PAGE_COMPLETION_PERSISTENCE_IDENTITY_MISMATCH');
  if (persistence.workspaceRevision !== receipt.workspaceRevision || persistence.sourceSnapshotRevision !== receipt.sourceSnapshotRevision || persistence.sourceSetChecksum !== receipt.sourceSetChecksum) throw new Error('KNOWLEDGE_PAGE_COMPLETION_PERSISTENCE_SOURCE_MISMATCH');
  if (persistence.pageRevision !== receipt.pageRevision || persistence.pageChecksum !== receipt.pageChecksum || persistence.claimSetChecksum !== receipt.claimSetChecksum || persistence.claimCount !== receipt.claimCount || persistence.verificationReceiptChecksum !== receipt.verificationReceiptChecksum) throw new Error('KNOWLEDGE_PAGE_COMPLETION_PERSISTENCE_CONTENT_MISMATCH');
  const { receiptChecksum: _receiptChecksum, ...body } = receipt;
  if (sha256HexV1(body) !== receipt.receiptChecksum) throw new Error('KNOWLEDGE_PAGE_COMPLETION_RECEIPT_CHECKSUM_MISMATCH');
  if (!receipt.durablePersistenceVerified || receipt.writesPerformed !== false) throw new Error('KNOWLEDGE_PAGE_COMPLETION_DURABILITY_INVALID');
  return receipt;
}

function assertBindingCoordinates(input: {
  job: KnowledgePageJobV1;
  runId: string;
  sourceSnapshotRevision: string;
  binding: KnowledgePageDagBindingV1;
}): void {
  const { job, runId, sourceSnapshotRevision, binding } = input;
  if (binding.runId !== runId) throw new Error('KNOWLEDGE_PAGE_COMPLETION_BINDING_RUN_MISMATCH');
  if (binding.jobId !== job.jobId || binding.pageId !== job.pageId) throw new Error('KNOWLEDGE_PAGE_COMPLETION_BINDING_JOB_MISMATCH');
  if (binding.sourceSnapshotRevision !== sourceSnapshotRevision) throw new Error('KNOWLEDGE_PAGE_COMPLETION_BINDING_SNAPSHOT_MISMATCH');
  if (binding.sourceSetChecksum !== job.sourceSetChecksum) throw new Error('KNOWLEDGE_PAGE_COMPLETION_BINDING_SOURCE_SET_MISMATCH');
}

/**
 * Construct the receipt that is eligible to move a page job to COMPLETE.
 * The caller supplies a typed persistence/readback receipt after page + claim
 * state are durable. This helper validates lineage/proof agreement and returns
 * the CURRENT manifest entry that must be stored with the completion receipt.
 */
export function buildKnowledgePageCompletionV1(input: {
  runId: string;
  job: KnowledgePageJobV1;
  workspaceRevision: string;
  sourceSnapshotRevision: string;
  pageRevision: string;
  pageChecksum: string;
  claimSetChecksum: string;
  claimCount: number;
  verificationReceiptChecksum: string;
  persistenceReceipt: KnowledgePagePersistenceReceiptV1;
  snapshot: KnowledgePageSnapshotV1;
  dagBinding: KnowledgePageDagBindingV1;
  dagExecutionReceipt: KernelBoundDagExecutionReceiptV1;
  completedBy: string;
}): { receipt: KnowledgePageCompletionReceiptV1; manifestEntry: KnowledgePageManifestEntryV1 } {
  const job = knowledgePageJobV1Schema.parse(input.job);
  const snapshot = knowledgePageSnapshotV1Schema.parse(input.snapshot);
  const { snapshotChecksum: _snapshotChecksum, ...snapshotBody } = snapshot;
  if (sha256HexV1(snapshotBody) !== snapshot.snapshotChecksum) throw new Error('KNOWLEDGE_PAGE_COMPLETION_SNAPSHOT_CHECKSUM_MISMATCH');
  const binding = knowledgePageDagBindingV1Schema.parse(input.dagBinding);
  const { bindingChecksum: _bindingChecksum, ...bindingBody } = binding;
  if (sha256HexV1(bindingBody) !== binding.bindingChecksum) throw new Error('KNOWLEDGE_PAGE_COMPLETION_BINDING_CHECKSUM_MISMATCH');
  const execution = kernelBoundDagExecutionReceiptV1Schema.parse(input.dagExecutionReceipt);
  const { receiptChecksum: _executionChecksum, ...executionBody } = execution;
  if (sha256HexV1(executionBody) !== execution.receiptChecksum) throw new Error('KNOWLEDGE_PAGE_COMPLETION_EXECUTION_RECEIPT_CHECKSUM_MISMATCH');
  const persistence = verifyKnowledgePagePersistenceReceiptV1(input.persistenceReceipt);

  if (job.status !== 'PENDING') throw new Error(`KNOWLEDGE_PAGE_COMPLETION_JOB_NOT_PENDING:${job.status}`);
  if (!input.runId.trim() || !input.workspaceRevision.trim() || !input.sourceSnapshotRevision.trim() || !input.pageRevision.trim() || !input.completedBy.trim()) {
    throw new Error('KNOWLEDGE_PAGE_COMPLETION_COORDINATES_REQUIRED');
  }
  sha256Hex.parse(input.pageChecksum);
  sha256Hex.parse(input.claimSetChecksum);
  sha256Hex.parse(input.verificationReceiptChecksum);
  if (persistence.runId !== input.runId || persistence.jobId !== job.jobId || persistence.pageId !== job.pageId || persistence.pagePath !== job.path) throw new Error('KNOWLEDGE_PAGE_COMPLETION_PERSISTENCE_IDENTITY_MISMATCH');
  if (persistence.workspaceRevision !== input.workspaceRevision || persistence.sourceSnapshotRevision !== input.sourceSnapshotRevision || persistence.sourceSetChecksum !== job.sourceSetChecksum) throw new Error('KNOWLEDGE_PAGE_COMPLETION_PERSISTENCE_SOURCE_MISMATCH');
  if (persistence.pageRevision !== input.pageRevision || persistence.pageChecksum !== input.pageChecksum || persistence.claimSetChecksum !== input.claimSetChecksum || persistence.claimCount !== input.claimCount || persistence.verificationReceiptChecksum !== input.verificationReceiptChecksum) throw new Error('KNOWLEDGE_PAGE_COMPLETION_PERSISTENCE_CONTENT_MISMATCH');
  if (snapshot.runId !== input.runId || snapshot.jobId !== job.jobId || snapshot.pageId !== job.pageId) throw new Error('KNOWLEDGE_PAGE_COMPLETION_SNAPSHOT_IDENTITY_MISMATCH');
  assertBindingCoordinates({ job, runId: input.runId, sourceSnapshotRevision: input.sourceSnapshotRevision, binding });
  if (execution.planId !== binding.planId || execution.planChecksum !== binding.planChecksum) throw new Error('KNOWLEDGE_PAGE_COMPLETION_EXECUTION_PLAN_MISMATCH');
  if (execution.writesPerformed !== false) throw new Error('KNOWLEDGE_PAGE_COMPLETION_EXECUTION_WRITE_FORBIDDEN');

  const manifestEntry = knowledgePageManifestEntryV1Schema.parse({
    schema: 'atlas.knowledge-page-manifest-entry.v1',
    pageId: job.pageId,
    path: job.path,
    workspaceRevision: input.workspaceRevision,
    sourceSnapshotRevision: input.sourceSnapshotRevision,
    sourceSetChecksum: job.sourceSetChecksum,
    pageRevision: input.pageRevision,
    pageChecksum: input.pageChecksum,
    claimSetChecksum: input.claimSetChecksum,
    claimCount: input.claimCount,
    verificationReceiptChecksum: input.verificationReceiptChecksum,
    completedRunId: input.runId,
    completedBy: input.completedBy,
    status: 'CURRENT',
    canonicalAuthority: false,
  });
  const manifestEntryChecksum = sha256HexV1(manifestEntry);
  const body = {
    schema: 'atlas.knowledge-page-completion-receipt.v1' as const,
    runId: input.runId,
    jobId: job.jobId,
    pageId: job.pageId,
    pagePath: job.path,
    workspaceRevision: input.workspaceRevision,
    sourceSnapshotRevision: input.sourceSnapshotRevision,
    sourceSetChecksum: job.sourceSetChecksum,
    pageRevision: input.pageRevision,
    pageChecksum: input.pageChecksum,
    claimSetChecksum: input.claimSetChecksum,
    claimCount: input.claimCount,
    verificationReceiptChecksum: input.verificationReceiptChecksum,
    persistenceReceipt: persistence,
    persistenceReceiptChecksum: persistence.receiptChecksum,
    snapshotChecksum: snapshot.snapshotChecksum,
    dagBindingChecksum: binding.bindingChecksum,
    dagPlanId: binding.planId,
    dagPlanChecksum: binding.planChecksum,
    dagExecutionReceiptChecksum: execution.receiptChecksum,
    manifestEntryChecksum,
    completedBy: input.completedBy,
    durablePersistenceVerified: true as const,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  const receipt = knowledgePageCompletionReceiptV1Schema.parse({ ...body, receiptChecksum: sha256HexV1(body) });
  return { receipt, manifestEntry };
}
