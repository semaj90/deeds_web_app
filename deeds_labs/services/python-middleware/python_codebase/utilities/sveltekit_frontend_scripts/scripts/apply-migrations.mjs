#!/usr/bin/env node
/**
 * Apply Drizzle migrations programmatically
 */

import { Client } from 'pg';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5432/legal_ai_db';

async function applyMigrations() {
  const client = new Client({ connectionString: DATABASE_URL });

  try {
    console.log('🔌 Connecting to PostgreSQL...');
    await client.connect();
    console.log('✅ Connected to database');

    // Apply migrations in order
    const migrations = [
      'drizzle/20251012_create_documents_table.sql',
      'drizzle/20251012_uuid_safe_documents_and_chunks_fixed.sql'
    ];

    for (const migrationFile of migrations) {
      const migrationPath = join(projectRoot, migrationFile);
      console.log(`\n📝 Applying migration: ${migrationFile}`);

      try {
        const sql = readFileSync(migrationPath, 'utf-8');
        await client.query(sql);
        console.log(`✅ Migration applied: ${migrationFile}`);
      } catch (error) {
        if (error.message && error.message.includes('already exists')) {
          console.log(`⚠️  Migration skipped (already applied): ${migrationFile}`);
        } else {
          console.error(`❌ Migration failed: ${migrationFile}`, error.message);
          throw error;
        }
      }
    }

    console.log('\n✅ All migrations applied successfully!');
  } catch (error) {
    console.error('\n❌ Migration error:', error);
    process.exit(1);
  } finally {
    await client.end();
  }
}

applyMigrations();
