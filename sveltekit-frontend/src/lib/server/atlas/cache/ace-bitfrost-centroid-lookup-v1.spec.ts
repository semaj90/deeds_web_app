import { describe, expect, it } from 'vitest';
import {
  CENTROID_HASH_NAMESPACES_V1,
  CacheDescriptorV1Schema,
  buildCentroidLookupKeyV1,
} from './ace-bitfrost-cache-identity-v1.js';

const hash = (c: string) => `sha256:${c.repeat(64)}`;
const base = {
  namespace: 'PACKET_DIGEST' as const,
  lookupHash: hash('a'),
  representationRevision: 'semantic_768:eg:title-path-trim:v1',
  artifactChecksum: 'sha256:' + 'c'.repeat(64),
};

describe('HASHCENT-01 centroid lookup key', () => {
  it('is deterministic and does not depend on the centroid answer', () => {
    expect(buildCentroidLookupKeyV1(base)).toBe(buildCentroidLookupKeyV1({ ...base }));
    expect(buildCentroidLookupKeyV1(base)).toContain('atlas:bitfrost:v1:centroid_lookup:packet_digest');
  });

  it('never collides across hash namespaces for the same hash value', () => {
    const keys = CENTROID_HASH_NAMESPACES_V1.map((namespace) => buildCentroidLookupKeyV1({ ...base, namespace }));
    expect(new Set(keys).size).toBe(CENTROID_HASH_NAMESPACES_V1.length);
  });

  it('changes with the representation revision and the centroid artifact checksum', () => {
    const k = buildCentroidLookupKeyV1(base);
    expect(buildCentroidLookupKeyV1({ ...base, representationRevision: 'semantic_768:raw:v1' })).not.toBe(k);
    expect(buildCentroidLookupKeyV1({ ...base, artifactChecksum: 'sha256:' + 'd'.repeat(64) })).not.toBe(k);
  });

  it('rejects identity-shaped values as lookup hashes (packet_key, stableKey, UUID, bare hex)', () => {
    for (const bad of ['packet:0123456789ab', 'stable:abc', '3f2b8c1e-0000-4000-8000-000000000000', 'a'.repeat(64), 'sha256:' + 'A'.repeat(64)]) {
      expect(() => buildCentroidLookupKeyV1({ ...base, lookupHash: bad })).toThrow();
    }
  });

  it('rejects an unknown namespace', () => {
    expect(() => buildCentroidLookupKeyV1({ ...base, namespace: 'STABLE_KEY' as never })).toThrow();
  });
});

describe('CacheDescriptorV1 (Valkey value)', () => {
  const descriptor = { ...base, centroidId: 'centroid:7' };

  it('accepts the tiny descriptor', () => {
    expect(CacheDescriptorV1Schema.parse(descriptor)).toEqual(descriptor);
  });

  it('is strict: vectors, source content and identity fields are rejected', () => {
    for (const extra of [{ vector: [0.1] }, { embedding: [0.1] }, { content: 'text' }, { packet_key: 'packet:abc' }]) {
      expect(() => CacheDescriptorV1Schema.parse({ ...descriptor, ...extra })).toThrow();
    }
  });
});
