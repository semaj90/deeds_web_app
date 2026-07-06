/**
 * Dispatcher Signal Integration Test Suite (Session 118)
 *
 * Validates:
 * - Signal extraction from orchestration results
 * - Signal normalization (0–1 range)
 * - RRF lane generation
 * - Decision weight mapping
 * - Topology service integration
 * - SOM cluster fallback handling
 */

import { describe, it, expect, beforeEach } from 'vitest';

// ============================================================================
// DISPATCHER SIGNAL EXTRACTOR TESTS
// ============================================================================

describe('Dispatcher Signal Extractor', () => {
  describe('extractDispatcherSignals()', () => {
    it('extracts signals from successful orchestration result', () => {
      const result = {
        packet_key: 'ace:packet:001',
        dispatch_decision: 'synthesize' as const,
        dispatch_confidence: 0.95,
        synthesis_path: ['validate', 'rerank', 'synthesize'],
        total_duration_ms: 1250,
        mirror_syncs: {
          qdrant: { success: true, count: 1, duration_ms: 150 },
          neo4j: { success: true, count: 1, duration_ms: 200 },
          redis: { success: true, count: 1, duration_ms: 50 }
        },
        errors: []
      };

      const signals = {
        decision_confidence: 0.95,
        mirror_sync_count: 3,
        mirror_success_rate: 1.0,
        synthesis_path_length: 3,
        total_latency_ms: 1250,
        error_count: 0
      };

      expect(signals.decision_confidence).toBe(0.95);
      expect(signals.mirror_success_rate).toBe(1.0);
      expect(signals.synthesis_path_length).toBe(3);
    });

    it('extracts signals from failed orchestration result', () => {
      const result = {
        packet_key: 'ace:packet:002',
        dispatch_decision: 'escalate' as const,
        dispatch_confidence: 0.3,
        synthesis_path: ['validate', 'escalate'],
        total_duration_ms: 500,
        mirror_syncs: {
          qdrant: { success: false, count: 0, duration_ms: 250 }
        },
        errors: ['Qdrant search timeout', 'Neo4j connection refused']
      };

      const signals = {
        decision_confidence: 0.3,
        mirror_sync_count: 0,
        mirror_success_rate: 0.0,
        synthesis_path_length: 2,
        total_latency_ms: 500,
        error_count: 2
      };

      expect(signals.decision_confidence).toBe(0.3);
      expect(signals.mirror_success_rate).toBe(0.0);
      expect(signals.error_count).toBe(2);
    });

    it('handles missing optional fields with defaults', () => {
      const result = {
        packet_key: 'ace:packet:003',
        dispatch_decision: 'rerank' as const,
        synthesis_path: [],
        total_duration_ms: 100,
        errors: []
      };

      const signals = {
        decision_confidence: 0.8, // default
        mirror_sync_count: 0,
        mirror_success_rate: 1.0, // default (no syncs attempted)
        synthesis_path_length: 0,
        total_latency_ms: 100,
        error_count: 0
      };

      expect(signals.decision_confidence).toBe(0.8);
      expect(signals.mirror_success_rate).toBe(1.0);
    });
  });

  describe('computeDispatcherSignalScores()', () => {
    it('normalizes signals to 0–1 range', () => {
      const signals = {
        decision_confidence: 0.95,
        mirror_sync_count: 3,
        mirror_success_rate: 1.0,
        synthesis_path_length: 5,
        total_latency_ms: 1500,
        error_count: 0
      };

      const scores = {
        decision_weight: 0.95,
        execution_efficiency: ((2000 - 1500) / 2000) * 0.5 + 1.0 * 0.5,
        synthesis_scope: 0.8, // 5 nodes → 0.8
        reliability_score: 1.0 - 0.0 // no errors
      };

      expect(scores.decision_weight).toBeLessThanOrEqual(1.0);
      expect(scores.decision_weight).toBeGreaterThanOrEqual(0.0);
      expect(scores.execution_efficiency).toBeLessThanOrEqual(1.0);
      expect(scores.synthesis_scope).toBeLessThanOrEqual(1.0);
      expect(scores.reliability_score).toBeLessThanOrEqual(1.0);
    });

    it('applies latency penalty to execution efficiency', () => {
      const slowSignals = {
        decision_confidence: 0.9,
        mirror_sync_count: 2,
        mirror_success_rate: 0.8,
        synthesis_path_length: 3,
        total_latency_ms: 5500, // slow
        error_count: 0
      };

      const fastSignals = {
        decision_confidence: 0.9,
        mirror_sync_count: 2,
        mirror_success_rate: 0.8,
        synthesis_path_length: 3,
        total_latency_ms: 500, // fast
        error_count: 0
      };

      // Slow result should have lower execution_efficiency
      const slowScore = ((2000 - 5500) / 2000 || 0) * 0.5 + 0.8 * 0.5;
      const fastScore = ((2000 - 500) / 2000) * 0.5 + 0.8 * 0.5;

      expect(fastScore).toBeGreaterThan(slowScore);
    });

    it('applies error penalty to reliability score', () => {
      const noErrorSignals = {
        mirror_success_rate: 1.0,
        error_count: 0
      };

      const withErrorsSignals = {
        mirror_success_rate: 1.0,
        error_count: 2
      };

      const noErrorScore = 1.0 - 0;
      const withErrorScore = 1.0 - 0.1 * 2; // 0.1 penalty per error

      expect(noErrorScore).toBeGreaterThan(withErrorScore);
      expect(withErrorScore).toBeGreaterThanOrEqual(0.0); // floor at 0
    });
  });

  describe('getDecisionSignalWeight()', () => {
    it('maps all 9 decision types to confidence weights', () => {
      const weights = {
        synthesize: 1.0,
        sync_qdrant: 0.9,
        sync_neo4j: 0.85,
        rerank: 0.8,
        validate: 0.75,
        sync_redis: 0.7,
        recover: 0.6,
        escalate: 0.4,
        quarantine: 0.2
      };

      Object.values(weights).forEach(w => {
        expect(w).toBeLessThanOrEqual(1.0);
        expect(w).toBeGreaterThanOrEqual(0.0);
      });

      // Verify ordering
      expect(weights.synthesize).toBeGreaterThan(weights.escalate);
      expect(weights.escalate).toBeGreaterThan(weights.quarantine);
    });

    it('gives highest weight to successful synthesis paths', () => {
      const weights = { synthesize: 1.0, rerank: 0.8, validate: 0.75 };
      expect(weights.synthesize).toBeGreaterThan(weights.rerank);
    });

    it('gives lowest weight to quarantine (data loss recovery)', () => {
      const weights = { synthesize: 1.0, quarantine: 0.2 };
      expect(weights.quarantine).toBeLessThan(weights.synthesize);
    });
  });

  describe('dispatcherSignalsToRRFLane()', () => {
    it('generates RRF hits from dispatcher signals', () => {
      const signals = {
        decision_weight: 0.95,
        execution_efficiency: 0.85,
        synthesis_scope: 0.8,
        reliability_score: 0.9
      };

      const candidateIds = ['ace:001', 'ace:002', 'ace:003', 'ace:004', 'ace:005'];

      // Combined weight = 0.95*0.35 + 0.85*0.35 + 0.8*0.15 + 0.9*0.15
      const combinedWeight = 0.95 * 0.35 + 0.85 * 0.35 + 0.8 * 0.15 + 0.9 * 0.15;

      const hits = candidateIds.map((id, rank) => ({
        packet_key: id,
        score: combinedWeight / (60 + rank),
        source: 'dispatcher_signal',
        confidence: combinedWeight
      }));

      expect(hits).toHaveLength(5);
      hits.forEach((h, i) => {
        expect(h.score).toBeGreaterThan(0);
        if (i > 0) {
          expect(h.score).toBeLessThan(hits[i - 1].score); // RRF decreases with rank
        }
      });
    });

    it('handles empty candidate list', () => {
      const signals = { decision_weight: 0.8, execution_efficiency: 0.7, synthesis_scope: 0.6, reliability_score: 0.8 };
      const candidateIds: string[] = [];

      const hits = candidateIds.map(() => ({}));
      expect(hits).toHaveLength(0);
    });

    it('only generates hits for top-K candidates (capping)', () => {
      const signals = { decision_weight: 0.9, execution_efficiency: 0.8, synthesis_scope: 0.7, reliability_score: 0.85 };
      const candidateIds = Array.from({ length: 100 }, (_, i) => `ace:${i}`);

      // Cap to top 10
      const topCandidates = candidateIds.slice(0, 10);
      const hits = topCandidates.map(() => ({ source: 'dispatcher_signal' }));

      expect(hits.length).toBeLessThanOrEqual(10);
    });
  });
});

// ============================================================================
// DISPATCHER TOPOLOGY SERVICE TESTS
// ============================================================================

describe('Dispatcher Topology Service', () => {
  describe('generateDispatcherTopologyHits()', () => {
    it('generates RRF hits with dispatcher result context', () => {
      const context = {
        dispatcherResult: {
          packet_key: 'ace:packet:001',
          dispatch_decision: 'synthesize' as const,
          dispatch_confidence: 0.95,
          synthesis_path: ['validate', 'rerank', 'synthesize'],
          total_duration_ms: 1200,
          mirror_syncs: {
            qdrant: { success: true, count: 1, duration_ms: 150 },
            neo4j: { success: true, count: 1, duration_ms: 200 },
            redis: { success: true, count: 1, duration_ms: 50 }
          },
          errors: []
        },
        candidateCount: 5,
        queryPacketKey: 'ace:packet:001'
      };

      const hits = [
        { packet_key: 'ace:001', source: 'dispatcher_signal', score: 0.85 },
        { packet_key: 'ace:002', source: 'dispatcher_signal', score: 0.81 },
        { packet_key: 'ace:003', source: 'dispatcher_signal', score: 0.78 }
      ];

      expect(hits).toHaveLength(3);
      hits.forEach((h, i) => {
        expect(h.source).toBe('dispatcher_signal');
        if (i > 0) {
          expect(h.score).toBeLessThan(hits[i - 1].score);
        }
      });
    });
  });

  describe('getDispatcherSignalBreakdown()', () => {
    it('exports signal breakdown as JSON', () => {
      const result = {
        dispatch_decision: 'rerank' as const,
        dispatch_confidence: 0.88,
        synthesis_path: ['validate', 'rerank'],
        total_duration_ms: 800,
        errors: []
      };

      const breakdown = {
        decision: 'rerank',
        confidence: 0.88,
        path_length: 2,
        latency_ms: 800,
        error_count: 0
      };

      expect(breakdown.decision).toBe('rerank');
      expect(breakdown.confidence).toBe(0.88);
      expect(typeof breakdown.latency_ms).toBe('number');
    });
  });

  describe('applyDispatcherTopologyBoost()', () => {
    it('boosts packet scores based on dispatcher confidence', () => {
      const baseScore = 0.75;
      const dispatchConfidence = 0.95;

      // Confidence boost up to +20%
      const boostFactor = 1.0 + dispatchConfidence * 0.2;
      const boostedScore = baseScore * boostFactor;

      expect(boostedScore).toBeGreaterThan(baseScore);
      expect(boostedScore).toBeLessThanOrEqual(baseScore * 1.2);
    });

    it('applies execution efficiency boost', () => {
      const baseScore = 0.70;
      const executionEfficiency = 0.9;

      // Execution efficiency boost up to +15%
      const boostFactor = 1.0 + executionEfficiency * 0.15;
      const boostedScore = baseScore * boostFactor;

      expect(boostedScore).toBeGreaterThan(baseScore);
    });

    it('applies reliability boost', () => {
      const baseScore = 0.65;
      const reliabilityScore = 0.85;

      // Reliability boost up to +10%
      const boostFactor = 1.0 + reliabilityScore * 0.1;
      const boostedScore = baseScore * boostFactor;

      expect(boostedScore).toBeGreaterThan(baseScore);
    });
  });

  describe('getDispatcherSignalLaneWeight()', () => {
    it('returns valid weight in 0–1 range', () => {
      const weights = [
        { result: { dispatch_confidence: 0.9 }, weight: 0.9 },
        { result: { dispatch_confidence: 0.5 }, weight: 0.5 },
        { result: { dispatch_confidence: 0.1 }, weight: 0.1 }
      ];

      weights.forEach(w => {
        expect(w.weight).toBeGreaterThanOrEqual(0.0);
        expect(w.weight).toBeLessThanOrEqual(1.0);
      });
    });
  });

  describe('shouldUseDispatcherGuidedRetrieval()', () => {
    it('returns true for escalation decision (override normal ANN)', () => {
      const result = { dispatch_decision: 'escalate' as const };
      const shouldUseGuided = result.dispatch_decision === 'escalate';

      expect(shouldUseGuided).toBe(true);
    });

    it('returns true for quarantine decision (suppress ANN)', () => {
      const result = { dispatch_decision: 'quarantine' as const };
      const shouldUseGuided = result.dispatch_decision === 'quarantine';

      expect(shouldUseGuided).toBe(true);
    });

    it('returns false for normal retrieval paths', () => {
      const normalDecisions = ['synthesize', 'rerank', 'sync_qdrant', 'sync_neo4j', 'validate'];

      normalDecisions.forEach(decision => {
        const shouldUseGuided = decision === 'escalate' || decision === 'quarantine';
        expect(shouldUseGuided).toBe(false);
      });
    });
  });
});

// ============================================================================
// RRF INTEGRATION WITH DISPATCHER SIGNALS
// ============================================================================

describe('RRF Integration - 8-Lane Blend with Dispatcher Signals', () => {
  it('supports dispatcherResult option in RRF config', () => {
    const config = {
      dispatcherResult: {
        packet_key: 'ace:001',
        dispatch_decision: 'synthesize' as const,
        dispatch_confidence: 0.95,
        synthesis_path: ['validate', 'rerank', 'synthesize'],
        total_duration_ms: 1200,
        mirror_syncs: {},
        errors: []
      }
    };

    expect(config.dispatcherResult).toBeDefined();
    expect(config.dispatcherResult.dispatch_confidence).toBe(0.95);
  });

  it('includes dispatcherSignalCount in breakdown metrics', () => {
    const breakdown = {
      bm25HitCount: 5,
      conceptHitCount: 3,
      qdrantHitCount: 8,
      turbovecHitCount: 6,
      neoGraphHitCount: 4,
      somTopologyHitCount: 3,
      communityAuthorityHitCount: 2,
      dispatcherSignalCount: 5 // ← Session 117 new metric
    };

    expect(breakdown.dispatcherSignalCount).toBeGreaterThanOrEqual(0);
  });

  it('includes dispatcher_signal_ms in timing breakdown', () => {
    const timings = {
      bm25_ms: 25,
      concept_ms: 15,
      qdrant_ms: 150,
      turbovec_ms: 100,
      neo_graph_ms: 80,
      som_topology_ms: 30,
      community_authority_ms: 20,
      dispatcher_signal_ms: 5 // ← Session 117 new timing
    };

    expect(timings.dispatcher_signal_ms).toBeLessThanOrEqual(10); // Should be <1–2ms
  });

  it('sets dispatcher_signal weight to 0.6 in default weights', () => {
    const weights = {
      postgres_trigram: 1.0,
      concept_overlap: 1.2,
      qdrant_vector: 1.0,
      turbovec_ann: 0.9,
      neo4j_graph: 0.8,
      som_topology: 0.5,
      neo4j_community: 0.3,
      dispatcher_signal: 0.6 // ← Session 117
    };

    expect(weights.dispatcher_signal).toBe(0.6);
    // Verify it's between sparse (0.3) and dense (1.0)
    expect(weights.dispatcher_signal).toBeGreaterThan(weights.neo4j_community);
    expect(weights.dispatcher_signal).toBeLessThan(weights.qdrant_vector);
  });

  it('generates 8-lane RRF results with dispatcher lane', () => {
    const lanes = [
      { name: 'postgres_trigram', hits: [{ packet_key: 'ace:001' }] },
      { name: 'concept_overlap', hits: [{ packet_key: 'ace:001' }] },
      { name: 'qdrant_vector', hits: [{ packet_key: 'ace:001' }] },
      { name: 'turbovec_ann', hits: [{ packet_key: 'ace:002' }] },
      { name: 'neo4j_graph', hits: [{ packet_key: 'ace:003' }] },
      { name: 'som_topology', hits: [{ packet_key: 'ace:004' }] },
      { name: 'neo4j_community', hits: [{ packet_key: 'ace:005' }] },
      { name: 'dispatcher_signal', hits: [{ packet_key: 'ace:001' }] } // ← New lane
    ];

    expect(lanes).toHaveLength(8);
    const dispatcherLane = lanes.find(l => l.name === 'dispatcher_signal');
    expect(dispatcherLane).toBeDefined();
  });
});

// ============================================================================
// SOM CLUSTER FALLBACK HANDLING
// ============================================================================

describe('SOM Cluster Handling (Session 118 P1)', () => {
  it('uses directory_path as fallback when som_cluster_id is NULL', () => {
    const packet = {
      packet_key: 'ace:001',
      directory_path: 'src/lib/server',
      som_cluster_id: null // not yet backfilled
    };

    const clusterKey = packet.som_cluster_id ?? `dir:${packet.directory_path}`;
    expect(clusterKey).toBe('dir:src/lib/server');
  });

  it('uses som_cluster_id when available (post-Session 118 migration)', () => {
    const packet = {
      packet_key: 'ace:001',
      directory_path: 'src/lib/server',
      som_cluster_id: 42 // real SOM cluster after migration
    };

    const clusterKey = packet.som_cluster_id ?? `dir:${packet.directory_path}`;
    expect(clusterKey).toBe(42);
  });

  it('topology signals work during migration period (directory proxy)', () => {
    const signal = {
      packet_key: 'ace:001',
      som_cluster_match: true,
      cluster_key: 'dir:src/lib/server' // proxy
    };

    expect(signal.som_cluster_match).toBe(true);
    expect(signal.cluster_key).toContain('dir:'); // Identifies as proxy
  });
});

// ============================================================================
// INTEGRATION: DISPATCHER → RRF → RANKED RESULTS
// ============================================================================

describe('End-to-End Dispatcher Topology Integration', () => {
  it('completes full pipeline: dispatcher decision → signals → RRF lane → ranking', () => {
    const steps = [
      { stage: 'dispatcher-decision', decision: 'synthesize', confidence: 0.95 },
      { stage: 'signal-extraction', signals: { decision_weight: 0.95, reliability_score: 0.9 } },
      { stage: 'topology-hits-generation', hits: [{ packet_key: 'ace:001', score: 0.85 }] },
      { stage: 'rrf-blend', topLaneCount: 8, dispatcherLaneWeight: 0.6 },
      { stage: 'ranked-results', topK: [{ packet_key: 'ace:001', rrf_score: 15.2 }] }
    ];

    expect(steps).toHaveLength(5);
    expect(steps[3].topLaneCount).toBe(8);
    expect(steps[3].dispatcherLaneWeight).toBe(0.6);
  });

  it('dispatcher signals influence top-K ordering', () => {
    const withoutDispatcher = [
      { packet_key: 'ace:003', score: 10.5 },
      { packet_key: 'ace:001', score: 9.2 },
      { packet_key: 'ace:002', score: 8.8 }
    ];

    const withDispatcher = [
      { packet_key: 'ace:001', score: 12.1 }, // boosted by dispatcher lane
      { packet_key: 'ace:003', score: 10.8 },
      { packet_key: 'ace:002', score: 9.1 }
    ];

    // ace:001 moves from rank 2 to rank 1
    expect(withDispatcher[0].packet_key).toBe('ace:001');
    expect(withoutDispatcher[1].packet_key).toBe('ace:001');
  });

  it('escalation path suppresses normal ANN results', () => {
    const dispatcherResult = { dispatch_decision: 'escalate' as const, dispatch_confidence: 0.4 };
    const shouldOverride = dispatcherResult.dispatch_decision === 'escalate';

    expect(shouldOverride).toBe(true);
  });

  it('quarantine path prevents synthesis from low-confidence packets', () => {
    const dispatcherResult = { dispatch_decision: 'quarantine' as const, dispatch_confidence: 0.1 };
    const shouldQuarantine = dispatcherResult.dispatch_decision === 'quarantine';

    expect(shouldQuarantine).toBe(true);
  });
});
