import { describe, expect, it } from 'vitest';
import { computeObservationFromQuery, inferHMMState, rankTools } from './hmm-tool-selector.js';

describe('hmm-tool-selector routing signals', () => {
  it('boosts graph routing for dependency trace queries', () => {
    const obs = computeObservationFromQuery('show dependency graph for atlas packets', {
      intent: 'dependency_trace',
      domainClass: 'graph',
      intentConfidence: 0.94,
      domainConfidence: 0.91,
    });

    expect(inferHMMState(obs, { intent: 'dependency_trace', domainClass: 'graph' })).toBe('GRAPH_EXPAND');
    const ranked = rankTools(obs, { intent: 'dependency_trace', domainClass: 'graph', intentConfidence: 0.94, domainConfidence: 0.91 });
    expect(ranked[0]?.tool).toBe('neo4j.dependency_closure');
  });

  it('routes symbol lookup queries toward lexical search', () => {
    const obs = computeObservationFromQuery('src/lib/server/ace/ace-query-packet.ts', {
      intent: 'symbol_lookup',
      domainClass: 'retrieval',
      intentConfidence: 0.95,
      domainConfidence: 0.9,
    });

    expect(inferHMMState(obs, { intent: 'symbol_lookup' })).toBe('CODE_SEARCH');
    const ranked = rankTools(obs, { intent: 'symbol_lookup', domainClass: 'retrieval', intentConfidence: 0.95, domainConfidence: 0.9 });
    expect(ranked[0]?.tool).toBe('rg.lexical_search');
  });
});

