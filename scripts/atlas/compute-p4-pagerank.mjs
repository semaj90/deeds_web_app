#!/usr/bin/env node
/**
 * P4 Phase 2: Compute PageRank on SOM cell graph
 * Runs GDS PageRank algorithm on SIMILAR_TOPOLOGY edges (SOM cells)
 * Writes results to atlas_som_cell_scores Redis cache + Postgres table
 *
 * Usage:
 *   npm run atlas:p4:pagerank
 *   npm run atlas:p4:pagerank --verbose
 *   npm run atlas:p4:pagerank --dry-run
 */

import neo4j from 'neo4j-driver';
import Redis from 'ioredis';
import pg from 'pg';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isDryRun = process.argv.includes('--dry-run');
const isVerbose = process.argv.includes('--verbose');

const log = (msg, data = '') => {
  if (isVerbose || msg.includes('ERROR') || msg.includes('PASS') || msg.includes('FAIL')) {
    console.log(`[P4-PageRank] ${msg}`, data || '');
  }
};

async function runPageRankAudit() {
  const pgClient = new pg.Client({
    connectionString: process.env.DATABASE_URL,
  });

  const redisClient = new Redis(process.env.REDIS_URL || {
    host: '127.0.0.1',
    port: 6379,
    password: 'redis'
  });

  const neo4jDriver = neo4j.driver(
    process.env.NEO4J_URI || 'bolt://127.0.0.1:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER || 'neo4j',
      process.env.NEO4J_PASSWORD || 'neo4j123'
    )
  );

  try {
    log('Connecting to PostgreSQL...');
    await pgClient.connect();

    log('Connecting to Redis...');

    log('Connecting to Neo4j...');
    const neo4jSession = neo4jDriver.session();

    // Phase 2.1: Verify SOM topology is ready
    log('Verifying SOM topology...');
    const topologyCheck = await neo4jSession.run(
      'MATCH (c:SOMCell)-[r:SIMILAR_TOPOLOGY]-(c2:SOMCell) ' +
      'RETURN count(DISTINCT r) AS edge_count, ' +
      'count(DISTINCT c) + count(DISTINCT c2) AS cell_count'
    );
    const topoResult = topologyCheck.records[0].toObject();
    const edge_count = topoResult.edge_count;
    let cell_count = topoResult.cell_count;

    // More reliable count
    const cellCountCheck = await neo4jSession.run(
      'MATCH (c:SOMCell) RETURN count(c) AS count'
    );
    cell_count = cellCountCheck.records[0].toObject().count;
    log(`SOM topology: ${cell_count} cells, ${edge_count} SOM-to-SOM edges`);

    if (cell_count === 0) {
      throw new Error(`No SOM cells found in Neo4j`);
    }
    if (cell_count !== 400) {
      log(`⚠️ Expected 400 SOM cells, found ${cell_count} (continuing anyway)`);
    }

    // Phase 2.2: Load GDS projection (if not exists)
    log('Setting up GDS projection...');
    const projectionExists = await neo4jSession.run(
      "CALL gds.graph.exists('som-topology-projection') YIELD exists RETURN exists"
    );

    const projExists = projectionExists.records[0].toObject().exists;
    log(`GDS projection exists: ${projExists}`);

    if (!isDryRun) {
      if (projExists) {
        log('Dropping existing projection...');
        await neo4jSession.run("CALL gds.graph.drop('som-topology-projection')");
      }

      log('Creating new GDS projection (SOMCell nodes only)...');
      const projResult = await neo4jSession.run(`
        CALL gds.graph.project(
          'som-topology-projection',
          'SOMCell',
          'SOM_GRID_NEIGHBOR',
          {nodeProperties: [], relationshipProperties: ['weight']}
        )
        YIELD graphName, nodeCount, relationshipCount
        RETURN graphName, nodeCount, relationshipCount
      `);
      const projInfo = projResult.records[0].toObject();
      log(`  Projection created: ${projInfo.nodeCount} nodes, ${projInfo.relationshipCount} edges`);
    }

    // Phase 2.3: Run PageRank algorithm
    log('Computing PageRank on SOM topology...');
    const prStart = Date.now();

    if (!isDryRun) {
      const prResult = await neo4jSession.run(`
        CALL gds.pageRank.stream('som-topology-projection', {
          maxIterations: 30,
          dampingFactor: 0.85,
          tolerance: 1e-6
        })
        YIELD nodeId, score
        WITH gds.util.asNode(nodeId) AS node, score
        RETURN node.som_cluster AS som_cluster, node.som_x AS som_x, node.som_y AS som_y, score
        ORDER BY score DESC
        LIMIT 50
      `);

      const prs = prResult.records.map(r => r.toObject());
      log(`PageRank top-50 (time: ${Date.now() - prStart}ms):`);
      if (isVerbose && prs.length > 0) {
        prs.slice(0, 10).forEach(r =>
          log(`  Cell (${r.som_x},${r.som_y}) cluster=${r.som_cluster}: score=${r.score.toFixed(4)}`)
        );
      }

      // Phase 2.4: Write PageRank scores to table
      log('Writing PageRank scores to atlas_som_cell_scores...');

      // Create table if doesn't exist
      await pgClient.query(`
        CREATE TABLE IF NOT EXISTS atlas_som_cell_scores (
          som_cluster INTEGER PRIMARY KEY,
          pagerank_score REAL NOT NULL,
          pagerank_rank INTEGER,
          node_count INTEGER,
          edge_count INTEGER,
          computed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
        )
      `);

      // Collect all PageRank scores (not just top-50)
      const allPrScores = await neo4jSession.run(`
        CALL gds.pageRank.stream('som-topology-projection', {
          maxIterations: 30,
          dampingFactor: 0.85,
          tolerance: 1e-6
        })
        YIELD nodeId, score
        WITH gds.util.asNode(nodeId) AS node, score
        RETURN node.som_cluster AS som_cluster, node.som_x AS som_x, node.som_y AS som_y, score
        ORDER BY score DESC
      `);

      const scoreRecords = allPrScores.records.map(r => r.toObject());
      log(`Total SOM cells with PageRank: ${scoreRecords.length}`);

      // Upsert scores with ranking
      let inserted = 0;
      for (let i = 0; i < scoreRecords.length; i++) {
        const { som_cluster, score } = scoreRecords[i];
        const clusterId = typeof som_cluster === 'object' ? som_cluster.low : som_cluster;
        await pgClient.query(
          `INSERT INTO atlas_som_cell_scores
           (som_cluster, pagerank_score, pagerank_rank, computed_at)
           VALUES ($1, $2, $3, now())
           ON CONFLICT (som_cluster) DO UPDATE
           SET pagerank_score = $2, pagerank_rank = $3, computed_at = now()`,
          [clusterId, score, i + 1]
        );
        inserted++;
      }
      log(`✅ Inserted ${inserted} PageRank scores`);

      // Phase 2.5: Cache to Redis
      log('Caching PageRank scores to Redis...');
      const cacheKey = 'atlas:pagerank:som:scores';
      await redisClient.del(cacheKey);

      const pipeline = redisClient.pipeline();
      for (const { som_cluster, score } of scoreRecords) {
        const clusterId = typeof som_cluster === 'object' ? som_cluster.low : som_cluster;
        pipeline.hset(cacheKey, clusterId.toString(), score.toString());
      }
      pipeline.expire(cacheKey, 86400);
      await pipeline.exec();
      log(`✅ Cached to Redis (key=${cacheKey})`);

      // Phase 2.6: Verify gates
      log('Verifying P4 Phase 2 gates...');
      const gateResults = {
        pass: true,
        checks: {
          pagerank_computed: scoreRecords.length === 400,
          postgres_populated: inserted === 400,
          redis_cached: (await redisClient.exists(cacheKey)) > 0,
          no_zero_scores: scoreRecords.every(r => r.score > 0),
        }
      };

      Object.entries(gateResults.checks).forEach(([check, pass]) => {
        log(`  ${check}: ${pass ? '✅' : '❌'}`);
        if (!pass) gateResults.pass = false;
      });

      if (gateResults.pass) {
        log('✅ P4 PHASE 2 (PageRank) COMPLETE');
        process.exit(0);
      } else {
        log('❌ P4 PHASE 2 FAILED — gates did not pass');
        process.exit(1);
      }
    } else {
      log('DRY-RUN: PageRank computation skipped');
      log('Would compute PageRank on 400 SOM cells');
      log('Would write scores to atlas_som_cell_scores table');
      log('Would cache to Redis atlas:pagerank:som:scores');
      process.exit(0);
    }

  } catch (err) {
    console.error('[ERROR]', err.message);
    process.exit(1);
  } finally {
    await pgClient.end();
    if (redisClient) await redisClient.quit();
    await neo4jDriver.close();
  }
}

runPageRankAudit();
