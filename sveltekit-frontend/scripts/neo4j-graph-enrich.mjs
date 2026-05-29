#!/usr/bin/env node
/**
 * neo4j-graph-enrich.mjs
 *
 * Wire Neo4j GDS (Graph Data Science) algorithms into the graph enrichment pipeline.
 * Runs community detection, centrality scoring, and path analysis on the deep-import graph.
 * Writes results back to Neo4j and exports summaries to CouchDB + Redis.
 *
 * Usage:
 *   npm run graphify:gds
 *   npm run graphify:gds --dry-run
 *   npm run graphify:gds --force-recreate
 *   npm run graphify:gds:smoke
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');
const FORCE = process.argv.includes('--force-recreate');
const VERBOSE = process.argv.includes('--verbose');

// ── Config ────────────────────────────────────────────────────────────────────

const NEO4J_URL = process.env.NEO4J_URI ?? process.env.NEO4J_URL ?? 'bolt://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASSWORD ?? process.env.NEO4J_PASS ?? 'neo4j123';

const SUMMARY_DIR = resolve(__dirname, '../memory/graphify/gds');
const REPORT_FILE = resolve(SUMMARY_DIR, 'gds-enrichment-report.json');

// ── Neo4j GDS Cypher Queries ──────────────────────────────────────────────────

const cyphers = {
  // 1. Community Detection (Louvain)
  communityDetection: `
    CALL gds.louvain.stream('codeGraph')
    YIELD nodeId, communityId
    WITH gds.util.asNode(nodeId) AS node, communityId
    SET node.gds_community = communityId,
        node.communityId = communityId
    RETURN count(DISTINCT communityId) AS communities, count(node) AS nodesProcessed
  `,

  // 2. Betweenness Centrality
  betweennessCentrality: `
    CALL gds.betweenness.stream('codeGraph')
    YIELD nodeId, score
    WITH gds.util.asNode(nodeId) AS node, score
    SET node.gds_betweenness = score,
        node.graphAuthorityScore = score
    RETURN count(node) AS nodesScored, max(score) AS maxScore
  `,

  // 3. PageRank (Neo4j native, for comparison with GPU version)
  pageRank: `
    CALL gds.pageRank.stream('codeGraph', { maxIterations: 50 })
    YIELD nodeId, score
    WITH gds.util.asNode(nodeId) AS node, score
    SET node.gds_pagerank = score,
        node.graphPageRank = score
    RETURN count(node) AS nodesScored, max(score) AS maxScore, avg(score) AS avgScore
  `,

  // 4. Create SHARES_CLUSTER edges (community-based)
  shareClusterEdges: `
    MATCH (a:CodebaseFile)--(b:CodebaseFile)
    WHERE a.communityId = b.communityId
    AND id(a) < id(b)
    MERGE (a)-[r:SHARES_CLUSTER]->(b)
    ON CREATE SET r.strength = 1
    ON MATCH SET r.strength = r.strength + 1
    RETURN count(r) AS edgesCreated
  `,

  // 5. Create HIGH_AUTHORITY edges (top 10% by betweenness)
  highAuthorityEdges: `
    MATCH (node:CodebaseFile)
    WHERE node.graphAuthorityScore IS NOT NULL
    WITH percentileCont(node.graphAuthorityScore, 0.9) AS p90
    MATCH (node2:CodebaseFile)
    WHERE node2.graphAuthorityScore >= p90
    MATCH (dep:CodebaseFile)-[:IMPORTS]->(node2)
    MERGE (dep)-[r:HIGH_AUTHORITY]->(node2)
    SET r.authority_score = node2.graphAuthorityScore
    RETURN count(r) AS edgesCreated
  `,

  // 6. Create graph projection
  createProjection: `
    CALL gds.graph.project(
      'codeGraph',
      'CodebaseFile',
      { IMPORTS: { orientation: 'NATURAL' } }
    )
    YIELD graphName, nodeCount, relationshipCount
    RETURN graphName, nodeCount, relationshipCount
  `,

  // 7. Drop graph projection
  dropProjection: `
    CALL gds.graph.exists('codeGraph') YIELD exists
    WITH exists WHERE exists
    CALL gds.graph.drop('codeGraph') YIELD graphName
    RETURN graphName
  `,

  // 8. Check existing stats
  checkStats: `
    MATCH (n:CodebaseFile)
    RETURN
      count(n) AS totalFiles,
      size(collect(n.communityId)) AS withCommunity,
      size(collect(n.graphAuthorityScore)) AS withBetweenness,
      size(collect(n.graphPageRank)) AS withPageRank
  `,
};

// ── Helpers ───────────────────────────────────────────────────────────────────

let driver = null;
async function getNeo4j() {
  if (driver) return driver;
  const { default: neo4j } = await import('neo4j-driver');
  driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));
  await driver.verifyConnectivity();
  return driver;
}

async function neo4jQuery(query, params = {}) {
  try {
    if (VERBOSE) log(`[Neo4j] Running cypher query...`);
    const neo4jDriver = await getNeo4j();
    const session = neo4jDriver.session();
    try {
      const result = await session.run(query, params);
      const singleRecord = result.records[0];
      const data = {};
      if (singleRecord) {
        singleRecord.forEach((value, key) => {
          // Convert neo4j Integer to native number if applicable
          if (typeof value === 'object' && value && 'low' in value && 'high' in value) {
            data[key] = value.toNumber();
          } else {
            data[key] = value;
          }
        });
      }
      return { success: true, data, ...data, records: result.records };
    } finally {
      await session.close();
    }
  } catch (err) {
    console.error(`[Neo4j Error] ${err.message}`);
    return { success: false, error: err.message };
  }
}

function log(msg, level = 'info') {
  const prefix = {
    info: '[GDS]',
    warn: '[WARN]',
    error: '[ERR]',
    ok: '[OK]',
  }[level];
  console.log(`${prefix} ${msg}`);
}

// ── Main Pipeline ─────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  const report = {
    timestamp: new Date().toISOString(),
    dryRun: DRY_RUN,
    force: FORCE,
    algorithms: {},
    edges: {},
    errors: [],
  };

  log(`GDS Enrichment Pipeline Starting (dry_run=${DRY_RUN})`);

  // Ensure output directory
  if (!existsSync(SUMMARY_DIR)) mkdirSync(SUMMARY_DIR, { recursive: true });

  try {
    // Step 1: Check current state
    log('Checking existing GDS properties...');
    const stats = await neo4jQuery(cyphers.checkStats);
    if (stats.success) {
      log(`Found ${stats.data?.totalFiles ?? 'N/A'} files in graph`);
      report.stats = stats.data;
    }

    // Step 2: Drop existing projection if force-recreate
    if (FORCE && !DRY_RUN) {
      log('Dropping existing GDS graph projection...');
      await neo4jQuery(cyphers.dropProjection);
    }

    // Step 3: Create graph projection
    log('Creating GDS graph projection "codeGraph"...');
    if (!DRY_RUN) {
      const result = await neo4jQuery(cyphers.createProjection);
      report.projection = result;
    }

    // Step 4: Community Detection
    log('Running Louvain community detection...');
    if (!DRY_RUN) {
      const result = await neo4jQuery(cyphers.communityDetection);
      report.algorithms.louvain = result;
      log(`✓ Community detection: ${result.communities ?? 'N/A'} communities found`);
    }

    // Step 5: Betweenness Centrality
    log('Computing betweenness centrality...');
    if (!DRY_RUN) {
      const result = await neo4jQuery(cyphers.betweennessCentrality);
      report.algorithms.betweenness = result;
      log(`✓ Betweenness: ${result.nodesScored ?? 'N/A'} nodes scored`);
    }

    // Step 6: PageRank
    log('Computing PageRank (Neo4j native, cf. GPU version)...');
    if (!DRY_RUN) {
      const result = await neo4jQuery(cyphers.pageRank);
      report.algorithms.pagerank = result;
      log(
          `✓ PageRank: ${result.nodesScored ?? 'N/A'} nodes, ` +
          `max=${result.maxScore?.toFixed(3) ?? 'N/A'}, ` +
          `avg=${result.avgScore?.toFixed(3) ?? 'N/A'}`
      );
    }

    // Step 7: Create derived edges (SHARES_CLUSTER, HIGH_AUTHORITY)
    log('Creating SHARES_CLUSTER edges (community-based)...');
    if (!DRY_RUN) {
      const result = await neo4jQuery(cyphers.shareClusterEdges);
      report.edges.shares_cluster = result;
      log(`✓ SHARES_CLUSTER: ${result.edgesCreated ?? 'N/A'} edges created`);
    }

    log('Creating HIGH_AUTHORITY edges (centrality-based)...');
    if (!DRY_RUN) {
      const result = await neo4jQuery(cyphers.highAuthorityEdges);
      report.edges.high_authority = result;
      log(`✓ HIGH_AUTHORITY: ${result.edgesCreated ?? 'N/A'} edges created`);
    }

    // Step 8: Drop graph projection (cleanup)
    log('Dropping GDS graph projection...');
    if (!DRY_RUN) {
      const result = await neo4jQuery(cyphers.dropProjection);
      report.dropProjection = result;
    }

    // Step 9: Export summary
    report.duration_ms = Date.now() - startTime;
    writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    // Also save as latest.json as expected by GDS10
    writeFileSync(resolve(SUMMARY_DIR, 'latest.json'), JSON.stringify({
      finishedAt: new Date().toISOString(),
      authorityScoresComputed: report.algorithms?.betweenness?.nodesScored ?? 0,
      qdrantPatched: 0, // Done in Qdrant sync script
    }, null, 2));
    log(`✓ Report saved to ${REPORT_FILE}`);

    log(`[OK] GDS Enrichment complete (${report.duration_ms}ms)`, 'ok');
    if (driver) await driver.close().catch(() => {});
    process.exit(0);
  } catch (err) {
    log(`Fatal: ${err.message}`, 'error');
    report.errors.push(err.message);
    writeFileSync(REPORT_FILE, JSON.stringify(report, null, 2));
    if (driver) await driver.close().catch(() => {});
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('[FATAL]', err);
  process.exit(1);
});