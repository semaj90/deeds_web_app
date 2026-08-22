/**
 * External Validation Lane Tests
 *
 * Validates domain classification via manual labels from external systems
 */

import { describe, it, expect } from 'vitest';
import {
  classifyExternalSingle,
  classifyExternalBatch,
  computeAgreementScore,
  computeExternalMetrics,
  type ManualLabel,
  type ExternalValidationResult,
} from './external-lane.js';

describe('External Lane', () => {
  describe('classifyExternalSingle', () => {
    it('should return empty for empty labels', () => {
      const results = classifyExternalSingle('entity-1', []);
      expect(results).toEqual([]);
    });

    it('should convert single label to domain score', () => {
      const labels: ManualLabel[] = [
        {
          entityId: 'entity-1',
          domain: 'auth',
          confidence: 0.95,
          source: 'operator',
          timestamp: new Date(),
          explanation: 'Manual review confirmed authentication module',
        },
      ];

      const results = classifyExternalSingle('entity-1', labels);
      expect(results).toHaveLength(1);
      expect(results[0].domain).toBe('auth');
      expect(results[0].score).toBe(0.95);
      expect(results[0].source).toBe('EXTERNAL_LABEL');
    });

    it('should handle multiple labels for same entity', () => {
      const labels: ManualLabel[] = [
        {
          entityId: 'entity-1',
          domain: 'auth',
          confidence: 0.9,
          source: 'operator',
          timestamp: new Date('2026-07-01'),
        },
        {
          entityId: 'entity-1',
          domain: 'auth',
          confidence: 0.95,
          source: 'code-review',
          timestamp: new Date('2026-07-02'),
        },
      ];

      const results = classifyExternalSingle('entity-1', labels);
      expect(results).toHaveLength(1);
      // Should average confidence
      expect(results[0].score).toBeCloseTo(0.925, 2);
    });

    it('should respect confidenceThreshold', () => {
      const labels: ManualLabel[] = [
        {
          entityId: 'entity-1',
          domain: 'auth',
          confidence: 0.3,
          source: 'operator',
          timestamp: new Date(),
        },
      ];

      const resultsLow = classifyExternalSingle('entity-1', labels, 0.2);
      const resultsHigh = classifyExternalSingle('entity-1', labels, 0.8);

      expect(resultsLow.length).toBeGreaterThanOrEqual(resultsHigh.length);
    });

    it('should handle multi-domain labels', () => {
      const labels: ManualLabel[] = [
        {
          entityId: 'entity-1',
          domain: 'auth',
          confidence: 0.8,
          source: 'operator',
          timestamp: new Date('2026-07-01'),
        },
        {
          entityId: 'entity-1',
          domain: 'security',
          confidence: 0.75,
          source: 'operator',
          timestamp: new Date('2026-07-02'),
        },
      ];

      const results = classifyExternalSingle('entity-1', labels);
      expect(results.length).toBe(2);
      expect(results[0].domain).toBe('auth');  // Higher confidence comes first
      expect(results[1].domain).toBe('security');
    });

    it('should use most recent timestamp for explanation', () => {
      const labels: ManualLabel[] = [
        {
          entityId: 'entity-1',
          domain: 'auth',
          confidence: 0.9,
          source: 'operator',
          timestamp: new Date('2026-07-01'),
          explanation: 'Old review',
        },
        {
          entityId: 'entity-1',
          domain: 'auth',
          confidence: 0.95,
          source: 'code-review',
          timestamp: new Date('2026-07-02'),
          explanation: 'Recent review',
        },
      ];

      const results = classifyExternalSingle('entity-1', labels);
      expect(results[0].explanation).toContain('code-review');
    });
  });

  describe('classifyExternalBatch', () => {
    it('should classify multiple entities', () => {
      const entities = [
        {
          entityId: 'entity-1',
          labels: [
            {
              entityId: 'entity-1',
              domain: 'auth',
              confidence: 0.9,
              source: 'operator',
              timestamp: new Date(),
            },
          ] as ManualLabel[],
        },
        {
          entityId: 'entity-2',
          labels: [
            {
              entityId: 'entity-2',
              domain: 'storage',
              confidence: 0.85,
              source: 'operator',
              timestamp: new Date(),
            },
          ] as ManualLabel[],
        },
      ];

      const results = classifyExternalBatch(entities);
      expect(Object.keys(results)).toHaveLength(2);
      expect(results['entity-1'][0].domain).toBe('auth');
      expect(results['entity-2'][0].domain).toBe('storage');
    });

    it('should handle entities with empty labels', () => {
      const entities = [
        { entityId: 'entity-1', labels: [] as ManualLabel[] },
        {
          entityId: 'entity-2',
          labels: [
            {
              entityId: 'entity-2',
              domain: 'auth',
              confidence: 0.9,
              source: 'operator',
              timestamp: new Date(),
            },
          ] as ManualLabel[],
        },
      ];

      const results = classifyExternalBatch(entities);
      expect(results['entity-1']).toEqual([]);
      expect(results['entity-2'].length).toBeGreaterThan(0);
    });
  });

  describe('computeAgreementScore', () => {
    it('should return 1.0 for single label', () => {
      const labels: ManualLabel[] = [
        {
          entityId: 'entity-1',
          domain: 'auth',
          confidence: 0.9,
          source: 'operator',
          timestamp: new Date(),
        },
      ];

      const score = computeAgreementScore(labels);
      expect(score).toBe(1.0);
    });

    it('should return 1.0 for all labels same domain', () => {
      const labels: ManualLabel[] = [
        { entityId: 'e1', domain: 'auth', confidence: 0.9, source: 'op', timestamp: new Date() },
        { entityId: 'e1', domain: 'auth', confidence: 0.95, source: 'cr', timestamp: new Date() },
        { entityId: 'e1', domain: 'auth', confidence: 0.85, source: 'audit', timestamp: new Date() },
      ];

      const score = computeAgreementScore(labels);
      expect(score).toBe(1.0);
    });

    it('should return 0.0 for all labels different domains', () => {
      const labels: ManualLabel[] = [
        { entityId: 'e1', domain: 'auth', confidence: 0.9, source: 'op', timestamp: new Date() },
        { entityId: 'e1', domain: 'storage', confidence: 0.9, source: 'op', timestamp: new Date() },
        { entityId: 'e1', domain: 'retrieval', confidence: 0.9, source: 'op', timestamp: new Date() },
      ];

      const score = computeAgreementScore(labels);
      expect(score).toBe(0.0);
    });

    it('should return intermediate score for partial agreement', () => {
      const labels: ManualLabel[] = [
        { entityId: 'e1', domain: 'auth', confidence: 0.9, source: 'op', timestamp: new Date() },
        { entityId: 'e1', domain: 'auth', confidence: 0.95, source: 'cr', timestamp: new Date() },
        { entityId: 'e1', domain: 'security', confidence: 0.85, source: 'audit', timestamp: new Date() },
      ];

      const score = computeAgreementScore(labels);
      expect(score).toBeGreaterThan(0);
      expect(score).toBeLessThan(1);
    });
  });

  describe('computeExternalMetrics', () => {
    it('should compute basic metrics', () => {
      const classifications = {
        entity1: [{ domain: 'auth', score: 0.9, source: 'EXTERNAL_LABEL' as const, explanation: '' }],
        entity2: [{ domain: 'storage', score: 0.85, source: 'EXTERNAL_LABEL' as const, explanation: '' }],
        entity3: [],  // Unlabeled
      };

      const metrics = computeExternalMetrics(classifications);

      expect(metrics.totalEntities).toBe(3);
      expect(metrics.labeledEntities).toBe(2);
      expect(metrics.coveragePercentage).toBeCloseTo(66.67, 1);
      expect(metrics.averageConfidence).toBeCloseTo(0.875, 2);
      expect(metrics.minConfidenceObserved).toBe(0.85);
      expect(metrics.maxConfidenceObserved).toBe(0.9);
    });

    it('should compute variance', () => {
      const classifications = {
        entity1: [{ domain: 'auth', score: 0.5, source: 'EXTERNAL_LABEL' as const, explanation: '' }],
        entity2: [{ domain: 'storage', score: 0.9, source: 'EXTERNAL_LABEL' as const, explanation: '' }],
      };

      const metrics = computeExternalMetrics(classifications);
      expect(metrics.confidenceVariance).toBeGreaterThan(0);
    });

    it('should track label source distribution', () => {
      const classifications = {
        entity1: [{ domain: 'auth', score: 0.9, source: 'EXTERNAL_LABEL' as const, explanation: '' }],
      };

      const externalResults: Record<string, ExternalValidationResult> = {
        entity1: {
          entityId: 'entity1',
          labels: [
            { entityId: 'entity1', domain: 'auth', confidence: 0.9, source: 'operator', timestamp: new Date() },
            { entityId: 'entity1', domain: 'auth', confidence: 0.95, source: 'code-review', timestamp: new Date() },
          ],
        },
      };

      const metrics = computeExternalMetrics(classifications, externalResults);
      expect(metrics.labelSourceDistribution['operator']).toBe(1);
      expect(metrics.labelSourceDistribution['code-review']).toBe(1);
    });

    it('should compute multi-label percentage', () => {
      const classifications = {
        entity1: [
          { domain: 'auth', score: 0.9, source: 'EXTERNAL_LABEL' as const, explanation: '' },
          { domain: 'security', score: 0.8, source: 'EXTERNAL_LABEL' as const, explanation: '' },
        ],
        entity2: [{ domain: 'storage', score: 0.85, source: 'EXTERNAL_LABEL' as const, explanation: '' }],
      };

      const externalResults: Record<string, ExternalValidationResult> = {
        entity1: {
          entityId: 'entity1',
          labels: [
            { entityId: 'entity1', domain: 'auth', confidence: 0.9, source: 'op', timestamp: new Date() },
            { entityId: 'entity1', domain: 'security', confidence: 0.8, source: 'op', timestamp: new Date() },
          ],
        },
        entity2: {
          entityId: 'entity2',
          labels: [{ entityId: 'entity2', domain: 'storage', confidence: 0.85, source: 'op', timestamp: new Date() }],
        },
      };

      const metrics = computeExternalMetrics(classifications, externalResults);
      expect(metrics.multiLabelPercentage).toBe(50);  // 1 out of 2 entities
    });

    it('should compute average agreement score', () => {
      const classifications = {
        entity1: [{ domain: 'auth', score: 0.9, source: 'EXTERNAL_LABEL' as const, explanation: '' }],
      };

      const externalResults: Record<string, ExternalValidationResult> = {
        entity1: {
          entityId: 'entity1',
          labels: [
            { entityId: 'entity1', domain: 'auth', confidence: 0.9, source: 'op', timestamp: new Date() },
            { entityId: 'entity1', domain: 'auth', confidence: 0.95, source: 'cr', timestamp: new Date() },
          ],
        },
      };

      const metrics = computeExternalMetrics(classifications, externalResults);
      expect(metrics.averageAgreementScore).toBe(1.0);  // Perfect agreement on single domain
    });

    it('should handle empty classifications', () => {
      const metrics = computeExternalMetrics({});

      expect(metrics.totalEntities).toBe(0);
      expect(metrics.labeledEntities).toBe(0);
      expect(metrics.coveragePercentage).toBe(0);
      expect(metrics.averageConfidence).toBe(0);
    });
  });

  describe('Integration: External Label Classification', () => {
    it('should handle realistic multi-source labels for 50 entities', () => {
      const entities = Array.from({ length: 50 }, (_, i) => {
        const labels: ManualLabel[] = [
          {
            entityId: `entity-${i}`,
            domain: i % 2 === 0 ? 'auth' : 'storage',
            confidence: 0.8 + Math.random() * 0.2,
            source: 'operator',
            timestamp: new Date(Date.now() - Math.random() * 30 * 24 * 60 * 60 * 1000),
          },
        ];

        // 20% have multi-domain labels
        if (Math.random() < 0.2) {
          labels.push({
            entityId: `entity-${i}`,
            domain: 'security',
            confidence: 0.7 + Math.random() * 0.2,
            source: 'code-review',
            timestamp: new Date(),
          });
        }

        return { entityId: `entity-${i}`, labels };
      });

      const results = classifyExternalBatch(entities);

      expect(Object.keys(results)).toHaveLength(50);

      const metrics = computeExternalMetrics(results);
      expect(metrics.coveragePercentage).toBe(100);  // All should be labeled
      expect(metrics.multiLabelPercentage).toBeGreaterThan(0);
      expect(metrics.multiLabelPercentage).toBeLessThanOrEqual(100);
      expect(metrics.labelSourceDistribution['operator']).toBeGreaterThan(0);
    });
  });
});
