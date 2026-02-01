/**
 * Database Health Check Utility
 * Validates actual PostgreSQL database connectivity
 */
// Assuming pool default export or similar from drizzle config or connection file
// We'll use the one from './connections.ts' for better reliability if available, but matching existing import style
import { appPool as pool } from './connections.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export async function validateDatabaseOnStartup(): Promise<boolean> {
	let client;
	try {
		// Get a client from the pool
        // @ts-ignore
		client = await pool.connect();

		// Run a simple query to verify connection
		const result = await client.query('SELECT NOW() as current_time, version() as pg_version');

		console.log('✅ Database health check passed');
		console.log(`🕐 PostgreSQL connected at: ${result.rows[0].current_time}`);
		console.log(`📊 Database version: ${result.rows[0].pg_version.split(',')[0]}`);

		// Check if essential tables exist
		const tableCheck = await client.query(`
			SELECT COUNT(*) as table_count
			FROM information_schema.tables
			WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
		`);

		console.log(`📋 Found ${tableCheck.rows[0].table_count} tables in database`);

		return true;
	} catch (error: any) {
		console.error('❌ Database health check failed: ', error.message);
		console.error('🔌 Please ensure PostgreSQL is running on localhost:5432');
		console.error('🔗 Connection string: postgresql://legal_admin:123456@localhost:5432/legal_ai_db');
		return false;
	} finally {
		// Always release the client back to the pool
		if (client) {
			client.release();
		}
	}
}

export default { validateDatabaseOnStartup };

