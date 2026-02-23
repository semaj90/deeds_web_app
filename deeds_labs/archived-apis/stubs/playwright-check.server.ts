import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

type Body = { route, string };

export const POST: RequestHandler = async ({ request }) => {
 const body = (await request.json().catch(() => ({}))) as Partial<Body>;
 if (!body.route) {
 return json({ error: 'Missing "route"' }, { status: 400 });
 }

 // TODO: trigger your MCP / Playwright runner here
 console.log('[phase78] playwright-check requested for', body.route);

 return json({
 ok: true,
 route: body.route,
 status: 'queued',
 });
};


