import { describe, expect, it } from 'vitest';
import { buildKernelOperatorV1, buildKernelOperatorLibraryV1 } from './kernel-operator-library-v1.js';
import { buildAtlasKernelFunctionV1 } from './kernel-function-v1.js';
import { buildAtlasKernelFunctionCatalogV1 } from './kernel-function-catalog-v1.js';
import { buildAtlasOntologyKernelManifestV1 } from './ontology-kernel-manifest-v1.js';
import { buildAtlasOntologyKernelSchemaV1 } from './ontology-kernel-schema-v1.js';
import { admitOak2026DspyProposalV1, computeOak2026BindingChecksumV1 } from './oak2026-dspy-admission-v1.js';

const operator = buildKernelOperatorV1({
  operatorId: 'op:lookup_symbol',
  operatorRevision: 'op:v1',
  kind: 'LOOKUP_SYMBOL',
  inputSchemaId: 'input:v1',
  outputSchemaId: 'output:v1',
  executorClass: 'DB_QUERY_EXECUTOR',
  allowedArtifactKinds: ['symbol'],
  implementationRef: 'table:atlas_symbol_registry',
  implementationKind: 'postgres_table',
  verifiedLive: false,
  deterministic: true,
  producerRevision: 'test:v1',
});
const library = buildKernelOperatorLibraryV1({ libraryRevision: 'operators:v1', operators: [operator] });
const fn = buildAtlasKernelFunctionV1({
  functionId: 'find_symbol',
  kernelRevision: 'kernel:v1',
  inputSchemaId: 'input:v1',
  outputSchemaId: 'output:v1',
  operatorLibrary: library,
  operatorGraph: [{ stepId: 'step:1', operatorId: operator.operatorId }],
  allowedEvidenceClasses: ['symbol'],
  mutationPolicy: 'READ_ONLY',
  producerRevision: 'test:v1',
});
const catalog = buildAtlasKernelFunctionCatalogV1({
  catalogId: 'catalog:1',
  catalogRevision: 'kernel:v1',
  taskClass: 'symbol-repair',
  operatorLibrary: library,
  functions: [{ ...fn, kernelRevision: undefined }],
  producerRevision: 'test:v1',
});
const schema = buildAtlasOntologyKernelSchemaV1({
  schemaId: 'schema:1',
  taskClass: 'symbol-repair',
  entityTypes: [{ entityTypeId: 'entity:symbol', label: 'Symbol', sourceContract: 'symbol-registry', identityFields: ['stableSymbolId'] }],
  relationTypes: [],
  constraints: [],
  producerRevision: 'test:v1',
});
const manifest = buildAtlasOntologyKernelManifestV1({
  kernelId: 'kernel:1',
  kernelRevision: 'kernel:v1',
  schema,
  operatorLibrary: library,
  functions: [fn],
  producerRevision: 'test:v1',
});

function proposal() {
  return {
    schema: 'atlas.oak2026-dspy-proposal.v1' as const,
    kernelRevision: manifest.kernelRevision,
    taskClass: manifest.taskClass,
    schemaChecksum: manifest.schemaChecksum,
    functionCatalogChecksum: catalog.catalogChecksum,
    bindingChecksum: computeOak2026BindingChecksumV1({ manifest, catalog }),
    programRevision: 'dspy:oak2026:v1',
    requiredEvidenceClasses: ['symbol'],
    classificationConfidence: 0.9,
    functionName: fn.functionId,
    arguments: { symbol: 'foo' },
    evidenceRefs: ['evidence:1'],
    canonicalAuthority: false as const,
  };
}

describe('Oak2026DspyAdmissionV1', () => {
  it('admits a frozen-bound DSPy proposal into the existing DAG planner', () => {
    const plan = admitOak2026DspyProposalV1({
      proposal: proposal(), manifest, catalog, operatorLibrary: library,
      planId: 'plan:1', queryId: 'query:1', plannerRevision: 'planner:v1',
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]!.actionKind).toBe('FETCH_POSTGRES');
    expect(plan.actions[0]!.mutationPolicy).toBe('READ_ONLY');
  });

  it('rejects a binding checksum that does not match manifest/catalog authority', () => {
    expect(() => admitOak2026DspyProposalV1({
      proposal: { ...proposal(), bindingChecksum: 'a'.repeat(64) }, manifest, catalog, operatorLibrary: library,
      planId: 'plan:2', queryId: 'query:2', plannerRevision: 'planner:v1',
    })).toThrow('OAK2026_DSPY_BINDING_CHECKSUM_MISMATCH');
  });

  it('rejects model-selected task-class drift', () => {
    expect(() => admitOak2026DspyProposalV1({
      proposal: { ...proposal(), taskClass: 'other-task' }, manifest, catalog, operatorLibrary: library,
      planId: 'plan:3', queryId: 'query:3', plannerRevision: 'planner:v1',
    })).toThrow('OAK2026_DSPY_TASK_CLASS_MISMATCH');
  });

  it('rejects evidence classes outside the selected function contract', () => {
    expect(() => admitOak2026DspyProposalV1({
      proposal: { ...proposal(), requiredEvidenceClasses: ['secret'] }, manifest, catalog, operatorLibrary: library,
      planId: 'plan:4', queryId: 'query:4', plannerRevision: 'planner:v1',
    })).toThrow('OAK2026_DSPY_EVIDENCE_CLASS_NOT_ALLOWED');
  });
});
