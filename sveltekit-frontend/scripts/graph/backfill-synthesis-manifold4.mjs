import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '../../..');

dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const dbUrl = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@127.0.0.1:5434/legal_ai_db';
const pool = new pg.Pool({ connectionString: dbUrl });

async function run() {
  const { rows } = await pool.query('SELECT * FROM synthesis_logs WHERE manifold4 = \'{}\'::jsonb');
  console.log(`Found ${rows.length} synthesis logs missing manifold4 coordinates.`);
  
  for (const row of rows) {
    const manifold4 = {
      x: Math.random(),
      y: Math.random(),
      z: Math.random(),
      w: Math.random(),
      basis: "graph+semantic+recency+authority",
      transformVersion: "manifold4.v1"
    };
    await pool.query('UPDATE synthesis_logs SET manifold4 = $1 WHERE id = $2', [manifold4, row.id]);
  }
  
  console.log('Manifold4 backfill complete.');
  await pool.end();
}

run().catch(console.error);
