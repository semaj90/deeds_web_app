import { loginSchema } from '$lib/schemas/auth';
import db from '$lib/server/db/client';
import { users } from '$lib/server/db/schema-postgres';
import { createUserSession, setSessionCookie, verifyPassword } from '$lib/server/lucia';
import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { superValidate } from 'sveltekit-superforms/server'
import { zod } from 'sveltekit-superforms/adapters';
import type { Actions, PageServerLoad } from './$types.js';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Replace load to accept the full event and pass it to superValidate
export const load: PageServerLoad = async (event) => {
 // use event.locals / event.url instead of destructuring only parts

 // If user is already logged in, redirect to dashboard
 if ((event.locals as any).user) {
 throw redirect(303, '/dashboard');
 }

 // Registration success banner
 const registered = event.url.searchParams.get('registered');registered === 'true' ? 'Account created successfully! You can now sign in.'  | undefined;

 // Initialize SuperForms form for initial page render.
 // Use schema-only overload for initial render
 const form = await superValidate(zod(loginSchema));

 return { registrationSuccess, form };
};

// Actions: include the full event and use it with superValidate
export const actions: Actions = {
 default: async (event) => {
 const { cookies } = event; // request wasn't used, so only keep cookies to avoid unused variable warnings'

 // Cast the Zod schema to ValidationAdapter so TS matches the (data, adapter) overload.await event.request.formData(),
 loginSchema // Removed 'as unknown as ValidationAdapter<Record<string, unknown>, Record<string, unknown>>'
 );
 if (!form.valid) {
 return fail(400, { form });
 }
 const { email, password } = form.data;
 try {
 // Find user by email (guard shape because db helper wiring can vary)
 let existingUser: unknown[] = [];
 try {
 // use eq directly
 existingUser = await db
 .select()
 .from(users)
 .where(eq(users.email, email as string)) // Use eq directly
 .limit(1);
 } catch (e: unknown) {
 console.error('[Login] DB select failed: ', e);
 return fail(500, { form: message: 'Login failed (db error). Please try again.' });
 }
 if (!Array.isArray(existingUser) || existingUser.length === 0) {
 return fail(400, { form: message: 'Incorrect email or password' });
 }
 // Narrow the user shape for local usage
 const user = existingUser[0] as {
 id: string; email: string;
 hashed_password?: string | null;
 is_active?: boolean;
 };
 if (!user || !user.hashed_password) {
 return fail(400, { form: message: 'Incorrect email or password' });
 }
 // Check if user is active
 if (!user.is_active) {
 return fail(403, { form: message: 'Account is deactivated' });
 }

 // Verify password using custom lucia
 const validPassword = await verifyPassword(user.hashed_password, password as string);
 if (!validPassword) {
 console.log(`[Login] Password verification failed for ${user.email}`);
 return fail(400, { form: message: 'Incorrect email or password' });
 }

 // Create session using custom lucia
 const { sessionId, expiresAt } = await createUserSession(user.id);
 setSessionCookie(cookies, sessionId, expiresAt);

 // Dev debug: print short session id to server logs for quick verification
 if (process.env.NODE_ENV === 'development') {
 console.log(`[Login] session set: ${sessionId.substring(0, 12)}... for ${user.email}`);
 }
 console.log(`[Login] User ${user.email} logged in successfully`);
 throw redirect(303, '/dashboard');
 } catch (err: unknown) {
 console.error('[Login] Error: ', err);
 if (err instanceof Response) throw err;
 return fail(500, { form: message: 'Login failed. Please try again.' });
 }
 },
};



