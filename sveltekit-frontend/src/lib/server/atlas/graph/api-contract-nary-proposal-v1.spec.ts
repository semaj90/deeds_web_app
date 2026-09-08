import { describe, expect, it } from 'vitest';
import { buildApiContractObservationV1 } from '../language/api-contract-observation-v1.js';
import { proposeApiContractNaryFactV1 } from './api-contract-nary-proposal-v1.js';

const observation = buildApiContractObservationV1({
  sourceRef: 'src/routes/search.ts',
  treeNodeId: null,
  symbolVersionId: null,
  workspaceRevision: 'workspace:v1',
  sourceRevision: 'source:v1',
  transport: 'HTTP',
  method: 'POST',
  route: '/search',
  handlerSymbol: 'searchHandler',
  inputSchemaRefs: ['SearchRequest'],
  outputSchemaRefs: ['SearchResponse'],
  authRequirements: ['session'],
  sideEffects: [],
  evidenceRefs: ['obs:evidence'],
  producerRevision: 'observer:v1',
});

const bindings = [
  { field: 'route', role: 'route', entityType: 'ROUTE', canonicalId: 'route:search', evidenceRefs: ['route:e'] },
  { field: 'handler', role: 'handler', entityType: 'SYMBOL', canonicalId: 'symbol:search', evidenceRefs: ['handler:e'] },
  { field: 'inputSchema', role: 'inputSchema', entityType: 'SCHEMA', canonicalId: 'schema:request', evidenceRefs: ['schema:e'] },
];

const owners = bindings.map(({ canonicalId, entityType }) => ({ canonicalId, entityType }));

describe('ApiContract NaryFactProposalV1 adapter', () => {
  it('creates only a proposed fact from explicitly resolved owners', () => {
    const result = proposeApiContractNaryFactV1(observation, {
      packetKey: 'packet:search',
      graphRevision: 'graph:current',
      producerRevision: 'api-proposal:v1',
      owners,
      bindings,
    });

    expect(result.status).toBe('RESOLVED');
    expect(result.proposal?.admission).toBe('PROPOSED');
    expect(result.proposal?.canonicalAuthority).toBe(false);
    expect(result.proposal?.participants.map((value) => value.canonicalId)).toEqual([
      'symbol:search', 'schema:request', 'route:search',
    ]);
  });

  it('does not synthesize route or method identity when the binding is literal-only', () => {
    const result = proposeApiContractNaryFactV1(observation, {
      packetKey: 'packet:search',
      graphRevision: 'graph:current',
      producerRevision: 'api-proposal:v1',
      owners,
      bindings: [
        ...bindings.slice(1),
        { field: 'method', role: 'method', entityType: 'HTTP_METHOD', canonicalId: null, literalValue: 'POST', evidenceRefs: ['method:e'] },
      ],
    });

    expect(result.status).toBe('UNRESOLVED');
    expect(result.proposal).toBeNull();
    expect(result.unresolvedFields).toEqual(['method']);
    expect(result.resolutions.find((value) => value.field === 'method')?.literalValue).toBe('POST');
  });
});
