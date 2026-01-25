import { lucia, setSessionCookie } from '$lib/server/lucia';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions: PageServerLoad } from './$types';

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

        // Mock auth for Phase 99 testing using known seeded credentials
		if (username === '2B' && password === 'glorytomankind') {
            try {
                const userId = 'dev-admin-id';
                const session = await lucia.createSession(userId, {});
                setSessionCookie(cookies, session.id);
            } catch (e) {
                console.error('Login error:', e);
                return fail(500, { error: 'Authentication failed' });
            }
            throw redirect(302, '/');
		}

		return fail(400, { error: 'Invalid credentials' });
	},
    devLogin: async ({ cookies }) => {
        try {
            const userId = 'dev-admin-id';
            const session = await lucia.createSession(userId, {});
            setSessionCookie(cookies, session.id);
        } catch (e) {
            console.error('Dev Login error:', e);
            return fail(500, { error: 'Dev bypass failed' });
        }
        throw redirect(302, '/');
    }
};
