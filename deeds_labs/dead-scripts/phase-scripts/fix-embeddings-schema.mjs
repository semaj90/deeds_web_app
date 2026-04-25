import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  console.error('❌ DATABASE_URL not set');
  process.exit(1);
}

const sql = postgres(connectionString);

async function main() {
  console.log('🛠️ Fixing error_cluster_embeddings schema...');

  try {
    // Drop the table to force recreation with correct dimensions
    await sql`DROP TABLE IF EXISTS error_cluster_embeddings CASCADE`;
    console.log('✅ Dropped error_cluster_embeddings table');

    // We don't need to recreate it here; phase78-embed-clusters.mts will do it
    // but we can verify the vector extension exists
    await sql`CREATE EXTENSION IF NOT EXISTS vector`;
    console.log('✅ Verified vector extension');

  } catch (err) {
    console.error('❌ Error:', err);
  } finally {
    await sql.end();
  }
}

main();
