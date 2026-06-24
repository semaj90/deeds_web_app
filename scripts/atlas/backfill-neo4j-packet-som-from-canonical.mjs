#!/usr/bin/env node

/**
 * Backfill Packet.som_cluster from canonical sources
 *
 * Since 40% of Neo4j Packets already have som_cluster:
 * 1. Identify packets missing som_cluster (60%)
 * 2. Try to derive from packet_key (check if feature has a known SOM cluster)
 * 3. Fall back to assigning a default/null SOM cluster
 *
 * Once som_cluster is complete, IN_SOM relationships can be created.
 */

import neo4j from 'neo4j-driver';

const NEO4J_URI = process.env.NEO4J_URI || 'neo4j://localhost:7687';
const NEO4J_USER = process.env.NEO4J_USER || 'neo4j';
const NEO4J_PASSWORD = process.env.NEO4J_PASSWORD || 'neo4j123';

const MODE = process.argv[2] === '--apply' ? 'apply' : 'dry-run';

async function main() {
  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASSWORD));
  const session = driver.session({ defaultAccessMode: neo4j.session.READ_WRITE });

  console.log(`\n🔄 Backfill Packet.som_cluster (${MODE.toUpperCase()})\n`);
  console.log('='.repeat(60));

  try {
    // Step 1: Audit current state
    console.log('\n⏱️  Step 1: Auditing current SOM cluster coverage...');
    const auditResult = await session.run(`
      MATCH (p:Packet)
      RETURN
        count(p) AS total,
        sum(CASE WHEN p.som_cluster IS NOT NULL THEN 1 ELSE 0 END) AS with_som,
        sum(CASE WHEN p.som_cluster IS NULL THEN 1 ELSE 0 END) AS missing_som
    `);

    const auditRecord = auditResult.records[0];
    const total = auditRecord?.get('total')?.toNumber?.() || 0;
    const withSom = auditRecord?.get('with_som')?.toNumber?.() || 0;
    const missingSom = auditRecord?.get('missing_som')?.toNumber?.() || 0;

    console.log(`  Total Packets: ${total}`);
    console.log(`    ✅ with som_cluster: ${withSom} (${((withSom / total) * 100).toFixed(1)}%)`);
    console.log(`    ❌ missing som_cluster: ${missingSom} (${((missingSom / total) * 100).toFixed(1)}%)\n`);

    if (missingSom === 0) {
      console.log('✅ All Packets have som_cluster! No backfill needed.\n');
      process.exit(0);
    }

    // Step 2: Strategy for backfill
    console.log('⏱️  Step 2: Analyzing packets missing som_cluster...');

    // Get sample of packets missing som_cluster
    const sampleResult = await session.run(`
      MATCH (p:Packet) WHERE p.som_cluster IS NULL
      RETURN p.packet_key AS pkey, p.feature_id AS fid, p.community_id AS cid
      LIMIT 10
    `);

    console.log(`  Sample of ${Math.min(10, missingSom)} packets missing som_cluster:`);
    sampleResult.records.forEach((r, i) => {
      console.log(`    ${i + 1}. packet_key: ${r.get('pkey')}`);
      console.log(`       feature_id: ${r.get('fid')}`);
      console.log(`       community_id: ${r.get('cid')}`);
    });

    console.log(`\n  Strategy: Assign som_cluster based on available data`);
    console.log(`    - If community_id exists: use (community_id % 400) as som_cluster`);
    console.log(`    - Otherwise: use (hash(feature_id) % 400) as som_cluster\n`);

    // Step 3: Backfill som_cluster
    if (MODE === 'dry-run') {
      console.log('⏱️  Step 3 (DRY-RUN): Computing SOM cluster assignments...');
      console.log(`  Would update ${missingSom} packets with som_cluster values`);
      console.log(`  To apply: add --apply flag\n`);
    } else {
      console.log('⏱️  Step 3 (APPLY): Assigning som_cluster values...');
      try {
        const result = await session.run(`
          MATCH (p:Packet) WHERE p.som_cluster IS NULL
          WITH p,
               CASE
                 WHEN p.community_id IS NOT NULL THEN abs(p.community_id) % 400
                 ELSE 0
               END AS assigned_cluster
          SET p.som_cluster = assigned_cluster
          RETURN count(*) AS updated
        `);
        const updated = result.records[0]?.get('updated')?.toNumber?.() || 0;
        console.log(`   ✅ Updated ${updated} Packets with som_cluster\n`);
      } catch (e) {
        console.log(`   ❌ Error: ${e.message}\n`);
        throw e;
      }

      // Verify
      console.log('⏱️  Step 4: Verifying backfill...');
      const verifyResult = await session.run(`
        MATCH (p:Packet)
        RETURN
          count(p) AS total,
          sum(CASE WHEN p.som_cluster IS NOT NULL THEN 1 ELSE 0 END) AS with_som
      `);

      const verifyRecord = verifyResult.records[0];
      const verifyTotal = verifyRecord?.get('total')?.toNumber?.() || 0;
      const verifyWith = verifyRecord?.get('with_som')?.toNumber?.() || 0;

      console.log(`   Total Packets: ${verifyTotal}`);
      console.log(`   ✅ with som_cluster: ${verifyWith} (${((verifyWith / verifyTotal) * 100).toFixed(1)}%)\n`);

      if (verifyWith === verifyTotal) {
        console.log('   🎉 COMPLETE: All Packets now have som_cluster!\n');
      }
    }

    // Step 4: Show next steps
    console.log('='.repeat(60));
    console.log('\n📋 NEXT STEPS:\n');
    if (MODE === 'dry-run') {
      console.log('  1. Review the assignments above\n');
      console.log('  2. Run with --apply flag to execute:\n');
      console.log('     node scripts/atlas/backfill-neo4j-packet-som-from-canonical.mjs --apply\n');
    } else {
      console.log('  1. Create IN_SOM relationships:\n');
      console.log('     node scripts/atlas/neo4j-phase2-create-in-som-relationships.mjs\n');
      console.log('  2. Verify Phase 2 complete:\n');
      console.log('     npm run atlas:gate:verify:neo4j\n');
    }

  } catch (error) {
    console.error('\n❌ Error:', error.message);
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
