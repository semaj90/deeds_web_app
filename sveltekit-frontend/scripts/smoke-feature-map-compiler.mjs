import { compileFeatureMap } from '../src/lib/server/features/feature-map-compiler.js';
import path from 'node:path';
import fs from 'node:fs/promises';

async function runSmokeTest() {
  console.log('🚀 Starting FeatureMap Compiler Smoke Test...');

  // Create a dummy feature note if it doesn't exist
  const dummyNotePath = 'docs/features/feature-smoke-test.md';
  const dummyNoteContent = `# Smoke Test Feature\n\nThis is a test feature for the compiler.`;
  
  await fs.mkdir(path.dirname(dummyNotePath), { recursive: true });
  await fs.writeFile(dummyNotePath, dummyNoteContent);

  try {
    const result = await compileFeatureMap({
      featureId: 'feature:smoke-test',
      featureNotePath: dummyNotePath,
      dryRun: true
    });

    console.log('✅ Compilation Successful!');
    console.log(JSON.stringify({
      featureId: result.featureMap.featureId,
      title: result.featureMap.title,
      graphTriples: result.featureMap.graphTriples.length,
      glyphMask: result.featureMap.glyph.mask,
      redisKeys: result.featureMap.cache.redisKeys,
      attentionScore: result.featureMap.scores?.attentionScore,
      warnings: result.warnings
    }, null, 2));

  } catch (err) {
    console.error('❌ Compilation Failed:', err);
    process.exit(1);
  }
}

runSmokeTest();
