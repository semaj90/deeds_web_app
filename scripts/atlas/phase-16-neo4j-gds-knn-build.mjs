#!/usr/bin/env node

/**
 * Phase 16: Neo4j GDS KNN Graph Construction
 *
 * Builds k-nearest-neighbor graph on Qdrant semantic embeddings
 * Computes pagerank, betweenness, eigenvector centrality
 * Populates atlas_topology_index.nn_1..4 foreign keys
 *
 * Created: June 15, 2026
 * Lane: Phase 16 Neo4j GDS Topology (P1 Critical)
 */

import pg from 'pg';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import dotenv from 'dotenv';
import { getNeo4jDriver } from '../lib/neo4j-driver.js';
import fetch from 'node-fetch';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config({ path: `${__dirname}/../../.env` });

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

const log = {
  info: (msg) => console.log(`[phase-16-gds-knn] ${msg}`),
  ok: (msg) => console.log(`✅ ${msg}`),
  error: (msg) => console.error(`❌ ${msg}`),
  progress: (msg) => console.log(`⏳ ${msg}`),
};

/**
 * Step 1: Fetch all packet embeddings from Qdrant
 */
async function fetchQdrantEmbeddings() {
  log.progress('Fetching embeddings from Qdrant...');

  const qdrantUrl = process.env.QDRANT_URL || 'http://127.0.0.1:6333';
  const response = await fetch(`${qdrantUrl}/collections/codebase_chunks_768/points`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`Qdrant fetch failed: ${response.statusText}`);
  }

  const data = await response.json();
  const embeddings = new Map();

  // Map point_id → embedding vector
  for (const point of data.result.points || []) {
    const packetKey = point.payload?.packet_key;
    if (packetKey && point.vector) {
      embeddings.set(packetKey, point.vector);
    }
  }

  log.ok(`Fetched ${embeddings.size} embeddings from Qdrant`);
  return embeddings;
}

/**
 * Step 2: Compute cosine similarity and build KNN graph (k=4)
 */
function buildKnnGraph(embeddings, k = 4) {
  log.progress(`Building KNN graph (k=${k})...`);

  const packets = Array.from(embeddings.entries());
  const knn = new Map(); // packet_key → [nn_1, nn_2, nn_3, nn_4]

  for (let i = 0; i < packets.length; i++) {
    const [packetKey, vec1] = packets[i];
    const similarities = [];

    for (let j = 0; j < packets.length; j++) {
      if (i === j) continue;

      const [otherKey, vec2] = packets[j];
      const sim = cosineSimilarity(vec1, vec2);
      similarities.push([otherKey, sim]);
    }

    // Sort by similarity DESC, take top k
    similarities.sort((a, b) => b[1] - a[1]);
    knn.set(packetKey, similarities.slice(0, k).map(([key]) => key));
  }

  log.ok(`Built KNN graph with ${knn.size} nodes`);
  return knn;
}

/**
 * Cosine similarity: (A·B) / (||A|| ||B||)
 */
function cosineSimilarity(vec1, vec2) {
  let dotProduct = 0;
  let norm1 = 0;
  let norm2 = 0;

  for (let i = 0; i < vec1.length; i++) {
    dotProduct += vec1[i] * vec2[i];
    norm1 += vec1[i] * vec1[i];
    norm2 += vec2[i] * vec2[i];
  }

  const denominator = Math.sqrt(norm1) * Math.sqrt(norm2);
  return denominator === 0 ? 0 : dotProduct / denominator;
}

/**
 * Step 3: Create Neo4j KNN edges
 */
async function createNeo4jKnnEdges(knn) {
  log.progress('Creating Neo4j KNN edges...');

  const driver = getNeo4jDriver();
  const session = driver.session();
  let edgesCreated = 0;

  try {
    for (const [packetKey, neighbors] of knn) {
      const cypher = `
        MATCH (p:Packet {packet_key: $packetKey})
        WITH p
        UNWIND $neighborKeys AS neighborKey
        MATCH (n:Packet {packet_key: neighborKey})
        MERGE (p)-[:KNN_NEIGHBOR]->(n)
      `;

      await session.run(cypher, { packetKey, neighborKeys: neighbors });
      edgesCreated += neighbors.length;
    }

    log.ok(`Created ${edgesCreated} KNN edges in Neo4j`);
  } finally {
    await session.close();
  }

  return edgesCreated;
}

/**
 * Step 4: Run GDS PageRank, Betweenness, Eigenvector
 */
async function runGdsMetrics() {
  log.progress('Running GDS algorithms...');

  const driver = getNeo4jDriver();
  const session = driver.session();
  const results = {};

  try {
    // Ensure projection exists
    const projectionCheck = await session.run(`
      CALL gds.graph.list() YIELD graphName WHERE graphName = 'codeTopology'
      RETURN graphName
    `);

    if (projectionCheck.records.length === 0) {
      log.progress('Creating GDS projection...');
      await session.run(`
        CALL gds.graph.project(
          'codeTopology',
          'Packet',
          { KNN_NEIGHBOR: { properties: [] }, USED_CONCEPT: { properties: [] } }
        )
      `);
      log.ok('GDS projection created');
    }

    // PageRank
    const prResult = await session.run(`
      CALL gds.pageRank.mutate(
        'codeTopology',
        { mutateProperty: 'pagerank', tolerance: 0.001, maxIterations: 20 }
      )
      YIELD nodePropertiesWritten, computeMillis
      RETURN nodePropertiesWritten, computeMillis
    `);
    results.pagerank = prResult.records[0].toObject();
    log.ok(`PageRank: ${results.pagerank.nodePropertiesWritten} nodes, ${results.pagerank.computeMillis}ms`);

    // Betweenness
    const bResult = await session.run(`
      CALL gds.betweenness.mutate(
        'codeTopology',
        { mutateProperty: 'betweenness' }
      )
      YIELD nodePropertiesWritten, computeMillis
      RETURN nodePropertiesWritten, computeMillis
    `);
    results.betweenness = bResult.records[0].toObject();
    log.ok(`Betweenness: ${results.betweenness.nodePropertiesWritten} nodes, ${results.betweenness.computeMillis}ms`);

    // Eigenvector
    const evResult = await session.run(`
      CALL gds.eigenvector.mutate(
        'codeTopology',
        { mutateProperty: 'eigenvector', tolerance: 0.001, maxIterations: 20 }
      )
      YIELD nodePropertiesWritten, computeMillis
      RETURN nodePropertiesWritten, computeMillis
    `);
    results.eigenvector = evResult.records[0].toObject();
    log.ok(`Eigenvector: ${results.eigenvector.nodePropertiesWritten} nodes, ${results.eigenvector.computeMillis}ms`);

  } finally {
    await session.close();
  }

  return results;
}

/**
 * Step 5: Sync Neo4j metrics back to Postgres atlas_topology_index
 */
async function syncMetricsToPostgres() {
  log.progress('Syncing Neo4j metrics to Postgres...');

  const client = await pool.connect();

  try {
    // Get all Packet nodes with metrics from Neo4j
    const driver = getNeo4jDriver();
    const session = driver.session();

    const neoResult = await session.run(`
      MATCH (p:Packet)
      RETURN p.packet_key AS packet_key,
             p.pagerank AS pagerank,
             p.betweenness AS betweenness,
             p.eigenvector AS eigenvector
    `);

    await session.close();

    // Update Postgres in batches
    let updated = 0;
    for (const record of neoResult.records) {
      const { packet_key, pagerank, betweenness, eigenvector } = record.toObject();

      await client.query(
        `UPDATE atlas_topology_index
         SET pagerank = $1,
             betweenness = $2,
             eigenvector = $3,
             updated_at = NOW()
         WHERE packet_key = $4`,
        [pagerank, betweenness, eigenvector, packet_key]
      );

      updated++;
    }

    log.ok(`Updated ${updated} rows in atlas_topology_index with GDS metrics`);
    return updated;

  } finally {
    await client.release();
  }
}

/**
 * Step 6: Link KNN neighbors in atlas_topology_index (nn_1..nn_4)
 */
async function linkKnnNeighbors(knn) {
  log.progress('Linking KNN neighbors in atlas_topology_index...');

  const client = await pool.connect();

  try {
    // Get packet_key → id mapping
    const idMap = new Map();
    const idResult = await client.query(`SELECT id, packet_key FROM atlas_topology_index`);
    for (const row of idResult.rows) {
      idMap.set(row.packet_key, row.id);
    }

    let linked = 0;
    for (const [packetKey, neighbors] of knn) {
      const nodeId = idMap.get(packetKey);
      if (!nodeId) continue;

      const nn = [
        neighbors[0] ? idMap.get(neighbors[0]) : null,
        neighbors[1] ? idMap.get(neighbors[1]) : null,
        neighbors[2] ? idMap.get(neighbors[2]) : null,
        neighbors[3] ? idMap.get(neighbors[3]) : null,
      ];

      await client.query(
        `UPDATE atlas_topology_index
         SET nn_1 = $1, nn_2 = $2, nn_3 = $3, nn_4 = $4, updated_at = NOW()
         WHERE id = $5`,
        [...nn, nodeId]
      );

      linked++;
    }

    log.ok(`Linked KNN neighbors for ${linked} packets`);
    return linked;

  } finally {
    await client.release();
  }
}

/**
 * Verify topology integrity
 */
async function verifyTopology() {
  log.progress('Verifying topology integrity...');

  const client = await pool.connect();

  try {
    const result = await client.query(`
      SELECT
        COUNT(*) as total,
        SUM(CASE WHEN pagerank IS NOT NULL THEN 1 ELSE 0 END) as has_pagerank,
        SUM(CASE WHEN betweenness IS NOT NULL THEN 1 ELSE 0 END) as has_betweenness,
        SUM(CASE WHEN eigenvector IS NOT NULL THEN 1 ELSE 0 END) as has_eigenvector,
        SUM(CASE WHEN nn_1 IS NOT NULL THEN 1 ELSE 0 END) as has_nn_1,
        SUM(CASE WHEN nn_4 IS NOT NULL THEN 1 ELSE 0 END) as has_nn_4
      FROM atlas_topology_index
    `);

    const row = result.rows[0];
    log.ok(`Topology Integrity: ${row.total} total, ${row.has_pagerank} pagerank, ${row.has_betweenness} betweenness, ${row.has_eigenvector} eigenvector, ${row.has_nn_1} nn_1, ${row.has_nn_4} nn_4`);

    if (row.has_pagerank < row.total * 0.95) {
      log.error('WARNING: <95% coverage on pagerank');
    }

    return row;

  } finally {
    await client.release();
  }
}

/**
 * Main execution
 */
async function main() {
  const startTime = Date.now();

  try {
    log.info('========== Phase 16 Neo4j GDS KNN Build ==========');

    // Step 1: Fetch embeddings
    const embeddings = await fetchQdrantEmbeddings();

    // Step 2: Build KNN graph
    const knn = buildKnnGraph(embeddings, 4);

    // Step 3: Create Neo4j edges
    const edgesCreated = await createNeo4jKnnEdges(knn);

    // Step 4: Run GDS metrics
    const gdsMetrics = await runGdsMetrics();

    // Step 5: Sync metrics to Postgres
    const syncedCount = await syncMetricsToPostgres();

    // Step 6: Link KNN neighbors
    const linkedCount = await linkKnnNeighbors(knn);

    // Verify
    const verified = await verifyTopology();

    log.ok('========== Phase 16 Complete ==========');
    log.info(`Total time: ${(Date.now() - startTime) / 1000}s`);
    log.info(`KNN edges: ${edgesCreated}`);
    log.info(`Metrics synced: ${syncedCount}`);
    log.info(`Neighbors linked: ${linkedCount}`);

  } catch (err) {
    log.error(`Execution failed: ${err.message}`);
    console.error(err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
