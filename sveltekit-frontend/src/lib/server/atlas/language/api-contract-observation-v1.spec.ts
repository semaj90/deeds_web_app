import { describe, expect, it } from 'vitest';

import {
  compileApiContractObservationV1,
  type ApiContractEvidenceSourceV1,
  type ApiContractNominationV1,
} from './api-contract-observation-v1.js';

function nomination(treeNodeId: string | null): ApiContractNominationV1 {
  const evidenceSources: ApiContractEvidenceSourceV1[] = ['TREE_SITTER', 'AST_GREP', 'TS_MORPH', 'ZOD'];
  return {
    schema: 'atlas.api-contract-nomination.v1',
    sourceRef: 'src/routes/api/search/+server.ts',
    workspaceRevision: 'workspace:742',
    sourceRevision: 'source:abc',
    coordinate: {
      sourceRef: 'src/routes/api/search/+server.ts',
      filePath: 'src/routes/api/search/+server.ts',
      startByte: 10,
      endByte: 100,
      startChar: 10,
      endChar: 100,
      startLine: 2,
      endLine: 8,
      treeNodeId,
      symbolVersionId: 'symbol-version:search-post',
    },
    transport: 'HTTP',
    method: 'POST',
    route: '/api/search',
    handlerSymbol: 'POST',
    inputSchemaRefs: ['zod:SearchRequest', 'zod:SearchRequest'],
    outputSchemaRefs: ['zod:SearchResponse'],
    authRequirements: ['session'],
    sideEffects: ['QDRANT_READ'],
    evidenceSources,
    evidenceRefs: ['src/routes/api/search/+server.ts#bytes=10-100'],
    grammarRevision: 'tree-sitter-typescript:test',
    semanticEngineRevision: 'ts-morph:test',
    producerRevision: 'atlas.api-contract-observation.v1:test',
  };
}

describe('ApiContractObservationV1', () => {
  it('requires a joined canonical tree node before producing an observation', () => {
    expect(() => compileApiContractObservationV1(nomination(null))).toThrow(
      'API_CONTRACT_CANONICAL_TREE_NODE_REQUIRED',
    );
  });

  it('inherits canonical coordinates and cannot authorize writes or a retrieval vote', () => {
    const value = compileApiContractObservationV1(nomination('tree:T8421'));

    expect(value.treeNodeId).toBe('tree:T8421');
    expect(value.symbolVersionId).toBe('symbol-version:search-post');
    expect(value.canonicalWritesAllowed).toBe(false);
    expect(value.retrievalVoteAdded).toBe(false);
    expect(value.requiresCanonicalPromotion).toBe(true);
    expect(value.inputSchemaRefs).toEqual(['zod:SearchRequest']);
    expect(value.observationId).toMatch(/^api-contract:[a-f0-9]{64}$/);
  });

  it('is deterministic for equivalent evidence sets', () => {
    const a = compileApiContractObservationV1(nomination('tree:T8421'));
    const raw = nomination('tree:T8421');
    raw.inputSchemaRefs = ['zod:SearchRequest'];
    const b = compileApiContractObservationV1(raw);
    expect(a.observationId).toBe(b.observationId);
  });
});
