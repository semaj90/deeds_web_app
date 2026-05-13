#!/usr/bin/env node
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { compileFeatureMap } from '../src/lib/server/features/feature-map-compiler.js';
import { extractProtoMetadata } from '../src/lib/server/features/proto-extractor.js';
import { extractSvgMetadata } from '../src/lib/server/features/svg-extractor.js';

const dryRun = !process.argv.includes('--write');

function writeFixtureFiles(root) {
  const notePath = join(root, 'feature-map-integrity.md');
  const svgPath = join(root, 'feature-map-integrity.svg');

  mkdirSync(root, { recursive: true });
  writeFileSync(svgPath, '<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64"><title>Feature Map Integrity</title></svg>');

  writeFileSync(notePath, [
    '---',
    'featureId: feature:integrity:smoke',
    'title: Feature Map Integrity Smoke',
    'status: implemented',
    'summary: Integrity smoke for FeatureMap compiler outputs and storage shapes.',
    '---',
    '',
    '# Feature Map Integrity Smoke',
    '',
    '- `src/lib/server/features/feature-map-compiler.ts`',
    '- `src/lib/server/features/feature-map-store.ts`',
    '- `src/lib/server/features/grpo-memory-stick.ts`',
    '- `src/lib/server/features/feature-glyph-encoder.ts`',
    '- `static/diagrams/missing-feature-map.svg`',
    '- `proto/missing-feature-map.proto`',
    '- `' + svgPath.replace(/\\/g, '/'),
  ].join('\n'), 'utf8');

  return notePath;
}

async function main() {
  const root = join(tmpdir(), 'opencode', 'feature-map-integrity');
  const notePath = writeFixtureFiles(root);
  const featureId = 'feature:integrity:smoke';

  const result = await compileFeatureMap({
    featureId,
    featureNotePath: notePath,
    dryRun,
  });

  assert.equal(result.featureMap.featureId, featureId);
  assert.ok(result.featureMap.title.length > 0);
  assert.ok(result.featureMap.summaries.short.length > 0);
  assert.ok(result.featureMap.graphTriples.length > 0);
  assert.ok(Number.isInteger(result.featureMap.glyph.mask));
  assert.ok(result.featureMap.glyph.mask >= 0 && result.featureMap.glyph.mask <= 255);
  assert.equal(result.featureMap.glyph.bits.length, 64);
  assert.deepEqual(result.featureMap.cache.redisKeys, [
    `feature:summary:${featureId}`,
    `feature:glyph:${featureId}`,
    `feature:map:${featureId}`,
  ]);
  assert.deepEqual(result.featureMap.cache.bitfrostKeys, [`bitfrost:feature:${featureId}`]);
  assert.ok(result.grpoMemoryStick);
  assert.ok(Array.isArray(result.grpoMemoryStick?.selectedSourceIds));
  assert.ok(Array.isArray(result.grpoMemoryStick?.rejectedSourceIds));
  assert.ok(!('reasoning' in (result.grpoMemoryStick ?? {})));
  assert.ok(result.featureMap.paths.svgDiagrams.some((p) => p.endsWith('.svg')));
  assert.ok(result.featureMap.paths.protos.some((p) => p.endsWith('.proto')));

  const missingReferences = result.featureMap.paths.svgDiagrams.filter((p) => p.includes('missing-'))
    .concat(result.featureMap.paths.protos.filter((p) => p.includes('missing-')));
  assert.ok(missingReferences.length >= 2, 'missing SVG/proto references are preserved in the feature map');
  assert.deepEqual(extractSvgMetadata('static/diagrams/missing-feature-map.svg'), { labels: [], ids: [], title: '' });
  assert.deepEqual(extractProtoMetadata('proto/missing-feature-map.proto'), { messages: [], enums: [], services: [] });

  const secondResult = await compileFeatureMap({
    featureId,
    featureNotePath: notePath,
    dryRun,
  });
  assert.deepEqual(secondResult.featureMap.cache.redisKeys, result.featureMap.cache.redisKeys);
  assert.deepEqual(secondResult.featureMap.cache.bitfrostKeys, result.featureMap.cache.bitfrostKeys);

  if (!dryRun) {
    const { persistFeatureCompileResult } = await import('../src/lib/server/features/feature-map-store.js');
    await persistFeatureCompileResult(result);
  }

  console.log(JSON.stringify({
    dryRun,
    featureId: result.featureMap.featureId,
    title: result.featureMap.title,
    triples: result.featureMap.graphTriples.length,
    glyphMask: result.featureMap.glyph.mask,
    redisKeys: result.featureMap.cache.redisKeys,
    grpoSources: result.grpoMemoryStick?.selectedSourceIds.length ?? 0,
    warnings: result.warnings,
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
