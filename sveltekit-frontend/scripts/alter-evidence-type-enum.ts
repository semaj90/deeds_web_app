/**
 * Alter evidence_type enum — adds missing values from BOTH Drizzle schema and DB.
 * Purely additive (ADD VALUE IF NOT EXISTS), no DROP.
 *
 * DB currently has: physical, digital, documentary, testimonial, demonstrative, real, circumstantial, hearsay, expert, scientific
 * Drizzle schema has: document, photo, video, audio, physical, digital, witness_statement, forensic
 * After: unified 16-value enum covering both legal classification and media types.
 *
 * Usage: npx tsx scripts/alter-evidence-type-enum.ts
 */

import pg from 'pg';
const { Pool } = pg;

const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';
const pool = new Pool({ connectionString: DATABASE_URL });

async function alterEnum() {
	console.log('[alter-enum] Connecting to:', DATABASE_URL.replace(/:[^@]+@/, ':****@'));

	// Values to add (missing from DB but needed by Drizzle schema)
	const missingFromDB = ['document', 'photo', 'video', 'audio', 'witness_statement', 'forensic'];

	// Values to add (missing from Drizzle schema but exist in DB — already there, but ensure consistency)
	// These are already in the DB, so ADD VALUE IF NOT EXISTS is a no-op for them
	const allValues = [
		...missingFromDB,
		'physical', 'digital', 'documentary', 'testimonial', 'demonstrative',
		'real', 'circumstantial', 'hearsay', 'expert', 'scientific'
	];

	// ALTER TYPE ADD VALUE must run outside a transaction in PostgreSQL
	for (const value of allValues) {
		try {
			await pool.query(`ALTER TYPE evidence_type ADD VALUE IF NOT EXISTS '${value}'`);
			console.log(`  + Added '${value}' to evidence_type enum`);
		} catch (err: any) {
			if (err.message?.includes('already exists')) {
				console.log(`  = '${value}' already exists (skipped)`);
			} else {
				console.error(`  ! Failed to add '${value}':`, err.message);
			}
		}
	}

	// Verify final enum values
	const result = await pool.query(`
		SELECT enumlabel FROM pg_enum
		WHERE enumtypid = (SELECT oid FROM pg_type WHERE typname = 'evidence_type')
		ORDER BY enumsortorder
	`);
	const values = result.rows.map((r: any) => r.enumlabel);
	console.log(`\n[alter-enum] Final evidence_type enum (${values.length} values):`);
	console.log('  ', values.join(', '));

	await pool.end();
}

alterEnum()
	.then(() => process.exit(0))
	.catch((err) => {
		console.error('[alter-enum] Failed:', err);
		process.exit(1);
	});
