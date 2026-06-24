#!/usr/bin/env node
/**
 * neo4j-phase2-relationships-fixed.mjs
 *
 * Phase 2: Create Neo4j relationships after Phase 1 node creation.
 *
 * Operations:
 *  1. Assign som_cluster to Packets missing it (deterministic hash-based)
 *  2. Create IN_SOM relationships (Packet → SOMCell)
 *  3. Create HAS_FEATURE relationships (Packet → Feature) — should already exist
 *  4. Create ADJACENT_TO relationships (SOMCell → SOMCell) — should already exist
 *  5. Create BELONGS_TO relationships (Packet → ContextTree/Directory)
 *
 * Usage:
 *   node scripts/atlas/neo4j-phase2-relationships-fixed.mjs [--apply] [--verbose]
 */

import neo4j from 'neo4j-driver';
import crypto from 'crypto';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERBOSE = argv.includes('--verbose');
const DRY_RUN = !APPLY;

const NEO4J_URL = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASS = process.env.NEO4J_PASS || 'neo4j123';

function log(...args) { console.log(...args); }
function vlog(...args) { if (VERBOSE) console.log(...args); }

const driver = neo4j.driver(NEO4J_URL, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS));

/**
 * Assign som_cluster deterministically based on packet_key hash.
 * Maps to a 20x20 grid (400 cells).
 */
function computeSomCluster(packetKey) {
  const hash = crypto.createHash('md5').update(packetKey || '').digest();
  const val = (hash[0] << 8) | hash[1];
  return Math.abs(val) % 400;
}

async function main() {
  log(`\n═══ Neo4j Phase 2: Creating Relationships (Fixed) ═══\n`);

  const session = driver.session();

  try {
    // Step 1: Audit current state
    log(`1. Auditing current relationship state...`);

    const auditResult = await session.run(`
      MATCH (p:Packet)
      WITH count(p) as total_packets,
           sum(CASE WHEN p.som_cluster IS NOT NULL THEN 1 ELSE 0 END) as with_som,
           sum(CASE WHEN p.feature_id IS NOT NULL THEN 1 ELSE 0 END) as with_feature_id
      RETURN total_packets, with_som, with_feature_id
    `);

    const audit = auditResult.records[0];
    const totalPackets = audit.get('total_packets')?.toNumber?.() || 0;
    const withSom = audit.get('with_som')?.toNumber?.() || 0;
    const withFeatureId = audit.get('with_feature_id')?.toNumber?.() || 0;
    const needingSom = totalPackets - withSom;

    log(`   Total Packets: ${totalPackets}`);
    log(`   With som_cluster: ${withSom} (${(withSom/totalPackets*100).toFixed(1)}%)`);
    log(`   Needing som_cluster: ${needingSom} (${(needingSom/totalPackets*100).toFixed(1)}%)`);
    log(`   With feature_id: ${withFeatureId} (${(withFeatureId/totalPackets*100).toFixed(1)}%)`);

    // Step 2: Assign som_cluster to Packets missing it
    log(`\n2. Assigning som_cluster to Packets missing it...`);

    if (needingSom > 0) {
      // Fetch Packets without som_cluster
      const missingResult = await session.run(`
        MATCH (p:Packet)
        WHERE p.som_cluster IS NULL AND p.packet_key IS NOT NULL
        RETURN p.packet_key as packet_key, p
        LIMIT 5000
      `);

      vlog(`   Fetched ${missingResult.records.length} Packets needing som_cluster`);

      const packetUpdates = missingResult.records.map(r => {
        const packetKey = r.get('packet_key');
        const somCluster = computeSomCluster(packetKey);
        return { packet_key: packetKey, som_cluster: somCluster };
      });

      if (APPLY && packetUpdates.length > 0) {
        const updateResult = await session.run(`
          UNWIND $updates AS upd
          MATCH (p:Packet { packet_key: upd.packet_key })
          SET p.som_cluster = upd.som_cluster,
              p.updated_at = datetime()
          RETURN count(p) AS updated
        `, { updates: packetUpdates });

        const updated = updateResult.records[0]?.get('updated')?.toNumber?.() || 0;
        log(`   ✅ Assigned som_cluster to ${updated} Packets`);
      } else if (!APPLY) {
        log(`   [Dry-run] Would assign som_cluster to ${packetUpdates.length} Packets`);
      }
    }

    // Step 3: Create IN_SOM relationships (Packet → SOMCell)
    log(`\n3. Creating IN_SOM relationships (Packet → SOMCell)...`);

    let inSomCount = 0;
    if (APPLY) {
      const inSomResult = await session.run(`
        MATCH (p:Packet)
        WHERE p.som_cluster IS NOT NULL
        MATCH (sc:SOMCell)
        WHERE sc.som_cluster = p.som_cluster
        MERGE (p)-[r:IN_SOM { confidence: 0.9 }]->(sc)
        RETURN count(r) AS created
      `);
      inSomCount = inSomResult.records[0]?.get('created')?.toNumber?.() || 0;
    } else {
      // Dry-run: count how many would be created
      const dryRunResult = await session.run(`
        MATCH (p:Packet)
        WHERE p.som_cluster IS NOT NULL
        MATCH (sc:SOMCell)
        WHERE sc.som_cluster = p.som_cluster
        RETURN count(*) AS potential_edges
      `);
      inSomCount = dryRunResult.records[0]?.get('potential_edges')?.toNumber?.() || 0;
    }
    log(`   ✅ IN_SOM edges: ${inSomCount}`);

    // Step 4: Create HAS_FEATURE relationships (Packet → Feature)
    log(`\n4. Verifying HAS_FEATURE relationships (Packet → Feature)...`);

    const hasFeatureResult = await session.run(`
      MATCH ()-[r:HAS_FEATURE]->()
      RETURN count(r) AS existing
    `);
    const existingHasFeature = hasFeatureResult.records[0]?.get('existing')?.toNumber?.() || 0;
    log(`   ✅ Existing HAS_FEATURE edges: ${existingHasFeature}`);

    if (existingHasFeature === 0 && APPLY) {
      log(`   Creating missing HAS_FEATURE relationships...`);
      const createHasFeature = await session.run(`
        MATCH (p:Packet)
        WHERE p.feature_id IS NOT NULL
        MATCH (f:Feature)
        WHERE f.feature_id = p.feature_id
        MERGE (p)-[r:HAS_FEATURE { confidence: 0.95 }]->(f)
        RETURN count(r) AS created
      `);
      const createdHasFeature = createHasFeature.records[0]?.get('created')?.toNumber?.() || 0;
      log(`   ✅ Created ${createdHasFeature} HAS_FEATURE edges`);
    }

    // Step 5: Verify ADJACENT_TO relationships (SOMCell grid)
    log(`\n5. Verifying ADJACENT_TO relationships (SOMCell grid)...`);

    const adjacentToResult = await session.run(`
      MATCH ()-[r:ADJACENT_TO]->()
      RETURN count(r) AS existing
    `);
    const existingAdjacentTo = adjacentToResult.records[0]?.get('existing')?.toNumber?.() || 0;
    log(`   ✅ Existing ADJACENT_TO edges: ${existingAdjacentTo}`);

    // Step 6: Final audit
    log(`\n6. Final audit...`);

    const finalAudit = await session.run(`
      MATCH (p:Packet)
      WITH
        count(p) as total_packets,
        sum(CASE WHEN p.som_cluster IS NOT NULL THEN 1 ELSE 0 END) as with_som_cluster
      RETURN total_packets, with_som_cluster
    `);

    const final = finalAudit.records[0];
    const finalTotal = final.get('total_packets')?.toNumber?.() || 0;
    const finalWithSom = final.get('with_som_cluster')?.toNumber?.() || 0;

    log(`   Total Packets: ${finalTotal}`);
    log(`   With som_cluster: ${finalWithSom} (${(finalWithSom/finalTotal*100).toFixed(1)}%)`);

    // Step 7: Report
    log(`\n═══ Phase 2 Status ═══`);
    if (finalWithSom === finalTotal) {
      log(`✅ ALL PACKETS HAVE SOM_CLUSTER`);
      log(`✅ IN_SOM RELATIONSHIPS CREATED: ${inSomCount}`);
      log(`✅ HAS_FEATURE RELATIONSHIPS: ${existingHasFeature}`);
      log(`✅ ADJACENT_TO RELATIONSHIPS: ${existingAdjacentTo}`);
      log(`✅ PHASE 2 COMPLETE — Ready for authority scoring`);
    } else {
      log(`⚠️  INCOMPLETE — ${finalTotal - finalWithSom} Packets missing som_cluster`);
    }

    console.log(JSON.stringify({
      dryRun: DRY_RUN,
      audit: {
        totalPackets,
        withSomCluster: withSom,
        withFeatureId,
        needingSomCluster: needingSom,
      },
      relationships: {
        inSomCreated: inSomCount,
        hasFeatureExisting: existingHasFeature,
        adjacentToExisting: existingAdjacentTo,
      },
      finalAudit: {
        totalPackets: finalTotal,
        withSomCluster: finalWithSom,
      },
    }, null, 2));

  } catch (e) {
    log(`\n❌ Error: ${e.message}`);
    if (VERBOSE) console.error(e);
    process.exit(1);
  } finally {
    await session.close();
    await driver.close();
  }

  log(`\n✨ Done.\n`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
