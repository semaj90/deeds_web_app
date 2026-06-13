import pg from 'pg';

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db'
});

async function run() {
  console.log('=== Querying a packet to verify metadata retrieval ===');
  const res = await pool.query(`
    SELECT packet_id, source_ref, metadata
    FROM atlas_packets
    WHERE metadata->>'hash' IS NOT NULL
    LIMIT 1;
  `);

  if (res.rows.length === 0) {
    console.error('❌ No packets with metadata found.');
  } else {
    const row = res.rows[0];
    console.log('✅ Found packet with metadata:');
    console.log(JSON.stringify(row, null, 2));
  }

  await pool.end();
}

run().catch(console.error);
