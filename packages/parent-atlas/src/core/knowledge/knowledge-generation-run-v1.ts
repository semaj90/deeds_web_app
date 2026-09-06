import { z } from 'zod';
import { knowledgePageJobV1Schema } from './knowledge-page-v1.js';
import { sha256HexV1 } from './stable-json-v1.js';

const id = z.string().trim().min(1);
const revision = z.string().trim().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const knowledgeGenerationRunV1Schema = z.object({
  schema: z.literal('atlas.knowledge-generation-run.v1').default('atlas.knowledge-generation-run.v1'),
  runId: id,
  mode: z.enum(['INIT', 'UPDATE']),
  phase: z.enum(['PLANNING', 'GENERATING']),
  startedAt: z.string().datetime(),
  workspaceRevision: revision,
  sourceSnapshotRevision: revision,
  sourceSetChecksum: sha256Hex,
  dagRevision: revision,
  plannerRevision: revision,
  programRevision: revision,
  modelRevision: revision,
  pageJobs: z.array(knowledgePageJobV1Schema),
  runChecksum: sha256Hex,
  canonicalAuthority: z.literal(false).default(false),
}).strict().superRefine((run, ctx) => {
  const ids = new Set<string>();
  const pages = new Set<string>();
  for (const job of run.pageJobs) {
    if (ids.has(job.jobId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pageJobs'], message: `Duplicate jobId ${job.jobId}` });
    if (pages.has(job.pageId)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['pageJobs'], message: `Duplicate pageId ${job.pageId}` });
    ids.add(job.jobId);
    pages.add(job.pageId);
  }
});
export type KnowledgeGenerationRunV1 = z.infer<typeof knowledgeGenerationRunV1Schema>;

export function buildKnowledgeGenerationRunV1(
  input: Omit<KnowledgeGenerationRunV1, 'schema' | 'runChecksum' | 'canonicalAuthority'>,
): KnowledgeGenerationRunV1 {
  const body = { schema: 'atlas.knowledge-generation-run.v1' as const, ...input, canonicalAuthority: false as const };
  return knowledgeGenerationRunV1Schema.parse({ ...body, runChecksum: sha256HexV1(body) });
}

export function nextPendingKnowledgePageV1(runInput: KnowledgeGenerationRunV1) {
  const run = knowledgeGenerationRunV1Schema.parse(runInput);
  return run.pageJobs.find((job) => job.status === 'PENDING') ?? null;
}

export function canFinishKnowledgeGenerationRunV1(runInput: KnowledgeGenerationRunV1): boolean {
  const run = knowledgeGenerationRunV1Schema.parse(runInput);
  return run.pageJobs.every((job) => job.status === 'COMPLETE' || job.status === 'SKIPPED');
}
