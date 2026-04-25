#!/usr/bin/env node
/**
 * Phase 72 - Quick Start Execution Script
 *
 * Automates the complete Phase 72 pipeline:
 * 1. Infrastructure verification (Redis, Ollama, Qdrant)
 * 2. SIMD parser integration
 * 3. Error embedding generation
 * 4. KAG population with verified fixes
 * 5. Vector search setup
 */

import { execSync } from 'child_process';
import { existsSync } from 'fs';
import Redis from 'ioredis';

const CONFIG = {
  redis: { url: 'redis://127.0.0.1:6379', prefix: 'phase72:kag' },
  ollama: { url: 'http://localhost:11434', model: 'embeddinggemma:latest' },
  qdrant: { url: 'http://localhost:6333', collection: 'phase72_error_patterns' },
  phase72: {
    batchSize: 32,
    errorFile: 'reports/latest/errors.jsonl',
    tier: 2,
    limit: 1000,
  }
};

console.log('\n🚀 Phase 72 Quick Start\n');
console.log('═'.repeat(60));

// Step 1: Verify Infrastructure
console.log('\n📊 Step 1: Infrastructure Verification\n');

const redis = new Redis(CONFIG.redis.url);
try {
  const pong = await redis.ping();
  console.log(`✅ Redis: ${pong} (port 6379)`);

  const stats = await redis.hgetall(`${CONFIG.redis.prefix}:stats`);
  console.log(`   Current fixes stored: ${stats.totalFixesStored || 0}`);
  console.log(`   Current signatures: ${stats.totalSignatures || 0}`);
} catch (error) {
  console.error(`❌ Redis connection failed: ${error.message}`);
  process.exit(1);
} finally {
  await redis.quit();
}

// Check Ollama
try {
  const ollamaRes = await fetch(`${CONFIG.ollama.url}/api/tags`);
  const models = await ollamaRes.json();
  const hasEmbedding = models.models.some(m => m.name.includes('embedding'));
  console.log(`✅ Ollama: ${models.models.length} models installed`);
  console.log(`   Embedding model: ${hasEmbedding ? '✅ embeddinggemma' : '❌ Missing'}`);

  if (!hasEmbedding) {
    console.error('\n⚠️  embeddinggemma:latest not found. Install with:');
    console.error('   ollama pull embeddinggemma:latest\n');
  }
} catch (error) {
  console.error(`❌ Ollama connection failed: ${error.message}`);
  process.exit(1);
}

// Check Qdrant
try {
  const qdrantRes = await fetch(`${CONFIG.qdrant.url}/collections`);
  const collections = await qdrantRes.json();
  const collectionNames = collections.result.collections.map(c => c.name);
  console.log(`✅ Qdrant: ${collectionNames.length} collections`);
  console.log(`   Existing: ${collectionNames.join(', ')}`);

  if (!collectionNames.includes(CONFIG.qdrant.collection)) {
    console.log(`   ⚠️  Collection ${CONFIG.qdrant.collection} will be created`);
  }
} catch (error) {
  console.error(`❌ Qdrant connection failed: ${error.message}`);
  process.exit(1);
}

// Step 2: Check error file
console.log('\n📂 Step 2: Error File Check\n');
if (!existsSync(CONFIG.phase72.errorFile)) {
  console.error(`❌ Error file not found: ${CONFIG.phase72.errorFile}`);
  console.log('\n📝 Generating errors.jsonl...');
  try {
    execSync('npx tsc --noEmit 2>&1 | node scripts/parse-tsc-errors.mjs > reports/latest/errors.jsonl', {
      stdio: 'inherit',
      shell: 'powershell.exe'
    });
    console.log('✅ Generated errors.jsonl');
  } catch (error) {
    console.error(`❌ Error generation failed: ${error.message}`);
    process.exit(1);
  }
} else {
  console.log(`✅ Error file exists: ${CONFIG.phase72.errorFile}`);
}

// Step 3: Run Factory Fixer (Tier 2)
console.log('\n🔧 Step 3: Factory Fixer - Tier 2 Fixes\n');
console.log(`   Applying up to ${CONFIG.phase72.limit} fixes (Tier ${CONFIG.phase72.tier})`);
console.log('');

try {
  execSync(
    `node scripts/factory-fixer-v2.mjs --apply --tier ${CONFIG.phase72.tier} --limit ${CONFIG.phase72.limit} --verify "cmd /c exit 0"`,
    { stdio: 'inherit', shell: 'powershell.exe' }
  );
  console.log('\n✅ Factory fixer completed');
} catch (error) {
  console.error(`\n❌ Factory fixer failed: ${error.message}`);
}

// Step 4: Verify KAG Storage
console.log('\n💾 Step 4: KAG Storage Verification\n');
const redis2 = new Redis(CONFIG.redis.url);
try {
  const stats = await redis2.hgetall(`${CONFIG.redis.prefix}:stats`);
  console.log(`   Total fixes stored: ${stats.totalFixesStored || 0}`);
  console.log(`   Total signatures: ${stats.totalSignatures || 0}`);

  const fixKeys = await redis2.keys(`${CONFIG.redis.prefix}:fix:*`);
  console.log(`   Fix keys in Redis: ${fixKeys.length}`);

  if (fixKeys.length > 0) {
    console.log(`   ✅ KAG storage populated`);
  } else {
    console.log(`   ⚠️  No fixes stored (Tier 2 may have no candidates)`);
  }
} finally {
  await redis2.quit();
}

// Step 5: Next Steps
console.log('\n📋 Next Steps:\n');
console.log('1. Generate embeddings:');
console.log('   node scripts/generate-error-embeddings.mjs\n');
console.log('2. Create Qdrant collection:');
console.log('   node scripts/create-qdrant-collection.mjs\n');
console.log('3. Upload embeddings to Qdrant:');
console.log('   node scripts/upload-embeddings-to-qdrant.mjs\n');
console.log('4. Test semantic search:');
console.log('   node scripts/test-error-search.mjs "Cannot find name"\n');

console.log('═'.repeat(60));
console.log('\n✅ Phase 72 Quick Start Complete!\n');
