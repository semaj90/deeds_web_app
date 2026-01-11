import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
 const route = url.searchParams.get('route');
 if (!route) {
 return json({ error: 'Missing "route"' }, { status: 400 });
 }

 // TODO: hook into phase82_upgrade table later
 return json({
 status: 'not_started',
 filesUpgraded: 0,
 totalFiles: 0,
 lastRun: null,
 });
};
