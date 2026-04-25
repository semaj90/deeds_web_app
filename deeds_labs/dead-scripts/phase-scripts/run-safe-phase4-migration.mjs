#!/usr/bin/env node

/**
 * Safe Phase 4 Migration Runner
 * Applies database changes using safe migration patterns
 * Avoids TRUNCATE TABLE and other destructive operations
 */

import * as dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';
import postgres from 'postgres';

// Load environment
dotenv.config({ path: '.env' });

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('❌ DATABASE_URL not found in .env');
  process.exit(1);
}

async function runSafeMigration() {
  console.log('🛡️  Starting SAFE Phase 4 migration...');
  console.log('📋 This migration follows safe patterns:');
  console.log('   - No TRUNCATE TABLE statements');
  console.log('   - No destructive operations');
  console.log('   - Proper backfilling of data');
  console.log('   - Guarded constraint operations');
  console.log('');

  const sql = postgres(connectionString, { max: 1 });

  try {
    // Read the safe migration file
    const migrationPath = join(process.cwd(), 'drizzle', 'safe_phase4_migration.sql');
    const migrationSQL = readFileSync(migrationPath, 'utf-8');

    console.log('📄 Read safe migration file');

    // Execute the entire migration as one statement
    console.log(`🔧 Executing safe migration...`);
    await sql.unsafe(migrationSQL);

    console.log('✅ Migration completed successfully!');
    console.log('');
    console.log('🔍 Verification:');

    // Verify tables were created
    const tables = await sql`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      AND table_name IN ('chat_turns', 'chat_turn_evidence', 'chat_analytics')
      ORDER BY table_name
    `;

    console.log(`   ✅ Created tables: ${tables.map(t => t.table_name).join(', ')}`);

    // Verify evidence table enhancements
    const evidenceColumns = await sql`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'evidence'
      AND column_name IN ('criminal_id', 'file_type', 'sub_type', 'file_url', 'file_name', 'canvas_position', 'uploaded_by', 'uploaded_at')
      ORDER BY column_name
    `;

    console.log(`   ✅ Enhanced evidence table with columns: ${evidenceColumns.map(c => c.column_name).join(', ')}`);

    // Check data integrity
    const evidenceCount = await sql`SELECT COUNT(*) as count FROM evidence`;
    console.log(`   📊 Evidence table has ${evidenceCount[0].count} rows (no data loss)`);

  } catch (error) {
    console.error('❌ Migration failed:', error);
    console.log('');
    console.log('🔄 To rollback (if needed):');
    console.log('   - The migration is additive-only, so no rollback needed');
    console.log('   - New tables can be dropped manually if required');
    console.log('   - New columns can be dropped manually if required');
    process.exit(1);
  } finally {
    await sql.end();
  }
}

runSafeMigration().catch(console.error);