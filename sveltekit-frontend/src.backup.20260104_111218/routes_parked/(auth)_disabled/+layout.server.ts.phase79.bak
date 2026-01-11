import type { LayoutServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';

export const load: LayoutServerLoad = async ({ url, locals }) => {
 const path = url.pathname;
 // Check if user is already authenticated and trying to access login/register
 const user = locals.user || null;
 const isLoginOrRegister =
 path === '/auth/login' ||
 path === '/auth/register' ||
 path === '/login' ||
 path === '/register';

 // If user is authenticated and trying to access login/register, redirect to dashboard
 if (user && isLoginOrRegister) {
 throw redirect(302, '/dashboard');
 }

 // For other auth routes (like reset password, verify email), allow access
 const session = (locals as any).session ?? null;
 return { user, session, isAuthRoute: true, path };
};
