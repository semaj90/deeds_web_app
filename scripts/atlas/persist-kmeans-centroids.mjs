#!/usr/bin/env node
/**
 * persist-kmeans-centroids.mjs
 *
 * Milestone 8: Recompute K-means centroids from existing cluster assignments
 * in atlas_packets and persist them to gpu_cluster_centroids.
 *
 * Uses the already-assigned topolog_cluster values in atlas_packets joined to
 * codebase_chunk_index.content_embedding (384-dim) as the vector source.
 *
 * Centroid = mean of all member vectors in each cluster (L2-normalized).
 *
 * Writes:
 *   gpu_cluster_centroids (cluster_id, cluster_type='kmeans_js', centroid_vec,
 *                          chunk_count, topo_class, dominant_tags, metadata)
 *
 * Usage:
 *   node scripts/atlas/persist-kmeans-centroids.mjs [--dry-run] [--verbose]
 */

import pg from 'pg';

const { Pool } = pg;

const DRY_RUN = process.argv.includes('--dry-run');
const VERBOSE = process.argv.includes('--verbose');

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5434'),
  user:     process.env.DB_USER     || 'legal_admin',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME     || 'legal_ai_db',
  max: 3,
});

function l2Normalize(vec) {
  const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
  if (norm === 0) return vec;
  return vec.map(v => v / norm);
}

async function main() {
  const startTime = Date.now();
  console.log('📍 Centroid Persistence — Milestone 8\n');
  console.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);

  const client = await pool.connect();
  try {
    // 1. Count how many clusters are assigned
    const clusterRes = await client.query(`
      SELECT topolog_cluster AS cluster_id, COUNT(*) AS member_count
      FROM atlas_packets
      WHERE topolog_cluster IS NOT NULL
        AND topolog_method = 'phase3_kmeans_js'
      GROUP BY topolog_cluster
      ORDER BY topolog_cluster
    `);
    const clusterRows = clusterRes.rows;
    console.log(`Clusters assigned in atlas_packets: ${clusterRows.length}`);
    console.log(`Total assigned packets: ${clusterRows.reduce((s, r) => s + parseInt(r.member_count), 0).toLocaleString()}`);

    if (clusterRows.length === 0) {
      console.log('\n❌ No clusters found. Run phase-3-kmeans-cluster.mjs first.');
      process.exit(1);
    }

    // 2. For each cluster, compute centroid from codebase_chunk_index embeddings
    // Join: atlas_packets.source_ref = 'sveltekit-frontend/' || codebase_chunk_index.relative_path
    console.log('\n── Computing centroids from content_embedding vectors ──');

    const centroids = [];
    let missingVecs = 0;

    for (const { cluster_id, member_count } of clusterRows) {
      // Fetch all 384-dim vectors for packets in this cluster
      const vecRes = await client.query(`
        SELECT
          ci.content_embedding::text AS vec_text
        FROM atlas_packets ap
        JOIN codebase_chunk_index ci
          ON ap.source_ref = 'sveltekit-frontend/' || ci.relative_path
        WHERE ap.topolog_cluster = $1
          AND ap.topolog_method = 'phase3_kmeans_js'
          AND ci.content_embedding IS NOT NULL
        LIMIT 2000
      `, [parseInt(cluster_id)]);

      if (vecRes.rows.length === 0) {
        missingVecs++;
        if (VERBOSE) console.log(`  cluster ${cluster_id}: no vectors found (non-code packets)`);
        // Use zero centroid placeholder for non-code clusters
        centroids.push({
          cluster_id: parseInt(cluster_id),
          member_count: parseInt(member_count),
          vec: null,
          dominant_domain: null,
        });
        continue;
      }

      // Parse pgvector text format: "[0.1,0.2,...]" or "{0.1,0.2,...}"
      const vecs = vecRes.rows.map(r => {
        const txt = r.vec_text.replace(/^\[|\]$|^\{|\}$/g, '');
        return txt.split(',').map(Number);
      });

      const dim = vecs[0].length;
      const mean = new Array(dim).fill(0);
      for (const v of vecs) {
        for (let i = 0; i < dim; i++) mean[i] += v[i];
      }
      for (let i = 0; i < dim; i++) mean[i] /= vecs.length;
      const centroidVec = l2Normalize(mean);

      // Dominant domain_class for this cluster
      const domainRes = await client.query(`
        SELECT domain_class, COUNT(*) AS cnt
        FROM atlas_packets
        WHERE topolog_cluster = $1
          AND topolog_method = 'phase3_kmeans_js'
          AND domain_class IS NOT NULL
        GROUP BY domain_class
        ORDER BY cnt DESC
        LIMIT 1
      `, [parseInt(cluster_id)]);
      const dominantDomain = domainRes.rows[0]?.domain_class ?? null;

      centroids.push({
        cluster_id: parseInt(cluster_id),
        member_count: parseInt(member_count),
        vec_members: vecs.length,
        vec: centroidVec,
        dominant_domain: dominantDomain,
      });

      if (VERBOSE) {
        console.log(`  cluster ${cluster_id}: ${vecs.length} vecs, dim=${dim}, domain=${dominantDomain ?? 'null'}`);
      }
    }

    const withVec    = centroids.filter(c => c.vec !== null).length;
    const withoutVec = centroids.filter(c => c.vec === null).length;
    console.log(`\nCentroids computed: ${withVec} with vectors, ${withoutVec} without (non-code clusters)`);

    if (DRY_RUN) {
      console.log('\nDRY RUN — sample centroids:');
      for (const c of centroids.filter(c => c.vec).slice(0, 5)) {
        const preview = c.vec.slice(0, 4).map(v => v.toFixed(4)).join(', ');
        console.log(`  cluster ${c.cluster_id}: ${c.member_count} members, ${c.vec_members} vecs, vec=[${preview}...], domain=${c.dominant_domain}`);
      }
      console.log(`\nWould upsert ${centroids.length} rows into gpu_cluster_centroids.`);
      console.log('Re-run without --dry-run to apply.');
      return;
    }

    // 3. Upsert centroids into gpu_cluster_centroids
    console.log('\n── Upserting into gpu_cluster_centroids ──');

    // gpu_cluster_centroids PK is cluster_id alone — truncate and reinsert cleanly
    await client.query(`TRUNCATE gpu_cluster_centroids`);

    let upserted = 0;
    for (const c of centroids) {
      if (c.vec === null) continue; // skip non-code placeholder clusters

      const vecLiteral = `{${c.vec.join(',')}}`;
      await client.query(`
        INSERT INTO gpu_cluster_centroids (
          cluster_id, cluster_type, centroid_vec,
          chunk_count, topo_class, dominant_tags,
          purpose, metadata, updated_at
        ) VALUES (
          $1, 'kmeans_js', $2::real[],
          $3, $4, $5,
          $6, $7, NOW()
        )
      `, [
        c.cluster_id,
        vecLiteral,
        c.member_count,
        c.dominant_domain ?? 'unknown',
        [],   // dominant_tags — extend later with tag extraction
        `K-means cluster ${c.cluster_id} (phase3_kmeans_js)`,
        JSON.stringify({
          method: 'phase3_kmeans_js',
          vec_members: c.vec_members,
          dim: c.vec.length,
          persisted_at: new Date().toISOString(),
        }),
      ]);
      upserted++;
    }

    // 4. Verify
    const verifyRes = await client.query(`
      SELECT COUNT(*) AS total, MIN(cluster_id) AS min_id, MAX(cluster_id) AS max_id
      FROM gpu_cluster_centroids WHERE cluster_type = 'kmeans_js'
    `);
    const v = verifyRes.rows[0];

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n📊 Centroid Persistence Complete');
    console.log('═'.repeat(60));
    console.log(`Clusters processed:    ${clusterRows.length}`);
    console.log(`Centroids upserted:    ${upserted}`);
    console.log(`Skipped (no vecs):     ${withoutVec}`);
    console.log(`DB rows (kmeans_js):   ${v.total}  (cluster ${v.min_id}–${v.max_id})`);
    console.log(`Duration:              ${duration}s`);
    console.log('═'.repeat(60));

    if (parseInt(v.total) === upserted) {
      console.log('\n✅ Milestone 8 PASS — centroids persisted to gpu_cluster_centroids');
    } else {
      console.log('\n❌ Count mismatch — verify gpu_cluster_centroids');
      process.exit(1);
    }

  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
