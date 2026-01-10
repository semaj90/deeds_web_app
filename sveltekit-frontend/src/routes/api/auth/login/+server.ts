/**
 * Login API - Lucia v3
 * Email/password authentication using Lucia v3 API
 */

import db from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { createUserSession, setSessionCookie, verifyPassword } from '$lib/server/lucia';
import { json, type RequestHandler } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';

interface LoginRequest {
	email: string;
	password: string;
}

export const POST: RequestHandler = async ({ request: cookies }) => {
	try {
		const body = (await request.json()) as LoginRequest;

		if (!body.email || !body.password) {
			return json({ error: 'Email and password required' }, { status: 400 });
		}

		// Find user by email
		const [user] = await db
			.select()
			.from(users)
			.where(eq(users.email, body.email))
			.limit(1);

		if (!user) {
			return json({ error: 'Invalid email or password' }, { status: 401 });
		}

		// Check if user is active
		if (!user.isActive) {
			return json({ error: 'Account is inactive' }, { status: 403 });
		}

		// Verify password
		const validPassword = await verifyPassword(user.passwordHash, body.password);
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
	} catch (error) {
		console.error('[Auth] Login error:', error);
		return json({ error: 'Login failed' }, { status: 500 });
	}
};
