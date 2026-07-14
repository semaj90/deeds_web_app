#!/usr/bin/env node
/**
 * validate-title-identity-projection.mjs
 *
 * Validates that every atlas_packets row has a title_id matching the
 * canonical format:
 *   title:<slug>:<hash8>
 *   slug  = [a-z0-9]+(-[a-z0-9]+)*   (NO trailing dash)
 *   hash8 = [a-f0-9]{8}
 *
 * Reports:
 *   - total rows
 *   - rows with title_id
 *   - rows missing title_id
 *   - rows with non-canonical title_id (slug ends in '-')
 *   - duplicate title_ids (should be 0)
 *   - generator-version breakdown
 *
 * Exit 0 = all pass, Exit 1 = failures found.
 *
 * Usage:
 *   node scripts/atlas/validate-title-identity-projection.mjs [--verbose]
 */

import pg from 'pg';
import { TITLE_GENERATOR_VERSION, CANONICAL_TITLE_RE as CANONICAL_RE } from '../../packages/atlas/lib/packet-registry.mjs';

const { Pool } = pg;
const VERBOSE = process.argv.includes('--verbose');

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5434'),
  user:     process.env.DB_USER     || 'legal_admin',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME     || 'legal_ai_db',
  max: 3,
});

async function main() {
  const client = await pool.connect();
  let exitCode = 0;

  try {
    console.log('🔍 Title Identity Projection Validator\n');

    // 1. Coverage
    const cov = await client.query(`
      SELECT
        COUNT(*)                                           AS total,
        COUNT(title_id)                                    AS has_title_id,
        COUNT(*) - COUNT(title_id)                        AS missing_title_id,
        COUNT(title_generator_version)                     AS has_version,
        COUNT(*) - COUNT(title_generator_version)         AS missing_version
      FROM atlas_packets
    `);
    const { total, has_title_id, missing_title_id, missing_version } = cov.rows[0];
    console.log(`Total packets:          ${parseInt(total).toLocaleString()}`);
    console.log(`Has title_id:           ${parseInt(has_title_id).toLocaleString()}`);
    console.log(`Missing title_id:       ${parseInt(missing_title_id).toLocaleString()}  ${missing_title_id > 0 ? '❌' : '✅'}`);
    console.log(`Missing generator_ver:  ${parseInt(missing_version).toLocaleString()}  ${missing_version > 0 ? '❌' : '✅'}`);

    if (parseInt(missing_title_id) > 0) {
      exitCode = 1;
      if (VERBOSE) {
        const rows = await client.query(
          `SELECT packet_key, source_ref FROM atlas_packets WHERE title_id IS NULL LIMIT 10`
        );
        console.log('\nSample missing title_id:');
        for (const r of rows.rows) console.log(`  ${r.packet_key}  ${r.source_ref}`);
      }
    }

    // 2. Non-canonical shape (slug ends with '-')
    const badShape = await client.query(`
      SELECT COUNT(*) AS cnt
      FROM atlas_packets
      WHERE title_id IS NOT NULL
        AND title_id !~ '^title:[a-z0-9]+(-[a-z0-9]+)*:[a-f0-9]{8}$'
    `);
    const nonCanonical = parseInt(badShape.rows[0].cnt);
    console.log(`\nNon-canonical title_id: ${nonCanonical.toLocaleString()}  ${nonCanonical > 0 ? '⚠️  (slug ends with dash — needs trim)' : '✅'}`);
    if (nonCanonical > 0) {
      exitCode = 1;
      if (VERBOSE) {
        const rows = await client.query(`
          SELECT title_id, source_ref
          FROM atlas_packets
          WHERE title_id IS NOT NULL
            AND title_id !~ '^title:[a-z0-9]+(-[a-z0-9]+)*:[a-f0-9]{8}$'
          LIMIT 10
        `);
        console.log('  Sample non-canonical rows:');
        for (const r of rows.rows) {
          console.log(`    ${r.title_id}`);
          console.log(`      src: ${r.source_ref.slice(0, 80)}`);
        }
      }
    }

    // 3. Duplicate title_ids
    const dups = await client.query(`
      SELECT title_id, COUNT(*) AS cnt
      FROM atlas_packets
      WHERE title_id IS NOT NULL
      GROUP BY title_id
      HAVING COUNT(*) > 1
      ORDER BY cnt DESC
      LIMIT 10
    `);
    console.log(`\nDuplicate title_ids:    ${dups.rows.length === 0 ? '0  ✅' : `${dups.rows.length} groups  ❌`}`);
    if (dups.rows.length > 0) {
      exitCode = 1;
      for (const r of dups.rows) console.log(`  ${r.title_id}  (${r.cnt} rows)`);
    }

    // 4. Generator version breakdown
    const versions = await client.query(`
      SELECT title_generator_version, COUNT(*) AS cnt
      FROM atlas_packets
      GROUP BY title_generator_version
      ORDER BY cnt DESC
    `);
    console.log('\nGenerator versions:');
    for (const r of versions.rows) {
      console.log(`  ${r.title_generator_version ?? '(null)'}:  ${parseInt(r.cnt).toLocaleString()}`);
    }

    // 5. Hash-length sanity
    const hashLens = await client.query(`
      SELECT
        length(split_part(title_id, ':', 3)) AS hash_len,
        COUNT(*) AS cnt
      FROM atlas_packets
      WHERE title_id IS NOT NULL
      GROUP BY hash_len
      ORDER BY cnt DESC
    `);
    console.log('\nHash lengths (all should be 8):');
    for (const r of hashLens.rows) {
      const ok = parseInt(r.hash_len) === 8;
      console.log(`  len=${r.hash_len}: ${parseInt(r.cnt).toLocaleString()}  ${ok ? '✅' : '❌'}`);
      if (!ok) exitCode = 1;
    }

    console.log('\n' + '═'.repeat(60));
    if (exitCode === 0) {
      console.log('✅ All title_id validations PASS');
    } else {
      console.log('❌ Validation FAIL — run backfill-title-identity.mjs to repair');
    }
    console.log('═'.repeat(60));

  } finally {
    client.release();
    await pool.end();
  }

  process.exit(exitCode);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
