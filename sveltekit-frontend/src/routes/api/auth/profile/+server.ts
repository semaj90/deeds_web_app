import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema-postgres.js';
import { eq } from 'drizzle-orm';

const profileUpdateSchema = z.object({
	firstName: z.string().max(255).optional(),
	lastName: z.string().max(255).optional(),
	email: z.string().email().max(255).optional(),
	avatarUrl: z.string().url().max(2048).nullable().optional()
});

/** PATCH /api/auth/profile — Update authenticated user's profile */
export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		return json({ message: 'Unauthorized' }, { status: 401 });
	}

	try {
		const raw = await request.json();
		const parsed = profileUpdateSchema.safeParse(raw);
		if (!parsed.success) {
			return json(
				{ message: parsed.error.issues[0]?.message ?? 'Invalid input' },
				{ status: 400 }
			);
		}

		const updates = parsed.data;
		if (Object.keys(updates).length === 0) {
			return json({ message: 'No fields to update' }, { status: 400 });
		}

		const [updated] = await db
			.update(users)
			.set({
				...(updates.firstName !== undefined && { firstName: updates.firstName }),
				...(updates.lastName !== undefined && { lastName: updates.lastName }),
				...(updates.email !== undefined && { email: updates.email }),
				...(updates.avatarUrl !== undefined && { avatarUrl: updates.avatarUrl }),
				updatedAt: new Date().toISOString()
			})
			.where(eq(users.id, Number(locals.user.id)))
			.returning({
				id: users.id,
				email: users.email,
				firstName: users.firstName,
				lastName: users.lastName,
				role: users.role,
				avatarUrl: users.avatarUrl
			});

		if (!updated) {
			return json({ message: 'User not found' }, { status: 404 });
		}

		return json(updated);
	} catch (err) {
		console.error('[/api/auth/profile] PATCH error:', err);
		return json({ message: 'Failed to update profile' }, { status: 500 });
	}
};