#!/usr/bin/env node
/**
 * Seed: atlas_svg_glyphs Table
 *
 * Seeds the atlas_svg_glyphs table with glyph records for enrichment.
 * Takes packet_key from atlas_codebase_packets and generates glyph IDs.
 *
 * Dry-run by default. Use --apply to commit changes.
 *
 * Output:
 *   - docs/reports/seed-atlas-svg-glyphs-dry-run.json
 *   - docs/reports/seed-atlas-svg-glyphs-apply.json
 *   - docs/reports/seed-atlas-svg-glyphs.md
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve, dirname } from 'path';
import { writeFileSync, mkdirSync } from 'fs';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const ROOT = resolve(__dirname, '../..');

config({ path: resolve(ROOT, '.env') });

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const REPORTS_DIR = resolve(ROOT, 'docs/reports');
const dryRun = process.argv.includes('--dry-run') || !process.argv.includes('--apply');

const logger = {
  log: (msg) => console.log(msg),
  ok: (msg) => console.log(`✅ ${msg}`),
  info: (msg) => console.log(`ℹ️  ${msg}`),
  warn: (msg) => console.log(`⚠️  ${msg}`),
  error: (msg) => console.log(`❌ ${msg}`),
};

function generateGlyphId(packetKey) {
  // Generate deterministic glyph ID from packet_key
  const hash = crypto.createHash('sha256').update(packetKey).digest('hex');
  return `glyph-${hash.substring(0, 8)}`;
}

function getGlyphType(packetKey) {
  // Assign glyph type based on packet characteristics
  if (packetKey.includes('auth')) return 'security';
  if (packetKey.includes('api')) return 'endpoint';
  if (packetKey.includes('db') || packetKey.includes('database')) return 'storage';
  if (packetKey.includes('cache') || packetKey.includes('redis')) return 'cache';
  if (packetKey.includes('ui') || packetKey.includes('component')) return 'ui';
  if (packetKey.includes('util') || packetKey.includes('helper')) return 'utility';
  return 'general';
}

async function seedAtlasSvgGlyphs() {
  logger.log('\n╔════════════════════════════════════════════════════════════════╗');
  logger.log(`║  Seed: atlas_svg_glyphs Table — ${dryRun ? 'DRY-RUN' : 'APPLY'}${' '.repeat(dryRun ? 26 : 27)} ║`);
  logger.log('╚════════════════════════════════════════════════════════════════╝\n');

  const report = {
    timestamp: new Date().toISOString(),
    mode: dryRun ? 'DRY_RUN' : 'APPLY',
    steps: [],
    seed_results: [],
    statistics: {
      total_packets_read: 0,
      glyphs_seeded: 0,
      glyphs_skipped: 0,
      seed_failed: 0,
    },
  };

  try {
    // Step 1: Fetch all unique packet_keys from atlas_codebase_packets
    logger.log('Step 1: Fetch unique packet_keys from atlas_codebase_packets...');

    const packetsRes = await pool.query(
      `SELECT DISTINCT packet_key, source_ref
       FROM atlas_codebase_packets
       WHERE packet_key IS NOT NULL
       ORDER BY packet_key`
    );

    const packets = packetsRes.rows;
    logger.ok(`  Found ${packets.length} unique packet_keys`);
    report.statistics.total_packets_read = packets.length;

    report.steps.push({
      step: 'fetch_packets',
      status: 'ok',
      packet_count: packets.length,
    });

    // Step 2: Build glyph records
    logger.log('\nStep 2: Generate glyph records...');

    const glyphRecords = [];
    for (const packet of packets) {
      const glyphId = generateGlyphId(packet.packet_key);
      const glyphType = getGlyphType(packet.packet_key);

      glyphRecords.push({
        packet_key: packet.packet_key,
        source_ref: packet.source_ref,
        glyph_id: glyphId,
        glyph_type: glyphType,
      });
    }

    logger.ok(`  Generated ${glyphRecords.length} glyph records`);

    report.steps.push({
      step: 'generate_glyphs',
      status: 'ok',
      glyph_count: glyphRecords.length,
    });

    // Step 3: Insert into atlas_svg_glyphs
    logger.log('\nStep 3: Insert glyph records into atlas_svg_glyphs...');

    let seeded = 0;
    let skipped = 0;
    let failed = 0;

    if (!dryRun) {
      for (const glyph of glyphRecords) {
        try {
          await pool.query(
            `INSERT INTO atlas_svg_glyphs (packet_key, source_ref, glyph_id, glyph_type)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (packet_key) DO UPDATE
             SET glyph_id = EXCLUDED.glyph_id,
                 glyph_type = EXCLUDED.glyph_type,
                 updated_at = now()`,
            [glyph.packet_key, glyph.source_ref, glyph.glyph_id, glyph.glyph_type]
          );
          seeded++;
        } catch (err) {
          if (err.message.includes('duplicate key')) {
            skipped++;
          } else {
            logger.warn(`    Packet ${glyph.packet_key} failed: ${err.message}`);
            failed++;
          }
        }
      }
    } else {
      seeded = glyphRecords.length;
    }

    report.statistics.glyphs_seeded = seeded;
    report.statistics.glyphs_skipped = skipped;
    report.statistics.seed_failed = failed;

    logger.ok(`  Seeded ${seeded} glyphs (${skipped} skipped, ${failed} failed)`);

    report.steps.push({
      step: 'insert_glyphs',
      status: 'ok',
      seeded,
      skipped,
      failed,
    });

    // Final status
    report.status = seeded > 0 ? 'PASS' : 'WARN';

    logger.ok(`\n✅ Glyph seeding complete — ${seeded} records inserted`);

  } catch (err) {
    logger.error(`Seeding failed: ${err.message}`);
    report.status = 'FAIL';
    report.error = err.message;
  }

  return report;
}

async function main() {
  const report = await seedAtlasSvgGlyphs();

  mkdirSync(REPORTS_DIR, { recursive: true });

  const reportFile = dryRun
    ? 'seed-atlas-svg-glyphs-dry-run.json'
    : 'seed-atlas-svg-glyphs-apply.json';

  writeFileSync(
    resolve(REPORTS_DIR, reportFile),
    JSON.stringify(report, null, 2)
  );

  const md = `# Seed: atlas_svg_glyphs Table

**Timestamp**: ${report.timestamp}
**Mode**: ${report.mode}
**Status**: ${report.status}

## Seed Results

| Metric | Count |
|--------|-------|
| Total Packets Read | ${report.statistics.total_packets_read} |
| Glyphs Seeded | ${report.statistics.glyphs_seeded} |
| Glyphs Skipped | ${report.statistics.glyphs_skipped} |
| Seed Failed | ${report.statistics.seed_failed} |

## Glyph Types Generated

- **security**: auth-related packets
- **endpoint**: API endpoint packets
- **storage**: database-related packets
- **cache**: Redis/cache-related packets
- **ui**: UI component packets
- **utility**: Helper/utility packets
- **general**: Other packets

`;

  writeFileSync(
    resolve(REPORTS_DIR, 'seed-atlas-svg-glyphs.md'),
    md
  );

  logger.ok(`\n✅ Reports written to ${REPORTS_DIR}`);
}

main().catch(err => {
  logger.error(err.message);
  process.exit(1);
}).finally(() => {
  pool.end();
});
