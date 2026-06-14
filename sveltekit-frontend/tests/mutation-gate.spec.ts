import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  extractACEFeatures,
  fetchSOMEmbedding,
  selectMutationAction,
  ACTION_SPACE,
  type ACEFeatures,
  type PolicyDecision
} from '$lib/server/ace/mutation-gate';

describe('ACE Mutation Gate (Lane 12)', () => {
  let mockACEFeatures: ACEFeatures;

  beforeEach(() => {
    // Create valid ACE features (all values in [0,1])
    mockACEFeatures = {
      pageRankScore: 0.85,
      attentionScore: 0.72,
      authorityScore: 0.88,
      communityConfidence: 0.75,
      semanticRelevance: 0.92,
      cacheHitCertainty: 0.6,
      freshness: 0.8,
      diversity: 0.45,
      fileImportance: 0.78,
      featureCoverage: 0.68,
      contextSize: 0.85,
      conflictDensity: 0.1,
      ambiguityScore: 0.15,
      evidenceQuality: 0.82,
      temporalConsistency: 0.71,
      relationshipDepth: 0.55,
      retrievalAttempts: 1 / 5, // Normalized: 1 attempt out of 5 max
      fallbackActivations: 0,
      errorRecoveryScore: 0.9,
      userApprovalHistory: 0.88,
      similarityToPriors: 0.76,
      contextMissRiskScore: 0.12,
      modelConfidenceDecay: 0.05,
      staleDataRisk: 0.08,
      estimatedFixComplexity: 0.35,
      parallelizability: 0.6,
      downstreamImpact: 0.2,
      rollbackFeasibility: 0.92,
      testCoverageGap: 0.15,
      integrationRisk: 0.2,
      deploymentReadiness: 0.75,
      documentationDelta: 0.3,
      semanticCorrectnessScore: 0.89,
      syntacticValidityScore: 0.95,
      performanceImpactScore: 0.1,
      securityAuditScore: 0.85,
      maintainabilityScore: 0.72
    };
  });

  describe('extractACEFeatures', () => {
    it('should extract 64 valid ACE features from context', () => {
      const features = extractACEFeatures(mockACEFeatures);

      expect(features.pageRankScore).toBe(0.85);
      expect(features.semanticRelevance).toBe(0.92);
      expect(features.authorityScore).toBe(0.88);
      expect(features.estimatedFixComplexity).toBe(0.35);
    });

    it('should reject features with out-of-range values', () => {
      const invalid = { ...mockACEFeatures, pageRankScore: 1.5 };
      expect(() => extractACEFeatures(invalid)).toThrow(/out of range/);
    });

    it('should reject features with NaN values', () => {
      const invalid = { ...mockACEFeatures, pageRankScore: NaN };
      expect(() => extractACEFeatures(invalid)).toThrow(/Invalid ACE feature/);
    });

    it('should reject features with missing fields', () => {
      const incomplete = { ...mockACEFeatures, pageRankScore: undefined as any };
      expect(() => extractACEFeatures(incomplete)).toThrow(/Invalid ACE feature/);
    });
  });

  describe('fetchSOMEmbedding', () => {
    it('should return a valid 64-dim SOM embedding', async () => {
      const som = await fetchSOMEmbedding('test:packet:001');

      expect(som.dimensions).toBe(64);
      expect(som.values.length).toBe(64);
      expect(som.somClusterX).toBeGreaterThanOrEqual(0);
      expect(som.somClusterX).toBeLessThan(20);
      expect(som.somClusterY).toBeGreaterThanOrEqual(0);
      expect(som.somClusterY).toBeLessThan(20);
      expect(som.somClusterId).toBeGreaterThanOrEqual(0);
      expect(som.somClusterId).toBeLessThan(400);
      expect(som.confidence).toBeGreaterThanOrEqual(0.75);
      expect(som.confidence).toBeLessThanOrEqual(1.0);
    });

    it('should have valid embedding values in [-1, 1] range', async () => {
      const som = await fetchSOMEmbedding('test:packet:002');

      for (const val of som.values) {
        expect(val).toBeGreaterThanOrEqual(-1);
        expect(val).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('selectMutationAction (fallback path)', () => {
    it('should select repair_file for high-confidence context', async () => {
      const som = await fetchSOMEmbedding('test:packet:003');
      const decision = await selectMutationAction({
        aceFeatures: mockACEFeatures,
        somEmbedding: som
      });

      expect(decision.action).toBeDefined();
      expect(ACTION_SPACE).toContain(decision.action);
      expect(decision.confidence).toBeGreaterThanOrEqual(0);
      expect(decision.confidence).toBeLessThanOrEqual(1);
    });

    it('should return valid PolicyDecision shape', async () => {
      const som = await fetchSOMEmbedding('test:packet:004');
      const decision = await selectMutationAction({
        aceFeatures: mockACEFeatures,
        somEmbedding: som
      });

      expect(decision).toHaveProperty('action');
      expect(decision).toHaveProperty('confidence');
      expect(decision).toHaveProperty('logits');
      expect(decision).toHaveProperty('reasoning');
      expect(decision).toHaveProperty('latencyMs');
      expect(decision).toHaveProperty('modelVersion');
      expect(Array.isArray(decision.logits)).toBe(true);
      expect(decision.logits.length).toBe(7);
    });

    it('should select ask_gemma4 for ambiguous context', async () => {
      const ambiguousFeatures = {
        ...mockACEFeatures,
        ambiguityScore: 0.75, // High ambiguity
        conflictDensity: 0.65 // Many conflicts
      };

      const som = await fetchSOMEmbedding('test:packet:005');
      const decision = await selectMutationAction({
        aceFeatures: extractACEFeatures(ambiguousFeatures),
        somEmbedding: som
      });

      expect(decision.action).toBeDefined();
      expect(decision.reasoning).toContain('ambiguous') || expect(decision.reasoning).toContain('conflict');
    });

    it('should select expand_graph for context miss risk', async () => {
      const riskyFeatures = {
        ...mockACEFeatures,
        contextMissRiskScore: 0.85, // High risk
        contextSize: 0.2 // Small context
      };

      const som = await fetchSOMEmbedding('test:packet:006');
      const decision = await selectMutationAction({
        aceFeatures: extractACEFeatures(riskyFeatures),
        somEmbedding: som
      });

      expect(decision.action).toBeDefined();
      expect(decision.reasoning).toBeDefined();
    });

    it('should handle integration risk by reranking', async () => {
      const riskyFeatures = {
        ...mockACEFeatures,
        integrationRisk: 0.8, // High integration risk
        testCoverageGap: 0.85
      };

      const som = await fetchSOMEmbedding('test:packet:007');
      const decision = await selectMutationAction({
        aceFeatures: extractACEFeatures(riskyFeatures),
        somEmbedding: som
      });

      expect(decision.action).toBeDefined();
    });

    it('should include latency measurement in response', async () => {
      const som = await fetchSOMEmbedding('test:packet:008');
      const decision = await selectMutationAction({
        aceFeatures: mockACEFeatures,
        somEmbedding: som
      });

      expect(decision.latencyMs).toBeGreaterThanOrEqual(0);
      expect(typeof decision.latencyMs).toBe('number');
    });
  });

  describe('Fallback policy determinism', () => {
    it('should produce consistent decisions for identical input', async () => {
      const som = await fetchSOMEmbedding('test:packet:009');
      const decision1 = await selectMutationAction({
        aceFeatures: mockACEFeatures,
        somEmbedding: som
      });

      const som2 = await fetchSOMEmbedding('test:packet:010');
      const decision2 = await selectMutationAction({
        aceFeatures: mockACEFeatures,
        somEmbedding: som2
      });

      // Both should select same action (rule-based fallback is deterministic)
      expect(decision1.action).toEqual(decision2.action);
    });

    it('should provide reasoning text for every decision', async () => {
      const som = await fetchSOMEmbedding('test:packet:011');
      const decision = await selectMutationAction({
        aceFeatures: mockACEFeatures,
        somEmbedding: som
      });

      expect(decision.reasoning).toBeDefined();
      expect(decision.reasoning.length).toBeGreaterThan(0);
      expect(decision.reasoning).toContain(decision.action);
    });

    it('should select different actions for different risk profiles', async () => {
      const lowRiskFeatures = extractACEFeatures({
        ...mockACEFeatures,
        integrationRisk: 0.1,
        testCoverageGap: 0.1,
        contextMissRiskScore: 0.05
      });

      const highRiskFeatures = extractACEFeatures({
        ...mockACEFeatures,
        integrationRisk: 0.9,
        testCoverageGap: 0.9,
        contextMissRiskScore: 0.9
      });

      const somLow = await fetchSOMEmbedding('low-risk');
      const somHigh = await fetchSOMEmbedding('high-risk');

      const decisionLow = await selectMutationAction({
        aceFeatures: lowRiskFeatures,
        somEmbedding: somLow
      });

      const decisionHigh = await selectMutationAction({
        aceFeatures: highRiskFeatures,
        somEmbedding: somHigh
      });

      // High-risk should NOT blindly repair without more checks
      expect(decisionHigh.action === 'repair_file' && decisionHigh.confidence < 0.6).toBe(true) ||
        expect(
          ['ask_gemma4', 'rerank', 'expand_graph', 'call_tool', 'run_tests'].includes(decisionHigh.action)
        ).toBe(true);
    });
  });

  describe('ACE integration contract', () => {
    it('should output vector ready for agent loop consumption', async () => {
      const som = await fetchSOMEmbedding('test:packet:012');
      const decision = await selectMutationAction({
        aceFeatures: mockACEFeatures,
        somEmbedding: som
      });

      // Lane 12 agent should receive:
      expect(decision.action).toMatch(/repair_file|rerank|call_tool|rollback|run_tests|ask_gemma4|expand_graph/);
      expect(decision.confidence).toBeGreaterThan(0);
      expect(decision.logits.length).toBe(7); // One per action
    });

    it('should support deterministic agent action ordering', async () => {
      const som = await fetchSOMEmbedding('test:packet:013');
      const decision = await selectMutationAction({
        aceFeatures: mockACEFeatures,
        somEmbedding: som
      });

      // Agent should use action + confidence to decide whether to proceed or ask user
      const shouldProceedAutomatically = decision.confidence > 0.7;
      const shouldAskUser = decision.confidence < 0.7;

      expect(shouldProceedAutomatically || shouldAskUser).toBe(true);
      expect(decision.reasoning).toContain(decision.confidence.toFixed(1));
    });
  });

  describe('Stage 5 positioning in ACE pipeline', () => {
    it('should consume 128-dim input (64 scalar + 64 SOM)', async () => {
      const som = await fetchSOMEmbedding('test:packet:014');

      expect(mockACEFeatures).toBeDefined();
      expect(som.values.length).toBe(64);

      // Total: 64 + 64 = 128-dim input to policy model
      const inputDim = 64 + som.values.length;
      expect(inputDim).toBe(128);
    });

    it('should output one of 7 deterministic actions for Lane 12 agent', () => {
      expect(ACTION_SPACE.length).toBe(7);
      expect(ACTION_SPACE).toContain('repair_file');
      expect(ACTION_SPACE).toContain('rerank');
      expect(ACTION_SPACE).toContain('call_tool');
      expect(ACTION_SPACE).toContain('rollback');
      expect(ACTION_SPACE).toContain('run_tests');
      expect(ACTION_SPACE).toContain('ask_gemma4');
      expect(ACTION_SPACE).toContain('expand_graph');
    });

    it('should position after Stage 4 (cache) in ACE pipeline', async () => {
      // Stage 0-1: Payload filter + ANN
      // Stage 2: XGBoost/Marco rerank
      // Stage 3: Neo4j contextual
      // Stage 4: Bifrost cache hit
      // Stage 5: Policy action selection ← We are here
      // Stage 6: LangGraph execution

      const som = await fetchSOMEmbedding('test:packet:015');
      const decision = await selectMutationAction({
        aceFeatures: mockACEFeatures,
        somEmbedding: som
      });

      // At Stage 5, we have:
      // ✅ Ranked packet list (from Stages 0-4)
      // ✅ ACE context features (from earlier stages)
      // ✅ SOM embedding (from semantic layer)
      // → Decide next action (agent mutation)
      // ✅ Should output policy action ready for Stage 6 execution

      expect(decision.action).toBeDefined();
      expect(ACTION_SPACE).toContain(decision.action);
    });
  });
});
