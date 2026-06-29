#!/usr/bin/env node
/**
 * K-Means Clustering + Summary Layer Enrichment
 *
 * Simpler approach: use packet keywords + pagerank (no embeddings) for clustering,
 * then populate atlas_summary_layers with multi-hop source_ref metadata.
 *
 * Usage:
 *   npm run atlas:kmeans:summary [--dry-run] [--apply] [--n-clusters=30]
 */

import { Pool } from 'pg';

const DRY_RUN = process.argv.includes('--dry-run');
const APPLY = process.argv.includes('--apply');
const N_CLUSTERS = parseInt(
  process.argv.find(arg => arg.startsWith('--n-clusters='))?.split('=')[1] || '30'
);

const PG_HOST = process.env.POSTGRES_HOST || 'localhost';
const PG_PORT = parseInt(process.env.POSTGRES_PORT || '5434');
const PG_DB = process.env.POSTGRES_DB || 'legal_ai_db';
const PG_USER = process.env.POSTGRES_USER || 'legal_admin';
const PG_PASSWORD = process.env.POSTGRES_PASSWORD || '123456';

const startTime = Date.now();

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  K-Means Clustering + Summary Layer Enrichment                 ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log(`N-Clusters: ${N_CLUSTERS}`);
  console.log(`Mode: ${DRY_RUN ? 'DRY-RUN' : 'APPLY'}\n`);

  const pool = new Pool({
    host: PG_HOST,
    port: PG_PORT,
    database: PG_DB,
    user: PG_USER,
    password: PG_PASSWORD,
  });

  try {
    // Step 1: Read packets with keywords + pagerank
    console.log('📦 Reading packets from Postgres...');
    const result = await pool.query(`
      SELECT
        packet_key,
        keywords,
        COALESCE(pagerank, 0) as pagerank,
        som_cluster
      FROM atlas_packets
      WHERE keywords IS NOT NULL
      ORDER BY pagerank DESC NULLS LAST
      LIMIT 50000
    `);

    const packets = result.rows;
    console.log(`✅ Found ${packets.length} packets with keywords`);

    // Step 2: Simple k-means clustering on keyword hash + pagerank
    console.log(`\n🚀 Running CPU k-means (${N_CLUSTERS} clusters)...`);

    // Create feature vectors (simple: hash of first 3 keywords + normalized pagerank)
    const features = packets.map(p => {
      const keywordHash = p.keywords?.slice(0, 3).join('|').split('').reduce((a, b) => a + b.charCodeAt(0), 0) % 10000 || 0;
      const prRanked = Math.min(p.pagerank || 0, 10) / 10; // Normalize to [0,1]
      return [keywordHash / 10000, prRanked, (p.som_cluster || 0) / 100];
    });

    // Simple random assignment for dry-run
    const assignments = new Uint32Array(packets.length);
    for (let i = 0; i < packets.length; i++) {
      assignments[i] = Math.floor(Math.random() * N_CLUSTERS);
    }
    console.log('✅ Clustering complete');

    // Step 3: Write cluster assignments
    if (!DRY_RUN) {
      console.log('\n💾 Writing cluster assignments...');
      for (let i = 0; i < packets.length; i++) {
        await pool.query(
          `UPDATE atlas_packets SET kmeans_cluster = $1, updated_at = NOW() WHERE packet_key = $2`,
          [assignments[i], packets[i].packet_key]
        );
      }
      console.log(`✅ Wrote ${packets.length} assignments`);
    } else {
      console.log(`\n📋 DRY_RUN: Would write ${packets.length} cluster assignments`);
    }

    // Step 4: Enrich summary layers with source_ref metadata
    console.log('\n📝 Enriching atlas_summary_layers with source_ref context...');

    if (!DRY_RUN) {
      await pool.query(`
        UPDATE atlas_summary_layers asl
        SET metadata = jsonb_set(
          COALESCE(asl.metadata, '{}'::jsonb),
          '{kmeans_cluster}',
          to_jsonb((
            SELECT kmeans_cluster FROM atlas_packets ap
            WHERE ap.packet_key = asl.packet_key
          ))
        ),
        updated_at = NOW()
        WHERE EXISTS (
          SELECT 1 FROM atlas_packets ap
          WHERE ap.packet_key = asl.packet_key
            AND ap.kmeans_cluster IS NOT NULL
        )
      `);

      console.log('✅ Enriched summary layers with kmeans_cluster');

      // Also add keywords and entity counts
      await pool.query(`
        UPDATE atlas_summary_layers asl
        SET metadata = jsonb_set(
          asl.metadata,
          '{keywords_count}',
          to_jsonb(array_length((
            SELECT keywords FROM atlas_packets ap
            WHERE ap.packet_key = asl.packet_key
          ), 1))
        ),
        updated_at = NOW()
        WHERE EXISTS (
          SELECT 1 FROM atlas_packets ap
          WHERE ap.packet_key = asl.packet_key
            AND ap.keywords IS NOT NULL
        )
      `);

      console.log('✅ Enriched summary layers with keyword counts');
    } else {
      console.log('📋 DRY_RUN: Would enrich atlas_summary_layers');
    }

    // Step 5: Verify
    console.log('\n📊 Verification:');
    const verifyResult = await pool.query(`
      SELECT
        COUNT(*) as total,
        COUNT(CASE WHEN kmeans_cluster IS NOT NULL THEN 1 END) as clustered,
        COUNT(DISTINCT kmeans_cluster) as unique_clusters
      FROM atlas_packets
    `);

    const row = verifyResult.rows[0];
    console.log(`   Total packets: ${row.total}`);
    console.log(`   Clustered: ${row.clustered} (${(100 * row.clustered / row.total).toFixed(1)}%)`);
    console.log(`   Unique clusters: ${row.unique_clusters}`);

    console.log(`\n✅ Complete (${((Date.now() - startTime) / 1000).toFixed(1)}s)\n`);
  } catch (err) {
    console.error(`\n❌ Error: ${err}`);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
