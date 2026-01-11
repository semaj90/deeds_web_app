import { redirect } from '@sveltejs/kit';
import type { LayoutServerLoad } from './$types.js';

/**
 * Phase 79: Protected (app) Layout with Graceful Fallback
 *
 * Strategy:
 * - Most routes require authentication
 * - Chat routes allow anonymous access for testing
 * - Non-intrusive prompts encourage login/register
 */
export const load: LayoutServerLoad = async ({ locals, url }) => {
	// Check if DEV_BYPASS_AUTH is enabled
	const devBypass = process.env.DEV_BYPASS_AUTH === 'true';

	// Phase 79: Allow anonymous access to chat routes
	const isChatRoute = url.pathname.startsWith('/chat');
	const allowAnonymous = isChatRoute || devBypass;

	if (!allowAnonymous && !locals.user) {
		// User is not authenticated, redirect to login with return URL
		const returnTo = url.pathname + url.search;
		throw redirect(302, `/login?redirect=${encodeURIComponent(returnTo)}`);
	}

	// User is authenticated, anonymous (chat only), or dev bypass is enabled
	return {
		user: locals.user || null,
		devBypass,
		isAuthenticated: !!locals.user,
		// Hint to frontend: show auth prompts for anonymous users
		shouldPromptAuth: !locals.user && isChatRoute
	};
};


