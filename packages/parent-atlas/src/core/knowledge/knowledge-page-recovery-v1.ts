import { z } from 'zod';
import { buildKnowledgePageSnapshotV1, knowledgePageJobV1Schema, type KnowledgePageJobV1 } from './knowledge-page-v1.js';
import { sha256HexV1, sha256TextV1 } from './stable-json-v1.js';

const id = z.string().trim().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export interface KnowledgePageFileAdapterV1 {
  readUtf8(path: string): Promise<string | null>;
  writeUtf8Exact(path: string, content: string): Promise<void>;
  removeIfExists(path: string): Promise<void>;
}

export const knowledgePageRecoveryReceiptV1Schema = z.object({
  schema: z.literal('atlas.knowledge-page-recovery-receipt.v1').default('atlas.knowledge-page-recovery-receipt.v1'),
  runId: id,
  jobId: id,
  pageId: id,
  pagePath: id,
  claimStatePath: id,
  snapshotChecksum: sha256Hex,
  beforePageChecksum: sha256Hex.nullable(),
  beforeClaimSetChecksum: sha256Hex.nullable(),
  afterPageChecksum: sha256Hex.nullable(),
  afterClaimSetChecksum: sha256Hex.nullable(),
  durableSubmitted: z.boolean(),
  completionReceiptChecksum: sha256Hex.nullable(),
  rollbackPerformed: z.boolean(),
  restoredExact: z.boolean(),
  status: z.enum(['SUBMITTED', 'ROLLED_BACK_PRE_SUBMIT', 'POST_SUBMIT_FAILED_NO_ROLLBACK']),
  failureStage: z.enum(['WORKER', 'DURABLE_SUBMIT', 'POST_SUBMIT']).nullable(),
  knowledgeFileAdapterUsed: z.literal(true).default(true),
  externalStoreWritesPerformed: z.literal(false).default(false),
  canonicalAuthority: z.literal(false).default(false),
  receiptChecksum: sha256Hex,
}).strict();
export type KnowledgePageRecoveryReceiptV1 = z.infer<typeof knowledgePageRecoveryReceiptV1Schema>;

function checksumOrNull(value: string | null): string | null {
  return value === null ? null : sha256TextV1(value);
}

async function restoreExact(adapter: KnowledgePageFileAdapterV1, path: string, before: string | null): Promise<void> {
  if (before === null) await adapter.removeIfExists(path);
  else await adapter.writeUtf8Exact(path, before);
}

async function readPair(adapter: KnowledgePageFileAdapterV1, pagePath: string, claimStatePath: string) {
  const [page, claims] = await Promise.all([adapter.readUtf8(pagePath), adapter.readUtf8(claimStatePath)]);
  return { page, claims, pageChecksum: checksumOrNull(page), claimChecksum: checksumOrNull(claims) };
}

function sealRecoveryReceipt(body: Omit<KnowledgePageRecoveryReceiptV1, 'schema' | 'receiptChecksum' | 'knowledgeFileAdapterUsed' | 'externalStoreWritesPerformed' | 'canonicalAuthority'>): KnowledgePageRecoveryReceiptV1 {
  const sealed = {
    schema: 'atlas.knowledge-page-recovery-receipt.v1' as const,
    ...body,
    knowledgeFileAdapterUsed: true as const,
    externalStoreWritesPerformed: false as const,
    canonicalAuthority: false as const,
  };
  return knowledgePageRecoveryReceiptV1Schema.parse({ ...sealed, receiptChecksum: sha256HexV1(sealed) });
}

/**
 * Execute one bounded knowledge-page worker with an exact recovery boundary.
 * Any failure before durable submission restores the page and claim sidecar
 * byte-for-byte. Once durableSubmit returns a receipt checksum, later failures
 * never roll back the submitted state.
 */
export async function executeKnowledgePageWorkerWithRollbackV1(input: {
  runId: string;
  job: KnowledgePageJobV1;
  claimStatePath: string;
  adapter: KnowledgePageFileAdapterV1;
  worker: () => Promise<void>;
  durableSubmit: () => Promise<{ completionReceiptChecksum: string }>;
  postSubmit?: () => Promise<void>;
}): Promise<KnowledgePageRecoveryReceiptV1> {
  const job = knowledgePageJobV1Schema.parse(input.job);
  if (job.status !== 'PENDING') throw new Error(`KNOWLEDGE_PAGE_RECOVERY_JOB_NOT_PENDING:${job.status}`);
  if (!input.runId.trim() || !input.claimStatePath.trim()) throw new Error('KNOWLEDGE_PAGE_RECOVERY_COORDINATES_REQUIRED');

  const before = await readPair(input.adapter, job.path, input.claimStatePath);
  const snapshot = buildKnowledgePageSnapshotV1({
    runId: input.runId,
    jobId: job.jobId,
    pageId: job.pageId,
    beforePageChecksum: before.pageChecksum,
    beforeClaimSetChecksum: before.claimChecksum,
    beforePageArtifactRef: null,
    beforeClaimArtifactRef: null,
  });

  const rollback = async (failureStage: 'WORKER' | 'DURABLE_SUBMIT') => {
    await restoreExact(input.adapter, job.path, before.page);
    await restoreExact(input.adapter, input.claimStatePath, before.claims);
    const after = await readPair(input.adapter, job.path, input.claimStatePath);
    const restoredExact = after.page === before.page && after.claims === before.claims;
    if (!restoredExact) throw new Error('KNOWLEDGE_PAGE_ROLLBACK_PARITY_FAILED');
    return sealRecoveryReceipt({
      runId: input.runId,
      jobId: job.jobId,
      pageId: job.pageId,
      pagePath: job.path,
      claimStatePath: input.claimStatePath,
      snapshotChecksum: snapshot.snapshotChecksum,
      beforePageChecksum: before.pageChecksum,
      beforeClaimSetChecksum: before.claimChecksum,
      afterPageChecksum: after.pageChecksum,
      afterClaimSetChecksum: after.claimChecksum,
      durableSubmitted: false,
      completionReceiptChecksum: null,
      rollbackPerformed: true,
      restoredExact,
      status: 'ROLLED_BACK_PRE_SUBMIT',
      failureStage,
    });
  };

  try {
    await input.worker();
  } catch {
    return rollback('WORKER');
  }

  let completionReceiptChecksum: string;
  try {
    const submission = await input.durableSubmit();
    completionReceiptChecksum = sha256Hex.parse(submission.completionReceiptChecksum);
  } catch {
    return rollback('DURABLE_SUBMIT');
  }

  if (input.postSubmit) {
    try {
      await input.postSubmit();
    } catch {
      const after = await readPair(input.adapter, job.path, input.claimStatePath);
      return sealRecoveryReceipt({
        runId: input.runId,
        jobId: job.jobId,
        pageId: job.pageId,
        pagePath: job.path,
        claimStatePath: input.claimStatePath,
        snapshotChecksum: snapshot.snapshotChecksum,
        beforePageChecksum: before.pageChecksum,
        beforeClaimSetChecksum: before.claimChecksum,
        afterPageChecksum: after.pageChecksum,
        afterClaimSetChecksum: after.claimChecksum,
        durableSubmitted: true,
        completionReceiptChecksum,
        rollbackPerformed: false,
        restoredExact: false,
        status: 'POST_SUBMIT_FAILED_NO_ROLLBACK',
        failureStage: 'POST_SUBMIT',
      });
    }
  }

  const after = await readPair(input.adapter, job.path, input.claimStatePath);
  return sealRecoveryReceipt({
    runId: input.runId,
    jobId: job.jobId,
    pageId: job.pageId,
    pagePath: job.path,
    claimStatePath: input.claimStatePath,
    snapshotChecksum: snapshot.snapshotChecksum,
    beforePageChecksum: before.pageChecksum,
    beforeClaimSetChecksum: before.claimChecksum,
    afterPageChecksum: after.pageChecksum,
    afterClaimSetChecksum: after.claimChecksum,
    durableSubmitted: true,
    completionReceiptChecksum,
    rollbackPerformed: false,
    restoredExact: false,
    status: 'SUBMITTED',
    failureStage: null,
  });
}
