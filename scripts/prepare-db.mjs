import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

function loadEnv() {
  const env = { ...process.env };
  for (const p of [
    path.join(ROOT, 'sveltekit-frontend', '.env.local'),
    path.join(ROOT, 'sveltekit-frontend', '.env'),
    path.join(ROOT, '.env.local'),
    path.join(ROOT, '.env'),
  ]) {
    if (fs.existsSync(p)) {
      for (const line of fs.readFileSync(p, 'utf8').split(/\r?\n/)) {
        const m = line.trim().match(/^([A-Z_][A-Z0-9_]*)=(.*)$/);
        if (m && !env[m[1]]) env[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    }
  }
  return env;
}

const env = loadEnv();
const DATABASE_URL = env.DATABASE_URL
  ?? `postgresql://${env.DB_USER ?? 'legal_admin'}:${env.DB_PASSWORD ?? '123456'}@${env.DB_HOST ?? '127.0.0.1'}:${env.DB_PORT ?? '5434'}/${env.DB_NAME ?? 'legal_ai_db'}`;

async function main() {
  console.log('══ Preparing Database: Backup and Column Additions ════════════════');
  console.log(`  Database: ${DATABASE_URL.replace(/:[^:@/]+@/, ':****@')}`);

  const pool = new pg.Pool({ connectionString: DATABASE_URL });

  try {
    // 1. Create backup table
    console.log('\n[Backup] Checking if backup table exists...');
    const backupCheck = await pool.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'public' AND table_name = 'atlas_packets_backup_20260612'
      ) AS exists;
    `);

    if (backupCheck.rows[0].exists) {
      console.log('  Backup table atlas_packets_backup_20260612 already exists. Dropping old backup...');
      await pool.query('DROP TABLE atlas_packets_backup_20260612;');
    }

    console.log('  Creating backup table...');
    await pool.query('CREATE TABLE atlas_packets_backup_20260612 AS SELECT * FROM atlas_packets;');
    
    const countRes = await pool.query('SELECT COUNT(*)::int AS count FROM atlas_packets_backup_20260612;');
    console.log(`  ✅ Backup created successfully with ${countRes.rows[0].count} rows.`);

    // 2. Add source_ref_key column to schema
    console.log('\n[Schema] Adding source_ref_key column if not exists...');
    await pool.query('ALTER TABLE atlas_packets ADD COLUMN IF NOT EXISTS source_ref_key TEXT;');
    
    console.log('  Creating index on source_ref_key if not exists...');
    await pool.query('CREATE INDEX IF NOT EXISTS idx_atlas_packets_source_ref_key ON atlas_packets(source_ref_key);');
    
    console.log('  ✅ Schema updated successfully.');
  } catch (err) {
    console.error('  ❌ Preparation failed:', err);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
