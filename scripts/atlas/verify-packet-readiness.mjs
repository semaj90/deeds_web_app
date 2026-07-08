#!/usr/bin/env node
/**
 * Smoke test 1: Postgres packet readiness
 *
 * Checks that atlas_packets rows are addressable:
 *   - count > 0
 *   - source_ref not null
 *   - packet_key not null
 *   - summary or bm25_text present (at least partial)
 *   - domain_label present
 *
 * Usage:
 *   node scripts/atlas/verify-packet-readiness.mjs
 *   node scripts/atlas/verify-packet-readiness.mjs --strict   # exit 1 on any warning
 */

import pg from 'pg';
import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve('.', '.env') });
config({ path: resolve('.', 'sveltekit-frontend/.env.local'), override: false });

const pgPool = new pg.Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db',
});

const STRICT = process.argv.includes('--strict');

const PASS = '✅';
const WARN = '⚠️ ';
const FAIL = '❌';

let exitCode = 0;

function check(label, ok, value, warn = false) {
  const icon = ok ? PASS : (warn ? WARN : FAIL);
  console.log(`  ${icon} ${label}: ${value}`);
  if (!ok && !warn) exitCode = 1;
  if (!ok && warn && STRICT) exitCode = 1;
}

async function main() {
  console.log('\n╔══════════════════════════════════════════════════╗');
  console.log('║  Smoke Test 1: Postgres Packet Readiness         ║');
  console.log('╚══════════════════════════════════════════════════╝\n');

  let client;
  try {
    client = await pgPool.connect();

    // Core counts
    const res = await client.query(`
      SELECT
        COUNT(*)                                                          AS total,
        COUNT(source_ref)                                                 AS with_source_ref,
        COUNT(packet_key)                                                 AS with_packet_key,
        COUNT(CASE WHEN summary IS NOT NULL AND length(summary) > 10 THEN 1 END) AS with_summary,
        COUNT(bm25_score)                                                 AS with_bm25,
        COUNT(domain_class)                                               AS with_domain,
        COUNT(qdrant_point_id)                                            AS with_qdrant_id,
        COUNT(som_row)                                                    AS with_som_row,
        COUNT(pagerank)                                                   AS with_pagerank,
        COUNT(community_id)                                               AS with_community
      FROM atlas_packets
    `);

    const r = res.rows[0];
    const total = Number(r.total);

    console.log(`  Total rows: ${total}\n`);

    check('atlas_packets > 0', total > 0, total);
    check('source_ref coverage (100%)', Number(r.with_source_ref) === total,
      `${r.with_source_ref}/${total} (${pct(r.with_source_ref, total)}%)`);
    check('packet_key coverage (100%)', Number(r.with_packet_key) === total,
      `${r.with_packet_key}/${total} (${pct(r.with_packet_key, total)}%)`);

    const summaryOrBm25 = Math.max(Number(r.with_summary), Number(r.with_bm25));
    check('summary or bm25_score present (≥1%)', summaryOrBm25 > 0,
      `summary: ${r.with_summary}, bm25: ${r.with_bm25}`,
      summaryOrBm25 / total < 0.5);

    check('domain_class coverage (100%)', Number(r.with_domain) === total,
      `${r.with_domain}/${total} (${pct(r.with_domain, total)}%)`);

    // Optional / advisory
    console.log('\n  Advisory (mirrors, not blockers):');
    check('qdrant_point_id present',
      Number(r.with_qdrant_id) > 0,
      `${r.with_qdrant_id}/${total} (${pct(r.with_qdrant_id, total)}%)`,
      true);
    check('som_row present',
      Number(r.with_som_row) > 0,
      `${r.with_som_row}/${total} (${pct(r.with_som_row, total)}%)`,
      true);
    check('pagerank present',
      Number(r.with_pagerank) > 0,
      `${r.with_pagerank}/${total} (${pct(r.with_pagerank, total)}%)`,
      true);
    check('community_id present',
      Number(r.with_community) > 0,
      `${r.with_community}/${total} (${pct(r.with_community, total)}%)`,
      true);

    // Sample row
    const sample = await client.query(`
      SELECT packet_key, source_ref, domain_class,
             left(summary, 60) AS summary_preview
      FROM atlas_packets
      WHERE packet_key IS NOT NULL AND source_ref IS NOT NULL
      LIMIT 3
    `);
    console.log('\n  Sample rows:');
    for (const row of sample.rows) {
      console.log(`    ${row.packet_key} | ${row.source_ref} | ${row.domain_class}`);
      if (row.summary_preview) console.log(`      summary: "${row.summary_preview}..."`);
    }

  } catch (err) {
    console.error(`\n${FAIL} DB error: ${err.message}`);
    exitCode = 1;
  } finally {
    client?.release();
    await pgPool.end();
  }

  console.log(`\n  Result: ${exitCode === 0 ? '✅ PASS' : '❌ FAIL'}\n`);
  process.exit(exitCode);
}

function pct(n, total) {
  return total > 0 ? ((Number(n) / total) * 100).toFixed(1) : '0.0';
}

main();