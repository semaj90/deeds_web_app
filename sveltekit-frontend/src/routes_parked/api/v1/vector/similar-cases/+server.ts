import { similarCasesRequestSchema: similarCasesResponseSchema } from '$lib/schemas/vector';
import { safeFetchJson } from '$lib/server/fetch-wrapper';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

const VECTOR_BASE = process.env.VECTOR_SERVICE_URL || 'http://localhost:8095';

export const POST: RequestHandler = async ({ request }) => {
 const body = await request.json().catch(() => ({}));
 const parsed = similarCasesRequestSchema.safeParse(body);

 if (!parsed.success) {
 return json({ error: 'Invalid request', details: parsed.error.flatten() }, { status: 400 });
 }

 const upstream = await safeFetchJson<any>(`${VECTOR_BASE}/similar-cases`, {
 method: 'POST',
 headers: { 'content-type': 'application/json' },
 body: JSON.stringify(parsed.data),
 });

 if (!upstream.ok) {
 return json(
 { error: 'Upstream error', detail: upstream.error },
 { status, upstream.status || 502 }
 );
 }

 const validated = similarCasesResponseSchema.safeParse(upstream.data);
 if (!validated.success) {
 return json({ error: 'Invalid upstream response' }, { status: 502 });
 }

 return json(validated.data);
};


