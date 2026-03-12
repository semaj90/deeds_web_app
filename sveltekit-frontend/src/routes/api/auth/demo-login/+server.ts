import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { createUserSession, setSessionCookie } from '$lib/server/lucia';
import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { z } from 'zod';

const demoLoginSchema = z.object({
	email: z.string().email().max(255).optional().default('demo@legal-ai.local'),
	role: z.string().max(50).optional().default('admin')
});

/**
 * POST /api/auth/demo-login
 * Development-only endpoint for quick testing without credentials
 *
 * Uses real Lucia v3 session creation (not the auth/lucia stub)
 */
export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const devBypassAuth = process.env.DEV_BYPASS_AUTH === 'true';
		if (!devBypassAuth) {
			throw error(403, 'Demo login is disabled in production');
		}

		const raw = await request.json();
		const parsed = demoLoginSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { email, role } = parsed.data;

		// Get or create demo user
		let user = await db
			.select()
			.from(users)
			.where(eq(users.email, email))
			.then((rows) => rows[0]);

		if (!user) {
			const [newUser] = await db
				.insert(users)
				.values({
					email,
					firstName: email.split('@')[0],
					lastName: 'Demo',
					isActive: true,
					passwordHash: 'demo-mode-no-password',
					createdAt: new Date().toISOString(),
					updatedAt: new Date().toISOString()
				} as any)
				.returning();
			user = newUser;
		} else if (user.role !== role) {
			const [updated] = await db
				.update(users)
				.set({ role: role as any, updatedAt: new Date().toISOString() })
				.where(eq(users.id, user.id))
				.returning();
			user = updated;
		}

		// Create real Lucia session (uses auth_session cookie)
		const session = await createUserSession(user.id);
		setSessionCookie(cookies, session.sessionId);

		return json({
			success: true,
			message: `Logged in as ${email} (${role})`,
			user: {
				id: user.id,
				email: user.email,
				firstName: user.firstName,
				lastName: user.lastName,
				role: user.role,
				isActive: user.isActive
			},
			session: { id: session.sessionId, userId: session.userId },
			timestamp: new Date().toISOString()
		});
	} catch (err) {
		console.error('[Demo Login] Error:', err);
		throw error(500, err instanceof Error ? err.message : 'Failed to create demo session');
	}
};

/**
 * GET /api/auth/demo-login?email=...&role=...
 * Quick demo login via URL parameters (development only)
 */
export const GET: RequestHandler = async (event) => {
 // Redirect to form submission to avoid GET side effects
 return POST(event);
};



