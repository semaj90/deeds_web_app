#!/usr/bin/env node
/**
 * Quick KAG Status Verification
 * Checks Redis connectivity and KAG storage state
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

async function main() {
  console.log('🔍 Phase 72 KAG Status Verification\n');

  // 1. Check Redis connectivity
  console.log('1️⃣ Testing Redis connectivity...');
  try {
    const Redis = (await import('ioredis')).default;
    const redis = new Redis({
      host: '127.0.0.1',
      port: 6379,
      lazyConnect: true,
      retryStrategy: () => null
    });

    await redis.connect();
    const pong = await redis.ping();
    console.log(`   ✅ Redis connected (PING: ${pong})\n`);

    // 2. Check KAG keys
    console.log('2️⃣ Checking KAG storage...');
    const keys = await redis.keys('phase72:kag:*');
    console.log(`   📊 Total KAG keys: ${keys.length}`);

    if (keys.length > 0) {
      console.log(`   ✅ KAG storage is working!\n`);

      // Get stats
      const statsJson = await redis.get('phase72:kag:stats');
      if (statsJson) {
        const stats = JSON.parse(statsJson);
        console.log('   📈 KAG Statistics:');
        console.log(`      - Total Fixes: ${stats.totalFixes || 0}`);
        console.log(`      - Verified: ${stats.verifiedCount || 0}`);
        console.log(`      - Cache Hits: ${stats.cacheHits || 0}`);
      }

      // Sample 5 keys
      console.log('\n   🔑 Sample KAG keys:');
      keys.slice(0, 5).forEach(key => {
        console.log(`      - ${key}`);
      });
    } else {
      console.log(`   ⚠️  No KAG keys found - storage not yet populated\n`);
    }

    await redis.quit();

  } catch (error) {
    console.error(`   ❌ Redis error: ${error.message}\n`);
    return 1;
  }

  // 3. Check latest run
  console.log('3️⃣ Checking latest factory-fixer run...');
  try {
    const fs = require('fs');
    const path = require('path');
    const runsDir = path.join(process.cwd(), 'reports', 'runs');

    if (!fs.existsSync(runsDir)) {
      console.log('   ⚠️  No runs directory found\n');
      return 0;
    }

    const runs = fs.readdirSync(runsDir)
      .filter(f => fs.statSync(path.join(runsDir, f)).isDirectory())
      .sort()
      .reverse();

    if (runs.length === 0) {
      console.log('   ⚠️  No runs found\n');
      return 0;
    }

    const latestRun = runs[0];
    const manifestPath = path.join(runsDir, latestRun, 'manifest.json');

    if (!fs.existsSync(manifestPath)) {
      console.log(`   ⚠️  No manifest found for run: ${latestRun}\n`);
      return 0;
    }

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    console.log(`   📅 Latest run: ${latestRun}`);
    console.log(`   📊 Applied: ${manifest.stats?.applied || 0} fixes`);
    console.log(`   🎯 KAG Candidates: ${manifest.stats?.kagCandidates?.length || 0}`);
    console.log(`   ✔️  Verification: ${manifest.verification?.success ? 'PASSED' : 'FAILED'}`);

    if (manifest.verification?.command) {
      console.log(`   🔧 Verify Command: ${manifest.verification.command}`);
    }

    console.log('');

  } catch (error) {
    console.error(`   ❌ Error reading runs: ${error.message}\n`);
  }

  return 0;
}

main().then(code => process.exit(code));
