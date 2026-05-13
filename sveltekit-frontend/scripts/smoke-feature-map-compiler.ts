import { compileFeatureMap } from '../src/lib/server/features/feature-map-compiler.js';

const result = await compileFeatureMap({
  featureId: 'feature:cs:topological-sort-corpus',
  featureNotePath: 'docs/features/feature-cs-topological-sort-corpus.md',
  dryRun: true
});

console.log(JSON.stringify({
  featureId: result.featureMap.featureId,
  title: result.featureMap.title,
  graphTriples: result.featureMap.graphTriples.length,
  glyphMask: result.featureMap.glyph.mask,
  redisKeys: result.featureMap.cache.redisKeys,
  warnings: result.warnings
}, null, 2));
