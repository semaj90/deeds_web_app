import { readdirSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { compileFeatureMap } from '../../src/lib/server/features/feature-map-compiler.js';
import { persistFeatureCompileResult } from '../../src/lib/server/features/feature-map-store.js';

async function compileAllFeatures() {
  console.log('🏗 Starting Global FeatureMap Compilation...');
  const t0 = Date.now();

  const featuresDir = 'documents/features';
  if (!existsSync(featuresDir)) {
    console.warn(`⚠️ Features directory not found: ${featuresDir}`);
    return;
  }

  const files = readdirSync(featuresDir).filter(f => f.endsWith('.md'));
  console.log(`🔍 Found ${files.length} feature notes.`);

  let success = 0;
  let failure = 0;

  for (const file of files) {
    const path = join(featuresDir, file);
    process.stdout.write(`   Compiling ${file}... `);
    
    try {
      const result = await compileFeatureMap(path);
      await persistFeatureCompileResult(result);
      process.stdout.write('✅\n');
      success++;
    } catch (err) {
      process.stdout.write('❌\n');
      console.error(`      Error: ${(err as Error).message}`);
      failure++;
    }
  }

  const duration = ((Date.now() - t0) / 1000).toFixed(2);
  console.log('\n🏁 Compilation Finished');
  console.log(`   Success: ${success}`);
  console.log(`   Failure: ${failure}`);
  console.log(`   Duration: ${duration}s`);
}

compileAllFeatures();
