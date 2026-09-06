import { z } from 'zod';
import { planKernelBoundDagV1 } from '../kernel-bound-dag-planner-v1.js';
import type { AtlasKernelFunctionCatalogV1 } from '../kernel-function-catalog-v1.js';
import type { KernelOperatorLibraryV1 } from '../kernel-operator-library-v1.js';
import type { AtlasOntologyKernelManifestV1 } from '../ontology-kernel-manifest-v1.js';
import { knowledgePageJobV1Schema, type KnowledgePageJobV1 } from './knowledge-page-v1.js';
import { sha256HexV1 } from './stable-json-v1.js';

const id = z.string().trim().min(1);
const revision = z.string().trim().min(1);
const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/);

export const knowledgePageDagBindingV1Schema = z.object({
  schema: z.literal('atlas.knowledge-page-dag-binding.v1').default('atlas.knowledge-page-dag-binding.v1'),
  runId: id,
  jobId: id,
  pageId: id,
  functionId: id,
  kernelRevision: revision,
  catalogRevision: revision,
  operatorLibraryRevision: revision,
  sourceSnapshotRevision: revision,
  sourceSetChecksum: sha256Hex,
  inputChecksum: sha256Hex,
  planId: id,
  planChecksum: sha256Hex,
  actionCount: z.number().int().positive(),
  actionMutationPolicies: z.array(z.enum(['READ_ONLY', 'PROPOSE_ONLY'])).min(1),
  bindingChecksum: sha256Hex,
  canonicalAuthority: z.literal(false).default(false),
  writesPerformed: z.literal(false).default(false),
}).strict();
export type KnowledgePageDagBindingV1 = z.infer<typeof knowledgePageDagBindingV1Schema>;

export function planKnowledgePageJobV1(input: {
  job: KnowledgePageJobV1;
  runId: string;
  workspaceRevision: string;
  sourceSnapshotRevision: string;
  manifest: AtlasOntologyKernelManifestV1;
  catalog: AtlasKernelFunctionCatalogV1;
  operatorLibrary: KernelOperatorLibraryV1;
  functionId: string;
  plannerRevision: string;
  classificationRevision: string;
  evidenceRefs: string[];
}) {
  const job = knowledgePageJobV1Schema.parse(input.job);
  if (job.status !== 'PENDING') throw new Error(`KNOWLEDGE_PAGE_JOB_NOT_PENDING:${job.status}`);
  if (!input.runId.trim() || !input.workspaceRevision.trim() || !input.sourceSnapshotRevision.trim()) throw new Error('KNOWLEDGE_PAGE_DAG_COORDINATES_REQUIRED');
  const evidenceRefs = [...new Set(input.evidenceRefs)].sort();
  const boundArguments = {
    knowledgePageJob: {
      jobId: job.jobId,
      pageId: job.pageId,
      path: job.path,
      title: job.title,
      purpose: job.purpose,
      sourceSetChecksum: job.sourceSetChecksum,
      relatedPageIds: [...job.relatedPageIds],
      instructions: [...job.instructions],
    },
    runId: input.runId,
    workspaceRevision: input.workspaceRevision,
    sourceSnapshotRevision: input.sourceSnapshotRevision,
  };
  const inputChecksum = sha256HexV1({ boundArguments, evidenceRefs });
  const planId = `knowledge:${input.runId}:${job.jobId}`;
  const plan = planKernelBoundDagV1({
    manifest: input.manifest,
    catalog: input.catalog,
    operatorLibrary: input.operatorLibrary,
    functionId: input.functionId,
    request: {
      planId,
      queryId: `knowledge-page:${job.pageId}`,
      plannerRevision: input.plannerRevision,
      classificationRevision: input.classificationRevision,
      boundArguments,
      evidenceRefs,
      inputChecksum,
    },
  });
  const actionMutationPolicies = plan.actions.map((action) => {
    if (action.mutationPolicy === 'MUTATES_WITH_RECEIPT') throw new Error('KNOWLEDGE_PAGE_DAG_MUTATION_FORBIDDEN');
    return action.mutationPolicy;
  });
  const body = {
    schema: 'atlas.knowledge-page-dag-binding.v1' as const,
    runId: input.runId,
    jobId: job.jobId,
    pageId: job.pageId,
    functionId: input.functionId,
    kernelRevision: input.manifest.kernelRevision,
    catalogRevision: input.catalog.catalogRevision,
    operatorLibraryRevision: input.operatorLibrary.libraryRevision,
    sourceSnapshotRevision: input.sourceSnapshotRevision,
    sourceSetChecksum: job.sourceSetChecksum,
    inputChecksum,
    planId: plan.planId,
    planChecksum: plan.planChecksum,
    actionCount: plan.actions.length,
    actionMutationPolicies,
    canonicalAuthority: false as const,
    writesPerformed: false as const,
  };
  const binding = knowledgePageDagBindingV1Schema.parse({ ...body, bindingChecksum: sha256HexV1(body) });
  return { plan, binding };
}
