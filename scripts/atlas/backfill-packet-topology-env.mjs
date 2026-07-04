#!/usr/bin/env node
/**
 * scripts/atlas/backfill-packet-topology-env.mjs
 *
 * Reads Neo4j GDS scores from `atlas_topology_scores` and SOM centroids/clusters
 * from `atlas_centroid_lookup` (populated from Valkey), and backfills them
 * into Postgres `atlas_packets` columns and JSONB envelopes (`topology` and `vectors`).
 *
 * Usage:
 *   node scripts/atlas/backfill-packet-topology-env.mjs [--dry-run] [--apply] [--verbose]
 */

import { writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import Redis from 'ioredis';
import { loadRepoEnv, resolveDatabaseUrl, resolveRedisUrl } from './connection-config.mjs';

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

const APPLY = process.argv.includes('--apply');
const DRY_RUN = !APPLY;
const VERBOSE = process.argv.includes('--verbose');

const runtimeEnv = loadRepoEnv(process.env);
const DATABASE_URL = resolveDatabaseUrl(runtimeEnv);
const REDIS_URL = resolveRedisUrl(runtimeEnv);

async function main() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  Backfill Packet Topology & Vectors Environment                ║');
  console.log(`║  Mode: ${APPLY ? 'APPLY' : 'DRY-RUN (default)'}                                            ║`);
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  console.log('🔌 Connecting to services...');
  const pool = new Pool({ connectionString: DATABASE_URL });
  const pgClient = await pool.connect();

  const treeNodeColumnRes = await pgClient.query(`
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'atlas_packets'
      AND column_name = 'tree_node_id'
    LIMIT 1
  `);
  const hasTreeNodeColumn = treeNodeColumnRes.rows.length > 0;
  console.log(`✅ atlas_packets.tree_node_id ${hasTreeNodeColumn ? 'available' : 'not available'}.`);

  const redis = new Redis(REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 4000,
    maxRetriesPerRequest: 1
  });

  let valkeyConnected = false;
  try {
    await redis.ping();
    valkeyConnected = true;
    console.log('✅ Connected to Redis/Valkey.');
  } catch (err) {
    console.warn('⚠️  Redis/Valkey unreachable. Skipping online centroid sync, using database only.');
  }

  // 1. Populate atlas_centroid_lookup if Valkey is connected
  if (valkeyConnected) {
    console.log('📥 Synchronizing centroids from Valkey to atlas_centroid_lookup...');
    let centroidsKey = 'cluster:kmeans:k20:centroids';
    let somGridKey = 'cluster:kmeans:k20:som:grid';
    let manifoldKey = 'cluster:kmeans:k20:manifold4:all';

    try {
      const centroidKeys = await redis.keys('cluster:kmeans:k*:centroids');
      if (centroidKeys.length > 0) {
        centroidsKey = centroidKeys[0];
        const match = centroidsKey.match(/k(\d+):centroids/);
        if (match) {
          const foundK = match[1];
          somGridKey = `cluster:kmeans:k${foundK}:som:grid`;
          manifoldKey = `cluster:kmeans:k${foundK}:manifold4:all`;
          console.log(`   - Detected K=${foundK} from Valkey.`);
        }
      }

      const centroidsStr = await redis.get(centroidsKey);
      const somGridStr = await redis.get(somGridKey);
      const manifoldStr = await redis.get(manifoldKey);

      if (centroidsStr && somGridStr && manifoldStr) {
        const centroids = JSON.parse(centroidsStr);
        const somGrid = JSON.parse(somGridStr);
        const manifold = JSON.parse(manifoldStr);

        console.log(`   - Found ${centroids.length} centroids. Storing in atlas_centroid_lookup...`);
        if (APPLY) {
          await pgClient.query('BEGIN');
          for (const cell of somGrid) {
            const cId = cell.centroid;
            const mCell = manifold.find(m => m.centroid === cId);
            const vector = centroids[cId] || null;

            await pgClient.query(`
              INSERT INTO atlas_centroid_lookup (centroid_id, kmeans_cluster, som_row, som_col, som_index, centroid_vector, cluster_label, cluster_size)
              VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
              ON CONFLICT (centroid_id) DO UPDATE SET
                kmeans_cluster = EXCLUDED.kmeans_cluster,
                som_row = EXCLUDED.som_row,
                som_col = EXCLUDED.som_col,
                som_index = EXCLUDED.som_index,
                centroid_vector = EXCLUDED.centroid_vector,
                cluster_label = EXCLUDED.cluster_label,
                cluster_size = EXCLUDED.cluster_size,
                updated_at = CURRENT_TIMESTAMP
            `, [cId, cId, cell.row, cell.col, cell.row * 20 + cell.col, vector, mCell?.topoLabel || null, mCell?.size || null]);
          }
          await pgClient.query('COMMIT');
          console.log('   ✅ Populated atlas_centroid_lookup.');
        } else {
          console.log('   - [dry-run] Would populate atlas_centroid_lookup.');
        }
      } else {
        console.warn('   ⚠️  Centroid keys not found in Valkey.');
      }
    } catch (err) {
      if (APPLY) await pgClient.query('ROLLBACK').catch(() => {});
      console.warn('   ⚠️  Error synchronizing centroids:', err.message);
    }
  }

  // 2. Populate atlas_vector_lookup
  console.log('📥 Populating atlas_vector_lookup...');
  if (APPLY) {
    try {
      const vectorRes = await pgClient.query(`
        INSERT INTO atlas_vector_lookup (qdrant_point_id, packet_key, collection_name, vector_source, vector_dim)
        SELECT packet_id, packet_key, COALESCE(qdrant_collection, 'codebase_chunks_768'), 'gemma4_summary', COALESCE(qdrant_vector_dim, 768)
        FROM atlas_packets
        WHERE packet_id IS NOT NULL
        ON CONFLICT (qdrant_point_id) DO NOTHING
      `);
      console.log(`   ✅ Populated atlas_vector_lookup (inserted: ${vectorRes.rowCount}).`);
    } catch (err) {
      console.error('   ❌ Failed to populate atlas_vector_lookup:', err.message);
    }
  } else {
    console.log('   - [dry-run] Would populate atlas_vector_lookup.');
  }

  // 3. Load directory assignments from Valkey
  const dirAssignments = new Map();
  if (valkeyConnected) {
    console.log('📥 Scanning directory assignments from Valkey...');
    try {
      const keys = await redis.keys('cluster:kmeans:k*:dir:*');
      if (keys.length > 0) {
        const vals = await redis.mget(keys);
        for (let i = 0; i < keys.length; i++) {
          const key = keys[i];
          const val = vals[i];
          if (val) {
            try {
              const data = JSON.parse(val);
              const parts = key.split(':dir:');
              if (parts.length > 1) {
                const dirPath = parts[1].replace(/\\/g, '/');
                dirAssignments.set(dirPath, data);
              }
            } catch {}
          }
        }
      }
      console.log(`   ✅ Loaded ${dirAssignments.size} directory mappings from Valkey.`);
    } catch (err) {
      console.warn('   ⚠️  Failed to read directory mappings from Valkey:', err.message);
    }
  }

  function getDirFromSourceRef(sourceRef) {
    if (!sourceRef) return '';
    const base = sourceRef.split('#')[0];
    const clean = base
      .replace(/\\/g, '/')
      .replace(/^\/+/, '')
      .replace(/^(\.\.\/)+/, '')
      .replace(/^\.\/+/, '')
      .replace(/^sveltekit-frontend\//, '');
    if (!clean) return '';
    return clean.includes('/') ? clean.split('/').slice(0, -1).join('/') : '.';
  }

  function getCentroidForDir(dir) {
    if (!dir) return null;
    const norm = dir.replace(/\\/g, '/').replace(/^\/+/, '').replace(/\/+$/, '');
    if (dirAssignments.has(norm)) return dirAssignments.get(norm);
    if (dirAssignments.has(dir)) return dirAssignments.get(dir);
    // Check parent directories
    let current = norm;
    while (current.includes('/')) {
      current = current.substring(0, current.lastIndexOf('/'));
      if (dirAssignments.has(current)) return dirAssignments.get(current);
    }
    return null;
  }

  // 4. Load GDS scores from atlas_topology_scores
  console.log('📥 Loading GDS scores from atlas_topology_scores...');
  const gdsScores = new Map();
  try {
    const scoresRes = await pgClient.query(`
      SELECT packet_key, pagerank, degree, community_id, betweenness, eigenvector
      FROM atlas_topology_scores
    `);
    for (const row of scoresRes.rows) {
      gdsScores.set(row.packet_key, row);
    }
    console.log(`   ✅ Loaded ${gdsScores.size} GDS scores.`);
  } catch (err) {
    console.warn('   ⚠️  Failed to load GDS scores (table might be empty or missing):', err.message);
  }

  // 4b. Load tree node ids from atlas_tree_nodes
  console.log('📥 Loading tree_node_id mappings from atlas_tree_nodes...');
  const treeNodeMap = new Map();
  try {
    const treeNodesRes = await pgClient.query(`
      SELECT packet_key, node_id, source_ref
      FROM atlas_tree_nodes
      WHERE packet_key IS NOT NULL
    `);
    for (const row of treeNodesRes.rows) {
      treeNodeMap.set(row.packet_key, {
        tree_node_id: row.node_id,
        source_ref: row.source_ref,
      });
    }
    console.log(`   ✅ Loaded ${treeNodeMap.size} tree node mappings.`);
  } catch (err) {
    console.warn('   ⚠️  Failed to load tree node mappings:', err.message);
  }

  // 5. Load Centroids from atlas_centroid_lookup
  console.log('📥 Loading centroids from atlas_centroid_lookup...');
  const centroidsMap = new Map();
  try {
    const centroidsRes = await pgClient.query(`
      SELECT centroid_id, kmeans_cluster, som_row, som_col, som_index, cluster_label, cluster_size
      FROM atlas_centroid_lookup
    `);
    for (const row of centroidsRes.rows) {
      centroidsMap.set(row.centroid_id, row);
    }
    console.log(`   ✅ Loaded ${centroidsMap.size} centroids.`);
  } catch (err) {
    console.warn('   ⚠️  Failed to load centroids:', err.message);
  }

  // 6. Read and backfill atlas_packets
  console.log('\n🔀 Backfilling atlas_packets...');
  const countRes = await pgClient.query(`
    SELECT COUNT(*) FROM atlas_packets
    WHERE packet_key IS NOT NULL AND source_ref IS NOT NULL AND source_ref != ''
  `);
  const totalPackets = parseInt(countRes.rows[0].count, 10);
  console.log(`   - Total addressable packets to scan: ${totalPackets}`);

  let offset = 0;
  const batchSize = 250;
  let successCount = 0;
  let errorCount = 0;
  let gdsEnriched = 0;
  let somEnriched = 0;
  let treeNodeEnriched = 0;

  while (offset < totalPackets) {
    try {
      const selectTreeNode = hasTreeNodeColumn ? 'tree_node_id' : 'NULL::uuid AS tree_node_id';
      const packetsRes = await pgClient.query(`
        SELECT packet_id, packet_key, source_ref, directory_path, qdrant_collection, qdrant_vector_dim,
               topology, vectors, pagerank, community_id, som_row, som_col, som_index, kmeans_cluster,
               neo4j_node_id, ${selectTreeNode}, metadata
        FROM atlas_packets
        WHERE packet_key IS NOT NULL AND source_ref IS NOT NULL AND source_ref != ''
        ORDER BY packet_id
        LIMIT $1 OFFSET $2
      `, [batchSize, offset]);

      if (packetsRes.rows.length === 0) break;

      if (APPLY) {
        await pgClient.query('BEGIN');
      }

      for (const packet of packetsRes.rows) {
        // Resolve Centroid / SOM Coordinates
        let dirPath = packet.directory_path || packet.metadata?.directory_path || getDirFromSourceRef(packet.source_ref);
        dirPath = dirPath.replace(/^sveltekit-frontend\//, '');
        const dirInfo = getCentroidForDir(dirPath);
        const centroidId = dirInfo ? dirInfo.centroid : null;
        const somInfo = centroidId !== null ? centroidsMap.get(centroidId) : null;

        // Resolve GDS Scores
        const gdsScore = gdsScores.get(packet.packet_key);

        const newPagerank = gdsScore?.pagerank !== undefined ? gdsScore.pagerank : (packet.pagerank ?? null);
        const newCommunityId = gdsScore?.community_id !== undefined ? gdsScore.community_id : (packet.community_id ?? null);
        const newSomRow = somInfo?.som_row !== undefined ? somInfo.som_row : (packet.som_row ?? null);
        const newSomCol = somInfo?.som_col !== undefined ? somInfo.som_col : (packet.som_col ?? null);
        const newSomIndex = somInfo?.som_index !== undefined ? somInfo.som_index : (packet.som_index ?? null);
        const newKmeansCluster = centroidId !== null ? centroidId : (packet.kmeans_cluster ?? null);
        const treeNode = treeNodeMap.get(packet.packet_key) || null;
        const newTreeNodeId = treeNode?.tree_node_id || packet.tree_node_id || null;

        if (gdsScore) gdsEnriched++;
        if (somInfo || centroidId !== null) somEnriched++;
        if (newTreeNodeId) treeNodeEnriched++;

        // Build topology envelope
        const existingTopology = (packet.topology && typeof packet.topology === 'object') ? packet.topology : {};
        const topology = {
          ...existingTopology,
          tree_node_id: newTreeNodeId || existingTopology.tree_node_id || null,
          community_id: newCommunityId !== null ? String(newCommunityId) : (existingTopology.community_id ?? null),
          neo4j_node_id: packet.neo4j_node_id || existingTopology.neo4j_node_id || null,
          pagerank: newPagerank,
          degree: gdsScore?.degree !== undefined ? gdsScore.degree : (existingTopology.degree ?? null),
          betweenness: gdsScore?.betweenness !== undefined ? gdsScore.betweenness : (existingTopology.betweenness ?? null),
          eigenvector: gdsScore?.eigenvector !== undefined ? gdsScore.eigenvector : (existingTopology.eigenvector ?? null),
          som_x: newSomCol,
          som_y: newSomRow,
          som_cluster: newSomRow !== null && newSomCol !== null ? `${newSomRow}:${newSomCol}` : (existingTopology.som_cluster ?? null),
          som_index: newSomIndex,
          centroid_id: newKmeansCluster !== null ? String(newKmeansCluster) : (existingTopology.centroid_id ?? null),
          ae_distance: existingTopology.ae_distance ?? null,
          nearest_neighbors: existingTopology.nearest_neighbors ?? [],
          topology_version: "2026-06-18",
          topology_updated_at: new Date().toISOString()
        };

        // Build vectors envelope
        const existingVectors = (packet.vectors && typeof packet.vectors === 'object') ? packet.vectors : {};
        const vectors = {
          ...existingVectors,
          qdrant_point_id: packet.packet_id,
          qdrant_collection: packet.qdrant_collection || "codebase_chunks_768",
          vector_source: "gemma4_summary",
          vector_dim: packet.qdrant_vector_dim || 768
        };

        if (APPLY) {
          if (hasTreeNodeColumn) {
            await pgClient.query(`
              UPDATE atlas_packets
              SET
                pagerank = $1,
                community_id = $2,
                tree_node_id = $3,
                som_row = $4,
                som_col = $5,
                som_index = $6,
                kmeans_cluster = $7,
                topology = $8,
                vectors = $9,
                updated_at = NOW()
              WHERE packet_id = $10
            `, [
              newPagerank,
              newCommunityId,
              newTreeNodeId,
              newSomRow,
              newSomCol,
              newSomIndex,
              newKmeansCluster,
              JSON.stringify(topology),
              JSON.stringify(vectors),
              packet.packet_id
            ]);
          } else {
            await pgClient.query(`
              UPDATE atlas_packets
              SET
                pagerank = $1,
                community_id = $2,
                som_row = $3,
                som_col = $4,
                som_index = $5,
                kmeans_cluster = $6,
                topology = $7,
                vectors = $8,
                updated_at = NOW()
              WHERE packet_id = $9
            `, [
              newPagerank,
              newCommunityId,
              newSomRow,
              newSomCol,
              newSomIndex,
              newKmeansCluster,
              JSON.stringify(topology),
              JSON.stringify(vectors),
              packet.packet_id
            ]);
          }
        }
        successCount++;
      }

      if (APPLY) {
        await pgClient.query('COMMIT');
      }

    } catch (err) {
      if (APPLY) {
        await pgClient.query('ROLLBACK').catch(() => {});
      }
      console.error(`   ❌ Error in batch offset ${offset}:`, err.message);
      errorCount += batchSize;
    }

    offset += batchSize;
    if (VERBOSE || offset % 1000 === 0 || offset >= totalPackets) {
      const pct = Math.round((Math.min(offset, totalPackets) / totalPackets) * 100);
      console.log(`   [${pct}%] Processed ${Math.min(offset, totalPackets)}/${totalPackets} packets...`);
    }
  }

  // Cleanup
  await pgClient.release();
  await pool.end();
  await redis.quit().catch(() => {});

  // Generate Report
  const reportDir = path.join(REPO_ROOT, 'docs', 'reports');
  mkdirSync(reportDir, { recursive: true });

  const report = {
    generated_at: new Date().toISOString(),
    mode: APPLY ? 'apply' : 'dry-run',
    stats: {
      total_scanned: totalPackets,
      success_count: successCount,
      error_count: errorCount,
      gds_enriched: gdsEnriched,
      som_enriched: somEnriched,
      tree_node_enriched: treeNodeEnriched
    }
  };

  writeFileSync(path.join(reportDir, 'backfill-packet-topology-env.json'), JSON.stringify(report, null, 2));
  console.log(`\n📊 Report written to: docs/reports/backfill-packet-topology-env.json`);

  // Write Markdown Report
  const reportMd = `# Packet Topology & Vectors Backfill Report

Generated: ${report.generated_at}
Mode: **${report.mode.toUpperCase()}**

## Statistics

| Metric | Value |
|:---|:---|
| **Total Scanned** | ${report.stats.total_scanned} |
| **Successfully Backfilled** | ${report.stats.success_count} |
| **Errors** | ${report.stats.error_count} |
| **GDS Enriched (PageRank/Louvain)** | ${report.stats.gds_enriched} |
| **SOM Enriched (BMU Grid)** | ${report.stats.som_enriched} |
| **Tree Node Enriched** | ${report.stats.tree_node_enriched} |

## Component Validation
- **Centroid Lookup Storage**: Populated dynamically from Valkey/Redis cache keys.
- **Vector Lookup Storage**: Cast and synchronized UUID mappings from \`atlas_packets\` to \`atlas_vector_lookup\`.
- **Packet Envelopes**: \`topology\` JSONB and \`vectors\` JSONB envelopes correctly mapped and populated.
`;
  writeFileSync(path.join(reportDir, 'addressable-packet-topology-report.md'), reportMd);
  console.log(`📊 Markdown report written to: docs/reports/addressable-packet-topology-report.md`);

  console.log('\n═══ Backfill Complete ═════════════════════════════════════════');
  console.log(`Processed:              ${successCount}`);
  console.log(`GDS Enriched:           ${gdsEnriched}`);
  console.log(`SOM Enriched:           ${somEnriched}`);
  console.log(`Tree Node Enriched:     ${treeNodeEnriched}`);
  console.log(`Errors:                 ${errorCount}`);
  console.log('═══════════════════════════════════════════════════════════════\n');
}

main().catch(err => {
  console.error('❌ Fatal error:', err.message);
  process.exit(1);
});
