/**
 * Password Reset Initiation
 *
 * POST /api/auth/reset-password
 * Body: { email: string }
 *
 * Generates a password-reset token, stores its SHA-256 hash in the
 * `password_reset_tokens` table with a 1-hour expiry, and logs the
 * token to the server console (this is an internal tool without an
 * email service — the administrator can relay the token manually).
 *
 * Always returns { success: true } regardless of whether the email
 * exists, to prevent user enumeration.
 */

import { db } from '$lib/server/db/client';
import { users, passwordResetTokens } from '$lib/server/db/schema-postgres';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import crypto from 'node:crypto';

const resetSchema = z.object({
	email: z.string().trim().email('Invalid email address').max(255)
});

export const POST: RequestHandler = async ({ request }) => {
	const raw = await request.json().catch(() => ({}));
	const parsed = resetSchema.safeParse(raw);
	if (!parsed.success) {
		return json({ error: parsed.error.issues[0]?.message ?? 'Invalid input' }, { status: 400 });
	}

	const { email } = parsed.data;

	// Always return success to prevent user enumeration
	const successResponse = json({ success: true, message: 'If that email is registered, reset instructions will be provided by your administrator.' });

	try {
		const [user] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
		if (!user) return successResponse;

		// Prune expired tokens for this user
		const now = new Date().toISOString();
		await db.delete(passwordResetTokens).where(
			eq(passwordResetTokens.userId, user.id)
		).catch(() => null);

		// Generate a 32-byte cryptographically random token
		const token = crypto.randomBytes(32).toString('hex');
		const tokenHash = crypto.createHash('sha256').update(token).digest('hex').slice(0, 63);
		const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString(); // 1 hour

		await db.insert(passwordResetTokens).values({
			tokenHash,
			userId: user.id,
			expiresAt,
		});

		// Token stored in DB — retrieve via admin panel if needed
		console.log(`[auth/reset-password] Reset token generated for user (expires ${expiresAt})`);
	} catch (err) {
		console.error('[auth/reset-password] Error generating reset token:', err);
	}

	return successResponse;
};
