/**
 * Database Seed Script - Drizzle ORM 0.44
 * Seeds legal_ai_db with demo users + sessions table.
 *
 * Usage: npx tsx src/lib/server/db/seed.ts
 * Or:    npm run db:seed
 */

import bcrypt from 'bcryptjs';
import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema-postgres';

const { Pool } = pg;

const DATABASE_URL =
	process.env.DATABASE_URL ||
	'postgresql://legal_admin:123456@localhost:5434/legal_ai_db';

const pool = new Pool({ connectionString: DATABASE_URL });
const db = drizzle(pool, { schema });

const { users } = schema;

async function seed(): Promise<void> {
	console.log('[seed] Starting database seed...');
	console.log('[seed] Database:', DATABASE_URL.replace(/:[^@]+@/, ':****@'));

	try {
		// Ensure sessions table exists (Lucia v3 requirement)
		await pool.query(`
			CREATE TABLE IF NOT EXISTS sessions (
				id TEXT PRIMARY KEY NOT NULL,
				user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
				expires_at TIMESTAMPTZ NOT NULL
			);
			CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
		`);
		console.log('[seed] Sessions table ready.');

		// Hash passwords
		const demoHash = await bcrypt.hash('demo123', 12);
		const defaultHash = await bcrypt.hash('password123', 12);

		const seedUsers = [
			{
				email: 'demo@legal-ai.local',
				name: 'Demo User',
				firstName: 'Demo',
				lastName: 'User',
				role: 'admin' as const,
				passwordHash: demoHash,
				isActive: true
			},
			{
				email: 'prosecutor@legal.ai',
				name: 'John Prosecutor',
				firstName: 'John',
				lastName: 'Prosecutor',
				role: 'prosecutor' as const,
				passwordHash: defaultHash,
				isActive: true
			},
			{
				email: 'detective@legal.ai',
				name: 'Jane Detective',
				firstName: 'Jane',
				lastName: 'Detective',
				role: 'detective' as const,
				passwordHash: defaultHash,
				isActive: true
			},
			{
				email: 'admin@legal.ai',
				name: 'Admin User',
				firstName: 'Admin',
				lastName: 'User',
				role: 'admin' as const,
				passwordHash: defaultHash,
				isActive: true
			}
		];

		console.log('[seed] Upserting demo users...');
		let count = 0;

		for (const user of seedUsers) {
			const existing = await db
				.select()
				.from(users)
				.where(eq(users.email, user.email))
				.limit(1);

			if (existing.length === 0) {
				await db.insert(users).values({
					email: user.email,
					passwordHash: user.passwordHash,
					name: user.name,
					firstName: user.firstName,
					lastName: user.lastName,
					role: user.role,
					isActive: user.isActive
				});
				console.log(`  + Created: ${user.email}`);
			} else {
				await db
					.update(users)
					.set({
						passwordHash: user.passwordHash,
						firstName: user.firstName,
						lastName: user.lastName,
						name: user.name,
						role: user.role,
						isActive: user.isActive,
						updatedAt: new Date().toISOString()
					})
					.where(eq(users.email, user.email));
				console.log(`  ~ Refreshed: ${user.email}`);
			}
			count++;
		}

		console.log(`\n[seed] Done. ${count} users ready.`);
		console.log('');
		console.log('Login Credentials:');
		console.log('  demo@legal-ai.local  / demo123');
		console.log('  prosecutor@legal.ai  / password123');
		console.log('  detective@legal.ai   / password123');
		console.log('  admin@legal.ai       / password123');
	} catch (error) {
		console.error('[seed] Fatal error:', error);
		throw error;
	} finally {
		await pool.end();
		console.log('[seed] Pool closed.');
	}
}

seed()
	.then(() => process.exit(0))
	.catch(() => process.exit(1));

export { seed };
