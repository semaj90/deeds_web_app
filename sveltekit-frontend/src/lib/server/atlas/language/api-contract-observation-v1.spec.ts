import { describe, expect, it } from 'vitest';

import { buildApiContractObservationV1 } from './api-contract-observation-v1.js';

describe('ApiContractObservationV1', () => {
  it('preserves revision-qualified schema links without inventing canonical coordinates', () => {
    const observation = buildApiContractObservationV1({
      sourceRef: 'sveltekit-frontend/src/routes/api/search/+server.ts',
      treeNodeId: null,
      symbolVersionId: null,
      transport: 'HTTP',
      method: 'POST',
      route: '/api/search',
      handlerSymbol: 'POST',
      inputSchemaRefs: ['zod:SearchRequest', 'zod:SearchRequest'],
      outputSchemaRefs: ['zod:SearchResponse'],
      authRequirements: ['session'],
      sideEffects: ['READ_POSTGRES', 'READ_QDRANT'],
      workspaceRevision: 'ws-42',
      sourceRevision: 'src-7',
      structuralEngine: 'TREE_SITTER_PLUS_AST_GREP',
      semanticEngine: 'TS_MORPH',
      evidenceRefs: ['source:route', 'source:schema'],
      producerRevision: 'api-observer-test',
    });

    expect(observation.treeNodeId).toBeNull();
    expect(observation.symbolVersionId).toBeNull();
    expect(observation.inputSchemaRefs).toEqual(['zod:SearchRequest']);
    expect(observation.requiresCanonicalPromotion).toBe(true);
    expect(observation.canonicalWritesAllowed).toBe(false);
    expect(observation.observationId).toMatch(/^apiobs:[0-9a-f]{64}$/);
  });

  it('is deterministic for semantically identical set-valued inputs', () => {
    const common = {
      sourceRef: 'src/api.ts',
      treeNodeId: 'tree-1',
      symbolVersionId: 'symbol-1',
      transport: 'MCP' as const,
      method: null,
      route: 'atlas.search',
      handlerSymbol: 'search',
      workspaceRevision: 'ws-1',
      sourceRevision: 'src-1',
      structuralEngine: 'AST_GREP' as const,
      semanticEngine: null,
      producerRevision: 'observer-v1',
    };

    const a = buildApiContractObservationV1({
      ...common,
      inputSchemaRefs: ['schema:b', 'schema:a'],
      outputSchemaRefs: [],
      authRequirements: [],
      sideEffects: [],
      evidenceRefs: ['evidence:b', 'evidence:a'],
    });
    const b = buildApiContractObservationV1({
      ...common,
      inputSchemaRefs: ['schema:a', 'schema:b'],
      outputSchemaRefs: [],
      authRequirements: [],
      sideEffects: [],
      evidenceRefs: ['evidence:a', 'evidence:b'],
    });

    expect(a.observationId).toBe(b.observationId);
    expect(a.inputSchemaRefs).toEqual(b.inputSchemaRefs);
    expect(a.evidenceRefs).toEqual(b.evidenceRefs);
  });
});
