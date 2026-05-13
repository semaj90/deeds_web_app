import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'vitest';

import { compileFeatureMap } from '../src/lib/server/features/feature-map-compiler.js';
import { encodeFeatureGlyph } from '../src/lib/server/features/feature-glyph-encoder.js';
import { createGrpoMemoryStick } from '../src/lib/server/features/grpo-memory-stick.js';
import { prepareStoreWrites } from '../src/lib/server/features/feature-map-store.js';

function makeFixture() {
  const root = join(tmpdir(), 'opencode', 'feature-map-integrity-spec');
  const notePath = join(root, 'feature-map-integrity.md');
  const svgPath = join(root, 'feature-map-integrity.svg');

  mkdirSync(root, { recursive: true });
  writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><title>Feature Map Integrity</title></svg>');
  writeFileSync(notePath, [
    '---',
    'featureId: feature:integrity:spec',
    'title: Feature Map Integrity Spec',
    'status: implemented',
    'summary: Integrity spec for FeatureMap compiler outputs.',
    '---',
    '',
    '# Feature Map Integrity Spec',
    '',
    '- `src/lib/server/features/feature-map-compiler.ts`',
    '- `src/lib/server/features/feature-map-store.ts`',
    '- `src/lib/server/features/grpo-memory-stick.ts`',
    '- `static/diagrams/missing-feature-map.svg`',
    '- `proto/missing-feature-map.proto`',
    '- `' + svgPath.replace(/\\/g, '/'),
  ].join('\n'), 'utf8');

  return notePath;
}

describe('feature map integrity', () => {
  it('compiles a stable feature map shape', async () => {
    const featureId = 'feature:integrity:spec';
    const result = await compileFeatureMap({
      featureId,
      featureNotePath: makeFixture(),
      dryRun: true,
    });

    assert.equal(result.featureMap.featureId, featureId);
    assert.ok(result.featureMap.title.length > 0);
    assert.ok(result.featureMap.summaries.short.length > 0);
    assert.ok(result.featureMap.graphTriples.length > 0);
    assert.ok(result.featureMap.glyph.mask >= 0 && result.featureMap.glyph.mask <= 255);
    assert.equal(result.featureMap.glyph.bits.length, 64);
    assert.deepEqual(result.featureMap.cache.redisKeys, [
      `feature:summary:${featureId}`,
      `feature:glyph:${featureId}`,
      `feature:map:${featureId}`,
    ]);
    assert.ok(result.grpoMemoryStick);
    assert.ok(Array.isArray(result.grpoMemoryStick?.selectedSourceIds));
    assert.ok(Array.isArray(result.grpoMemoryStick?.rejectedSourceIds));
    assert.ok(!('reasoning' in (result.grpoMemoryStick ?? {})));
  });

  it('encodes feature completeness into an 8-bit glyph mask', () => {
    const glyph = encodeFeatureGlyph({
      featureId: 'feature:integrity:glyph',
      hasTypes: true,
      hasService: true,
      hasRoute: true,
      hasTool: true,
      hasTest: true,
      hasDocs: true,
      hasGraphEdge: true,
    });

    assert.equal(glyph.mask, 127);
    assert.equal(glyph.width, 8);
    assert.equal(glyph.height, 8);
    assert.equal(glyph.bits.length, 64);
    assert.deepEqual(glyph.bits.slice(0, 8), [1, 1, 1, 1, 1, 1, 1, 0]);
  });

  it('creates compact GRPO memory sticks without reasoning payloads', () => {
    const stick = createGrpoMemoryStick({
      featureId: 'feature:integrity:stick',
      query: 'topological sort corpus',
      contextPacketHash: 'packet-abc123def456',
      selectedSourceIds: ['src/a.ts', 'src/b.ts'],
      rejectedSourceIds: ['src/c.ts'],
      rewardSignals: { compilePassed: true, testsPassed: true },
      scores: { attentionScore: 0.9, grpoReward: 0.8, finalUtility: 0.85 },
      cacheKeys: { redis: ['feature:map:feature:integrity:stick'] },
    });

    assert.match(stick.id, /^grpo:[a-f0-9]{16}:/);
    assert.equal(stick.featureId, 'feature:integrity:stick');
    assert.equal(stick.queryHash.length, 64);
    assert.deepEqual(stick.cacheKeys.redis, ['feature:map:feature:integrity:stick']);
    assert.ok(!('reasoning' in (stick as Record<string, unknown>)));
  });

  it('prepares the expected postgres, redis, qdrant, and neo4j writes', () => {
    const writes = prepareStoreWrites({
      featureMap: {
        featureId: 'feature:integrity:store',
        title: 'Store Integrity',
        status: 'implemented',
        paths: {
          featureNote: 'docs/features/store.md',
          types: ['src/lib/server/features/feature-map.types.ts'],
          services: ['src/lib/server/features/feature-storage.ts'],
          apiRoutes: ['src/routes/api/wiki/search/+server.ts'],
          uiComponents: [],
          tools: [],
          tests: [],
          docs: [],
          svgDiagrams: [],
          protos: [],
        },
        graphTriples: [['feature:integrity:store', 'IMPLEMENTS', 'src/lib/server/features/feature-storage.ts']],
        edges: [{ source: 'feature:integrity:store', relation: 'IMPLEMENTS', target: 'src/lib/server/features/feature-storage.ts', confidence: 1, sourceKind: 'manual' }],
        summaries: { short: 'Store integrity spec.' },
        scores: { attentionScore: 0.5, grpoUtility: 0.4, pagerank: 0.3, karpathyBlend: 0.4 },
        glyph: encodeFeatureGlyph({ featureId: 'feature:integrity:store', hasTypes: true }),
        cache: {
          redisKeys: ['feature:summary:feature:integrity:store'],
          bitfrostKeys: ['bitfrost:feature:feature:integrity:store'],
          qdrantPointIds: ['feature:integrity:store'],
          neo4jNodeIds: ['neo4j:feature:integrity:store'],
        },
        vectors: { encoded64: Array.from({ length: 64 }, () => 0) },
      },
      grpoMemoryStick: createGrpoMemoryStick({
        featureId: 'feature:integrity:store',
        query: 'store integrity',
        contextPacketHash: 'packet-store-123456',
        selectedSourceIds: ['src/lib/server/features/feature-map-store.ts'],
        rejectedSourceIds: [],
      }),
      warnings: [],
    });

    assert.equal(writes.postgresJsonb.row.id, 'feature:integrity:store');
    assert.equal(writes.redisHotKeys[0].key, 'feature:summary:feature:integrity:store');
    assert.equal(writes.qdrantFeatureSummaryPoint.collection, 'feature_maps');
    assert.equal(writes.qdrantFeatureSummaryPoint.payload.featureId, 'feature:integrity:store');
    assert.ok(writes.neo4jJsonl.some((line) => line.includes('Feature_TO_File')));
  });
});
