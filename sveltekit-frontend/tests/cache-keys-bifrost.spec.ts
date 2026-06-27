/**
 * BitFrost Cache Key Consolidation Tests (P1)
 *
 * Verifies that all bifrost:* keys are generated from canonical helpers.
 * Prevents key collisions and ensures consistent naming across modules.
 */

import { describe, it, expect } from 'vitest';
import { bifrostKey, TTL } from '$lib/server/cache-keys';

describe('BitFrost Cache Keys (P1 Consolidation)', () => {
  describe('bifrostKey.packet', () => {
    it('should generate packet cache keys', () => {
      const packetKey = 'ace:packet:auth:001';
      const cacheKey = bifrostKey.packet(packetKey);

      expect(cacheKey).toBe('bifrost:packet:ace:packet:auth:001');
      expect(cacheKey).toMatch(/^bifrost:packet:/);
    });

    it('should handle various packet key formats', () => {
      const testKeys = [
        'feature:auth.sessions',
        'task:123',
        'schema:user',
        'api:/users/[id]',
      ];

      testKeys.forEach((key) => {
        const cacheKey = bifrostKey.packet(key);
        expect(cacheKey).toMatch(/^bifrost:packet:/);
        expect(cacheKey).toContain(key);
      });
    });
  });

  describe('bifrostKey.feature', () => {
    it('should hash feature IDs to prevent key explosion', () => {
      const featureId = 'auth.sessions';
      const cacheKey = bifrostKey.feature(featureId);

      expect(cacheKey).toBe('bifrost:feature:' + '8f7e6d5c4b3a2a1b'); // hash of featureId
      expect(cacheKey.length).toBeLessThan(50); // hashed, not too long
    });

    it('should produce consistent hashes', () => {
      const featureId = 'gpu.acceleration';
      const key1 = bifrostKey.feature(featureId);
      const key2 = bifrostKey.feature(featureId);

      expect(key1).toBe(key2);
    });

    it('should differentiate similar feature IDs', () => {
      const key1 = bifrostKey.feature('auth');
      const key2 = bifrostKey.feature('auth.sessions');

      expect(key1).not.toBe(key2);
    });
  });

  describe('bifrostKey.source', () => {
    it('should hash source references', () => {
      const sourceRef = 'src/lib/server/auth.ts';
      const cacheKey = bifrostKey.source(sourceRef);

      expect(cacheKey).toMatch(/^bifrost:source:[a-f0-9]{16}$/);
    });

    it('should handle file paths with special characters', () => {
      const sourceRefs = [
        'src/lib/server/auth.ts',
        'src/routes/api/[id]/+server.ts',
        'packages/atlas-core/src/validation/gan-audit.ts',
      ];

      sourceRefs.forEach((ref) => {
        const cacheKey = bifrostKey.source(ref);
        expect(cacheKey).toMatch(/^bifrost:source:[a-f0-9]{16}$/);
      });
    });
  });

  describe('bifrostKey.query', () => {
    it('should hash query strings', () => {
      const query = 'authentication sessions validation';
      const cacheKey = bifrostKey.query(query);

      expect(cacheKey).toMatch(/^bifrost:query:[a-f0-9]{16}$/);
    });

    it('should provide consistent hashing across sessions', () => {
      const query = 'what is hearsay evidence?';
      const key1 = bifrostKey.query(query);
      const key2 = bifrostKey.query(query);

      expect(key1).toBe(key2);
    });

    it('should differentiate rephrased queries', () => {
      const query1 = 'authentication';
      const query2 = 'how do I authenticate?';

      expect(bifrostKey.query(query1)).not.toBe(bifrostKey.query(query2));
    });
  });

  describe('bifrostKey.workflow', () => {
    it('should hash workflow IDs', () => {
      const workflowId = 'workflow:auth:validation:001';
      const cacheKey = bifrostKey.workflow(workflowId);

      expect(cacheKey).toMatch(/^bifrost:workflow:[a-f0-9]{16}$/);
    });

    it('should handle UUID-format workflow IDs', () => {
      const workflowId = '550e8400-e29b-41d4-a716-446655440000';
      const cacheKey = bifrostKey.workflow(workflowId);

      expect(cacheKey).toMatch(/^bifrost:workflow:[a-f0-9]{16}$/);
    });
  });

  describe('TTL Constants', () => {
    it('should define bifrost TTL constants', () => {
      expect(TTL.BIFROST_PACKET).toBe(60 * 60); // 1 hour
      expect(TTL.BIFROST_INDEX).toBe(6 * 60 * 60); // 6 hours
      expect(TTL.BIFROST_QUERY).toBe(30 * 60); // 30 min
      expect(TTL.BIFROST_WORKFLOW).toBe(60 * 60); // 1 hour
    });

    it('should order TTLs correctly (shorter query, longer index)', () => {
      expect(TTL.BIFROST_QUERY).toBeLessThan(TTL.BIFROST_PACKET);
      expect(TTL.BIFROST_PACKET).toBeLessThan(TTL.BIFROST_INDEX);
    });
  });

  describe('No Key Collisions', () => {
    it('should prevent collisions across different key types', () => {
      const keys = [
        bifrostKey.packet('test-packet'),
        bifrostKey.feature('test-feature'),
        bifrostKey.source('test-source'),
        bifrostKey.query('test-query'),
        bifrostKey.workflow('test-workflow'),
      ];

      // All should be unique
      const uniqueKeys = new Set(keys);
      expect(uniqueKeys.size).toBe(keys.length);

      // All should start with different prefixes
      expect(keys.every((k) => k.startsWith('bifrost:'))).toBe(true);
      const prefixes = keys.map((k) => k.split(':')[1]);
      expect(new Set(prefixes).size).toBe(prefixes.length);
    });

    it('should prevent collisions with similar inputs', () => {
      const key1 = bifrostKey.feature('auth');
      const key2 = bifrostKey.source('auth');
      const key3 = bifrostKey.query('auth');

      expect(new Set([key1, key2, key3]).size).toBe(3);
    });
  });

  describe('Integration with Module Imports', () => {
    it('should be importable from cache-keys.ts', () => {
      expect(typeof bifrostKey).toBe('object');
      expect(typeof bifrostKey.packet).toBe('function');
      expect(typeof bifrostKey.feature).toBe('function');
      expect(typeof bifrostKey.source).toBe('function');
      expect(typeof bifrostKey.query).toBe('function');
      expect(typeof bifrostKey.workflow).toBe('function');
    });

    it('should work with Redis-style key patterns', () => {
      const key = bifrostKey.packet('test');
      const pattern = 'bifrost:packet:*';

      // Verify key matches pattern
      expect(key.match(/^bifrost:packet:/)).toBeTruthy();
    });
  });

  describe('Performance', () => {
    it('should generate keys quickly', () => {
      const start = performance.now();

      for (let i = 0; i < 1000; i++) {
        bifrostKey.packet(`packet:${i}`);
        bifrostKey.feature(`feature:${i}`);
        bifrostKey.source(`source:${i}`);
        bifrostKey.query(`query ${i}`);
        bifrostKey.workflow(`workflow:${i}`);
      }

      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100); // 5000 generations in <100ms
    });
  });
});
