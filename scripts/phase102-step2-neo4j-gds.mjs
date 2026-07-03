#!/usr/bin/env node
/**
 * Phase 102 Step 2: Neo4j GDS (PageRank, HITS, Louvain)
 *
 * Canonical order (Tier 1 → Tier 2):
 * 1. Import code_feature_edges from Postgres into Neo4j
 * 2. Create Feature nodes + relationships
 * 3. Run PageRank (CPU)
 * 4. Run HITS if available
 * 5. Run Louvain community detection
 * 6. Write results back to Postgres feature_statistics
 *
 * Proof gates:
 * - SELECT COUNT(*) FROM feature_statistics WHERE pagerank_score IS NOT NULL
 * - SELECT COUNT(*) FROM feature_statistics WHERE community_id IS NOT NULL
 *
 * Usage:
 *   node phase102-step2-neo4j-gds.mjs --dry-run
 *   node phase102-step2-neo4j-gds.mjs --apply
 */

import pg from 'pg';
import neo4j from 'neo4j-driver';
import { createRequire } from 'module';
import dotenv from 'dotenv';

dotenv.config({ path: '.env' });

const { Pool } = pg;

// Config
const NEO4J_URI = process.env.NEO4J_URI || 'bolt://127.0.0.1:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

const DB_HOST = process.env.DATABASE_HOST || '127.0.0.1';
const DB_PORT = parseInt(process.env.DATABASE_PORT || '5434');
const DB_USER = process.env.DATABASE_USER || 'legal_admin';
const DB_PASSWORD = process.env.DATABASE_PASSWORD || '123456';
const DB_NAME = process.env.DATABASE_NAME || 'legal_ai_db';

// Args
const dryRun = process.argv.includes('--dry-run');
const apply = process.argv.includes('--apply');
const MODE = dryRun ? 'DRY_RUN' : apply ? 'APPLY' : 'DRY_RUN';

// Pools
const pool = new Pool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME
});

const driver = neo4j.driver(
  NEO4J_URI,
  neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD)
);

function toFloat(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'object' && typeof val.toNumber === 'function') return val.toNumber();
  return Number(val);
}

async function importEdgesFromPostgres(session) {
  /**
   * Step 1: Read code_feature_edges from Postgres
   *         Create Feature nodes + relationships in Neo4j
   */
  console.log('\n📥 Step 1: Importing edges from Postgres...');

  const result = await pool.query(`
    SELECT
      from_feature_id,
      to_feature_id,
      relation as edge_type,
      confidence as weight
    FROM code_feature_edges
    LIMIT 10000
  `);

  const edges = result.rows;
  console.log(`  ✓ Loaded ${edges.length} edges from Postgres`);

  if (dryRun) {
    console.log(`  [DRY_RUN] Would create ${edges.length} Feature relationships in Neo4j`);
    return edges.length;
  }

  // Create/merge Feature nodes and relationships
  let created = 0;

  for (const edge of edges) {
    await session.run(`
      MERGE (source:Feature {feature_id: $sourceId})
      MERGE (target:Feature {feature_id: $targetId})
      MERGE (source)-[r:CONNECTS_TO {weight: $weight, type: $edgeType}]->(target)
      SET r.updated_at = datetime()
    `, {
      sourceId: edge.from_feature_id,
      targetId: edge.to_feature_id,
      weight: edge.weight || 1.0,
      edgeType: edge.edge_type || 'CONNECTS_TO'
    });

    created++;
    if (created % 100 === 0) {
      console.log(`  ✓ Created ${created} relationships...`);
    }
  }

  console.log(`  ✓ Created ${created} Feature relationships in Neo4j`);
  return created;
}

async function runPageRank(session) {
  /**
   * Step 2: Run PageRank on Feature graph
   * Writes pagerank property to Feature nodes
   */
  console.log('\n📊 Step 2: Running PageRank...');

  if (dryRun) {
    console.log('  [DRY_RUN] Would run: CALL gds.pageRank.write(...)');
    return;
  }

  try {
    // Create in-memory graph projection
    await session.run(`
      CALL gds.graph.project(
        'features_proj',
        'Feature',
        'CONNECTS_TO',
        { relationshipProperties: ['weight'] }
      )
    `);
    console.log('  ✓ Created graph projection');

    // Run PageRank
    const result = await session.run(`
      CALL gds.pageRank.write(
        'features_proj',
        {
          relationshipWeightProperty: 'weight',
          writeProperty: 'pagerank',
          dampingFactor: 0.85,
          maxIterations: 20
        }
      )
      YIELD nodePropertiesWritten, ranIterations
      RETURN nodePropertiesWritten, ranIterations
    `);

    const record = result.records[0];
    const written = toFloat(record.get('nodePropertiesWritten'));
    const iterations = toFloat(record.get('ranIterations'));

    console.log(`  ✓ PageRank complete: ${written} nodes, ${iterations} iterations`);

    // Clean up projection
    await session.run(`CALL gds.graph.drop('features_proj')`);
  } catch (e) {
    console.warn(`  ⚠️  PageRank failed: ${e.message}`);
  }
}

async function runHITS(session) {
  /**
   * Step 3: Run HITS (authority + hub scores)
   * Writes hitsAuthority and hitsHub properties
   */
  console.log('\n🎯 Step 3: Running HITS...');

  if (dryRun) {
    console.log('  [DRY_RUN] Would run: CALL gds.hits.write(...)');
    return;
  }

  try {
    await session.run(`
      CALL gds.graph.project(
        'features_hits',
        'Feature',
        'CONNECTS_TO',
        { relationshipProperties: ['weight'] }
      )
    `);

    const result = await session.run(`
      CALL gds.hits.write(
        'features_hits',
        {
          relationshipWeightProperty: 'weight',
          writeProperty: 'hitsScore',
          maxIterations: 20
        }
      )
      YIELD nodePropertiesWritten
      RETURN nodePropertiesWritten
    `);

    const written = toFloat(result.records[0].get('nodePropertiesWritten'));
    console.log(`  ✓ HITS complete: ${written} nodes`);

    await session.run(`CALL gds.graph.drop('features_hits')`);
  } catch (e) {
    console.warn(`  ⚠️  HITS failed (optional): ${e.message}`);
  }
}

async function runLouvain(session) {
  /**
   * Step 4: Run Louvain community detection
   * Writes communityId property
   */
  console.log('\n🔗 Step 4: Running Louvain...');

  if (dryRun) {
    console.log('  [DRY_RUN] Would run: CALL gds.louvain.write(...)');
    return;
  }

  try {
    await session.run(`
      CALL gds.graph.project(
        'features_louvain',
        'Feature',
        'CONNECTS_TO'
      )
    `);

    const result = await session.run(`
      CALL gds.louvain.write(
        'features_louvain',
        {
          writeProperty: 'communityId',
          maxIterations: 10
        }
      )
      YIELD nodePropertiesWritten, communityCount
      RETURN nodePropertiesWritten, communityCount
    `);

    const record = result.records[0];
    const written = toFloat(record.get('nodePropertiesWritten'));
    const communities = toFloat(record.get('communityCount'));

    console.log(`  ✓ Louvain complete: ${written} nodes in ${communities} communities`);

    await session.run(`CALL gds.graph.drop('features_louvain')`);
  } catch (e) {
    console.warn(`  ⚠️  Louvain failed (optional): ${e.message}`);
  }
}

async function syncResultsToPostgres(session) {
  /**
   * Step 5: Read Feature nodes from Neo4j
   *         Write pagerank + communityId to Postgres feature_statistics
   */
  console.log('\n💾 Step 5: Syncing results to feature_statistics...');

  // Fetch all Feature nodes with GDS scores
  const result = await session.run(`
    MATCH (f:Feature)
    WHERE f.pagerank IS NOT NULL
    RETURN f.feature_id AS feature_id,
           f.pagerank AS pagerank_score,
           f.hitsScore AS hits_score,
           f.communityId AS community_id
  `);

  const features = result.records.map(r => ({
    feature_id: r.get('feature_id'),
    pagerank: toFloat(r.get('pagerank_score')),
    hits_authority: toFloat(r.get('hits_score')),
    community: toFloat(r.get('community_id'))
  })).filter(f => f.feature_id);

  console.log(`  ✓ Fetched ${features.length} Feature nodes from Neo4j`);

  if (dryRun) {
    console.log(`  [DRY_RUN] Would upsert ${features.length} rows to feature_statistics`);
    return features.length;
  }

  // Upsert to feature_statistics
  let upserted = 0;

  for (const feature of features) {
    await pool.query(`
      INSERT INTO feature_statistics (
        feature_id,
        pagerank,
        hits_authority,
        community,
        last_updated
      ) VALUES ($1, $2, $3, $4, NOW())
      ON CONFLICT (feature_id) DO UPDATE SET
        pagerank = EXCLUDED.pagerank,
        hits_authority = EXCLUDED.hits_authority,
        community = EXCLUDED.community,
        last_updated = NOW()
    `, [
      feature.feature_id,
      feature.pagerank,
      feature.hits_authority,
      feature.community
    ]);

    upserted++;
    if (upserted % 100 === 0) {
      console.log(`  ✓ Upserted ${upserted} rows...`);
    }
  }

  console.log(`  ✓ Upserted ${upserted} rows to feature_statistics`);
  return upserted;
}

async function verifyResults() {
  /**
   * Proof gates: Verify feature_statistics is populated
   */
  console.log('\n✅ Verification Gates:');

  const result1 = await pool.query(`
    SELECT COUNT(*) as count FROM feature_statistics
  `);
  const totalStats = result1.rows[0].count;
  console.log(`  Gate 1: feature_statistics rows = ${totalStats}`);

  const result2 = await pool.query(`
    SELECT COUNT(*) as count FROM feature_statistics
    WHERE pagerank IS NOT NULL AND pagerank > 0
  `);
  const rankRows = result2.rows[0].count;
  console.log(`  Gate 2: rows with pagerank_score = ${rankRows}`);

  const result3 = await pool.query(`
    SELECT COUNT(*) as count FROM feature_statistics
    WHERE community IS NOT NULL
  `);
  const communityRows = result3.rows[0].count;
  console.log(`  Gate 3: rows with community_id = ${communityRows}`);

  return {
    totalStats,
    rankRows,
    communityRows,
    passed: rankRows > 0 && communityRows > 0
  };
}

async function main() {
  console.log('\n🧬 Phase 102 Step 2: Neo4j GDS\n');
  console.log(`Mode: ${MODE}`);

  const session = driver.session();

  try {
    // Step 1: Import edges
    await importEdgesFromPostgres(session);

    // Step 2-4: Run GDS algorithms
    await runPageRank(session);
    await runHITS(session);
    await runLouvain(session);

    // Step 5: Sync to Postgres
    await syncResultsToPostgres(session);

    // Verify
    const verification = await verifyResults();

    console.log(`\n${verification.passed ? '✅' : '⚠️'} Step 2 ${verification.passed ? 'PROVEN' : 'PARTIAL'}`);

  } catch (err) {
    console.error('\n❌ Error:', err.message);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
    await pool.end();
  }
}

main();
