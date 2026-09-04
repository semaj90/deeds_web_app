import { describe, expect, it } from 'vitest';
import { buildAdaptiveDagPlanV1 } from './adaptive-dag-plan-v1.js';
import { buildKernelOperatorV1, buildKernelOperatorLibraryV1 } from './kernel-operator-library-v1.js';
import { buildAtlasKernelFunctionV1 } from './kernel-function-v1.js';
import { buildAtlasKernelFunctionCatalogV1 } from './kernel-function-catalog-v1.js';
import { buildAtlasOntologyKernelManifestV1 } from './ontology-kernel-manifest-v1.js';
import { buildAtlasOntologyKernelSchemaV1 } from './ontology-kernel-schema-v1.js';
import { planKernelBoundDagV1 } from './kernel-bound-dag-planner-v1.js';
import { checksumKernelDagBoundArguments } from './kernel-dag-execution-binding-v1.js';

const checksum = 'a'.repeat(64);
const operator = buildKernelOperatorV1({ operatorId: 'op:lookup_symbol', operatorRevision: 'op:v1', kind: 'LOOKUP_SYMBOL', inputSchemaId: 'input:v1', outputSchemaId: 'output:v1', executorClass: 'DB_QUERY_EXECUTOR', allowedArtifactKinds: ['symbol'], implementationRef: 'table:atlas_symbol_registry', implementationKind: 'postgres_table', verifiedLive: false, deterministic: true, producerRevision: 'test:v1' });
const library = buildKernelOperatorLibraryV1({ libraryRevision: 'operators:v1', operators: [operator] });
const fn = buildAtlasKernelFunctionV1({ functionId: 'find_symbol', kernelRevision: 'kernel:v1', inputSchemaId: 'input:v1', outputSchemaId: 'output:v1', operatorLibrary: library, operatorGraph: [{ stepId: 'step:1', operatorId: operator.operatorId }], allowedEvidenceClasses: ['symbol'], mutationPolicy: 'READ_ONLY', producerRevision: 'test:v1' });
const catalog = buildAtlasKernelFunctionCatalogV1({ catalogId: 'catalog:1', catalogRevision: 'kernel:v1', taskClass: 'symbol-repair', operatorLibrary: library, functions: [{ ...fn, kernelRevision: undefined }], producerRevision: 'test:v1' });
const schema = buildAtlasOntologyKernelSchemaV1({ schemaId: 'schema:1', taskClass: 'symbol-repair', entityTypes: [{ entityTypeId: 'entity:symbol', label: 'Symbol', sourceContract: 'symbol-registry', identityFields: ['stableSymbolId'] }], relationTypes: [], constraints: [], producerRevision: 'test:v1' });
const manifest = buildAtlasOntologyKernelManifestV1({ kernelId: 'kernel:1', kernelRevision: 'kernel:v1', schema, operatorLibrary: library, functions: [fn], producerRevision: 'test:v1' });

describe('KernelBoundDagPlannerV1', () => {
  it('lowers only the selected catalog function into a bounded plan', () => {
    const plan = planKernelBoundDagV1({ manifest, catalog, operatorLibrary: library, functionId: fn.functionId, request: { planId: 'plan:1', queryId: 'query:1', plannerRevision: 'planner:v1', classificationRevision: 'class:v1', boundArguments: { symbol: 'foo' }, evidenceRefs: ['evidence:1'], inputChecksum: checksum } });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]!.actionKind).toBe('FETCH_POSTGRES');
    expect(plan.actions[0]!.mutationPolicy).toBe('READ_ONLY');
    expect(plan.actions[0]!.parameterArtifactRef).toMatch(/^parameter:v1:/);
    expect(plan.actions[0]!.parameterChecksum).toMatch(/^[a-f0-9]{64}$/);
  });

  it('rejects a function not declared by the manifest', () => {
    expect(() => planKernelBoundDagV1({ manifest, catalog, operatorLibrary: library, functionId: 'missing', request: { planId: 'plan:2', queryId: 'query:2', plannerRevision: 'planner:v1', classificationRevision: 'class:v1', boundArguments: {}, evidenceRefs: ['evidence:1'], inputChecksum: checksum } })).toThrow('UNDECLARED_FUNCTION');
  });

  it('replays the same frozen inputs to an identical plan checksum', () => {
    const request = { planId: 'plan:replay', queryId: 'query:replay', plannerRevision: 'planner:v1', classificationRevision: 'class:v1', boundArguments: { symbol: 'foo' }, evidenceRefs: ['evidence:1'], inputChecksum: checksum };
    const first = planKernelBoundDagV1({ manifest, catalog, operatorLibrary: library, functionId: fn.functionId, request });
    const second = planKernelBoundDagV1({ manifest, catalog, operatorLibrary: library, functionId: fn.functionId, request: { ...request, boundArguments: { symbol: 'foo' } } });
    expect(second).toEqual(first);
    expect(second.planChecksum).toBe(first.planChecksum);
  });

  it('uses prevalidated operator-scoped arguments when provided', () => {
    const plan = planKernelBoundDagV1({ manifest, catalog, operatorLibrary: library, functionId: fn.functionId, request: {
      planId: 'plan:scoped', queryId: 'query:scoped', plannerRevision: 'planner:v1', classificationRevision: 'class:v1',
      boundArguments: { symbol: 'request-wide', unrelated: true },
      operatorArgumentsByOperatorId: { [operator.operatorId]: { symbol: 'scoped' } },
      evidenceRefs: ['evidence:1'], inputChecksum: checksum,
    } });
    expect(plan.actions[0]!.parameterChecksum).toBe(checksumKernelDagBoundArguments({ symbol: 'scoped' }));
    expect(plan.actions[0]!.parameterChecksum).not.toBe(checksumKernelDagBoundArguments({ symbol: 'request-wide', unrelated: true }));
  });

  it('lowers a FETCH_LATENT_REPRESENTATION operator to a FETCH_LATENT action (FETCH-LATENT-OPERATOR-01)', () => {
    const latentOperator = buildKernelOperatorV1({
      operatorId: 'op:fetch_latent_256',
      operatorRevision: 'op:v1',
      kind: 'FETCH_LATENT_REPRESENTATION',
      inputSchemaId: 'input:v1',
      outputSchemaId: 'atlas.candidate-representation-slice.v1',
      executorClass: 'DB_QUERY_EXECUTOR',
      allowedArtifactKinds: ['symbol'],
      implementationRef: 'table:codebase_chunk_index.latent_256',
      implementationKind: 'postgres_table',
      verifiedLive: false,
      deterministic: true,
      producerRevision: 'test:v1',
    });
    const latentLibrary = buildKernelOperatorLibraryV1({ libraryRevision: 'operators:latent:v1', operators: [latentOperator] });
    const latentFn = buildAtlasKernelFunctionV1({
      functionId: 'fetch_latent_256',
      kernelRevision: 'kernel:latent:v1',
      inputSchemaId: 'input:v1',
      outputSchemaId: 'atlas.candidate-representation-slice.v1',
      operatorLibrary: latentLibrary,
      operatorGraph: [{ stepId: 'step:1', operatorId: latentOperator.operatorId }],
      allowedEvidenceClasses: ['symbol'],
      mutationPolicy: 'READ_ONLY',
      producerRevision: 'test:v1',
    });
    const latentSchema = buildAtlasOntologyKernelSchemaV1({ schemaId: 'schema:latent:1', taskClass: 'latent-fetch', entityTypes: [{ entityTypeId: 'entity:symbol', label: 'Symbol', sourceContract: 'symbol-registry', identityFields: ['stableSymbolId'] }], relationTypes: [], constraints: [], producerRevision: 'test:v1' });
    const latentManifest = buildAtlasOntologyKernelManifestV1({ kernelId: 'kernel:latent:1', kernelRevision: 'kernel:latent:v1', schema: latentSchema, operatorLibrary: latentLibrary, functions: [latentFn], producerRevision: 'test:v1' });
    const latentCatalog = buildAtlasKernelFunctionCatalogV1({ catalogId: 'catalog:latent:1', catalogRevision: 'kernel:latent:v1', taskClass: 'latent-fetch', operatorLibrary: latentLibrary, functions: [{ ...latentFn, kernelRevision: undefined }], producerRevision: 'test:v1' });

    const plan = planKernelBoundDagV1({
      manifest: latentManifest,
      catalog: latentCatalog,
      operatorLibrary: latentLibrary,
      functionId: latentFn.functionId,
      request: { planId: 'plan:latent', queryId: 'query:latent', plannerRevision: 'planner:v1', classificationRevision: 'class:v1', boundArguments: { candidateIds: ['a', 'b'] }, evidenceRefs: ['evidence:1'], inputChecksum: checksum },
    });
    expect(plan.actions).toHaveLength(1);
    expect(plan.actions[0]!.actionKind).toBe('FETCH_LATENT');
    expect(plan.actions[0]!.parameterArtifactRef).toMatch(/^parameter:v1:/);
  });
});
