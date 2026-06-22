import pg from 'pg';

const DATABASE_URL = 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';

async function main() {
  const pool = new pg.Pool({ connectionString: DATABASE_URL });
  const { rows: pkts } = await pool.query(`
    SELECT source_ref, packet_key, feature_id, qdrant_point_id
    FROM atlas_packets
    WHERE source_ref ILIKE '%dialog%'
    LIMIT 20
  `);
  console.log("Postgres atlas_packets for dialog:");
  console.log(JSON.stringify(pkts, null, 2));

  const { rows: docs } = await pool.query(`
    SELECT source_ref, feature_id, qdrant_point_id
    FROM parent_atlas_documents
    WHERE source_ref ILIKE '%dialog%'
    LIMIT 20
  `);
  console.log("Postgres parent_atlas_documents for dialog:");
  console.log(JSON.stringify(docs, null, 2));

  await pool.end();
}

main().catch(console.error);
