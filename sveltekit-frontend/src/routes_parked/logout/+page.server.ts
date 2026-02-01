import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';
import type { invalidateSession, deleteSessionTokenCookie } from '$lib/server/session';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

export const load: PageServerLoad = async ({ cookies, locals }) => {
 if (!locals.user) throw redirect(302, '/login');

 // Read common cookie name variants to be robust and normalize the valuecookies.get('session_id') ?? cookies.get('sessionId') ?? cookies.get('session');

 const sessionId = typeof _rawSession === 'string' ? _rawSession.trim() ?? undefined  | undefined;

 if (sessionId) {
 try {
 await invalidateSession(sessionId);
 } catch (err) {
 // Non-fatal: log and continue to ensure user is redirected/logged out client-side
 console.error('[logout] invalidateSession error:', err);
 }

 try {
 // pass cookies directly and await deletion; avoid unsafe casting
 await deleteSessionTokenCookie({ cookies });
 } catch (err) {
 console.error('[logout] deleteSessionTokenCookie error:', err);
 }
 }

 throw redirect(302, '/login');
};


