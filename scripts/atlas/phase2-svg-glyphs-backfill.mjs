#!/usr/bin/env node
/**
 * Phase 2.1: atlas_svg_glyphs Backfill with Bifrost Cache Integration
 *
 * Purpose: Populate SVG rendering metadata for file-level glyphs
 * Strategy: Cache-aware backfill using Bifrost L1 (exact-match) + L2 (semantic)
 *
 * Stages:
 *   1. L1 Cache (Redis): Check if glyph already computed
 *   2. L2 Cache (Bifrost): Transfer learn from similar packets (same SOM cell)
 *   3. Compute: Generate SVG glyph from scratch if needed
 *   4. Store: Write to DB + cache for future
 *
 * Usage:
 *   node scripts/atlas/phase2-svg-glyphs-backfill.mjs [--dry-run] [--apply] [--limit N]
 */

import pg from 'pg';
import { createClient } from 'redis';
import { config } from 'dotenv';
import { resolve } from 'path';
import crypto from 'crypto';

config({ path: resolve('.', '.env') });

const { Pool } = pg;
const pgPool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379'
});

const flags = {
  dryRun: process.argv.includes('--dry-run'),
  apply: process.argv.includes('--apply'),
  limit: parseInt(process.argv.find(arg => arg.startsWith('--limit='))?.split('=')[1] || '100')
};

const mode = flags.apply ? 'APPLY' : 'DRY-RUN';

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Phase 2.1: atlas_svg_glyphs Backfill (Bifrost Cache-Aware)   ║');
console.log(`║  Mode: ${mode}${' '.repeat(48 - mode.length)}║`);
console.log(`║  Limit: ${flags.limit}${' '.repeat(46 - String(flags.limit).length)}║`);
console.log('╚════════════════════════════════════════════════════════════════╝\n');

// ── Cache helpers ──────────────────────────────────────────────────────────

function generateGlyphCacheKey(packetKey) {
  return `svg:glyph:${packetKey}`;
}

async function tryRedisL1Cache(packetKey) {
  try {
    const cacheKey = generateGlyphCacheKey(packetKey);
    const cached = await redisClient.get(cacheKey);
    if (cached) {
      return { hit: true, data: JSON.parse(cached), source: 'redis_l1' };
    }
  } catch (err) {
    console.warn(`  ⚠️  Redis L1 cache error: ${err.message}`);
  }
  return { hit: false };
}

async function setRedisL1Cache(packetKey, glyph) {
  try {
    const cacheKey = generateGlyphCacheKey(packetKey);
    await redisClient.setEx(cacheKey, 86400, JSON.stringify(glyph)); // 24h TTL
  } catch (err) {
    console.warn(`  ⚠️  Redis L1 cache set error: ${err.message}`);
  }
}

// ── Bifrost L2 transfer learning ───────────────────────────────────────────

async function findSimilarGlyphs(packetKey, somCluster) {
  try {
    // Simulate Bifrost prefilter: find other packets in same SOM cell with cached glyphs
    const result = await pgPool.query(`
      SELECT DISTINCT ap.packet_key, ap.file_path
      FROM atlas_codebase_packets ap
      WHERE ap.som_cluster = $1
        AND ap.packet_key != $2
      LIMIT 3
    `, [somCluster, packetKey]);

    const candidates = [];
    for (const row of result.rows) {
      const cached = await tryRedisL1Cache(row.packet_key);
      if (cached.hit) {
        candidates.push({
          packet_key: row.packet_key,
          file_path: row.file_path,
          glyph: cached.data
        });
      }
    }
    return candidates;
  } catch (err) {
    console.warn(`  ⚠️  Bifrost L2 lookup error: ${err.message}`);
    return [];
  }
}

async function transferLearnGlyph(packet, similar) {
  // Adapt a similar glyph to this packet (simple: copy + update file_path)
  if (similar.length === 0) return null;

  const sourceGlyph = similar[0].glyph;
  return {
    glyph_name: `file-glyph-${packet.file_path.split('/').pop().split('.')[0]}`,
    color_dominant: sourceGlyph.color_dominant || '#808080',
    color_palette: sourceGlyph.color_palette || ['#666', '#999', '#ccc'],
    rendering_complexity: sourceGlyph.rendering_complexity || 0.3,
    source: 'transfer_learned',
    confidence: 0.6
  };
}

// ── Glyph generation ──────────────────────────────────────────────────────

function generateSvgGlyph(fileName) {
  // Simple deterministic glyph based on file path hash
  const hash = crypto.createHash('sha256').update(fileName).digest('hex');
  const seed = parseInt(hash.substring(0, 8), 16);

  const hueShift = (seed % 360);
  const colorDominant = `hsl(${hueShift}, 70%, 50%)`;
  const palette = [
    `hsl(${(hueShift + 120) % 360}, 70%, 50%)`,
    `hsl(${(hueShift + 240) % 360}, 70%, 50%)`,
    `hsl(${hueShift}, 30%, 70%)`
  ];

  return {
    glyph_name: `file-glyph-${fileName.split('/').pop().split('.')[0]}`,
    svg_data: `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
      <rect width="64" height="64" fill="${colorDominant}" opacity="0.1"/>
      <circle cx="32" cy="32" r="24" fill="${colorDominant}" opacity="0.6"/>
    </svg>`,
    color_dominant: colorDominant,
    color_palette: palette,
    rendering_complexity: 0.2,
    source: 'generated',
    confidence: 0.4
  };
}

// ── Main backfill ──────────────────────────────────────────────────────────

async function backfillSvgGlyphs() {
  console.log('📊 Step 1: Fetch packets with file_path\n');

  try {
    const result = await pgPool.query(`
      SELECT packet_key, file_path, som_cluster
      FROM atlas_codebase_packets
      WHERE file_path IS NOT NULL
      LIMIT $1
    `, [flags.limit]);

    const packets = result.rows;
    console.log(`   ✅ Fetched ${packets.length} packets\n`);

    if (packets.length === 0) {
      console.log('   ⚠️  No packets found\n');
      return { success: true, processed: 0, cached: 0, transferred: 0, generated: 0 };
    }

    console.log('🧠 Step 2: Backfill with cache awareness\n');

    let cached = 0;
    let transferred = 0;
    let generated = 0;
    const glyphsToInsert = [];

    for (const packet of packets) {
      // Stage 1: L1 Redis cache
      const l1Hit = await tryRedisL1Cache(packet.packet_key);
      if (l1Hit.hit) {
        console.log(`   ✅ L1 HIT: ${packet.packet_key}`);
        cached++;
        glyphsToInsert.push({
          packet_key: packet.packet_key,
          file_path: packet.file_path,
          ...l1Hit.data,
          source: 'redis_l1'
        });
        continue;
      }

      // Stage 2: L2 Bifrost (transfer learn from similar)
      const similar = await findSimilarGlyphs(packet.packet_key, packet.som_cluster);
      if (similar.length > 0) {
        const transferred_glyph = await transferLearnGlyph(packet, similar);
        console.log(`   📚 L2 HIT (transfer): ${packet.packet_key}`);
        transferred++;
        glyphsToInsert.push({
          packet_key: packet.packet_key,
          file_path: packet.file_path,
          ...transferred_glyph
        });
        await setRedisL1Cache(packet.packet_key, transferred_glyph);
        continue;
      }

      // Stage 3: Compute from scratch
      const computed = generateSvgGlyph(packet.file_path);
      console.log(`   🔧 COMPUTE: ${packet.packet_key}`);
      generated++;
      glyphsToInsert.push({
        packet_key: packet.packet_key,
        file_path: packet.file_path,
        ...computed
      });
      await setRedisL1Cache(packet.packet_key, computed);
    }

    console.log(`\n   📈 Backfill summary:`);
    console.log(`      L1 cache hits: ${cached}`);
    console.log(`      L2 transfer learns: ${transferred}`);
    console.log(`      Computed from scratch: ${generated}`);
    console.log(`      Total glyphs ready: ${glyphsToInsert.length}\n`);

    if (flags.dryRun) {
      console.log('   [DRY-RUN] Preview (first 3 glyphs):\n');
      for (let i = 0; i < Math.min(3, glyphsToInsert.length); i++) {
        const g = glyphsToInsert[i];
        console.log(`   ${g.packet_key}: ${g.glyph_name} (${g.source})`);
      }
      console.log(`\n   [DRY-RUN] Would insert ${glyphsToInsert.length} glyphs\n`);
      return { success: true, processed: glyphsToInsert.length, cached, transferred, generated };
    }

    // APPLY: Insert into database
    console.log('💾 Step 3: Insert into atlas_svg_glyphs\n');

    let inserted = 0;
    for (const glyph of glyphsToInsert) {
      try {
        await pgPool.query(`
          INSERT INTO atlas_svg_glyphs
          (packet_key, file_path, glyph_name, color_dominant, color_palette, rendering_complexity, source)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (packet_key, glyph_name) DO UPDATE SET
            color_dominant = EXCLUDED.color_dominant,
            rendering_complexity = EXCLUDED.rendering_complexity
        `, [
          glyph.packet_key,
          glyph.file_path,
          glyph.glyph_name,
          glyph.color_dominant,
          glyph.color_palette,
          glyph.rendering_complexity,
          glyph.source
        ]);
        inserted++;
      } catch (err) {
        console.error(`   ❌ Insert error for ${glyph.packet_key}: ${err.message}`);
      }
    }

    console.log(`   ✅ Inserted ${inserted} glyphs\n`);
    return { success: true, processed: glyphsToInsert.length, cached, transferred, generated };
  } catch (err) {
    console.error('   ❌ Backfill error:', err.message);
    return { success: false, processed: 0, cached: 0, transferred: 0, generated: 0 };
  }
}

// ── Verification ───────────────────────────────────────────────────────────

async function verify() {
  console.log('✅ Step 4: Verify atlas_svg_glyphs coverage\n');

  try {
    const result = await pgPool.query(`
      SELECT
        COUNT(*) as total_glyphs,
        COUNT(DISTINCT packet_key) as unique_packets,
        COUNT(DISTINCT source) as source_types
      FROM atlas_svg_glyphs
    `);

    const { total_glyphs, unique_packets, source_types } = result.rows[0];

    console.log(`   Total glyphs: ${total_glyphs}`);
    console.log(`   Unique packets: ${unique_packets}`);
    console.log(`   Source types: ${source_types}\n`);

    // Sample source distribution
    const distribution = await pgPool.query(`
      SELECT source, COUNT(*) as count
      FROM atlas_svg_glyphs
      GROUP BY source
    `);

    console.log('   Source distribution:');
    for (const row of distribution.rows) {
      console.log(`      ${row.source}: ${row.count}`);
    }
    console.log('');

    return { success: true, totalGlyphs: total_glyphs, uniquePackets: unique_packets };
  } catch (err) {
    console.error('   ❌ Verification error:', err.message);
    return { success: false };
  }
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main() {
  try {
    await redisClient.connect();

    const backfillResult = await backfillSvgGlyphs();
    const verifyResult = await verify();

    console.log('╔════════════════════════════════════════════════════════════════╗');
    console.log('║  Phase 2.1 Complete ✅                                        ║');
    console.log('╚════════════════════════════════════════════════════════════════╝\n');

    if (backfillResult.success && verifyResult.success) {
      console.log(`   ✅ SVG glyphs backfill complete`);
      console.log(`   Cache hits: ${backfillResult.cached}`);
      console.log(`   Transfer learns: ${backfillResult.transferred}`);
      console.log(`   Generated: ${backfillResult.generated}`);
      console.log(`   Total: ${verifyResult.totalGlyphs} glyphs\n`);
      process.exit(0);
    } else {
      console.log(`   ⚠️  Backfill incomplete\n`);
      if (!flags.apply) {
        console.log('   📋 To apply, run:\n');
        console.log(`   node scripts/atlas/phase2-svg-glyphs-backfill.mjs --apply --limit ${flags.limit}\n`);
      }
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error:', err.message);
    process.exit(1);
  } finally {
    await redisClient.quit();
    await pgPool.end();
  }
}

main();