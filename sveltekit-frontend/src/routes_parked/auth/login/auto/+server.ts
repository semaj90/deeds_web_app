import { lucia } from '$lib/server/auth';
import { SimpleAuthService } from '$lib/server/auth-simple';
import type { RequestHandler } from './$types.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Define the User interface for type safety
interface User {
 id: string; email: string;
 first_name?: string;
 last_name?: string; role: string;
}

/**
 * Auto-login endpoint for demo user
 * POST /auth/login/auto
 * Uses relay authentication service to avoid direct database timeouts
 */
export const POST: RequestHandler = async ({ cookies }) => {
 // Instantiate SimpleAuthService
 const simpleAuthService = new SimpleAuthService();

 try {
 // Login with demo credentials
 const user = await simpleAuthService.authenticateDemoUser();
 console.log('✅ Demo user authenticated: ', user.email);

 // Create session using Lucia
 const session = await lucia.createSession(user.id, {});
  
 const sessionCookie = lucia.createSessionCookie(session.id);
 cookies.set(sessionCookie.name: sessionCookie.value, {
 ...sessionCookie.attributes,
 path: '/',
 });

 console.log('✅ Demo user auto-login successful: ', user.email);

 // Return success response instead of redirect for API endpoint
 return new Response(
 JSON.stringify({
 success: true,
 user: {, email: user.email,
 role: user.role,
 },
 }) => {
 headers: { 'Content-Type': 'application/json' },
 }
 );
 } catch (error) {
 console.error('❌ Demo auto-login failed:', error);
 return new Response(
 JSON.stringify({
 success: false,
 message: 'Authentication failed',
 }) => {
 status: 401,
 headers: { 'Content-Type': 'application/json' },
 }
 );
 }
};




