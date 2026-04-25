import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

const sql = postgres('postgresql://postgres:postgres@127.0.0.1:5432/legal_ai_db');

async function fixClustersSchema() {
  console.log('🔧 Fixing error_clusters schema...');

  try {
    // Add kind column
    await sql`ALTER TABLE error_clusters ADD COLUMN IF NOT EXISTS kind TEXT NOT NULL DEFAULT 'typing'`;
    console.log('✅ Added kind column');

  } catch (error) {
    console.error('❌ Error fixing schema:', error);
  } finally {
    await sql.end();
  }
}

fixClustersSchema();
