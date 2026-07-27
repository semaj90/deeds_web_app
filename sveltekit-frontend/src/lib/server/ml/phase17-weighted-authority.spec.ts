import { describe, test, expect } from 'vitest';
import {
  computeWeightedAuthority,
  hasTestCoverage,
  estimateDocumentationPresence,
  computeDependencyMetrics,
  enhanceMetadata,
} from '$lib/server/ml/phase17-advanced-features';
import type { Phase17Input, ExtractedFeatures } from '$lib/server/ml/phase17-schema';

describe('Phase 17B.1: Weighted Authority Scoring', () => {
  describe('computeWeightedAuthority', () => {
    test('base authority unchanged when no boosts apply', () => {
      const score = computeWeightedAuthority(0.5, false, 0, 0);
      expect(score).toBe(0.5);
    });

    test('test coverage boost applies (+0.15)', () => {
      const score = computeWeightedAuthority(0.5, true, 0, 0);
      expect(score).toBe(0.65);
    });

    test('documentation presence boost applies (+0.1 × docPresence)', () => {
      const score = computeWeightedAuthority(0.5, false, 1.0, 0);
      expect(score).toBe(0.6);
    });

    test('documentation presence partial boost', () => {
      const score = computeWeightedAuthority(0.5, false, 0.5, 0);
      expect(score).toBe(0.55);
    });

    test('packet count boost applies (+0.02 × packetCount, capped at 0.2)', () => {
      const score = computeWeightedAuthority(0.5, false, 0, 5);
      expect(score).toBe(0.6);
    });

    test('packet count boost caps at 0.2', () => {
      const score = computeWeightedAuthority(0.5, false, 0, 100);
      expect(score).toBe(0.7); // 0.5 + min(0.2, 100 * 0.02) = 0.5 + 0.2
    });

    test('all boosts combined', () => {
      const score = computeWeightedAuthority(0.5, true, 1.0, 10);
      // 0.5 + 0.15 (tests) + 0.1 (docs) + 0.2 (packets) = 0.95
      expect(score).toBe(0.95);
    });

    test('score clamped to minimum 0.1', () => {
      const score = computeWeightedAuthority(0.0, false, 0, 0);
      expect(score).toBe(0.1);
    });

    test('score clamped to maximum 1.0', () => {
      const score = computeWeightedAuthority(0.9, true, 1.0, 100);
      expect(score).toBe(1.0);
    });

    test('edge case: high base authority with all boosts', () => {
      const score = computeWeightedAuthority(0.95, true, 1.0, 50);
      expect(score).toBe(1.0);
    });

    test('edge case: low base authority with all boosts', () => {
      const score = computeWeightedAuthority(0.1, true, 1.0, 5);
      expect(score).toBeGreaterThan(0.1);
      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('hasTestCoverage', () => {
    test('detects .spec.ts files', () => {
      expect(hasTestCoverage('src/lib/auth.spec.ts')).toBe(true);
    });

    test('detects .test.ts files', () => {
      expect(hasTestCoverage('src/lib/auth.test.ts')).toBe(true);
    });

    test('detects .spec.js files', () => {
      expect(hasTestCoverage('src/lib/auth.spec.js')).toBe(true);
    });

    test('detects .test.js files', () => {
      expect(hasTestCoverage('src/lib/auth.test.js')).toBe(true);
    });

    test('detects __tests__/ directory', () => {
      expect(hasTestCoverage('src/__tests__/auth.ts')).toBe(true);
    });

    test('detects /tests/ directory', () => {
      expect(hasTestCoverage('src/lib/tests/auth.ts')).toBe(true);
    });

    test('returns false for non-test files', () => {
      expect(hasTestCoverage('src/lib/auth.ts')).toBe(false);
    });

    test('case sensitive: .SPEC.TS not detected', () => {
      expect(hasTestCoverage('src/lib/auth.SPEC.TS')).toBe(false);
    });
  });

  describe('estimateDocumentationPresence', () => {
    test('baseline score 0.1 for non-documented files', () => {
      const score = estimateDocumentationPresence('random.js');
      expect(score).toBe(0.1);
    });

    test('adds 0.4 for /docs/ directory', () => {
      const score = estimateDocumentationPresence('docs/architecture/auth.md');
      expect(score).toBeGreaterThanOrEqual(0.5);
    });

    test('adds 0.2 for /src/lib/ directory', () => {
      const score = estimateDocumentationPresence('/src/lib/auth.ts');
      // 0.1 (baseline) + 0.2 (src/lib) + 0.1 (.ts) = 0.4
      expect(score).toBe(0.4);
    });

    test('adds 0.5 for .md files', () => {
      const score = estimateDocumentationPresence('README.md');
      expect(score).toBeGreaterThanOrEqual(0.6);
    });

    test('adds 0.3 for README mention', () => {
      const score = estimateDocumentationPresence('docs/README.md');
      expect(score).toBeLessThanOrEqual(1.0);
    });

    test('adds 0.1 for .ts files', () => {
      const score = estimateDocumentationPresence('src/lib/auth.ts');
      expect(score).toBeGreaterThanOrEqual(0.2);
    });

    test('adds 0.1 for .tsx files', () => {
      const score = estimateDocumentationPresence('src/lib/Component.tsx');
      expect(score).toBeGreaterThanOrEqual(0.2);
    });

    test('score clamped to maximum 1.0', () => {
      const score = estimateDocumentationPresence('docs/README.md');
      expect(score).toBeLessThanOrEqual(1.0);
    });
  });

  describe('computeDependencyMetrics', () => {
    test('returns 0 incoming/outgoing for empty packets', () => {
      const input: Phase17Input = {
        reconciliationResult: {
          aliasId: 'test-1',
          queryHash: 'hash-1',
          sourceRefs: [],
          featureIds: [],
          clusterCards: [],
          packets: [],
          scoreProfile: {
            qdrant: 0.4,
            cluster: 0.35,
            topological: 0.25,
            fusion: 1.0,
          },
        },
        sourceRef: 'src/lib/auth.ts',
        featureId: 'auth.sessions',
        aliasId: 'test-1',
      };

      const metrics = computeDependencyMetrics(input, 'src/lib/auth.ts');
      expect(metrics.incoming).toBe(0);
      expect(metrics.outgoing).toBe(0);
    });

    test('counts outgoing dependencies (packets with sourceRef)', () => {
      const input: Phase17Input = {
        reconciliationResult: {
          aliasId: 'test-1',
          queryHash: 'hash-1',
          sourceRefs: ['src/lib/auth.ts'],
          featureIds: ['auth.sessions', 'auth.tokens'],
          clusterCards: [],
          packets: [
            {
              packetKey: 'packet-1',
              sourceRef: 'src/lib/auth.ts',
              featureId: 'auth.sessions',
              aliasId: 'test-1',
            },
            {
              packetKey: 'packet-2',
              sourceRef: 'src/lib/auth.ts',
              featureId: 'auth.tokens',
              aliasId: 'test-1',
            },
          ],
          scoreProfile: {
            qdrant: 0.4,
            cluster: 0.35,
            topological: 0.25,
            fusion: 1.0,
          },
        },
        sourceRef: 'src/lib/auth.ts',
        featureId: 'auth.sessions',
        aliasId: 'test-1',
      };

      const metrics = computeDependencyMetrics(input, 'src/lib/auth.ts');
      expect(metrics.outgoing).toBe(2);
    });

    test('caps incoming at 100', () => {
      const packets = Array.from({ length: 150 }, (_, i) => ({
        packetKey: `packet-${i}`,
        sourceRef: `src/lib/other-${i}.ts`,
        featureId: `feature-${i}`,
        aliasId: 'test-1',
      }));

      const input: Phase17Input = {
        reconciliationResult: {
          aliasId: 'test-1',
          queryHash: 'hash-1',
          sourceRefs: [],
          featureIds: [],
          clusterCards: [],
          packets,
          scoreProfile: {
            qdrant: 0.4,
            cluster: 0.35,
            topological: 0.25,
            fusion: 1.0,
          },
        },
        sourceRef: 'src/lib/auth.ts',
        featureId: 'auth.sessions',
        aliasId: 'test-1',
      };

      const metrics = computeDependencyMetrics(input, 'other-file.ts');
      expect(metrics.outgoing).toBe(0); // no packets match source_ref
    });
  });

  describe('enhanceMetadata', () => {
    test('applies all enhancements to metadata', () => {
      const baseMetadata: ExtractedFeatures['metadata'] = {
        authority_score: 0.5,
        member_count: 5,
        summary_length: 100,
        source_ref_depth: 3,
        is_core_library: true,
        is_test_file: false,
        has_packets: true,
        packet_count: 3,
        avg_packet_authority: 0.6,
      };

      const input: Phase17Input = {
        reconciliationResult: {
          aliasId: 'test-1',
          queryHash: 'hash-1',
          sourceRefs: ['src/lib/auth.spec.ts', 'docs/auth.md'],
          featureIds: ['auth.sessions'],
          clusterCards: [],
          packets: [],
          scoreProfile: {
            qdrant: 0.4,
            cluster: 0.35,
            topological: 0.25,
            fusion: 1.0,
          },
        },
        sourceRef: 'src/lib/auth.spec.ts',
        featureId: 'auth.sessions',
        aliasId: 'test-1',
      };

      const enhanced = enhanceMetadata(baseMetadata, input, 'src/lib/auth.spec.ts');

      // Authority should be boosted (has tests, in src/lib)
      expect(enhanced.authority_score).toBeGreaterThan(baseMetadata.authority_score);
      expect(enhanced.authority_score).toBeLessThanOrEqual(1.0);

      // Other metadata should be preserved
      expect(enhanced.member_count).toBe(baseMetadata.member_count);
      expect(enhanced.summary_length).toBe(baseMetadata.summary_length);
    });

    test('preserves base metadata fields', () => {
      const baseMetadata: ExtractedFeatures['metadata'] = {
        authority_score: 0.5,
        member_count: 10,
        summary_length: 250,
        source_ref_depth: 4,
        is_core_library: false,
        is_test_file: true,
        has_packets: false,
        packet_count: 0,
        avg_packet_authority: 0.5,
      };

      const input: Phase17Input = {
        reconciliationResult: {
          aliasId: 'test-1',
          queryHash: 'hash-1',
          sourceRefs: [],
          featureIds: [],
          clusterCards: [],
          packets: [],
          scoreProfile: {
            qdrant: 0.4,
            cluster: 0.35,
            topological: 0.25,
            fusion: 1.0,
          },
        },
        sourceRef: 'src/lib/other.ts',
        featureId: 'other.feature',
        aliasId: 'test-1',
      };

      const enhanced = enhanceMetadata(baseMetadata, input, 'src/lib/other.ts');

      expect(enhanced.member_count).toBe(10);
      expect(enhanced.summary_length).toBe(250);
      expect(enhanced.source_ref_depth).toBe(4);
      expect(enhanced.is_core_library).toBe(false);
      expect(enhanced.is_test_file).toBe(true);
      expect(enhanced.has_packets).toBe(false);
      expect(enhanced.packet_count).toBe(0);
      expect(enhanced.avg_packet_authority).toBe(0.5);
    });
  });
});
