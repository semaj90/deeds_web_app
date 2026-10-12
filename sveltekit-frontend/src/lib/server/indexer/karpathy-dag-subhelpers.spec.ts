import { describe, it, expect } from 'vitest';
import {
  buildKarpathyDagCacheKey,
  resolveValidDagHits,
  rankDenseDagHits,
  KarpathyDagHitSchema,
  type KarpathyDagHit,
} from './karpathy-dag-subhelpers.js';

describe('Karpathy GPU Dense Search & DAG Subhelpers', () => {
  const dummyRev = 'sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';
  const staleRev = 'sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';

  const sampleHit1: KarpathyDagHit = {
    nodeId: 'node:api-route:1',
    filePath: 'src/routes/api/search/+server.ts',
    semanticTag: 'api-route',
    similarityScore: 0.92,
    sourceRevision: dummyRev,
    dagLevel: 'FILE',
    dependencies: ['src/lib/server/db/client.ts'],
    dependents: ['src/routes/api/search/+server.test.ts', 'src/routes/(app)/search/+page.svelte'],
    cacheKey: buildKarpathyDagCacheKey('src/routes/api/search/+server.ts', dummyRev, 'api-route'),
    canonicalAuthority: false,
  };

  const sampleHit2: KarpathyDagHit = {
    nodeId: 'node:db:2',
    filePath: 'src/lib/server/db/schema.ts',
    semanticTag: 'database',
    similarityScore: 0.85,
    sourceRevision: staleRev,
    dagLevel: 'SYMBOL',
    dependencies: [],
    dependents: ['src/lib/server/db/client.ts'],
    cacheKey: buildKarpathyDagCacheKey('src/lib/server/db/schema.ts', staleRev, 'database'),
    canonicalAuthority: false,
  };

  it('validates schema compliance and deterministic cache keys', () => {
    expect(() => KarpathyDagHitSchema.parse(sampleHit1)).not.toThrow();
    expect(sampleHit1.cacheKey).toMatch(/^dag:karpathy:[a-f0-9]{64}$/);
    expect(sampleHit1.canonicalAuthority).toBe(false);
  });

  it('filters out stale DAG hits based on current source revision', () => {
    const currentRevisions = {
      'src/routes/api/search/+server.ts': dummyRev,
      'src/lib/server/db/schema.ts': dummyRev, // Stale! sampleHit2 has staleRev
    };

    const valid = resolveValidDagHits([sampleHit1, sampleHit2], currentRevisions);
    expect(valid).toHaveLength(1);
    expect(valid[0].filePath).toBe('src/routes/api/search/+server.ts');
  });

  it('ranks dense DAG hits fusing similarity and topological degrees', () => {
    const hits = [
      { ...sampleHit1, similarityScore: 0.80, dependents: ['dep1', 'dep2', 'dep3', 'dep4'] },
      { ...sampleHit1, similarityScore: 0.82, dependents: [] },
    ];

    const ranked = rankDenseDagHits(hits, 2);
    expect(ranked).toHaveLength(2);
    // Even though the second has slightly higher similarity (0.82 vs 0.80), the first has 4 dependents boosting fused score
    expect(ranked[0].dependents.length).toBe(4);
  });
});
