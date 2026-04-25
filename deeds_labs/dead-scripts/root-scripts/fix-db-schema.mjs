import dotenv from 'dotenv';
import postgres from 'postgres';

dotenv.config();

const sql = postgres('postgresql://postgres:postgres@localhost:5432/legal_ai_db');

async function main() {
  try {
    console.log('Dropping legacy columns from error_clusters...');

    await sql`ALTER TABLE error_clusters DROP COLUMN IF EXISTS kind`;
    await sql`ALTER TABLE error_clusters DROP COLUMN IF EXISTS route_paths`;
    await sql`ALTER TABLE error_clusters DROP COLUMN IF EXISTS radius`;

    console.log('✅ Successfully dropped legacy columns');
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sql.end();
  }
}main();