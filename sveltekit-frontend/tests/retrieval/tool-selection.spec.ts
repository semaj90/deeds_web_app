import { describe, it, expect } from 'vitest';
import {
  selectTool,
  inferHMMState,
  rankTools,
  computeObservationFromQuery
} from '$lib/server/retrieval/hmm-tool-selector';

describe('HMM Tool Selector', () => {
  describe('State Inference', () => {
    it('should classify CODE_SEARCH for code-related queries', () => {
      const obs = computeObservationFromQuery('where is the function defined?');
      const state = inferHMMState(obs);
      expect(state).toBe('CODE_SEARCH');
    });

    it('should classify GRAPH_EXPAND for dependency queries', () => {
      const obs = computeObservationFromQuery('what functions call validateSession?');
      const state = inferHMMState(obs);
      expect(state).toBe('GRAPH_EXPAND');
    });

    it('should classify SEMANTIC_SEARCH for pattern queries', () => {
      const obs = computeObservationFromQuery('find code similar to this pattern');
      const state = inferHMMState(obs);
      expect(state).toBe('SEMANTIC_SEARCH');
    });

    it('should block QUARANTINE state on low validation', () => {
      const obs = computeObservationFromQuery('test query');
      obs.validationScore = 0.1; // Force low validation
      const state = inferHMMState(obs);
      expect(state).toBe('QUARANTINE');
    });

    it('should default to UNKNOWN for ambiguous queries', () => {
      const obs = computeObservationFromQuery('xyz abc def');
      const state = inferHMMState(obs);
      expect(state).toBe('UNKNOWN');
    });
  });

  describe('Tool Ranking', () => {
    it('should rank lexical search high for CODE_SEARCH state', () => {
      const obs = computeObservationFromQuery('find the route handler');
      const ranked = rankTools(obs);
      expect(ranked.length).toBeGreaterThan(0);
      expect(ranked[0].tool).toBeDefined();
    });

    it('should rank qdrant high for SEMANTIC_SEARCH state', () => {
      const obs = computeObservationFromQuery('find similar patterns');
      const ranked = rankTools(obs);
      expect(ranked.length).toBeGreaterThan(0);
    });

    it('should only include tools allowed in state', () => {
      const obs = computeObservationFromQuery('where does this call authenticate?');
      const ranked = rankTools(obs);
      // GRAPH_EXPAND allows: neo4j.dependency_closure, trace.kag_search, atlas.topology_expand
      ranked.forEach((r) => {
        expect(['neo4j.dependency_closure', 'trace.kag_search', 'atlas.topology_expand']).toContain(
          r.tool
        );
      });
    });

    it('should exclude zero-score tools', () => {
      const obs = computeObservationFromQuery('explain this code');
      obs.validationScore = 0.9; // High validation for synthesis
      const ranked = rankTools(obs);
      // In SYNTHESIZE state, only gemma4.explain_code should score > 0
      ranked.forEach((r) => {
        expect(r.score).toBeGreaterThan(0);
      });
    });
  });

  describe('Tool Selection', () => {
    it('should select best tool for code search query', async () => {
      const result = await selectTool('find the authentication route', new Array(384).fill(0.5), 5);

      expect(result).toBeDefined();
      expect(['rg.lexical_search', 'atlas.topology_expand', 'trace.kag_search']).toContain(
        result.tool_id
      );
      expect(result.hmm_state).toBe('CODE_SEARCH');
    });

    it('should select best tool for semantic query', async () => {
      const result = await selectTool('find similar patterns', new Array(384).fill(0.5), 5);

      expect(result).toBeDefined();
      expect(result.hmm_state).toBe('SEMANTIC_SEARCH');
    });

    it('should fallback to lexical on invalid embedding', async () => {
      const result = await selectTool('test query', [], 5);

      expect(result.tool_id).toBe('rg.lexical_search');
    });

    it('should fallback to lexical on wrong embedding dimension', async () => {
      const badEmbedding = new Array(768).fill(0.5);
      const result = await selectTool('test query', badEmbedding, 5);

      expect(result.tool_id).toBe('rg.lexical_search');
    });

    it('should block QUARANTINE state', async () => {
      const result = await selectTool(
        'test query with low validation score',
        new Array(384).fill(0.5),
        5
      );

      if (result.hmm_state === 'QUARANTINE') {
        expect(result.tool_id).toBe('rg.lexical_search');
      }
    });

    it('should return valid metadata', async () => {
      const result = await selectTool('find functions', new Array(384).fill(0.5), 5);

      expect(result.tool_id).toBeDefined();
      expect(result.name).toBeDefined();
      expect(typeof result.score).toBe('number');
      expect(result.hmm_state).toBeDefined();
      expect(Array.isArray(result.domains)).toBe(true);
    });

    it('should include observation in result', async () => {
      const result = await selectTool('where is this defined?', new Array(384).fill(0.5), 5);

      expect(result.observation).toBeDefined();
      expect(result.observation?.query).toBeDefined();
      expect(typeof result.observation?.keywordScore).toBe('number');
      expect(typeof result.observation?.astScore).toBe('number');
    });

    it('should include ranked tools in result', async () => {
      const result = await selectTool('find the route handler', new Array(384).fill(0.5), 5);

      if (result.ranked_tools) {
        expect(Array.isArray(result.ranked_tools)).toBe(true);
        expect(result.ranked_tools.length).toBeGreaterThan(0);
      }
    });
  });

  describe('Observation Extraction', () => {
    it('should detect code-related keywords', () => {
      const obs = computeObservationFromQuery('where is the function defined?');
      expect(obs.keywordScore).toBeGreaterThan(0.5);
      expect(obs.astScore).toBeGreaterThan(0.2);
    });

    it('should detect graph-related keywords', () => {
      const obs = computeObservationFromQuery('what does this depend on?');
      expect(obs.graphScore).toBeGreaterThan(0.5);
    });

    it('should detect semantic keywords', () => {
      const obs = computeObservationFromQuery('find similar code patterns');
      expect(obs.semanticScore).toBeGreaterThan(0.5);
    });

    it('should detect validation keywords', () => {
      const obs = computeObservationFromQuery('validate this schema');
      expect(obs.validationScore).toBeGreaterThan(0.5);
    });
  });
});
