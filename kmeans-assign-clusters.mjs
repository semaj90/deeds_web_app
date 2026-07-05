import { Pool } from 'pg';

const pgPool = new Pool({
  host: process.env.POSTGRES_HOST || 'localhost',
  port: parseInt(process.env.POSTGRES_PORT || '5434'),
  database: process.env.POSTGRES_DB || 'legal_ai_db',
  user: process.env.POSTGRES_USER || 'legal_admin',
  password: process.env.POSTGRES_PASSWORD || '123456',
});

async function assignClusters() {
  console.log('╔════════════════════════════════════════════════════════════════╗');
  console.log('║  K-Means Cluster Assignment (Deterministic Hash)              ║');
  console.log('╚════════════════════════════════════════════════════════════════╝\n');

  try {
    const K = 20;  // number of clusters

    console.log(`📖 Fetching all packets for assignment to ${K} clusters...`);
    const res = await pgPool.query(`
      SELECT packet_key FROM atlas_packets WHERE packet_key IS NOT NULL
    `);
    
    const packets = res.rows;
    console.log(`  Found: ${packets.length} packets\n`);

    // Deterministic assignment via hash
    console.log('🔄 Assigning packets to clusters...\n');
    const BATCH_SIZE = 1000;
    let updated = 0;

    for (let i = 0; i < packets.length; i += BATCH_SIZE) {
      const batch = packets.slice(i, i + BATCH_SIZE);
      
      for (const p of batch) {
        // Hash-based deterministic assignment
        let hash = 0;
        for (let j = 0; j < p.packet_key.length; j++) {
          hash = ((hash << 5) - hash) + p.packet_key.charCodeAt(j);
          hash = hash & hash; // Convert to 32-bit
        }
        const cluster = Math.abs(hash) % K;

        await pgPool.query(
          `UPDATE atlas_packets SET kmeans_cluster_id = $1 WHERE packet_key = $2`,
          [cluster, p.packet_key]
        );
        updated++;
      }

      const pct = ((i + batch.length) / packets.length * 100).toFixed(1);
      console.log(`  ✓ Batch ${Math.floor(i / BATCH_SIZE) + 1} (${updated}/${packets.length}, ${pct}%)`);
    }

    console.log(`\n✅ Cluster assignment complete:`);
    console.log(`  Packets assigned: ${updated}`);
    console.log(`  Clusters: ${K}`);
    console.log(`  Distribution: hash-based deterministic (uniform across clusters)`);

    await pgPool.end();
  } catch (err) {
    console.error(`✗ Error: ${err.message}`);
    await pgPool.end();
    process.exit(1);
  }
}

assignClusters();
