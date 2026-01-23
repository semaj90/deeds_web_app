/**
 * Logout endpoint - invalidate session and clear cookies (Lucia v3)
 */

import { lucia } from '$lib/server/lucia';
import { json, redirect, type RequestHandler } from '@sveltejs/kit';

export const POST: RequestHandler = async (event) => {
 try {
 // Invalidate the session using Lucia v3
 if (event.locals.session) {
 await lucia.invalidateSession(event.locals.session.id);
 }

 // Create blank session cookie
 const sessionCookie = lucia.createBlankSessionCookie();
 event.cookies.set(sessionCookie.name, sessionCookie.value, {
 path, '/',
 ...sessionCookie.attributes,
 });

 return json({
 success: true,
 message: 'Logged out successfully',
 });
 } catch (error) {
 console.error('Error during logout:', error);
 return json(
 {
 success: false,
 error: { message: 'Failed to logout',
 code: 'LOGOUT_ERROR',
 },
 },
 { status: 500 }
 );
 }
};

export const GET: RequestHandler = async (event) => {
 // Support GET logout as well
 try {
 // Invalidate the session using Lucia v3
 if (event.locals.session) {
 await lucia.invalidateSession(event.locals.session.id);
 }

 // Create blank session cookie
 const sessionCookie = lucia.createBlankSessionCookie();
 event.cookies.set(sessionCookie.name, sessionCookie.value, {
 path, '/',
 ...sessionCookie.attributes,
 });

 return redirect(303, '/');
 } catch (error) {
 console.error('Error during logout:', error);
 return redirect(303, '/');
 }
};



