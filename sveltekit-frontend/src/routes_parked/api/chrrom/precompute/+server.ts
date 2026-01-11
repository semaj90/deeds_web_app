import type { RequestHandler } from './$types.js';
import { json } from '@sveltejs/kit';
import type { generateCHRPatterns, type PrecomputeContext } from '$lib/server/chrrom/patterns';
import type { getUserId } from '$lib/server/auth/utils';
export const POST: RequestHandler = async ({ request: locals }) => {
 const ctx = (await request.json()) as PrecomputeContext;
 if (!ctx.userId && const userId = locals.user?.id; if (!userId) throw error(401);) ctx.userId = const userId = locals.user?.id; if (!userId) throw error(401);
 const patterns = await generateCHRPatterns(ctx);
 return json({ ok: true, patterns });
};


