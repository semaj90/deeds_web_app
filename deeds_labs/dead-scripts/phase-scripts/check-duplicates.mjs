/**
 * Phase 90: Check for Duplicate Emails
 * CRITICAL: Must pass before adding UNIQUE(email) constraint
 */

import * as dotenv from 'dotenv';
import pg from 'pg';

dotenv.config();

const { Pool } = pg;

const pool = new Pool({
	connectionString: process.env.DATABASE_URL
});

async function checkDuplicates() {
	console.log('\n🔍 Phase 90: Checking for duplicate emails...\n');

	try {
		// Check for duplicate emails in users table
		const result = await pool.query(`
			SELECT email, COUNT(*) AS count
			FROM users
			GROUP BY email
			HAVING COUNT(*) > 1
			ORDER BY count DESC
		`);

		if (result.rows.length === 0) {
			console.log('✅ No duplicate emails found - safe to add UNIQUE constraint');
			console.log('');
			process.exit(0);
		} else {
			console.log('❌ Found duplicate emails:\n');

			result.rows.forEach(row => {
				console.log(`  ${row.email}: ${row.count} occurrences`);
			});

			console.log('\n⚠️  MIGRATION BLOCKED: Fix duplicates before proceeding');
			console.log('');
			console.log('To fix manually:');
			console.log('  1. Connect to database: psql -d legal_ai_db');
			console.log('  2. For each duplicate, keep one and delete/merge others');
			console.log('  3. Re-run: npm run db:check-duplicates');
			console.log('');

			process.exit(1);
		}
	} catch (error) {
		console.error('❌ Error checking duplicates:', error);
		process.exit(1);
	} finally {
		await pool.end();
	}
}

checkDuplicates();
