/**
 * Bifrost Cache Key Consolidation Tests
 *
 * Validates canonical bifrostKey helpers prevent collisions,
 * ensure consistent TTLs, and maintain backward compatibility.
 */

import { describe, it, expect } from 'vitest';
import { bifrostKey, TTL } from '$lib/server/cache-keys';

describe('Bifrost Cache Keys (P1-A)', () => {
  describe('Key Generation', () => {
    it('should generate packet keys without hashing', () => {
      const key = bifrostKey.packet('auth:001');
      expect(key).toBe('bifrost:packet:auth:001');
    });

    it('should hash feature IDs consistently', () => {
      const featureId = 'auth.sessions';
      const key1 = bifrostKey.feature(featureId);
      const key2 = bifrostKey.feature(featureId);
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^bifrost:feature:[a-f0-9]{16}$/);
    });

    it('should hash source references consistently', () => {
      const ref = 'src/lib/server/auth.ts';
      const key1 = bifrostKey.source(ref);
      const key2 = bifrostKey.source(ref);
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^bifrost:source:[a-f0-9]{16}$/);
    });

    it('should hash queries consistently', () => {
      const query = 'SELECT * FROM packets WHERE status = active';
      const key1 = bifrostKey.query(query);
      const key2 = bifrostKey.query(query);
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^bifrost:query:[a-f0-9]{16}$/);
    });

    it('should hash workflow IDs consistently', () => {
      const workflowId = 'workflow:semantic-index:001';
      const key1 = bifrostKey.workflow(workflowId);
      const key2 = bifrostKey.workflow(workflowId);
      expect(key1).toBe(key2);
      expect(key1).toMatch(/^bifrost:workflow:[a-f0-9]{16}$/);
    });
  });

  describe('Semantic Cache Lanes', () => {
    it('should generate semantic packet keys', () => {
      const key = bifrostKey.semantic.packet('auth:001');
      expect(key).toBe('bifrost:sem:packet:auth:001');
    });

    it('should generate semantic feature keys', () => {
      const key = bifrostKey.semantic.feature('auth.sessions');
      expect(key).toBe('bifrost:sem:feature:auth.sessions');
    });

    it('should generate semantic intent keys', () => {
      const hash = 'abc123def456';
      const key = bifrostKey.semantic.intent(hash);
      expect(key).toBe('bifrost:sem:intent:abc123def456');
    });
  });

  describe('TTL Constants', () => {
    it('should define BIFROST_PACKET TTL as 1 hour', () => {
      expect(TTL.BIFROST_PACKET).toBe(60 * 60);
    });

    it('should define BIFROST_INDEX TTL as 6 hours', () => {
      expect(TTL.BIFROST_INDEX).toBe(6 * 60 * 60);
    });

    it('should define BIFROST_QUERY TTL as 30 minutes', () => {
      expect(TTL.BIFROST_QUERY).toBe(30 * 60);
    });

    it('should define BIFROST_WORKFLOW TTL as 1 hour', () => {
      expect(TTL.BIFROST_WORKFLOW).toBe(60 * 60);
    });
  });

  describe('Collision Prevention', () => {
    it('should produce unique keys across all key types', () => {
      const keys = new Set([
        bifrostKey.packet('test'),
        bifrostKey.feature('test'),
        bifrostKey.source('test'),
        bifrostKey.query('test'),
        bifrostKey.workflow('test'),
        bifrostKey.semantic.packet('test'),
        bifrostKey.semantic.feature('test'),
        bifrostKey.semantic.intent('test'),
      ]);
      expect(keys.size).toBe(8);
    });

    it('should differentiate between similar inputs', () => {
      const key1 = bifrostKey.feature('auth.sessions');
      const key2 = bifrostKey.feature('auth.session');
      expect(key1).not.toBe(key2);
    });

    it('should differentiate between different hashed inputs', () => {
      const source1 = bifrostKey.source('src/lib/auth.ts');
      const source2 = bifrostKey.source('src/lib/Auth.ts');
      expect(source1).not.toBe(source2);
    });
  });

  describe('Backward Compatibility', () => {
    it('should match atlas-reward-cache semantic packet format', () => {
      const key = bifrostKey.semantic.packet('auth:001');
      expect(key).toBe('bifrost:sem:packet:auth:001');
    });

    it('should match atlas-reward-cache semantic feature format', () => {
      const key = bifrostKey.semantic.feature('auth.sessions');
      expect(key).toBe('bifrost:sem:feature:auth.sessions');
    });

    it('should maintain existing Redis key format', () => {
      const packetKey = bifrostKey.packet('auth:001');
      expect(packetKey.startsWith('bifrost:packet:')).toBe(true);
    });
  });

  describe('Performance', () => {
    it('should generate 5000 keys in under 100ms', () => {
      const start = performance.now();
      for (let i = 0; i < 5000; i++) {
        bifrostKey.packet(`packet:${i}`);
        bifrostKey.feature(`feature:${i}`);
        bifrostKey.source(`src/file${i}.ts`);
      }
      const elapsed = performance.now() - start;
      expect(elapsed).toBeLessThan(100);
    });
  });

  describe('Integration', () => {
    it('should work with Redis patterns', () => {
      const packetKey = bifrostKey.packet('auth:001');
      const pattern = `bifrost:packet:*`;
      expect(packetKey).toMatch(/bifrost:packet:.+/);
    });

    it('should work with cache expiry', () => {
      const key = bifrostKey.packet('auth:001');
      const ttl = TTL.BIFROST_PACKET;
      expect(key).toBeTruthy();
      expect(ttl).toBeGreaterThan(0);
    });

    it('should support batch invalidation via patterns', () => {
      const keys = [
        bifrostKey.packet('auth:001'),
        bifrostKey.packet('auth:002'),
        bifrostKey.packet('auth:003'),
      ];
      const pattern = 'bifrost:packet:auth:*';
      keys.forEach((k) => {
        expect(k).toMatch(new RegExp(`^${pattern.replace('*', '.+')}$`));
      });
    });
  });
});
