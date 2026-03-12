/**
 * Login API - Lucia v3
 * Email/password authentication using Lucia v3 API
 */

import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { createUserSession, setSessionCookie, verifyPassword } from '$lib/server/lucia';
import { json, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const loginSchema = z.object({
	email: z.string().trim().min(1, 'Email is required').max(255).email('Invalid email'),
	password: z.string().min(1, 'Password is required').max(255)
});

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const raw = await request.json();
		const parsed = loginSchema.safeParse(raw);
		if (!parsed.success) {
			return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
		}
		const { email, password } = parsed.data;

		// Find user by email
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		if (!user) {
			return json({ error: 'Invalid email or password' }, { status: 401 });
		}

		// Check if user is active
		if (!user.isActive) {
			return json({ error: 'Account is inactive' }, { status: 403 });
		}

		// Verify password (bcrypt.compare expects plaintext first, then hash)
		const validPassword = await verifyPassword(body.password, user.passwordHash);
		if (!validPassword) {
			return json({ error: 'Invalid email or password' }, { status: 401 });
		}

		// Create session using Lucia v3
		const session = await createUserSession(user.id);

		// Set session cookie
		setSessionCookie(cookies, session.sessionId);

		return json({
			success: true,
			userId: user.id,
			sessionId: session.sessionId,
			user: {
				id: user.id,
				email: user.email,
				firstName: user.firstName,
				lastName: user.lastName,
				role: user.role,
				avatarUrl: user.avatarUrl
			}
		});
	} catch (err) {
		console.error('[Auth] Login error:', err instanceof Error ? err.message : String(err));
		return json({ error: 'Login failed — please try again later' }, { status: 500 });
	}
};