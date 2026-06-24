#!/usr/bin/env node

/**
 * Neo4j Phase F: PageRank Authority Scoring
 *
 * Purpose:
 *   Compute PageRank scores on the Neo4j identity graph to rank packet authority.
 *   Uses the identity relationships (HAS_FEATURE, IN_SOM, ADJACENT_TO) to score
 *   influence and importance of packets within the codebase topology.
 *
 * Algorithm:
 *   1. Run GDS PageRank algorithm on the identity graph
 *   2. Write results back to Packet.pagerank property
 *   3. Verify completion and report score distribution
 *
 * Dependencies:
 *   - Neo4j GDS (Graph Data Science) plugin must be installed
 *   - Phase 2 relationships must be complete (HAS_FEATURE, IN_SOM, ADJACENT_TO)
 *
 * Usage:
 *   node scripts/atlas/neo4j-pagerank-phase-f.mjs [--apply] [--verbose]
 */

import neo4j from 'neo4j-driver';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const DRY_RUN = !APPLY;

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

async function main() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ defaultAccessMode: neo4j.session.READ_WRITE });

  console.log('\n🔗 Neo4j Phase F: PageRank Authority Scoring\n');
  console.log('='.repeat(60));

  try {
    // Step 1: Verify Neo4j connectivity
    console.log('\n⏱️  Step 1: Verifying Neo4j connectivity...');
    await session.run('CALL dbms.components() YIELD name, versions RETURN name, versions');
    console.log('   ✅ Neo4j connected\n');

    // Step 2: Check GDS library availability
    console.log('⏱️  Step 2: Checking GDS (Graph Data Science) availability...');
    try {
      const gdsCheckResult = await session.run('CALL gds.version()');
      const gdsVersion = gdsCheckResult.records[0]?.get(0)?.toString?.() || 'unknown';
      console.log(`   ✅ GDS available (version: ${gdsVersion})\n`);
    } catch (e) {
      if (e.message.includes('Unknown procedure')) {
        console.log('   ⚠️  GDS not installed. Installing via: CALL gds.install()');
        throw new Error('GDS plugin required. Install with: CALL gds.install()');
      }
      throw e;
    }

    // Step 3: Pre-flight audit of identity graph
    console.log('⏱️  Step 3: Pre-flight audit of identity graph...');
    const auditResult = await session.run(`
      MATCH (p:Packet)
      RETURN
        count(p) AS total_packets,
        sum(CASE WHEN p.pagerank IS NOT NULL THEN 1 ELSE 0 END) AS with_pagerank
    `);

    const auditRecord = auditResult.records[0];
    const totalPackets = auditRecord?.get('total_packets')?.toNumber?.() || 0;
    const alreadyScored = auditRecord?.get('with_pagerank')?.toNumber?.() || 0;

    console.log(`   Total Packets: ${totalPackets}`);
    console.log(`   Already scored: ${alreadyScored}`);
    console.log(`   Needing scoring: ${totalPackets - alreadyScored}\n`);

    // Step 4: Create GDS projection of identity graph
    console.log('⏱️  Step 4: Creating GDS graph projection...');
    const projectionName = `identity_graph_${Date.now()}`;

    try {
      await session.run(`
        CALL gds.graph.project(
          $projectionName,
          'Packet',
          {
            HAS_FEATURE: { orientation: 'NATURAL' },
            IN_SOM: { orientation: 'NATURAL' },
            ADJACENT_TO: { orientation: 'NATURAL' }
          }
        )
      `, { projectionName });
      console.log(`   ✅ Projection created: ${projectionName}\n`);
    } catch (e) {
      console.log(`   ❌ Projection failed: ${e.message}`);
      throw e;
    }

    // Step 5: Run PageRank algorithm
    console.log('⏱️  Step 5: Running PageRank algorithm...');
    const pagerankResult = await session.run(`
      CALL gds.pageRank.stream(
        $projectionName,
        {
          maxIterations: 20,
          dampingFactor: 0.85,
          tolerance: 1e-06
        }
      )
      YIELD nodeId, score
      RETURN nodeId, score
    `, { projectionName });

    const scores = {};
    for (const record of pagerankResult.records) {
      const nodeId = record.get('nodeId');
      const score = record.get('score');
      scores[nodeId] = score;
    }

    console.log(`   ✅ PageRank computed for ${Object.keys(scores).length} nodes\n`);

    // Step 6: Write PageRank scores back to Packet nodes (if --apply)
    let updatedCount = 0;
    if (APPLY && Object.keys(scores).length > 0) {
      console.log('⏱️  Step 6: Writing PageRank scores to Packet nodes...');

      const scoreUpdateResult = await session.run(`
        CALL gds.pageRank.stream(
          $projectionName,
          {
            maxIterations: 20,
            dampingFactor: 0.85,
            tolerance: 1e-06
          }
        )
        YIELD nodeId, score
        MATCH (p:Packet) WHERE id(p) = nodeId
        SET p.pagerank = score,
            p.pagerank_computed_at = datetime()
        RETURN count(p) AS updated
      `, { projectionName });

      updatedCount = scoreUpdateResult.records[0]?.get('updated')?.toNumber?.() || 0;
      console.log(`   ✅ Updated ${updatedCount} Packet nodes with PageRank scores\n`);
    } else if (!APPLY) {
      console.log('⏱️  Step 6: [Dry-run] Would write PageRank scores to Packet nodes\n');
      updatedCount = Object.keys(scores).length;
    }

    // Step 7: Verify PageRank distribution
    console.log('⏱️  Step 7: Verifying PageRank score distribution...');
    const distributionResult = await session.run(`
      MATCH (p:Packet)
      WHERE p.pagerank IS NOT NULL
      WITH collect(p.pagerank) AS scores
      RETURN
        size(scores) AS count,
        reduce(min = scores[0], s IN scores | CASE WHEN s < min THEN s ELSE min END) AS min_score,
        reduce(max = scores[0], s IN scores | CASE WHEN s > max THEN s ELSE max END) AS max_score,
        reduce(sum = 0.0, s IN scores | sum + s) / size(scores) AS avg_score
    `);

    const dist = distributionResult.records[0];
    const count = dist?.get('count')?.toNumber?.() || 0;
    const minScore = dist?.get('min_score')?.toNumber?.() || 0;
    const maxScore = dist?.get('max_score')?.toNumber?.() || 0;
    const avgScore = dist?.get('avg_score')?.toNumber?.() || 0;

    console.log(`   Packets with PageRank: ${count}`);
    console.log(`   Score range: [${minScore.toFixed(6)}, ${maxScore.toFixed(6)}]`);
    console.log(`   Mean: ${avgScore.toFixed(6)}\n`);

    // Step 8: Show top-10 packets by authority
    console.log('⏱️  Step 8: Top 10 packets by PageRank authority...');
    const topPacketsResult = await session.run(`
      MATCH (p:Packet)
      WHERE p.pagerank IS NOT NULL
      RETURN
        p.packet_key AS packet_key,
        p.source_ref AS source_ref,
        p.pagerank AS score
      ORDER BY score DESC
      LIMIT 10
    `);

    for (let i = 0; i < topPacketsResult.records.length; i++) {
      const record = topPacketsResult.records[i];
      const packetKey = record.get('packet_key') || 'UNKNOWN';
      const sourceRef = record.get('source_ref') || 'UNKNOWN';
      const score = record.get('score')?.toFixed?.(4) || 'N/A';
      console.log(`   ${i + 1}. ${packetKey} (${sourceRef}): ${score}`);
    }
    console.log();

    // Step 9: Clean up GDS projection
    console.log('⏱️  Step 9: Cleaning up GDS projection...');
    try {
      await session.run(`
        CALL gds.graph.drop($projectionName)
      `, { projectionName });
      console.log(`   ✅ Projection dropped\n`);
    } catch (e) {
      vlog(`   ⚠️  Projection cleanup warning: ${e.message}`);
    }

    // Step 10: Final report
    console.log('='.repeat(60));
    console.log('\n✅ Phase F: PageRank Authority Scoring Complete!\n');

    console.log('📊 Summary:\n');
    console.log(`  Packets scored: ${count}`);
    console.log(`  Score range: [${minScore.toFixed(6)}, ${maxScore.toFixed(6)}]`);
    console.log(`  Mean authority: ${avgScore.toFixed(6)}\n`);

    if (APPLY) {
      console.log(`✅ PageRank scores persisted to Neo4j (${updatedCount} packets)\n`);
    } else {
      console.log(`[Dry-run] Would persist PageRank scores (${updatedCount} packets)\n`);
    }

    console.log('✨ Phase F is ready for downstream authority-weighted retrieval and ranking.\n');

  } catch (error) {
    console.error('\n❌ Error:', error.message);
    if (VERBOSE) console.error(error.stack);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
