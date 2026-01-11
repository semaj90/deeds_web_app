/**
 * Logout Handler - Destroys session and clears auth cookies
 * POST /logout
 *
 * Invalidates the current session and redirects to home
 */

import type { auth } from '$lib/server/auth';
import { redirect } from '@sveltejs/kit';

export const POST = async (event) => {
 const sessionId = event.cookies.get('auth_session');

 if (sessionId) {
 try {
 // Invalidate the session
 const { session } = await auth.validateSession(sessionId);
 if (session) {
 await auth.invalidateSession(session.id);
 }

 // Clear the auth cookie
 event.cookies.delete('auth_session', {
 path: '/',
 httpOnly: true,
 secure: process.env.NODE_ENV === 'production',
 sameSite: 'lax',
 });
 } catch (error) {
 console.error('Error during logout: ', error);
 }
 }

 // Redirect to home
 throw redirect(302, '/');
};
