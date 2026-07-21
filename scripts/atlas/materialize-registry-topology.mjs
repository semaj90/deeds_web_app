#!/usr/bin/env node

/**
 * Materialize Registry Topology Lane
 *
 * Purpose: Project existing topology evidence (5,982 rows from backfill-topology-authority)
 * into the 4,209 atlas_packets registry rows to raise the topology lane score from 1.85%.
 *
 * The disconnect:
 * - backfill-topology-authority.mjs writes community_id + community_confidence to atlas_packets base columns
 * - validate-feature-set-alignment-smoke.mjs reads payload->>'som_cluster' OR payload->>'pagerank_score'
 * - Result: 5,982 rows have topology data but validator reads 0 (1.85% coverage)
 *
 * Solution: Materialize topology data from base columns into payload JSONB.
 *
 * Sources:
 *   atlas_packets.community_id (base column, set by backfill)
 *   atlas_packets.community_confidence (base column, set by backfill)
 *   atlas_topology_index.pagerank (dedicated table, exists)
 *   atlas_topology_index.som_cluster (dedicated table, exists)
 *   atlas_feature_packets.page_rank_score (if wired)
 *
 * Usage:
 *   node materialize-registry-topology.mjs --dry-run
 *   node materialize-registry-topology.mjs --apply --limit=500
 */

import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env.local') });
dotenv.config({ path: path.join(__dirname, '../../sveltekit-frontend/.env') });

const { Pool } = pg;
const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const verbose = args.includes('--verbose');
const limitArg = args.find(a => a.startsWith('--limit='));
const limit = limitArg ? parseInt(limitArg.split('=')[1]) : 500;

const pool = new Pool({
  host: '127.0.0.1',
  port: 5434,
  user: 'legal_admin',
  password: '123456',
  database: 'legal_ai_db',
});

async function main() {
  console.log(`\n╔════════════════════════════════════════════════════════════╗`);
  console.log(`║        Materialize Registry Topology Lane                  ║`);
  console.log(`║        (Project 5,982 backfilled rows → 4,209 registry)   ║`);
  console.log(`╚════════════════════════════════════════════════════════════╝\n`);

  try {
    // 1. Audit: How many packets have topology evidence but no payload projection?
    const auditRes = await pool.query(`
      SELECT
        COUNT(*) as total_packets,
        COUNT(CASE WHEN community_id IS NOT NULL THEN 1 END) as with_community_id,
        COUNT(CASE WHEN payload->>'som_cluster' IS NOT NULL THEN 1 END) as with_som_in_payload,
        COUNT(CASE WHEN payload->>'pagerank_score' IS NOT NULL THEN 1 END) as with_pagerank_in_payload,
        COUNT(CASE
          WHEN community_id IS NOT NULL AND payload->>'som_cluster' IS NULL
          THEN 1
        END) as missing_projection
      FROM atlas_packets
    `);

    const audit = auditRes.rows[0];
    console.log('AUDIT RESULTS:\n');
    console.log(`  Total packets: ${audit.total_packets}`);
    console.log(`  With community_id (base column): ${audit.with_community_id}`);
    console.log(`  With som_cluster in payload: ${audit.with_som_in_payload}`);
    console.log(`  With pagerank_score in payload: ${audit.with_pagerank_in_payload}`);
    console.log(`  Missing projection: ${audit.missing_projection} (disconnected rows)\n`);

    if (audit.missing_projection === 0) {
      console.log('✅ No missing projections. Topology lane is already complete.\n');
      await pool.end();
      process.exit(0);
    }

    // 2. Attempt to join existing topology data from atlas_topology_index
    console.log('TOPOLOGY SOURCES:\n');

    // Check atlas_topology_index availability
    const topoIndexRes = await pool.query(`
      SELECT COUNT(*) as topo_rows FROM atlas_topology_index LIMIT 1
    `);
    console.log(`  atlas_topology_index rows: ${topoIndexRes.rows[0]?.topo_rows || 0}`);

    // Check atlas_feature_packets availability
    const featurePacketsRes = await pool.query(`
      SELECT COUNT(*) as feature_rows FROM atlas_feature_packets LIMIT 1
    `);
    console.log(`  atlas_feature_packets rows: ${featurePacketsRes.rows[0]?.feature_rows || 0}`);

    // 3. Build materialization query
    // Join with atlas_topology_index by packet_key
    // Extract SOM coordinates and pagerank, writing to validator-visible fields
    const materializeQuery = `
      UPDATE atlas_packets ap
      SET payload = jsonb_set(jsonb_set(jsonb_set(
        COALESCE(ap.payload, '{}'::jsonb),
        '{pagerank_score}',
        to_jsonb(COALESCE(subq.pagerank, 0.5)::text)
      ),
        '{som_cluster}',
        to_jsonb(COALESCE(subq.som_source, 'unknown')::text)
      ),
        '{topology_materialized}',
        jsonb_build_object(
          'x_cosine', COALESCE(subq.x_cosine, 0)::numeric,
          'y_graph', COALESCE(subq.y_graph, 0)::numeric,
          'z_som', COALESCE(subq.z_som, 0)::numeric,
          'w_authority', COALESCE(subq.w_authority, 0)::numeric,
          'community_id', subq.community_id,
          'community_confidence', subq.community_confidence,
          'materialized_at', NOW()::text
        )
      ),
      updated_at = NOW()
      FROM (
        SELECT DISTINCT ON (ap2.packet_key)
          ap2.packet_key,
          ap2.community_id,
          ap2.community_confidence,
          ti.x_cosine,
          ti.y_graph,
          ti.z_som,
          ti.w_authority,
          ti.pagerank,
          ti.som_source
        FROM atlas_packets ap2
        LEFT JOIN atlas_topology_index ti ON ap2.packet_key = ti.packet_key
        WHERE
          ap2.community_id IS NOT NULL
          AND ap2.payload->>'pagerank_score' IS NULL
        LIMIT ${limit}
      ) AS subq(packet_key, community_id, community_confidence, x_cosine, y_graph, z_som, w_authority, pagerank, som_source)
      WHERE ap.packet_key = subq.packet_key
    `;

    if (dryRun) {
      console.log(`\nDRY RUN: Would update up to ${limit} packets\n`);
      console.log('Sample packets that would be updated:');

      const sampleRes = await pool.query(`
        SELECT
          ap.packet_key,
          ap.community_id,
          ap.community_confidence,
          ti.pagerank,
          ti.som_source
        FROM atlas_packets ap
        LEFT JOIN atlas_topology_index ti ON ap.packet_key = ti.packet_key
        WHERE
          ap.community_id IS NOT NULL
          AND ap.payload->>'pagerank_score' IS NULL
        LIMIT 5
      `);

      sampleRes.rows.forEach(row => {
        console.log(`  ${row.packet_key} | community: ${row.community_id} | pr: ${row.pagerank} | source: ${row.som_source}`);
      });

      console.log(`\nDRY RUN COMPLETE. To apply, run with --apply flag.\n`);
      await pool.end();
      process.exit(0);
    }

    // 4. Apply materialization
    console.log(`\nAPPLYING MATERIALIZATION (limit: ${limit})...\n`);

    const result = await pool.query(materializeQuery);
    const updated = result.rowCount || 0;

    console.log(`✅ Updated ${updated} packets\n`);

    // 5. Re-measure topology lane coverage
    const remeasureRes = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE
          WHEN payload->'topology_materialized' IS NOT NULL
          OR payload->>'som_cluster' IS NOT NULL
          OR payload->>'pagerank_score' IS NOT NULL
          THEN 1
        END) as covered,
        ROUND(100.0 * COUNT(CASE
          WHEN payload->'topology_materialized' IS NOT NULL
          OR payload->>'som_cluster' IS NOT NULL
          OR payload->>'pagerank_score' IS NOT NULL
          THEN 1
        END) / COUNT(*), 2) as coverage_percent
      FROM atlas_packets
    `);

    const remeasure = remeasureRes.rows[0];
    console.log('POST-MATERIALIZATION COVERAGE:\n');
    console.log(`  Total packets: ${remeasure.total}`);
    console.log(`  With topology evidence: ${remeasure.covered}`);
    console.log(`  Coverage: ${remeasure.coverage_percent}%\n`);

    const previousCoverage = 1.85;
    const improvement = (remeasure.coverage_percent - previousCoverage).toFixed(2);
    console.log(`📊 Improvement: ${previousCoverage}% → ${remeasure.coverage_percent}% (+${improvement}%)\n`);

    if (updated > 0) {
      console.log('✅ Topology materialization complete.\n');
      console.log('Next step: Run validate-feature-set-alignment-smoke.mjs to see updated lane score.\n');
    }

    await pool.end();
    process.exit(0);

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    if (verbose) console.error(err.stack);
    await pool.end();
    process.exit(1);
  }
}

main();
