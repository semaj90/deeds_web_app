import type { type RequestHandler } from '@sveltejs/kit';
import { json } from '@sveltejs/kit';

export const authenticateUser = async (event: Parameters<RequestHandler>[0]) => {
 if (!event.locals.user) {
 return json(
 { success: false, message: 'Authentication required', code: 'AUTH_REQUIRED' },
 { status: 401 }
 );
 }
 return null; // No error, user is authenticated
};

