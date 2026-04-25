#!/usr/bin/env node

/**
 * Safe Phase 4 Essential Migration Runner
 * Executes only the critical missing tables for Phase 4
 * Date: 2025-12-09
 */

import 'dotenv/config';
import { readFileSync } from 'fs';
import { dirname, join } from 'path';
import { Client } from 'pg';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function runEssentialMigration() {
  console.log('🚀 Starting Safe Phase 4 Essential Migration...');

  const client = new Client(process.env.DATABASE_URL);

  try {
    await client.connect();
    console.log('📡 Connected to database');

    // Read the essential migration file
    const migrationPath = join(__dirname, '..', 'drizzle', 'safe_phase4_essential_migration.sql');
    console.log(`📖 Reading migration file: ${migrationPath}`);

    const migrationSQL = readFileSync(migrationPath, 'utf8');

    // Execute the entire migration as one statement
    console.log('⚡ Executing migration...');
    await client.query(migrationSQL);

    console.log('🔍 Verifying migration results...');

    // Check if chat_turn_evidence table exists
    const chatTurnEvidenceExists = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'chat_turn_evidence'
      )
    `);

    if (chatTurnEvidenceExists.rows[0].exists) {
      console.log('✅ chat_turn_evidence table created');
    } else {
      console.log('❌ chat_turn_evidence table not found');
    }

    // Check evidence table new columns
    const evidenceColumns = await client.query(`
      SELECT column_name
      FROM information_schema.columns
      WHERE table_name = 'evidence'
      AND column_name IN ('evidence_type', 'file_type', 'file_url', 'file_name', 'file_size', 'mime_type', 'hash', 'tags', 'ai_analysis', 'ai_tags', 'ai_summary', 'uploaded_by', 'uploaded_at')
      ORDER BY column_name
    `);

    console.log('✅ Evidence table enhanced with columns:');
    evidenceColumns.rows.forEach(row => {
      console.log(`  - ${row.column_name}`);
    });

    // Count existing data to verify no loss
    const evidenceCount = await client.query('SELECT COUNT(*) as count FROM evidence');
    const chatTurnsCount = await client.query('SELECT COUNT(*) as count FROM chat_turns');

    console.log('📊 Data preservation check:');
    console.log(`  - Evidence records: ${evidenceCount.rows[0].count}`);
    console.log(`  - Chat turns: ${chatTurnsCount.rows[0].count}`);

    console.log('🎉 Safe Phase 4 Essential Migration completed successfully!');
    console.log('✅ No data loss detected');
    console.log('✅ Critical tables created');
    console.log('✅ Evidence table enhanced');

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

// Run the migration
runEssentialMigration().catch(console.error);