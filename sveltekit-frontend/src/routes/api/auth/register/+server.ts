/**
 * Register API - Lucia v3
 * User registration with email/password
 */

import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { formatErrorResponse, ERROR_CODES } from '$lib/server/errors.js';
import { createUserSession, hashPassword, setSessionCookie } from '$lib/server/lucia';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { z } from 'zod';

const registerSchema = z.object({
	email: z.string().email('Invalid email address'),
	password: z.string().min(8, 'Password must be at least 8 characters'),
	firstName: z.string().min(1, 'First name is required'),
	lastName: z.string().min(1, 'Last name is required')
});

export const POST: RequestHandler = async ({ request, cookies }) => {
	try {
		const body = await request.json();

		// Validate input
		const validation = registerSchema.safeParse(body);
		if (!validation.success) {
			return json(
				{ error: validation.error.issues[0].message },
				{ status: 400 }
			);
		}
		const { email, password, firstName, lastName } = validation.data;

		// Check if user already exists
		const [existingUser] = await db
			.select()
			.from(users)
			.where(eq(users.email, email))
			.limit(1);

		if (existingUser) {
			return json({ error: 'Email already registered', code: ERROR_CODES.EMAIL_TAKEN }, { status: 409 });
		}

		// Hash password
		const passwordHash = await hashPassword(password);

		// Create user
		const [newUser] = await db
			.insert(users)
			.values({
				email,
				passwordHash,
				firstName,
				lastName,
				role: 'prosecutor',
				isActive: true,
				createdAt: new Date().toISOString(),
				updatedAt: new Date().toISOString()
			})
			.returning();

		// Create session
		const session = await createUserSession(newUser.id);

		// Set session cookie
		setSessionCookie(cookies, session.sessionId);

		return json({
			success: true,
			userId: newUser.id,
			sessionId: session.sessionId,
			user: {
				id: newUser.id,
				email: newUser.email,
				firstName: newUser.firstName,
				lastName: newUser.lastName,
				role: newUser.role,
				avatarUrl: newUser.avatarUrl
			}
		}, { status: 201 });
	} catch (error) {
		console.error('[Auth] Registration error:', error);
		const formatted = formatErrorResponse(error);
		return json(formatted, { status: formatted.error.status });
	}
};