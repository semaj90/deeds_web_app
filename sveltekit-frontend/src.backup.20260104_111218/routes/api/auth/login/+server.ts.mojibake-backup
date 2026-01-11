/**
 * Login API
 * Lucia v3 email/password authentication
 */

import { json, type RequestHandler } from '@sveltejs/kit';
import { auth } from '$lib/server/auth/lucia';

interface LoginRequest {
  email: string;
  password: string;
}

export const POST: RequestHandler = async ({ request, locals }) => {
  try {
    const body = (await request.json()) as LoginRequest;

    if (!body.email || !body.password) {
      return json({ error: 'Email and password required' }, { status: 400 });
    }

    // Authenticate with Lucia
    const key = await auth.useKey('email', body.email, body.password);
    const session = await auth.createSession({
      userId: key.userId,
      attributes: {},
    });

    // Set session cookie
    locals.auth.setSession(session);

    return json({
      success: true,
      userId: key.userId,
    });
  } catch (error) {
    console.error('Login error:', error);

    if (error instanceof Error) {
      if (error.message.includes('AUTH_INVALID_KEY_ID')) {
        return json({ error: 'Invalid email or password' }, { status: 401 });
      }
      if (error.message.includes('AUTH_INVALID_PASSWORD')) {
        return json({ error: 'Invalid email or password' }, { status: 401 });
      }
    }

    return json({ error: 'Login failed' }, { status: 500 });
  }
};
