import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'vitest';

import { compileFeatureMap } from '../src/lib/server/features/feature-map-compiler.js';

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
});
