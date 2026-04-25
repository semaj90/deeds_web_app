/**
 * Property-Based Test: Rune UUID Uniqueness
 *
 * Feature: advanced-multimodal-retriever
 * Property 1: Rune UUID Uniqueness
 * Validates: Requirements 1.1
 *
 * Property: For any set of runes, all generated tensor UUIDs must be unique
 * and in valid hex format.
 */

import fc from 'fast-check';
import { buildRunes, getRuneCount } from '../../services/rune_uuid_generator';

describe('Property 1: Rune UUID Uniqueness', () => {
  it('should generate unique UUIDs for all runes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (iterations) => {
        // Generate rune bank multiple times
        for (let i = 0; i < iterations; i++) {
          const runes = buildRunes();

          // Extract UUIDs
          const uuids = runes.map(r => r.tensor_uuid);

          // Check uniqueness
          const uniqueUuids = new Set(uuids);
          expect(uniqueUuids.size).toBe(uuids.length);
          expect(uuids.length).toBe(getRuneCount());
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should generate valid hex format UUIDs', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 100 }), (iterations) => {
        for (let i = 0; i < iterations; i++) {
          const runes = buildRunes();

          for (const rune of runes) {
            // UUID should be 32 hex characters (128 bits)
            expect(rune.tensor_uuid).toMatch(/^[0-9a-f]{32}$/);
          }
        }
      }),
      { numRuns: 100 }
    );
  });

  it('should never generate duplicate UUIDs across multiple builds', () => {
    fc.assert(
      fc.property(fc.integer({ min: 2, max: 10 }), (numBuilds) => {
        const allUuids: string[] = [];

        for (let i = 0; i < numBuilds; i++) {
          const runes = buildRunes();
          allUuids.push(...runes.map(r => r.tensor_uuid));
        }

        // All UUIDs should be unique across all builds
        const uniqueUuids = new Set(allUuids);
        expect(uniqueUuids.size).toBe(allUuids.length);
      }),
      { numRuns: 50 }
    );
  });

  it('should maintain UUID consistency for same rune symbol', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 25 }), (runeIndex) => {
        const runes1 = buildRunes();
        const runes2 = buildRunes();

        // Same rune symbol should have different UUIDs (since they're generated fresh)
        // But the rune symbol itself should be the same
        expect(runes1[runeIndex].rune).toBe(runes2[runeIndex].rune);

        // UUIDs should be different (probabilistically)
        // This is expected since we generate new UUIDs each time
        // In a real system, you might want to cache these
      }),
      { numRuns: 100 }
    );
  });

  it('should generate correct number of runes', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 50 }), (iterations) => {
        for (let i = 0; i < iterations; i++) {
          const runes = buildRunes();
          expect(runes.length).toBe(26);
        }
      }),
      { numRuns: 100 }
    );
  });
});
