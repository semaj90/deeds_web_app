import pg from 'pg';
import neo4j from 'neo4j-driver';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:legal_admin_password@localhost:5434/legal_ai_db' });
const driver = neo4j.driver('bolt://localhost:7687', neo4j.auth.basic('neo4j', 'neo4j123'));

async function main() {
  // Step 1: fetch source_ref → packet_key + pageRankScore from Postgres
  const { rows } = await pool.query(`
    SELECT source_ref, packet_key FROM atlas_packets
    WHERE source_ref IS NOT NULL AND packet_key IS NOT NULL
    LIMIT 60000
  `);
  console.log(`Fetched ${rows.length} source_ref → packet_key mappings from Postgres`);

  // Step 2: batch UNWIND into Neo4j to set packet_key on nodes
  const session = driver.session();
  const BATCH = 500;
  let updated = 0;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH).map(r => ({ source_ref: r.source_ref, packet_key: r.packet_key }));
    const result = await session.run(
      `UNWIND $batch AS row
       MATCH (n {source_ref: row.source_ref})
       SET n.packet_key = row.packet_key
       RETURN count(n) as cnt`,
      { batch }
    );
    const cnt = result.records[0]?.get('cnt')?.toNumber() ?? 0;
    updated += cnt;
    if ((i / BATCH) % 10 === 0) process.stdout.write(`  Neo4j: ${updated} nodes updated...\r`);
  }
  console.log(`\n✅ Set packet_key on ${updated} Neo4j nodes`);

  // Step 3: sync pageRankScore → atlas_packets.page_rank_score
  const prResult = await session.run(`
    MATCH (n) WHERE n.pageRankScore IS NOT NULL AND n.packet_key IS NOT NULL
    RETURN n.packet_key as packet_key, n.pageRankScore as score
  `);
  console.log(`Syncing ${prResult.records.length} PageRank scores → Postgres`);
  
  let synced = 0;
  const client = await pool.connect();
  try {
    for (const record of prResult.records) {
      const packet_key = record.get('packet_key');
      const score = parseFloat(record.get('score'));
      await client.query(
        `UPDATE atlas_packets SET page_rank_score = $2, updated_at = NOW() WHERE packet_key = $1`,
        [packet_key, score]
      );
      synced++;
    }
  } finally {
    client.release();
  }
  console.log(`✅ Synced ${synced} PageRank scores to Postgres`);

  await session.close();
  await driver.close();
  await pool.end();
}

main().catch(e => { console.error(e); process.exit(1); });
