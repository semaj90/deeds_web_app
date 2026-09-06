import { describe, expect, it } from 'vitest';
import { buildKernelOperatorV1, buildKernelOperatorLibraryV1 } from '../kernel-operator-library-v1.js';
import { buildAtlasKernelFunctionV1 } from '../kernel-function-v1.js';
import { buildAtlasKernelFunctionCatalogV1 } from '../kernel-function-catalog-v1.js';
import { buildAtlasOntologyKernelManifestV1 } from '../ontology-kernel-manifest-v1.js';
import { buildAtlasOntologyKernelSchemaV1 } from '../ontology-kernel-schema-v1.js';
import { planKnowledgePageJobV1 } from './knowledge-page-dag-binding-v1.js';
import { sha256TextV1 } from './stable-json-v1.js';

const operator = buildKernelOperatorV1({ operatorId: 'op:get_source_span', operatorRevision: 'op:v1', kind: 'GET_SOURCE_SPAN', inputSchemaId: 'knowledge-page-input:v1', outputSchemaId: 'source-evidence:v1', executorClass: 'FILE_EXECUTOR', allowedArtifactKinds: ['source'], implementationRef: 'source-registry', implementationKind: 'typescript_function', verifiedLive: false, deterministic: true, producerRevision: 'test:v1' });
const library = buildKernelOperatorLibraryV1({ libraryRevision: 'operators:v1', operators: [operator] });
const fn = buildAtlasKernelFunctionV1({ functionId: 'knowledge_page_source_evidence', kernelRevision: 'kernel:v1', inputSchemaId: 'knowledge-page-input:v1', outputSchemaId: 'source-evidence:v1', operatorLibrary: library, operatorGraph: [{ stepId: 'step:source', operatorId: operator.operatorId }], allowedEvidenceClasses: ['source'], mutationPolicy: 'READ_ONLY', producerRevision: 'test:v1' });
const catalog = buildAtlasKernelFunctionCatalogV1({ catalogId: 'catalog:knowledge', catalogRevision: 'kernel:v1', taskClass: 'knowledge-generation', operatorLibrary: library, functions: [{ ...fn, kernelRevision: undefined }], producerRevision: 'test:v1' });
const schema = buildAtlasOntologyKernelSchemaV1({ schemaId: 'schema:knowledge', taskClass: 'knowledge-generation', entityTypes: [{ entityTypeId: 'entity:knowledge-page', label: 'Knowledge Page', sourceContract: 'KnowledgePageJobV1', identityFields: ['pageId'] }], relationTypes: [], constraints: [], producerRevision: 'test:v1' });
const manifest = buildAtlasOntologyKernelManifestV1({ kernelId: 'kernel:knowledge', kernelRevision: 'kernel:v1', schema, operatorLibrary: library, functions: [fn], producerRevision: 'test:v1' });

const job = {
  schema: 'atlas.knowledge-page-job.v1' as const,
  jobId: 'job:1',
  pageId: 'page:1',
  path: 'docs/knowledge/one.md',
  title: 'One',
  purpose: 'Document one.',
  sourceSetChecksum: sha256TextV1('sources'),
  relatedPageIds: [],
  instructions: ['ground every factual claim'],
  status: 'PENDING' as const,
  completedBy: null,
};

describe('KnowledgePageDagBindingV1', () => {
  it('delegates page planning to the frozen kernel-bound DAG planner', () => {
    const first = planKnowledgePageJobV1({ job, runId: 'run:1', workspaceRevision: 'workspace:r1', sourceSnapshotRevision: 'snapshot:r1', manifest, catalog, operatorLibrary: library, functionId: fn.functionId, plannerRevision: 'planner:v1', classificationRevision: 'class:v1', evidenceRefs: ['source:src/a.ts'] });
    const second = planKnowledgePageJobV1({ job, runId: 'run:1', workspaceRevision: 'workspace:r1', sourceSnapshotRevision: 'snapshot:r1', manifest, catalog, operatorLibrary: library, functionId: fn.functionId, plannerRevision: 'planner:v1', classificationRevision: 'class:v1', evidenceRefs: ['source:src/a.ts'] });
    expect(first).toEqual(second);
    expect(first.plan.actions[0]?.actionKind).toBe('FETCH_FILE');
    expect(first.plan.actions[0]?.mutationPolicy).toBe('READ_ONLY');
    expect(first.binding.planChecksum).toBe(first.plan.planChecksum);
    expect(first.binding.writesPerformed).toBe(false);
  });

  it('refuses to plan a completed page job', () => {
    expect(() => planKnowledgePageJobV1({ job: { ...job, status: 'COMPLETE', completedBy: 'worker:1' }, runId: 'run:1', workspaceRevision: 'workspace:r1', sourceSnapshotRevision: 'snapshot:r1', manifest, catalog, operatorLibrary: library, functionId: fn.functionId, plannerRevision: 'planner:v1', classificationRevision: 'class:v1', evidenceRefs: ['source:src/a.ts'] })).toThrow('KNOWLEDGE_PAGE_JOB_NOT_PENDING');
  });
});
