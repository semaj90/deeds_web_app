#!/usr/bin/env node
/**
 * Extract Packet Titles (P4.1 Prerequisite)
 *
 * Generates titles for atlas_packets from structural metadata.
 * No LLM needed — pure string manipulation (fast, <5 min for all packets).
 *
 * Title format (in priority order):
 * 1. function_symbol (if present) → "validateSession"
 * 2. file_path stem + class/const + symbol → "auth.ts:Session"
 * 3. feature_label → "Authentication Sessions"
 * 4. file_path basename → "auth.ts"
 *
 * Purpose: Quick reference for display in KAG/ACE results.
 * Enables dense search ranking: exact title match → boost score by 1.5×
 *
 * Usage:
 *   npm run atlas:titles:extract:dry      # Preview: 100 packets, no write
 *   npm run atlas:titles:extract:apply    # Production: all packets
 *   npm run atlas:titles:extract:apply --batch=500
 *
 * Time estimate: <5 min (pure string ops, no DB writes in preview)
 */

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import Redis from 'ioredis';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

// CLI args
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const apply = !dryRun && args.includes('--apply');
const verbose = args.includes('--verbose');
const batchSize = parseInt(args.find(a => a.startsWith('--batch='))?.split('=')[1] ?? '100');

// Database connection
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgres://legal_admin:legal_ai@127.0.0.1:5434/legal_ai_db',
  max: 10,
});

/**
 * Validate packet has required identity fields
 */
function validatePacket(packet) {
  const errors = [];
  if (!packet.packetKey) errors.push('missing packet_key');
  if (!packet.filePath && !packet.featureLabel) errors.push('missing file_path and feature_label');
  return errors;
}

/**
 * Invalidate Redis/BitFrost cache after Postgres write
 */
async function invalidateRedisCache(packetKeys) {
  const redis = new Redis({
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD || 'redis',
    lazyConnect: true
  });

  try {
    await redis.connect();
    const keysToDelete = packetKeys.map(pk => `bitfrost:packet:${pk}`);
    if (keysToDelete.length > 0) {
      const deleted = await redis.del(...keysToDelete);
      if (verbose) console.log(`✓ Invalidated ${deleted} Redis keys`);
    }
  } catch (err) {
    console.warn(`⚠️  Failed to invalidate Redis cache: ${err.message}`);
  } finally {
    await redis.quit();
  }
}

/**
 * Fetch packets needing titles
 */
async function getPacketsNeedingTitles(limit) {
  const query = `
    SELECT
      id,
      packet_key as "packetKey",
      file_path as "filePath",
      function_symbol as "functionSymbol",
      feature_label as "featureLabel",
      title
    FROM atlas_packets
    WHERE title IS NULL OR title = ''
    ORDER BY packet_key ASC
    LIMIT $1
  `;

  const result = await pool.query(query, [limit]);
  return result.rows;
}

/**
 * Generate title from packet metadata
 */
function generateTitle(packet) {
  // Priority 1: function symbol (most specific)
  if (packet.functionSymbol && packet.functionSymbol.trim()) {
    return packet.functionSymbol.trim();
  }

  // Priority 2: file path + symbol extraction
  if (packet.filePath) {
    const basename = path.basename(packet.filePath);
    const stem = basename.replace(/\.(ts|tsx|js|jsx|py|go|rs|cpp)$/, '');

    // Try to extract class/interface name from stem (common pattern: AuthService, UserController)
    const classMatch = stem.match(/([A-Z][a-z]+(?:[A-Z][a-z]+)*)/);
    if (classMatch) {
      return `${classMatch[1]} (${basename})`;
    }

    return stem || basename;
  }

  // Priority 3: feature label (broader concept)
  if (packet.featureLabel && packet.featureLabel.trim()) {
    return packet.featureLabel.trim();
  }

  // Fallback: packet key itself
  return packet.packetKey || 'Untitled';
}

/**
 * Upsert packet title
 */
async function upsertPacketTitle(pool, packetId, title) {
  const query = `
    UPDATE atlas_packets
    SET
      title = $1,
      updated_at = NOW()
    WHERE id = $2
  `;

  try {
    await pool.query(query, [title, packetId]);
    return true;
  } catch (err) {
    console.error(`Failed to upsert title for packet ${packetId}:`, err.message);
    return false;
  }
}

/**
 * Process batch of packets
 */
async function processBatch(packets, pool) {
  const results = {
    success: 0,
    skipped: 0,
    failed: 0,
    packetKeysUpdated: [],
  };

  for (const packet of packets) {
    try {
      // Validate packet identity
      const validationErrors = validatePacket(packet);
      if (validationErrors.length > 0) {
        results.failed++;
        console.warn(`✗ [${packet.packetKey}] ${validationErrors.join('; ')}`);
        continue;
      }

      // Skip if already has title
      if (packet.title) {
        results.skipped++;
        if (verbose) console.log(`✓ [${packet.packetKey}] already has title`);
        continue;
      }

      // Generate title
      const title = generateTitle(packet);

      // Write to DB if not dry-run
      if (apply) {
        const success = await upsertPacketTitle(pool, packet.id, title);
        if (success) {
          results.success++;
          results.packetKeysUpdated.push(packet.packetKey);
          if (verbose) console.log(`✓ [${packet.packetKey}] "${title}"`);
        } else {
          results.failed++;
        }
      } else {
        results.success++;
        if (verbose) console.log(`[DRY] [${packet.packetKey}] "${title}"`);
      }
    } catch (err) {
      results.failed++;
      console.warn(`✗ [${packet.packetKey}] ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  return results;
}

/**
 * Get coverage stats
 */
async function getCoverageStats(pool) {
  const query = `
    SELECT
      COUNT(*) as total,
      COUNT(title) as with_title,
      ROUND(100.0 * COUNT(title) / COUNT(*), 2) as coverage_pct
    FROM atlas_packets
  `;

  const result = await pool.query(query);
  return result.rows[0];
}

/**
 * Main execution
 */
async function main() {
  console.log(`\n📝 Extract Packet Titles (P4.1 Prerequisite)`);
  console.log(`Mode: ${apply ? 'APPLY' : dryRun ? 'DRY-RUN' : 'DRY-RUN (default)'}`);
  console.log(`Batch size: ${batchSize}\n`);

  try {
    // Check database connection
    const connTest = await pool.query('SELECT NOW()');
    console.log(`✓ Database connected: ${connTest.rows[0].now}\n`);

    // Get packets needing titles
    const packets = await getPacketsNeedingTitles(batchSize);
    console.log(`📋 Found ${packets.length} packets needing titles\n`);

    if (packets.length === 0) {
      console.log('✓ All packets have titles!\n');
      const stats = await getCoverageStats(pool);
      console.log(`Coverage: ${stats.with_title}/${stats.total} (${stats.coverage_pct}%)\n`);
      return;
    }

    // Process batch
    console.log(`⏳ Processing ${packets.length} packets...\n`);
    const startTime = Date.now();
    const results = await processBatch(packets, pool);
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

    // Invalidate Redis/BitFrost cache after successful writes (canonical flow)
    if (apply && results.packetKeysUpdated.length > 0) {
      console.log(`\n🔄 Invalidating Redis cache for ${results.packetKeysUpdated.length} packets...`);
      await invalidateRedisCache(results.packetKeysUpdated);
    }

    // Report results
    console.log(`\n📊 Results (${elapsed}s):`);
    console.log(`  ✓ Success: ${results.success}`);
    console.log(`  ⊘ Skipped: ${results.skipped}`);
    console.log(`  ✗ Failed:  ${results.failed}`);

    // Coverage stats
    const stats = await getCoverageStats(pool);
    console.log(`\n📈 Coverage: ${stats.with_title}/${stats.total} (${stats.coverage_pct}%)\n`);

    if (!apply) {
      console.log(`💡 To apply changes, run with: npm run atlas:titles:extract:apply\n`);
    }
  } catch (err) {
    console.error('Fatal error:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
