import { db } from '$lib/server/db/client';
import { users } from '$lib/server/db/schema';
import { createUserSession, hashPassword, setSessionCookie } from '$lib/server/lucia';
import { fail, redirect } from '@sveltejs/kit';
import { superValidate, message } from 'sveltekit-superforms/server';
import { zod4 as zod } from 'sveltekit-superforms/adapters';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { registerSchema } from './schema.js';

/**
 * Register page server. Mirrors the /login pattern:
 *   - load() returns an empty superValidate form for SSR + hydration
 *   - actions.default validates → uniqueness check → hash → insert → session
 *
 * The prior implementation used XState `authMachine` + a client-side fetch
 * to an undocumented endpoint. This refactor uses the SvelteKit form action
 * + Zod adapter pattern that the other 10 forms in the app use.
 */
export const load: PageServerLoad = async ({ locals }) => {
	// Already authenticated → redirect to dashboard
	if (locals.user) {
		throw redirect(302, '/dashboard');
	}
	return {
		form: await superValidate(zod(registerSchema)),
	};
};

export const actions: Actions = {
	default: async ({ request, cookies }) => {
		const form = await superValidate(request, zod(registerSchema));
		if (!form.valid) {
			return fail(400, { form });
		}

		const { firstName, lastName, email, password } = form.data;
		const normalizedEmail = email.toLowerCase();

		try {
			// 1. Uniqueness check — email is the unique key per schema-postgres.ts
			const [existing] = await db
				.select({ id: users.id })
				.from(users)
				.where(eq(users.email, normalizedEmail))
				.limit(1);

			if (existing) {
				return message(form, 'An account with that email already exists', { status: 409 });
			}

			// 2. Hash + insert. Default role 'prosecutor' per schema enum.
			const passwordHash = await hashPassword(password);
			const [created] = await db
				.insert(users)
				.values({
					email:        normalizedEmail,
					passwordHash,
					firstName,
					lastName,
					name:                  `${firstName} ${lastName}`.trim(),
					role:                  'prosecutor',
					isActive:              true,
					hasCompletedOnboarding: false,
					onboardingStep:        0,
				})
				.returning({ id: users.id });

			if (!created) {
				return message(form, 'Account creation failed — please try again', { status: 500 });
			}

			// 3. Session + cookie. users.id is serial integer; lucia expects string.
			const session = await createUserSession(String(created.id));
			setSessionCookie(cookies, session.sessionId);
		} catch (err) {
			console.error('[Register] Error:', err);
			return message(form, 'Registration failed — check database connection', {
				status: 500,
			});
		}

		// Successful registration → onboarding flow at /dashboard
		throw redirect(302, '/dashboard');
	},
};
