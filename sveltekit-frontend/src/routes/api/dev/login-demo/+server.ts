/**
 * DEV-ONLY Login Endpoint
 * POST /api/dev/login-demo
 *
 * Logs in as the seeded demo user for Playwright testing.
 * Only enabled when DEV_BYPASS_AUTH=true
 *
 * Usage:
 *   POST /api/dev/login-demo
 *   Returns: { success: true, user: { email, name, role } }
 */

import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema-postgres';
import { eq } from 'drizzle-orm';
import { auth } from '$lib/server/auth';

export const POST: RequestHandler = async ({ cookies }) => {
	// Only allow in development mode
	if (process.env.DEV_BYPASS_AUTH !== 'true') {
		throw error(403, 'This endpoint is only available in development mode');
	}

	try {
		// Find the demo user
		const [demoUser] = await db
			.select()
			.from(users)
			.where(eq(users.email, 'demo@legal-ai.local'))
			.limit(1);

		if (!demoUser) {
			throw error(404, 'Demo user not found. Run db:seed first.');
		}

		// Create session using Lucia
		const session = await auth.createSession(demoUser.id, {});
		const sessionCookie = auth.createSessionCookie(session.id);

		// Set the session cookie
		cookies.set(sessionCookie.name, sessionCookie.value, {
			path: '.',
			...sessionCookie.attributes
		});

		console.log(`[dev-login] Created session for demo@legal-ai.local (${demoUser.id})`);

		return json({
			success: true,
			user: {
				id: demoUser.id,
				email: demoUser.email,
				name: demoUser.name,
				role: demoUser.role,
			},
		});
	} catch (e) {
		console.error('[dev-login] Error:', e);
		throw error(500, 'Failed to create demo session');
	}
};