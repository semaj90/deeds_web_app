// Database connection management with role separation
import pkg from 'pg';
const { Pool } = pkg;

// Environment configuration
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * 🔒 Runtime App Connection (legal_admin - limited privileges)
 * Use this for all normal app operations: queries, inserts, updates
 */
const appConnectionString = process.env?.DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

/**
 * 👑 Admin Connection (postgres - superuser)
 * Use this only for migrations, extensions, and administrative tasks
 */
const adminConnectionString = process.env?.ADMIN_DATABASE_URL || (process.env?.MIGRATION_DATABASE_URL ?? 'postgresql://legal_admin:123456@localhost:5434/legal_ai_db');

// App connection pool (for normal operations)
export const appPool = isDevelopment
	? new Pool({
			connectionString: appConnectionString,
			max: 5, // Smaller pool for development
			idleTimeoutMillis: 30000,
			connectionTimeoutMillis: 10000
	  })
	: new Pool({
			connectionString: appConnectionString,
			max: 20,
			idleTimeoutMillis: 60000,
			connectionTimeoutMillis: 5000
	  });

// Admin connection pool (for privileged operations)
export const adminPool = new Pool({
	connectionString: adminConnectionString,
	max: 2, // Keep admin pool small
	idleTimeoutMillis: 10000 // Disconnect quickly when unused
});

export async function testAdminConnection(): Promise<boolean> {
	try {
        // @ts-ignore
		const client = await adminPool.connect();
		await client.query('SELECT 1');
		client.release();
		return true;
	} catch (error) {
		console.error('Admin connection failed: ', error);
		return false;
	}
}

export async function ensureExtensions(): Promise<void> {
	try {
        // @ts-ignore
		const client = await adminPool.connect();
		// Enable required extensions with superuser privileges
		await client.query('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');
		await client.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
		await client.query('CREATE EXTENSION IF NOT EXISTS "vector"');
		console.log('✅ PostgreSQL extensions ensured');
		client.release();
	} catch (error) {
		console.error('Failed to ensure extensions: ', error);
		throw error;
	}
}

// Graceful shutdown
if (typeof process !== 'undefined') {
    process.on('SIGTERM', async () => {
        console.log('Closing database pools...');
        await Promise.all([appPool.end(), adminPool.end()]);
    });
    process.on('SIGINT', async () => {
        console.log('Closing database pools...');
        await Promise.all([appPool.end(), adminPool.end()]);
        process.exit(0);
    });
}

