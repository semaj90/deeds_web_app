#!/usr/bin/env node

/**
 * Phase 16-H.8: Glyph Bridge
 *
 * Links glyph records from atlas_svg_glyphs by packet_key or feature_id
 * Populates glyph_record_id and glyph_render_type
 *
 * Time: ~10 min
 * Blocker: Phase 16-H.1
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const log = {
  info: (msg) => console.log(`[phase-16-h-8] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

async function main() {
  const startTime = Date.now();

  try {
    log.info('========== Phase 16-H.8: Glyph Bridge ==========');
    log.info('');

    const client = await pool.connect();

    try {
      log.progress('Checking if atlas_svg_glyphs table exists...');

      // Check if table exists
      const tableCheckResult = await client.query(`
        SELECT EXISTS (
          SELECT 1 FROM information_schema.tables
          WHERE table_name = 'atlas_svg_glyphs'
        )
      `);

      const tableExists = tableCheckResult.rows[0].exists;

      if (!tableExists) {
        log.info('⏳ atlas_svg_glyphs table does not exist yet');
        log.info('   Skipping glyph linkage (expected — glyphs are on-demand)');
        log.ok('Glyph bridge status: pending (awaiting atlas_svg_glyphs creation)');
      } else {
        log.progress('Linking glyph records by packet_key and feature_id...');

        // Link by packet_key first
        const packetKeyResult = await client.query(`
          UPDATE atlas_higher_hop_index h
          SET
            glyph_record_id = g.id,
            glyph_render_type = g.glyph_type
          FROM atlas_svg_glyphs g
          WHERE h.packet_key = g.packet_key AND h.glyph_record_id IS NULL
        `);

        const linked1 = packetKeyResult.rowCount;
        log.ok(`Linked ${linked1} glyphs by packet_key`);

        // Link by source_ref second
        const sourceRefResult = await client.query(`
          UPDATE atlas_higher_hop_index h
          SET
            glyph_record_id = g.id,
            glyph_render_type = g.glyph_type
          FROM atlas_svg_glyphs g
          WHERE h.source_ref = g.source_ref AND h.glyph_record_id IS NULL
        `);

        const linked2 = sourceRefResult.rowCount;
        log.ok(`Linked ${linked2} glyphs by source_ref`);

        log.info('');

        // Audit
        const auditResult = await client.query(`
          SELECT
            COUNT(CASE WHEN glyph_record_id IS NOT NULL THEN 1 END) as with_glyph,
            COUNT(*) as total
          FROM atlas_higher_hop_index
        `);

        const { with_glyph, total } = auditResult.rows[0];
        const coverage = (100 * with_glyph / total).toFixed(1);

        log.ok(`Glyph coverage: ${with_glyph}/${total} (${coverage}%)`);
        log.ok(`Note: Low coverage expected (glyphs are on-demand, not exhaustive)`);
      }

      log.ok('');
      log.ok('========== Phase 16-H.8 COMPLETE ==========');
      log.info(`Total time: ${((Date.now() - startTime) / 1000).toFixed(1)}s`);

    } finally {
      await client.release();
    }

  } catch (err) {
    log.error(`Execution failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
