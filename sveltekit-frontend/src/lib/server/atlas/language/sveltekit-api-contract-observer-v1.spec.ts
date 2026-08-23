import { describe, expect, it } from 'vitest';

import { AstGrepStructuralCandidateV1Schema } from './ast-grep-structural-topk.js';
import { observeSvelteKitHttpContractV1 } from './sveltekit-api-contract-observer-v1.js';

function candidate(overrides: Record<string, unknown> = {}) {
  return AstGrepStructuralCandidateV1Schema.parse({
    schema: 'atlas.ast-grep-structural-candidate.v1',
    entityKind: 'FUNCTION',
    declarationForm: 'VARIABLE_DECLARATOR',
    name: 'POST',
    nodeKind: 'variable_declarator',
    signature: 'export const POST = async ({ request }) => {',
    isExported: true,
    isAsync: true,
    sourceRef: 'sveltekit-frontend/src/routes/api/search/+server.ts',
    filePath: '/workspace/sveltekit-frontend/src/routes/api/search/+server.ts',
    startByte: 10,
    endByte: 90,
    startLine: 1,
    startColumn: 0,
    endLine: 4,
    endColumn: 1,
    treeNodeId: 'tree:search-post',
    symbolVersionId: 'symbol:search-post',
    workspaceRevision: 'ws-42',
    sourceRevision: 'src-7',
    engine: 'AST_GREP_NAPI',
    structuralMatchExactForDeclaredRule: true,
    requiresCanonicalTreeJoin: true,
    logicalLane: 'ast',
    logicalLaneVoteAdded: false,
    canonicalWritesAllowed: false,
    producerRevision: 'ast-grep-test',
    ...overrides,
  });
}

describe('SvelteKitApiContractObserverV1', () => {
  it('recognizes only grounded exported +server HTTP handlers', () => {
    const observation = observeSvelteKitHttpContractV1(candidate(), {
      schema: 'atlas.sveltekit-api-observation-options.v1',
      inputSchemaRefs: ['zod:SearchRequest'],
      outputSchemaRefs: ['zod:SearchResponse'],
      authRequirements: ['session'],
      sideEffects: ['READ_POSTGRES'],
      semanticEngine: 'TS_MORPH',
      producerRevision: 'observer-test',
    });

    expect(observation?.route).toBe('/api/search');
    expect(observation?.method).toBe('POST');
    expect(observation?.transport).toBe('HTTP');
    expect(observation?.treeNodeId).toBe('tree:search-post');
    expect(observation?.requiresCanonicalPromotion).toBe(true);
    expect(observation?.canonicalWritesAllowed).toBe(false);
  });

  it('does not invent an API observation for a non-exported handler', () => {
    expect(observeSvelteKitHttpContractV1(candidate({ isExported: false }), {
      schema: 'atlas.sveltekit-api-observation-options.v1',
      inputSchemaRefs: [],
      outputSchemaRefs: [],
      authRequirements: [],
      sideEffects: [],
      semanticEngine: null,
      producerRevision: 'observer-test',
    })).toBeNull();
  });

  it('does not treat ordinary source files as routes', () => {
    expect(observeSvelteKitHttpContractV1(candidate({
      filePath: '/workspace/sveltekit-frontend/src/lib/server/search.ts',
      sourceRef: 'sveltekit-frontend/src/lib/server/search.ts',
    }), {
      schema: 'atlas.sveltekit-api-observation-options.v1',
      inputSchemaRefs: [],
      outputSchemaRefs: [],
      authRequirements: [],
      sideEffects: [],
      semanticEngine: null,
      producerRevision: 'observer-test',
    })).toBeNull();
  });
});
