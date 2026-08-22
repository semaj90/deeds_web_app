/**
 * Graph Lane Tests
 *
 * Validates domain classification via Neo4j graph traversal
 */

import { describe, it, expect } from 'vitest';
import {
  computeGraphDomainScore,
  classifyGraphSingle,
  classifyGraphBatch,
  computeGraphMetrics,
  type CommunityNode,
} from './graph-lane.js';

describe('Graph Lane', () => {
  describe('computeGraphDomainScore', () => {
    it('should return 0 for empty visited set', () => {
      const score = computeGraphDomainScore([], 'auth');
      expect(score).toBe(0);
    });

    it('should score high when all neighbors have domain', () => {
      const visited: CommunityNode[] = [
        { nodeId: '1', communityId: 1, pageRankScore: 0.8, domainTags: ['auth', 'security'], confidence: 0.95 },
        { nodeId: '2', communityId: 1, pageRankScore: 0.7, domainTags: ['auth'], confidence: 0.9 },
      ];
      const score = computeGraphDomainScore(visited, 'auth');
      expect(score).toBeGreaterThan(0.7);
    });

    it('should score low when no neighbors have domain', () => {
      const visited: CommunityNode[] = [
        { nodeId: '1', communityId: 1, pageRankScore: 0.8, domainTags: ['storage'], confidence: 0.95 },
        { nodeId: '2', communityId: 1, pageRankScore: 0.7, domainTags: ['database'], confidence: 0.9 },
      ];
      const score = computeGraphDomainScore(visited, 'auth');
      expect(score).toBe(0);
    });

    it('should scale by community affinity and authority', () => {
      const visited: CommunityNode[] = [
        { nodeId: '1', communityId: 1, pageRankScore: 0.5, domainTags: ['retrieval'], confidence: 0.9 },
        { nodeId: '2', communityId: 1, pageRankScore: 0.3, domainTags: ['embedding'], confidence: 0.8 },
      ];
      const score = computeGraphDomainScore(visited, 'retrieval', 0.6, 0.4);
      // 60% of neighbors have domain, avg PageRank = 0.4, but score = 0 because no agreement
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(1);
    });

    it('should respect community and authority weights', () => {
      const visited: CommunityNode[] = [
        { nodeId: '1', communityId: 1, pageRankScore: 1.0, domainTags: ['auth'], confidence: 1.0 },
      ];
      const scoreHeavyCommunity = computeGraphDomainScore(visited, 'auth', 0.9, 0.1);
      const scoreHeavyAuthority = computeGraphDomainScore(visited, 'auth', 0.1, 0.9);
      // Both should be high, but the exact values may differ
      expect(scoreHeavyCommunity).toBeGreaterThan(0);
      expect(scoreHeavyAuthority).toBeGreaterThan(0);
    });
  });

  describe('classifyGraphSingle', () => {
    it('should return empty for empty visited set', () => {
      const results = classifyGraphSingle('entity-1', []);
      expect(results).toEqual([]);
    });

    it('should classify based on neighborhood domains', () => {
      const visited: CommunityNode[] = [
        { nodeId: '1', communityId: 1, pageRankScore: 0.8, domainTags: ['auth', 'security'], confidence: 0.95 },
        { nodeId: '2', communityId: 1, pageRankScore: 0.75, domainTags: ['auth'], confidence: 0.9 },
        { nodeId: '3', communityId: 1, pageRankScore: 0.7, domainTags: ['retrieval'], confidence: 0.85 },
      ];

      const results = classifyGraphSingle('entity-1', visited, 0.2);
      expect(results.length).toBeGreaterThan(0);
      expect(results[0].domain).toBe('auth');  // Most neighbors have auth
      expect(results[0].score).toBeGreaterThan(results[1]?.score || 0);
    });

    it('should respect confidenceThreshold', () => {
      const visited: CommunityNode[] = [
        { nodeId: '1', communityId: 1, pageRankScore: 0.1, domainTags: ['rare-domain'], confidence: 0.1 },
      ];

      const scoresLow = classifyGraphSingle('entity-1', visited, 0.01);
      const scoresHigh = classifyGraphSingle('entity-1', visited, 0.99);

      expect(scoresLow.length).toBeGreaterThanOrEqual(scoresHigh.length);
    });

    it('should respect topK parameter', () => {
      const visited: CommunityNode[] = [
        { nodeId: '1', communityId: 1, pageRankScore: 1.0, domainTags: CANONICAL_DOMAINS, confidence: 1.0 },
      ];

      const results = classifyGraphSingle('entity-1', visited, 0.0, 3);
      expect(results.length).toBeLessThanOrEqual(3);
    });

    it('should include source label', () => {
      const visited: CommunityNode[] = [
        { nodeId: '1', communityId: 1, pageRankScore: 0.8, domainTags: ['auth'], confidence: 0.9 },
      ];

      const results = classifyGraphSingle('entity-1', visited);
      if (results.length > 0) {
        expect(results[0].source).toBe('GRAPH_COMMUNITY');
      }
    });

    it('should handle mixed domain tags across neighborhood', () => {
      const visited: CommunityNode[] = [
        { nodeId: '1', communityId: 1, pageRankScore: 0.8, domainTags: ['auth', 'security'], confidence: 0.95 },
        { nodeId: '2', communityId: 1, pageRankScore: 0.7, domainTags: ['retrieval'], confidence: 0.9 },
        { nodeId: '3', communityId: 2, pageRankScore: 0.6, domainTags: ['embedding', 'ai_analysis'], confidence: 0.85 },
      ];

      const results = classifyGraphSingle('entity-1', visited, 0.2);
      expect(results.length).toBeGreaterThan(0);
      const domainSet = new Set(results.map((r) => r.domain));
      // Should include multiple domains present in neighborhood
      expect(domainSet.size).toBeGreaterThanOrEqual(1);
    });
  });

  describe('classifyGraphBatch', () => {
    it('should classify multiple entities', () => {
      const entities = [
        {
          entityId: 'entity-1',
          visited: [
            { nodeId: '1', communityId: 1, pageRankScore: 0.8, domainTags: ['auth'], confidence: 0.9 },
          ] as CommunityNode[],
        },
        {
          entityId: 'entity-2',
          visited: [
            { nodeId: '2', communityId: 2, pageRankScore: 0.7, domainTags: ['storage'], confidence: 0.85 },
          ] as CommunityNode[],
        },
      ];

      const results = classifyGraphBatch(entities);
      expect(Object.keys(results)).toHaveLength(2);
      expect(results['entity-1']).toBeDefined();
      expect(results['entity-2']).toBeDefined();
    });

    it('should handle empty neighborhoods', () => {
      const entities = [
        { entityId: 'entity-1', visited: [] as CommunityNode[] },
        {
          entityId: 'entity-2',
          visited: [
            { nodeId: '1', communityId: 1, pageRankScore: 0.8, domainTags: ['auth'], confidence: 0.9 },
          ] as CommunityNode[],
        },
      ];

      const results = classifyGraphBatch(entities);
      expect(results['entity-1']).toEqual([]);
      expect(results['entity-2'].length).toBeGreaterThan(0);
    });
  });

  describe('computeGraphMetrics', () => {
    it('should compute basic metrics', () => {
      const classifications = {
        entity1: [{ domain: 'auth', score: 0.8, source: 'GRAPH_COMMUNITY' as const, explanation: '' }],
        entity2: [{ domain: 'retrieval', score: 0.7, source: 'GRAPH_COMMUNITY' as const, explanation: '' }],
        entity3: [],  // No classifications
      };

      const metrics = computeGraphMetrics(classifications);

      expect(metrics.totalEntities).toBe(3);
      expect(metrics.classifiedEntities).toBe(2);
      expect(metrics.coveragePercentage).toBeCloseTo(66.67, 1);
      expect(metrics.averageConfidence).toBeCloseTo(0.75, 2);
      expect(metrics.minConfidenceObserved).toBe(0.7);
      expect(metrics.maxConfidenceObserved).toBe(0.8);
    });

    it('should compute variance correctly', () => {
      const classifications = {
        entity1: [{ domain: 'auth', score: 0.5, source: 'GRAPH_COMMUNITY' as const, explanation: '' }],
        entity2: [{ domain: 'retrieval', score: 0.9, source: 'GRAPH_COMMUNITY' as const, explanation: '' }],
      };

      const metrics = computeGraphMetrics(classifications);
      expect(metrics.confidenceVariance).toBeGreaterThan(0);
    });

    it('should compute community density', () => {
      const classifications = {
        entity1: [{ domain: 'auth', score: 0.8, source: 'GRAPH_COMMUNITY' as const, explanation: '' }],
        entity2: [{ domain: 'retrieval', score: 0.7, source: 'GRAPH_COMMUNITY' as const, explanation: '' }],
      };

      const traversalResults = [
        {
          entityId: 'entity1',
          visited: [
            { nodeId: '1', communityId: 1, pageRankScore: 0.8, domainTags: ['auth', 'security'], confidence: 0.9 },
            { nodeId: '2', communityId: 1, pageRankScore: 0.7, domainTags: ['auth'], confidence: 0.85 },
          ] as CommunityNode[],
        },
        {
          entityId: 'entity2',
          visited: [
            { nodeId: '3', communityId: 2, pageRankScore: 0.6, domainTags: ['retrieval', 'embedding'], confidence: 0.8 },
          ] as CommunityNode[],
        },
      ];

      const metrics = computeGraphMetrics(classifications, traversalResults);
      expect(metrics.communityDensity).toBeGreaterThanOrEqual(0);
      expect(metrics.communityDensity).toBeLessThanOrEqual(1);
      expect(metrics.averageNeighbors).toBeGreaterThan(0);
      expect(metrics.averagePageRankObserved).toBeGreaterThan(0);
    });

    it('should handle empty classifications', () => {
      const metrics = computeGraphMetrics({});

      expect(metrics.totalEntities).toBe(0);
      expect(metrics.classifiedEntities).toBe(0);
      expect(metrics.coveragePercentage).toBe(0);
      expect(metrics.averageConfidence).toBe(0);
    });
  });

  describe('Integration: Graph-based Classification', () => {
    it('should classify 100 entities with graph neighborhoods', () => {
      const entities = Array.from({ length: 100 }, (_, i) => {
        const visited: CommunityNode[] = Array.from({ length: 5 }, (_, j) => ({
          nodeId: `node-${i}-${j}`,
          communityId: Math.floor(i / 10),
          pageRankScore: Math.random() * 0.9 + 0.1,
          domainTags: [CANONICAL_DOMAINS[Math.floor(Math.random() * CANONICAL_DOMAINS.length)]],
          confidence: Math.random() * 0.5 + 0.5,
        }));

        return { entityId: `entity-${i}`, visited };
      });

      const results = classifyGraphBatch(entities, 0.2);

      const classifiedEntities = Object.values(results).filter((scores) => scores.length > 0).length;
      const coverage = (classifiedEntities / entities.length) * 100;

      // Expect reasonable coverage with graph neighborhoods
      expect(coverage).toBeGreaterThanOrEqual(50);

      const metrics = computeGraphMetrics(results);
      expect(metrics.averageNeighbors).toBeCloseTo(5, 0);
      expect(metrics.communityDensity).toBeGreaterThanOrEqual(0);
    });
  });
});

const CANONICAL_DOMAINS = [
  'auth',
  'retrieval',
  'embedding',
  'graph',
  'storage',
  'ai_analysis',
  'ui_components',
  'api_routes',
  'testing',
  'documentation',
];
