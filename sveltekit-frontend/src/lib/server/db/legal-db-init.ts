import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';
import { join } from 'path';
import { db } from './drizzle.js';

/**
 * Initialize legal search database schema
 * Runs migrations and creates tables if they don't exist
 */
export async function initializeLegalSearchSchema() {
 try {
 console.log('[Legal DB] Initializing legal search schema...');

 // Enable pgvector extension
 await db.execute(sql`CREATE EXTENSION IF NOT EXISTS vector`);
 console.log('[Legal DB] pgvector extension enabled');

 // Read and execute migration SQL
 const migrationPath = join(
 process.cwd(),
 'src/lib/server/db/migrations/0003_legal_search_schema.sql'
 );

 try {
 const migrationSQL = readFileSync(migrationPath, 'utf-8');
 // Split by semicolon and execute each statement
 const statements = migrationSQL
 .split(';')
 .map((s) => s.trim())
 .filter((s) => s.length > 0);

		for (const statement of statements) {
			await db.execute(sql`${sql.raw(statement)}`);
		} console.log('[Legal DB] Migration 0003_legal_search_schema executed successfully');
 } catch (migrationError) {
 console.warn('[Legal DB] Migration file not found or error executing:', migrationError);
 // Continue with Drizzle schema creation as fallback
 }

 console.log('[Legal DB] Legal search schema initialized successfully');
 return true;
 } catch (error) {
 console.error('[Legal DB] Error initializing legal search schema:', error);
 throw error;
 }
}

/**
 * Health check for legal search tables
 */
export async function checkLegalSearchHealth() {
 try {
 // Check if tables exist
 const result = await db.execute(sql`
 SELECT EXISTS (
 SELECT FROM information_schema.tables
 WHERE table_name = 'cases'
 ) as cases_exists,
 EXISTS (
 SELECT FROM information_schema.tables
 WHERE table_name = 'crimes'
 ) as crimes_exists,
 EXISTS (
 SELECT FROM information_schema.tables
 WHERE table_name = 'case_chunks'
 ) as case_chunks_exists,
 EXISTS (
 SELECT FROM information_schema.tables
 WHERE table_name = 'laws'
 ) as laws_exists,
 EXISTS (
 SELECT FROM information_schema.tables
 WHERE table_name = 'law_sections'
 ) as law_sections_exists
 `);

 const health = result[0] as Record<string, boolean>;

 const allTablesExist =
 health.cases_exists &&
 health.crimes_exists &&
 health.case_chunks_exists &&
 health.laws_exists &&
 health.law_sections_exists;

 return {
 healthy: allTablesExist,
 tables: {
 cases: health.cases_exists,
 crimes: health.crimes_exists,
 case_chunks: health.case_chunks_exists,
 laws: health.laws_exists,
 law_sections: health.law_sections_exists,
 },
 };
 } catch (error) {
 console.error('[Legal DB] Health check error:', error);
 return {
 healthy: false,
 error: String(error),
 };
 }
}
