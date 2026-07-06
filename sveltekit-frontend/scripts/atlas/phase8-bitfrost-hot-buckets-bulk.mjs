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
import { sql } from 'drizzle-orm';
import { db } from '../sveltekit-frontend/src/lib/server/db/client.js';
import { buildCanonicalPacketKey } from '../../../scripts/atlas/lib/packet-identity.mjs';
import { buildCanonicalFeatureEnvelope, reportValidation } from '../../../scripts/atlas/lib/envelope-builder.mjs';

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
    const packetResult = await db.execute(sql`
      SELECT
        id,
        relative_path AS "relativePath",
        line_start AS "lineStart",
        line_end AS "lineEnd",
        content_hash AS "contentHash",
        language,
        kind,
        domain,
        coalesce(nullif(title_id, ''), nullif(feature_id, ''), nullif(domain, '')) AS "titleId",
        coalesce(nullif(feature_id, ''), nullif(domain, ''), nullif(kind, '')) AS "featureId",
        som_cluster AS "somCluster",
        summary
      FROM codebase_chunk_index
      WHERE summary IS NOT NULL AND LENGTH(summary) > 10
      ORDER BY id
      LIMIT ${limit}
    `);
    const packets = packetResult.rows ?? packetResult;

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
      title: new Map(),
      som: new Map(),
    };

    for (const packet of packets) {
      const packetKey = buildCanonicalPacketKey(packet) || `${packet.id}`;
      const featureHint =
        packet.featureId ||
        packet.domain ||
        packet.relativePath?.split(/[\\/]/).filter(Boolean).slice(0, 2).join('.') ||
        packet.relativePath ||
        '';
      const titleHint = packet.titleId || packet.featureId || packet.domain || packet.relativePath || '';
      const somHint = packet.somCluster !== null && packet.somCluster !== undefined ? String(packet.somCluster) : '';

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

      // Feature bucket (inferred from domain or top-level path segments)
      if (featureHint) {
        const feature = String(featureHint).split('.').slice(0, 2).join('.');
        const featureKey = `bitfrost:hot:feature:${normalizeKey(feature)}`;
        if (!buckets.feature.has(featureKey)) buckets.feature.set(featureKey, []);
        buckets.feature.get(featureKey).push(packetKey);
      }

      if (titleHint) {
        const titleKey = `bitfrost:hot:title:${normalizeKey(titleHint)}`;
        if (!buckets.title.has(titleKey)) buckets.title.set(titleKey, []);
        buckets.title.get(titleKey).push(packetKey);
      }

      if (somHint) {
        const somKey = `bitfrost:hot:som:${normalizeKey(somHint)}`;
        if (!buckets.som.has(somKey)) buckets.som.set(somKey, []);
        buckets.som.get(somKey).push(packetKey);
      }
    }

    const totalBuckets = buckets.language.size + buckets.kind.size + buckets.feature.size + buckets.title.size + buckets.som.size;
    console.log(`  ✓ Built ${totalBuckets} hot buckets`);
    console.log(`    Language: ${buckets.language.size}`);
    console.log(`    Kind: ${buckets.kind.size}`);
    console.log(`    Feature: ${buckets.feature.size}\n`);
    console.log(`    Title: ${buckets.title.size}`);
    console.log(`    SOM: ${buckets.som.size}\n`);

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
    for (const [key, members] of Array.from(buckets.feature.entries()).slice(0, 5)) {
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
    for (const [key, members] of buckets.title) {
      pipeline.sadd(key, ...members);
      pipeline.expire(key, ttl);
      written += members.length;
    }
    for (const [key, members] of buckets.som) {
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
    const titleKeys = await redis.keys('bitfrost:hot:title:*');
    const somKeys = await redis.keys('bitfrost:hot:som:*');

    console.log(`  ✓ Language buckets: ${languageKeys.length}`);
    console.log(`  ✓ Kind buckets: ${kindKeys.length}`);
    console.log(`  ✓ Feature buckets: ${featureKeys.length}`);
    console.log(`  ✓ Title buckets: ${titleKeys.length}`);
    console.log(`  ✓ SOM buckets: ${somKeys.length}`);

    // Sample a bucket
    if (languageKeys.length > 0) {
      const sampleKey = languageKeys[0];
      const sampleMembers = await redis.smembers(sampleKey);
      console.log(`  ✓ Sample (${sampleKey}): ${sampleMembers.length} packets`);
    }

    console.log('\n✅ Phase 8: BitFrost hot bucket population complete');
    console.log(`   Total hot buckets: ${languageKeys.length + kindKeys.length + featureKeys.length + titleKeys.length + somKeys.length}`);
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
