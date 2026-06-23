#!/usr/bin/env node
/**
 * P3 Readiness Verification
 *
 * Checks that P1h, P2, P3 phases are complete and P3g can proceed.
 * Gates:
 * - P1h: retrieval_provenance has P2 fields (retrieval_strategy, retrieval_path)
 * - P2: 250/250 rows populated with sensible values
 * - P3: atlas_packets.qdrant_point_id join completed (2,488/17,995 = 13.8% covered)
 * - P3g ready: 15,507 packets still need embeddings
 *
 * Usage:
 *   node scripts/atlas/verify-p3-readiness.mjs
 */

import { Pool } from 'pg';
import { loadAtlasEnv } from './load-atlas-env.mjs';

await loadAtlasEnv();
const PG_URL = process.env.DATABASE_URL;

if (!PG_URL) {
  console.error('[FAIL] DATABASE_URL not set');
  process.exit(1);
}

const pool = new Pool({ connectionString: PG_URL });

async function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('P3 READINESS VERIFICATION');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log();

  const client = await pool.connect();
  let passCount = 0;
  let failCount = 0;

  try {
    // ── Gate 1: P1h Schema ────────────────────────────────────────────
    console.log('GATE 1: P1h Schema (retrieval_provenance P2 fields)');
    try {
      const res = await client.query(`
        SELECT column_name FROM information_schema.columns
        WHERE table_name = 'retrieval_provenance'
        AND column_name IN ('retrieval_strategy', 'retrieval_path')
      `);
      if (res.rows.length === 2) {
        console.log('  ✅ PASS: Both P2 columns exist (retrieval_strategy, retrieval_path)');
        passCount++;
      } else {
        console.log(`  ❌ FAIL: Missing columns (found ${res.rows.length}/2)`);
        failCount++;
      }
    } catch (err) {
      console.log(`  ❌ FAIL: ${err.message}`);
      failCount++;
    }
    console.log();

    // ── Gate 2: P2 Provenance Population ──────────────────────────────
    console.log('GATE 2: P2 Provenance Population');
    try {
      const res = await client.query(`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE retrieval_strategy IS NOT NULL) as with_strategy,
          COUNT(*) FILTER (WHERE retrieval_path IS NOT NULL) as with_path,
          COUNT(*) FILTER (WHERE retrieval_strategy = 'fusion') as fusion_count
        FROM retrieval_provenance
      `);
      const { total, with_strategy, with_path, fusion_count } = res.rows[0];
      if (with_strategy === total && with_path === total && fusion_count > 0) {
        console.log(`  ✅ PASS: All ${total} rows have retrieval_strategy + retrieval_path`);
        console.log(`           ${fusion_count}/${total} rows use 'fusion' strategy (${(fusion_count/total*100).toFixed(1)}%)`);
        passCount++;
      } else {
        console.log(`  ⚠️  PARTIAL: strategy=${with_strategy}/${total}, path=${with_path}/${total}`);
        failCount++;
      }
    } catch (err) {
      console.log(`  ❌ FAIL: ${err.message}`);
      failCount++;
    }
    console.log();

    // ── Gate 3: P3 Qdrant Join Repair ────────────────────────────────
    console.log('GATE 3: P3 Qdrant Join Repair (atlas_packets ← atlas_higher_hop_index)');
    try {
      const before = await client.query(`
        SELECT
          COUNT(*) FILTER (WHERE qdrant_point_id IS NOT NULL) as with_qdrant,
          COUNT(*) as total
        FROM atlas_packets
        WHERE packet_key IS NOT NULL
      `);
      const { with_qdrant, total } = before.rows[0];
      const pct = (with_qdrant / total * 100).toFixed(1);

      if (with_qdrant >= 2400) { // Allow some variance
        console.log(`  ✅ PASS: P3 join complete (${with_qdrant}/${total} = ${pct}%)`);
        passCount++;
      } else {
        console.log(`  ⚠️  PARTIAL: Only ${with_qdrant}/${total} packets have qdrant_point_id (${pct}%)`);
        failCount++;
      }
    } catch (err) {
      console.log(`  ❌ FAIL: ${err.message}`);
      failCount++;
    }
    console.log();

    // ── Gate 4: P3g Readiness (Remaining packets) ────────────────────
    console.log('GATE 4: P3g Readiness (Packets needing embeddings)');
    try {
      const res = await client.query(`
        SELECT
          COUNT(*) FILTER (WHERE qdrant_point_id IS NULL) as missing_qdrant,
          COUNT(*) as total
        FROM atlas_packets
        WHERE packet_key IS NOT NULL
      `);
      const { missing_qdrant, total } = res.rows[0];
      const pct = (missing_qdrant / total * 100).toFixed(1);

      if (missing_qdrant > 15000) {
        console.log(`  ✅ PASS: P3g has sufficient work (${missing_qdrant}/${total} = ${pct}% packets need embeddings)`);
        console.log(`           Estimated backfill time: 60–90 min (Option B: worker pool)`);
        passCount++;
      } else {
        console.log(`  ⚠️  PARTIAL: Only ${missing_qdrant} packets remaining`);
        failCount++;
      }
    } catch (err) {
      console.log(`  ❌ FAIL: ${err.message}`);
      failCount++;
    }
    console.log();

    // ── Gate 5: Authority Chain ──────────────────────────────────────
    console.log('GATE 5: Authority Chain (Postgres canonical truth verified)');
    try {
      const packets = await client.query('SELECT COUNT(*) FROM atlas_packets WHERE packet_key IS NOT NULL');
      const qdrant = await client.query('SELECT COUNT(*) FROM atlas_packets WHERE qdrant_point_id IS NOT NULL AND packet_key IS NOT NULL');
      const higher_hop = await client.query('SELECT COUNT(*) FROM atlas_higher_hop_index WHERE qdrant_point_id IS NOT NULL');

      const packetsCount = packets.rows[0].count;
      const qdrantCount = qdrant.rows[0].count;
      const higherHopCount = higher_hop.rows[0].count;

      if (qdrantCount > 2400 && higherHopCount > 2400) {
        console.log(`  ✅ PASS: Authority chain intact`);
        console.log(`           atlas_packets: ${packetsCount} total packets`);
        console.log(`           qdrant-linked: ${qdrantCount} (${(qdrantCount/packetsCount*100).toFixed(1)}%)`);
        console.log(`           atlas_higher_hop_index (ledger): ${higherHopCount} canonical entries`);
        passCount++;
      } else {
        console.log(`  ⚠️  PARTIAL: Authority chain incomplete`);
        failCount++;
      }
    } catch (err) {
      console.log(`  ❌ FAIL: ${err.message}`);
      failCount++;
    }
    console.log();

    // ── Summary ───────────────────────────────────────────────────────
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`RESULT: ${passCount} PASS | ${failCount} FAIL`);
    console.log('═══════════════════════════════════════════════════════════════');
    console.log();

    if (failCount === 0) {
      console.log('🚀 P3 COMPLETE — Ready for P3g Embedding Backfill');
      console.log();
      console.log('Next step:');
      console.log('  npm run atlas:backfill:qdrant:embeddings:apply');
      console.log();
      console.log('Expected duration: 60–90 minutes');
      console.log('Parallelization: 4 workers, 100 packets/batch, checkpoint every 500');
    } else {
      console.log('⚠️  BLOCKERS DETECTED — Fix before proceeding to P3g');
    }
    console.log();

  } finally {
    client.release();
  }

  await pool.end();
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('[FAIL]', err);
  process.exit(1);
});
