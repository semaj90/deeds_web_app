import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { createUserSession, setSessionCookie, verifyPassword } from '$lib/server/lucia';
import { fail, redirect } from '@sveltejs/kit';
import { eq, or } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(302, '/');
	}
	return {};
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const formData = await request.formData();
		const username = formData.get('username');
		const password = formData.get('password');

		if (
			typeof username !== 'string' ||
			username.length < 1 ||
			typeof password !== 'string' ||
			password.length < 1
		) {
			return fail(400, { error: 'Invalid input' });
		}

		try {
			// Look up user by email or name
			const [user] = await db
				.select()
				.from(users)
				.where(or(eq(users.email, username), eq(users.name, username)))
				.limit(1);

			if (!user) {
				return fail(400, { error: 'Invalid credentials' });
			}

			if (!user.isActive) {
				return fail(403, { error: 'Account is inactive' });
			}

			const validPassword = await verifyPassword(password, user.passwordHash);
			if (!validPassword) {
				return fail(400, { error: 'Invalid credentials' });
			}

			const session = await createUserSession(user.id);
			setSessionCookie(cookies, session.sessionId);
		} catch (e) {
			console.error('[Login] Error:', e);
			return fail(500, { error: 'Authentication failed — check database connection' });
		}
		throw redirect(302, '/');
	}
};
