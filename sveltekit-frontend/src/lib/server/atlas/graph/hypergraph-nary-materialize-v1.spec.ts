import { describe, expect, it } from 'vitest';

import { buildApiContractObservationV1 } from '../language/api-contract-observation-v1.js';
import { materializeApiContractObservationAsHyperedgeV1 } from './hypergraph-nary-materialize-v1.js';

function fixtureObservation() {
  return buildApiContractObservationV1({
    sourceRef: 'sveltekit-frontend/src/routes/api/search/+server.ts',
    treeNodeId: null,
    symbolVersionId: null,
    transport: 'HTTP',
    method: 'POST',
    route: '/api/search',
    handlerSymbol: 'POST',
    inputSchemaRefs: ['zod:SearchRequest'],
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
}

describe('materializeApiContractObservationAsHyperedgeV1', () => {
  it('produces a genuine n-ary fact (arity >= 3), not another binary edge', () => {
    const edge = materializeApiContractObservationAsHyperedgeV1(fixtureObservation());
    expect(edge).not.toBeNull();
    expect(edge!.participants.length).toBeGreaterThanOrEqual(3);
    const roles = new Set(edge!.participants.map((p) => p.role));
    expect(roles).toEqual(new Set(['route', 'handler', 'inputSchema', 'outputSchema', 'authRequirement']));
  });

  it('is deterministic: identical observation input produces identical hyperedgeId and checksum', () => {
    const first = materializeApiContractObservationAsHyperedgeV1(fixtureObservation());
    const second = materializeApiContractObservationAsHyperedgeV1(fixtureObservation());
    expect(first!.hyperedgeId).toBe(second!.hyperedgeId);
    expect(first!.checksum).toBe(second!.checksum);
  });

  it('fails closed (returns null) for a non-HTTP transport with no route', () => {
    const observation = buildApiContractObservationV1({
      sourceRef: 'src/mcp/tools.ts',
      treeNodeId: null,
      symbolVersionId: null,
      transport: 'MCP',
      method: null,
      route: null,
      handlerSymbol: 'search',
      inputSchemaRefs: [],
      outputSchemaRefs: [],
      authRequirements: [],
      sideEffects: [],
      workspaceRevision: 'ws-1',
      sourceRevision: 'src-1',
      evidenceRefs: ['source:route'],
      producerRevision: 'api-observer-test',
    });
    expect(materializeApiContractObservationAsHyperedgeV1(observation)).toBeNull();
  });

  it('fails closed (returns null) rather than emitting a binary fact when only route+handler are known', () => {
    const observation = buildApiContractObservationV1({
      sourceRef: 'src/routes/api/health/+server.ts',
      treeNodeId: null,
      symbolVersionId: null,
      transport: 'HTTP',
      method: 'GET',
      route: '/api/health',
      handlerSymbol: 'GET',
      inputSchemaRefs: [],
      outputSchemaRefs: [],
      authRequirements: [],
      sideEffects: [],
      workspaceRevision: 'ws-1',
      sourceRevision: 'src-1',
      evidenceRefs: ['source:route'],
      producerRevision: 'api-observer-test',
    });
    expect(materializeApiContractObservationAsHyperedgeV1(observation)).toBeNull();
  });

  it('produces a HyperedgeV1 that passes the existing canonical schema validation unchanged', () => {
    const edge = materializeApiContractObservationAsHyperedgeV1(fixtureObservation());
    expect(edge!.schemaVersion).toBe('atlas.hyperedge.v1');
    expect(edge!.checksum).toMatch(/^[0-9a-f]{64}$/);
  });
});
