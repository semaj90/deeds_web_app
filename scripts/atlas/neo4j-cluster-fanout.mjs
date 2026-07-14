#!/usr/bin/env node
/**
 * neo4j-cluster-fanout.mjs
 *
 * Milestone 10: Write BELONGS_TO_CLUSTER edges from atlas_packets K-means
 * assignments into Neo4j, and MERGE KmeansCluster nodes.
 *
 * Graph shape:
 *   (f:CodebaseFile {filePath: <abs_path>})-[:BELONGS_TO_CLUSTER]->(c:KmeansCluster {cluster_id: N})
 *
 * Join strategy:
 *   atlas_packets.source_ref = 'sveltekit-frontend/<rel_path>'
 *   CodebaseFile.filePath    = 'C:/Users/james/Videos/deeds-web-app/sveltekit-frontend/<rel_path>'
 *   → strip prefix, match suffix
 *
 * Also sets cluster properties from gpu_cluster_centroids:
 *   KmeansCluster.chunk_count, .topo_class, .method
 *
 * Usage:
 *   node scripts/atlas/neo4j-cluster-fanout.mjs [--dry-run] [--verbose] [--limit N]
 */

import pg from 'pg';

const { Pool } = pg;

const DRY_RUN   = process.argv.includes('--dry-run');
const VERBOSE   = process.argv.includes('--verbose');
const LIMIT_IDX = process.argv.indexOf('--limit');
const LIMIT = LIMIT_IDX !== -1 && process.argv[LIMIT_IDX + 1]
  ? parseInt(process.argv[LIMIT_IDX + 1], 10)
  : 0;

const NEO4J_URL  = process.env.NEO4J_URL  || 'http://127.0.0.1:7474';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS || 'neo4j123';
const BATCH_SIZE = 200;

// Base path that CodebaseFile.filePath prepends to source_ref's relative path
const BASE_PATH = 'C:/Users/james/Videos/deeds-web-app/';

const pool = new Pool({
  host:     process.env.DB_HOST     || '127.0.0.1',
  port:     parseInt(process.env.DB_PORT || '5434'),
  user:     process.env.DB_USER     || 'legal_admin',
  password: process.env.DB_PASSWORD || '123456',
  database: process.env.DB_NAME     || 'legal_ai_db',
  max: 3,
});

async function cypher(statement, parameters = {}) {
  const res = await fetch(`${NEO4J_URL}/db/neo4j/tx/commit`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Basic ' + Buffer.from(`${NEO4J_USER}:${NEO4J_PASS}`).toString('base64'),
    },
    body: JSON.stringify({ statements: [{ statement, parameters }] }),
    signal: AbortSignal.timeout(60_000),
  });
  if (!res.ok) throw new Error(`Neo4j HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  if (body.errors?.length) throw new Error(`Neo4j error: ${body.errors[0].message}`);
  return body.results?.[0];
}

async function main() {
  const startTime = Date.now();
  console.log('🕸️  Neo4j Cluster Fan-out — Milestone 10\n');
  console.log(`Mode:  ${DRY_RUN ? 'DRY RUN' : 'APPLY'}`);

  // 1. Verify Neo4j connectivity
  process.stdout.write('Neo4j: connecting... ');
  const pingRes = await cypher('RETURN 1 AS ok');
  console.log(pingRes?.data?.[0]?.row?.[0] === 1 ? 'connected ✅' : 'FAIL ❌');

  const client = await pool.connect();
  try {
    // 2. Load all cluster assignments with source_refs
    const limitClause = LIMIT > 0 ? `LIMIT ${LIMIT}` : '';
    const packetsRes = await client.query(`
      SELECT
        ap.packet_key,
        ap.source_ref,
        ap.topolog_cluster  AS cluster_id,
        ap.topolog_method,
        ap.domain_class
      FROM atlas_packets ap
      WHERE ap.topolog_cluster IS NOT NULL
        AND ap.topolog_method = 'phase3_kmeans_js'
        AND ap.source_ref LIKE 'sveltekit-frontend/%'
      ORDER BY ap.topolog_cluster, ap.packet_key
      ${limitClause}
    `);
    const packets = packetsRes.rows;
    console.log(`\nPackets with cluster assignment: ${packets.length.toLocaleString()}`);

    // 3. Load cluster metadata
    const clustersRes = await client.query(`
      SELECT cluster_id, chunk_count, topo_class, metadata
      FROM gpu_cluster_centroids
      WHERE cluster_type = 'kmeans_js'
      ORDER BY cluster_id
    `);
    const clusterMeta = new Map(clustersRes.rows.map(r => [r.cluster_id, r]));
    console.log(`Cluster metadata loaded: ${clusterMeta.size} clusters`);

    if (DRY_RUN) {
      console.log('\nDRY RUN — sample edges:');
      for (const p of packets.slice(0, 8)) {
        const absPath = BASE_PATH + p.source_ref;
        console.log(`  (CodebaseFile {filePath:"${absPath.slice(-60)}"})`);
        console.log(`    -[:BELONGS_TO_CLUSTER]->(KmeansCluster {cluster_id:${p.cluster_id}})`);
      }
      console.log(`\nWould create/update ${packets.length} BELONGS_TO_CLUSTER edges.`);
      return;
    }

    // 4. MERGE all KmeansCluster nodes first
    console.log('\n── Step 1: MERGE KmeansCluster nodes ──');
    const uniqueClusterIds = [...new Set(packets.map(p => p.cluster_id))].sort((a, b) => a - b);
    for (const cid of uniqueClusterIds) {
      const meta = clusterMeta.get(cid);
      await cypher(`
        MERGE (c:KmeansCluster {cluster_id: $cluster_id})
        SET c.chunk_count = $chunk_count,
            c.topo_class  = $topo_class,
            c.method      = 'phase3_kmeans_js',
            c.updated_at  = $updated_at
      `, {
        cluster_id:  cid,
        chunk_count: meta?.chunk_count ?? 0,
        topo_class:  meta?.topo_class ?? 'unknown',
        updated_at:  new Date().toISOString(),
      });
    }
    console.log(`  Merged ${uniqueClusterIds.length} KmeansCluster nodes ✅`);

    // 5. Delete existing BELONGS_TO_CLUSTER edges (idempotent reset)
    console.log('\n── Step 2: Clear existing BELONGS_TO_CLUSTER edges ──');
    const delRes = await cypher(`
      MATCH ()-[r:BELONGS_TO_CLUSTER]->(:KmeansCluster)
      DELETE r
      RETURN count(r) AS deleted
    `);
    const deleted = delRes?.data?.[0]?.row?.[0] ?? 0;
    console.log(`  Deleted ${deleted} stale edges ✅`);

    // 6. Write BELONGS_TO_CLUSTER edges in batches
    console.log(`\n── Step 3: Write BELONGS_TO_CLUSTER edges (batch=${BATCH_SIZE}) ──`);
    let edgesCreated = 0;
    let notFound = 0;

    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE);

      // Build params: array of {filePath, cluster_id, packet_key}
      const rows = batch.map(p => ({
        filePath:   BASE_PATH + p.source_ref,
        cluster_id: p.cluster_id,
        packet_key: p.packet_key,
        domain:     p.domain_class ?? 'unknown',
      }));

      const batchRes = await cypher(`
        UNWIND $rows AS row
        MATCH (f:CodebaseFile {filePath: row.filePath})
        MATCH (c:KmeansCluster {cluster_id: row.cluster_id})
        MERGE (f)-[r:BELONGS_TO_CLUSTER]->(c)
        SET r.packet_key = row.packet_key,
            r.domain     = row.domain,
            r.created_at = $created_at
        RETURN count(r) AS created
      `, { rows, created_at: new Date().toISOString() });

      const created = batchRes?.data?.[0]?.row?.[0] ?? 0;
      edgesCreated += created;
      notFound += batch.length - created;

      if (VERBOSE) {
        console.log(`  Batch ${Math.floor(i / BATCH_SIZE) + 1}: ${created}/${batch.length} edges created`);
      } else {
        process.stdout.write(`\r  Edges: ${edgesCreated.toLocaleString()} / ${packets.length.toLocaleString()} ...`);
      }
    }
    if (!VERBOSE) console.log('');

    // 7. Verify
    const verifyRes = await cypher(`
      MATCH ()-[r:BELONGS_TO_CLUSTER]->(:KmeansCluster)
      RETURN count(r) AS total_edges,
             count(DISTINCT startNode(r)) AS unique_files,
             count(DISTINCT endNode(r))   AS unique_clusters
    `);
    const [totalEdges, uniqueFiles, uniqueClusters] = verifyRes?.data?.[0]?.row ?? [0, 0, 0];

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('\n📊 Neo4j Fan-out Complete');
    console.log('═'.repeat(60));
    console.log(`Packets processed:      ${packets.length.toLocaleString()}`);
    console.log(`Edges created:          ${edgesCreated.toLocaleString()}`);
    console.log(`Not matched (no node):  ${notFound.toLocaleString()}`);
    console.log(`Verified edges:         ${totalEdges.toLocaleString()}  ${totalEdges > 0 ? '✅' : '❌'}`);
    console.log(`Unique CodebaseFiles:   ${uniqueFiles.toLocaleString()}`);
    console.log(`Unique KmeansClusters:  ${uniqueClusters.toLocaleString()}`);
    console.log(`Duration:               ${duration}s`);
    console.log('═'.repeat(60));

    if (edgesCreated > 0 && totalEdges > 0) {
      console.log('\n✅ Milestone 10 PASS — BELONGS_TO_CLUSTER edges written to Neo4j');
    } else {
      console.log('\n❌ Milestone 10 FAIL — no edges created');
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
