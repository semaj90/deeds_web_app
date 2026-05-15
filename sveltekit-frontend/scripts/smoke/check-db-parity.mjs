import pg from 'pg';
const { Pool } = pg;
import dotenv from 'dotenv';
import { join } from 'path';

dotenv.config({ path: '../.env' });

async function ensureTable() {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    console.log("🛠️ Ensuring 'uploaded_files' table exists...");
    await pool.query(`
      CREATE TABLE IF NOT EXISTS uploaded_files (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        original_name text NOT NULL,
        object_key text NOT NULL UNIQUE,
        bucket text NOT NULL,
        mime_type text,
        size_bytes integer NOT NULL,
        status text NOT NULL DEFAULT 'uploaded',
        metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
        created_at timestamp with time zone NOT NULL DEFAULT now(),
        updated_at timestamp with time zone NOT NULL DEFAULT now()
      )
    `);

    // Verify column parity
    const res = await pool.query(`
      SELECT column_name, data_type 
      FROM information_schema.columns 
      WHERE table_name = 'uploaded_files'
      ORDER BY column_name
    `);
    
    console.log("✅ Table 'uploaded_files' parity check:");
    const expectedColumns = [
      'bucket', 'created_at', 'id', 'metadata', 'mime_type', 
      'object_key', 'original_name', 'size_bytes', 'status', 'updated_at'
    ];
    
    const actualColumns = res.rows.map(r => r.column_name).sort();
    const missing = expectedColumns.filter(c => !actualColumns.includes(c));
    
    if (missing.length === 0) {
      console.log("   - All 10 expected columns are present.");
    } else {
      console.error(`   - ❌ MISSING COLUMNS: ${missing.join(', ')}`);
    }
    
  } catch (err) {
    console.error("💥 DB Parity audit failed:", err.message);
  } finally {
    await pool.end();
  }
}

ensureTable();
