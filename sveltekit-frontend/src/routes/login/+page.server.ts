import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { createUserSession, setSessionCookie, verifyPassword } from '$lib/server/lucia';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate } from 'sveltekit-superforms/server';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { eq, or } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { loginSchema } from './schema.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		throw redirect(302, '/');
	}
	return {
		form: await superValidate(zod(loginSchema))
	};
};

export const actions: Actions = {
	login: async ({ request, cookies }) => {
		const form = await superValidate(request, zod(loginSchema));
		if (!form.valid) {
			return fail(400, { form });
		}

		const { username, password } = form.data;

		try {
			// Look up user by email or name
			const [user] = await db
				.select()
				.from(users)
				.where(or(eq(users.email, username), eq(users.name, username)))
				.limit(1);

			if (!user) {
				return fail(400, { form, error: 'Invalid credentials' });
			}

			if (!user.isActive) {
				return fail(403, { form, error: 'Account is inactive' });
			}

			const validPassword = await verifyPassword(password, user.passwordHash);
			if (!validPassword) {
				return fail(400, { form, error: 'Invalid credentials' });
			}

			const session = await createUserSession(String(user.id));
			setSessionCookie(cookies, session.sessionId);
		} catch (e) {
			console.error('[Login] Error:', e);
			return fail(500, { form, error: 'Authentication failed — check database connection' });
		}
		throw redirect(302, '/');
	}
};
