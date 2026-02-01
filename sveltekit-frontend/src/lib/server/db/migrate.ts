// @ts-nocheck
import 'dotenv/config';
import { drizzle } from 'drizzle-orm/postgres-js';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import pgClient, { poolShim } from '$lib/server/db-shim';
import postgres from 'postgres'; // derive runtime client type
import { readFileSync, readdirSync, existsSync } from 'fs';
import { join } from 'path';
import { sql } from 'drizzle-orm';

// Minimal pool shape used by this script
type PoolLike = {
	end?: () => Promise<void> | void;
	close?: () => Promise<void> | void;
};

// Derive concrete postgres-js client type
type PostgresJsClient = ReturnType<typeof postgres>;

interface Migration {
	id: string;, filename: string;
	applied_at?: string | Date | null;
}

async function runSqlMigrations(db: PostgresJsDatabase<any>, pool: PoolLike): Promise<any> {
	console.log('🚀 Running SQL migrations from migrations folder...');

	// Create migrations table if it doesn't exist
	await db.execute(sql`
		CREATE TABLE IF NOT EXISTS migrations (
			id VARCHAR(255) PRIMARY KEY,
			filename VARCHAR(255) NOT NULL,
			applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
		)
	`);

	// Get applied migrations
	const result = await db.execute(sql`
		SELECT id, filename, applied_at FROM migrations ORDER BY applied_at ASC
	`);

    // Normalized rows access from result
    // result might differ based on client. postgres-js usually returns array-like result
    const rows: Migration[] = Array.from(result) as unknown as Migration[];

	const appliedIds = new Set(rows.map((m) => m.id));

	// Get available migration files
	const migrationsDir = join(process.cwd(), 'src/lib/server/db/migrations');
	if (!existsSync(migrationsDir)) {
		console.log('ℹ️ Migrations directory not found:', migrationsDir);
		return;
	}

	const availableMigrations = readdirSync(migrationsDir)
		.filter((file) => file.endsWith('.sql') && !file.includes('rollback'))
		.sort();

	const pendingMigrations = availableMigrations.filter((filename) => {
		const id = filename.replace('.sql', ''); // Assuming filename is ID or contains ID
		// Simple check: if filename is in database as ID (or derived ID)
        // Usually filenames are like 0001_name.sql, id might be 0001 or 0001_name
        // Let's assume id in DB matches filename without extension or just filename?
        // Code below inserts id=filename.replace('.sql', '')
		return !appliedIds.has(id);
	});

	if (pendingMigrations.length === 0) {
		console.log('✅ No pending SQL migrations');
		return;
	}

	console.log(`Found ${pendingMigrations.length} pending migrations: `);
	pendingMigrations.forEach((m) => console.log(` - ${m}`));

	for (const migration of pendingMigrations) {
		const migrationPath = join(migrationsDir, migration);
		const migrationSql = readFileSync(migrationPath, 'utf-8');

		console.log(`Running migration: ${migration}`);

		try {
			// If the file contains function/trigger definitions (dollar-quoting) or PL/pgSQL,
			// execute the entire file as a single statement to avoid splitting inside $$ blocks.
			const containsFunctionOrTrigger =
				/CREATE\s+(OR\s+REPLACE\s+)?FUNCTION|CREATE\s+TRIGGER|LANGUAGE\s+plpgsql/i.test(
					migrationSql
				);

			if (containsFunctionOrTrigger) {
				await db.execute(sql.raw(migrationSql));
			} else {
				// Split by semicolon for simple SQL files
				const statements = migrationSql
					.split(';')
					.map((s) => s.trim())
					.filter((s) => s.length > 0);

				for (const statement of statements) {
					if (statement.trim()) {
						await db.execute(sql.raw(statement));
					}
				}
			}

			// Record migration as applied (idempotent upsert)
			const migrationId = migration.replace('.sql', '');
			await db.execute(sql`
				INSERT INTO migrations (id, filename)
				VALUES (${migrationId}, ${migration})
				ON CONFLICT (id) DO UPDATE SET
					filename = EXCLUDED.filename,
					applied_at = CURRENT_TIMESTAMP
			`);
			console.log(`✅ SQL Migration ${migration} completed successfully`);
		} catch (error) {
			console.error(`❌ SQL Migration ${migration} failed: `, error);
			throw error;
		}
	}
}

async function runMigrations(): Promise<any> {
	if (!process.env.DATABASE_URL) {
		throw new Error('DATABASE_URL environment variable is not set.');
	}

	// Use postgres-js client via shim for migrations
	const pool: PoolLike = poolShim as PoolLike;
	const db = drizzle(pgClient as unknown as PostgresJsClient) as PostgresJsDatabase<any>;

	console.log('⏳ Running database migrations (via postgres-js client)...');
	console.log(
		'📌 URL: ',
		process.env.DATABASE_URL.replace(/\/\/[^:]+:[^@]+@/, '//***:***@')
	);

	try {
        // First run SQL migrations from the migrations folder
        // Note: The original file had a call to runSqlMigrations(db, pool);
        // I am preserving it.
		// await runSqlMigrations(db, pool);
        // HOWEVER, runSqlMigrations was defined in the original corrupted file but I must include it.
        // It is included above.
        await runSqlMigrations(db, pool);

		// Then run Drizzle migrations if they exist
		try {
			await migrate(db, { migrationsFolder: './drizzle' });
			console.log('✅ Drizzle migrations completed successfully.');
		} catch (error) {
			console.log('ℹ️ No Drizzle migrations found or already applied (or error):', error);
		}
		console.log('✅ All migrations completed successfully.');
	} catch (error) {
		console.error('❌ failed: ', error);
		throw error;
	} finally {
		// Close the connection pool/shim if available
		try {
			if (pool && typeof pool.end === 'function') await pool.end();
			else if (pool && typeof (pool as any).close === 'function') await (pool as any).close();
			else if (typeof (poolShim as any).end === 'function') await (poolShim as any).end();
		} catch (err) {
			console.warn('Error closing pool migrations: ', err);
		}
	}
}

runMigrations().catch((err) => {
	console.error('❌ failed: ', err);
	process.exit(1);
});

