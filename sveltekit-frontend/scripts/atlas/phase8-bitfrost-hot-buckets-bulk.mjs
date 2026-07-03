#!/usr/bin/env node
/**
 * Phase 8: BitFrost Hot Bucket Bulk Population
 *
 * Populates bitfrost:hot:language:*, bitfrost:hot:kind:*, bitfrost:hot:feature:*
 * from summarized packets in Postgres after Phase 7 completes.
 *
 * Usage:
 *   npm run atlas:phase102:step8:hot-buckets:dry      # Preview
 *   npm run atlas:phase102:step8:hot-buckets:apply    # Execute
 */

import Redis from 'ioredis';
import { db } from '../sveltekit-frontend/src/lib/server/db/client.js';
import { codebaseChunkIndex } from '../sveltekit-frontend/src/lib/server/db/schema-postgres.js';
import { sql } from 'drizzle-orm';

const isDryRun = process.argv.includes('--dry-run') || process.argv.includes('--dry');
const isApply = process.argv.includes('--apply');
const limit = parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] ?? '50000');

const redis = new Redis({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD || 'redis',
  lazyConnect: true,
  enableOfflineQueue: false,
  retryStrategy: () => null,
});

function normalizeKey(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '_')
    .substring(0, 64);
}

async function main() {
  console.log(`\n🔥 Phase 8: BitFrost Hot Bucket Bulk Population [${isDryRun ? 'DRY-RUN' : 'APPLY'}]\n`);
  console.log(`   Limit: ${limit} packets | Mode: ${isDryRun ? 'DRY-RUN' : 'APPLY'}\n`);

  try {
    await redis.connect();

    // 1. Fetch summarized packets from Postgres
    console.log('📦 Step 1: Fetch summarized packets from Postgres...');
    const packets = await db
      .select({
        id: codebaseChunkIndex.id,
        fileId: codebaseChunkIndex.fileId,
        language: codebaseChunkIndex.language,
        kind: codebaseChunkIndex.kind,
        summary: codebaseChunkIndex.summary,
      })
      .from(codebaseChunkIndex)
      .where(sql`summary IS NOT NULL AND LENGTH(summary) > 10`)
      .limit(limit);

    console.log(`  ✓ Fetched ${packets.length} summarized packets\n`);

    if (packets.length === 0) {
      console.log('⚠️  No summarized packets found. Phase 7 may still be running.\n');
      process.exit(0);
    }

    // 2. Build hot bucket operations
    console.log('📊 Step 2: Build hot bucket operations...');
    const buckets = {
      language: new Map(),
      kind: new Map(),
      feature: new Map(),
    };

    for (const packet of packets) {
      const packetKey = `${packet.fileId}`;

      // Language bucket
      if (packet.language) {
        const langKey = `bitfrost:hot:language:${normalizeKey(packet.language)}`;
        if (!buckets.language.has(langKey)) buckets.language.set(langKey, []);
        buckets.language.get(langKey).push(packetKey);
      }

      // Kind bucket (code structure type)
      if (packet.kind) {
        const kindKey = `bitfrost:hot:kind:${normalizeKey(packet.kind)}`;
        if (!buckets.kind.has(kindKey)) buckets.kind.set(kindKey, []);
        buckets.kind.get(kindKey).push(packetKey);
      }

      // Feature bucket (inferred from fileId: domain.section)
      if (packet.fileId && packet.fileId.includes('.')) {
        const feature = packet.fileId.split('.').slice(0, 2).join('.');
        const featureKey = `bitfrost:hot:feature:${normalizeKey(feature)}`;
        if (!buckets.feature.has(featureKey)) buckets.feature.set(featureKey, []);
        buckets.feature.get(featureKey).push(packetKey);
      }
    }

    const totalBuckets = buckets.language.size + buckets.kind.size + buckets.feature.size;
    console.log(`  ✓ Built ${totalBuckets} hot buckets`);
    console.log(`    Language: ${buckets.language.size}`);
    console.log(`    Kind: ${buckets.kind.size}`);
    console.log(`    Feature: ${buckets.feature.size}\n`);

    // 3. Preview statistics
    console.log('📈 Step 3: Bucket statistics...');
    let totalPackets = 0;
    for (const [key, members] of buckets.language) {
      totalPackets += members.length;
      console.log(`  ${key}: ${members.length} packets`);
    }
    for (const [key, members] of buckets.kind) {
      totalPackets += members.length;
      console.log(`  ${key}: ${members.length} packets`);
    }
    for (const [key, members] of buckets.feature.slice(0, 5)) {
      totalPackets += members.length;
      console.log(`  ${key}: ${members.length} packets`);
    }
    if (buckets.feature.size > 5) {
      console.log(`  ... and ${buckets.feature.size - 5} more feature buckets\n`);
    }

    if (isDryRun) {
      console.log('✅ Dry-run complete. Use --apply to execute.\n');
      process.exit(0);
    }

    // 4. Execute: write to Redis
    console.log('🔥 Step 4: Populating hot buckets in Redis...');
    let written = 0;

    const pipeline = redis.pipeline();
    const ttl = 86400 * 7; // 7 days

    for (const [key, members] of buckets.language) {
      pipeline.sadd(key, ...members);
      pipeline.expire(key, ttl);
      written += members.length;
    }
    for (const [key, members] of buckets.kind) {
      pipeline.sadd(key, ...members);
      pipeline.expire(key, ttl);
      written += members.length;
    }
    for (const [key, members] of buckets.feature) {
      pipeline.sadd(key, ...members);
      pipeline.expire(key, ttl);
      written += members.length;
    }

    await pipeline.exec();
    console.log(`  ✓ Written ${written} packet references to hot buckets\n`);

    // 5. Verification
    console.log('✅ Step 5: Verification...');
    const languageKeys = await redis.keys('bitfrost:hot:language:*');
    const kindKeys = await redis.keys('bitfrost:hot:kind:*');
    const featureKeys = await redis.keys('bitfrost:hot:feature:*');

    console.log(`  ✓ Language buckets: ${languageKeys.length}`);
    console.log(`  ✓ Kind buckets: ${kindKeys.length}`);
    console.log(`  ✓ Feature buckets: ${featureKeys.length}`);

    // Sample a bucket
    if (languageKeys.length > 0) {
      const sampleKey = languageKeys[0];
      const sampleMembers = await redis.smembers(sampleKey);
      console.log(`  ✓ Sample (${sampleKey}): ${sampleMembers.length} packets`);
    }

    console.log('\n✅ Phase 8: BitFrost hot bucket population complete');
    console.log(`   Total hot buckets: ${languageKeys.length + kindKeys.length + featureKeys.length}`);
    console.log(`   Stage A0 cache is now operational (5-20ms cache hits)\n`);

    process.exit(0);
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.error(error);
    process.exit(1);
  } finally {
    await redis.quit().catch(() => {});
  }
}

main();
