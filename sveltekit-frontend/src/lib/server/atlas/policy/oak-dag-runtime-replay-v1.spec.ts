import { describe, expect, it, vi } from 'vitest';
import {
  buildAdaptiveDagPlanV1,
  buildKernelDagExecutionBindingV1,
  checksumKernelDagBoundArguments,
  OAK_SEMANTIC_QDRANT_STRICT_V1,
} from '@deeds/parent-atlas';

vi.mock('$lib/server/atlas/integration/atlas-ast-evidence-reader-v1.js', () => ({ readAtlasAstEvidenceV1: async () => ({ rows: [] }) }));
vi.mock('$lib/server/atlas/graph/graph-expansion-adapter.js', () => ({ expandAtlasGraph: async () => ({ nodes: [], edges: [] }) }));
vi.mock('$lib/server/atlas/integration/kag-hypergraph-reader-v1.js', () => ({ readKagHypergraphNeighborsStrictV1: async () => ({ requestedCanonicalIds: [], matchedTuples: [], matchedHyperedges: [], neighbors: [] }) }));
vi.mock('$lib/server/search/postgres-fts.js', () => ({ searchCodeLexicalStrictV1: async () => [] }));
vi.mock('$lib/server/search/qdrant-search.js', () => ({ searchQdrantCodeStrictV1: async () => [] }));
vi.mock('$lib/server/ace/ace-context-manifest.js', () => ({ buildContextManifestFromACE: async () => ({}) }));

const hash = 'a'.repeat(64);
const lexicalArguments = { query: 'deterministic replay', limit: 2 };
const semanticArguments = { embedding: Array.from({ length: 768 }, () => 0), limit: 2, collection: 'codebase_chunks_768_v2' as const };

describe('OaK runtime owner replay', () => {
  it('executes the registered read-only owners twice with the same deterministic checksum', async () => {
    const { createOakDagRuntimeRegistryV1 } = await import('./oak-dag-runtime-registry-v1.js');
    const { executeOakDagThroughBoundedExecutorV1 } = await import('./oak-dag-execution-adapter-v1.js');
    const lexicalAction = {
      actionId: 'lexical', actionKind: 'FETCH_POSTGRES' as const, parentActionIds: [], inputArtifactRefs: ['artifact:query'],
      inputChecksum: hash, parameterArtifactRef: null, parameterChecksum: checksumKernelDagBoundArguments(lexicalArguments),
      outputContract: 'output:ranked_chunks', mutationPolicy: 'READ_ONLY' as const, timeoutMs: 1000, failurePolicy: 'FAIL_CLOSED' as const,
    };
    const semanticAction = {
      actionId: 'semantic', actionKind: 'FETCH_QDRANT' as const, parentActionIds: [], inputArtifactRefs: ['artifact:query'],
      inputChecksum: hash, parameterArtifactRef: null, parameterChecksum: checksumKernelDagBoundArguments(semanticArguments),
      outputContract: 'output:oak_semantic_qdrant_receipt', mutationPolicy: 'READ_ONLY' as const, timeoutMs: 1000, failurePolicy: 'FAIL_CLOSED' as const,
    };
    const plan = buildAdaptiveDagPlanV1({
      planId: 'oak-replay-fixture-v1', queryId: 'query:replay', dagRevision: 'graph:fixture:v1', plannerRevision: 'planner:fixture:v1',
      classificationRevision: 'classification:fixture:v1', actions: [lexicalAction, semanticAction],
    });
    const bindings = [
      buildKernelDagExecutionBindingV1({ action: plan.actions[0], functionId: 'fn:replay', stepId: 'step:lexical', operatorId: 'op:search_lexical', operatorKind: 'SEARCH_LEXICAL', implementationRef: 'sveltekit-frontend/src/lib/server/search/postgres-fts.ts#searchCodeLexicalStrictV1', boundArguments: lexicalArguments, expectedOutputSchemaId: 'output:ranked_chunks' }),
      buildKernelDagExecutionBindingV1({ action: plan.actions[1], functionId: 'fn:replay', stepId: 'step:semantic', operatorId: 'op:search_semantic', operatorKind: 'SEARCH_SEMANTIC', implementationRef: OAK_SEMANTIC_QDRANT_STRICT_V1, boundArguments: semanticArguments, expectedOutputSchemaId: 'output:oak_semantic_qdrant_receipt' }),
    ];
    const registry = createOakDagRuntimeRegistryV1();
    const first = await executeOakDagThroughBoundedExecutorV1({ plan, handlers: registry.handlers, bindings });
    const second = await executeOakDagThroughBoundedExecutorV1({ plan, handlers: registry.handlers, bindings });
    expect(first.deterministicExecutionChecksum).toBe(second.deterministicExecutionChecksum);
    expect(first.actions.map((action) => action.status)).toEqual(['SUCCEEDED', 'SUCCEEDED']);
    expect(first.actions.every((action) => action.writesPerformed === false)).toBe(true);
    expect(first.canonicalAuthority).toBe(false);
  });
});
