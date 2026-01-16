/**
 * SvelteKit proxy route for /api/search
 *
 * Forwards POST requests to backend /api/search endpoint
 * Attaches user_id from session/locals if available
 */

import type { RequestHandler } from './$types.js';

const BACKEND_BASE = process.env.BACKEND_BASE ?? 'http://localhost:8000';

export const POST: RequestHandler = async ({ request, locals }) => {
 try {
 const body = await request.json();

 // Attach user_id from session if available
 const user_id = (locals as any)?.user?.id ?? body.user_id ?? null;

 const res = await fetch(`${BACKEND_BASE}/api/search`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ ...body, user_id }),
 });

 const data = await res.json();

 return new Response(JSON.stringify(data) => {
 status: res.status,
 headers: { 'Content-Type': 'application/json' },
 });
 } catch (error) {
 return new Response(JSON.stringify({ error: 'Search request failed' }) => {
 status: 500,
 headers: { 'Content-Type': 'application/json' },
 });
 }
};


