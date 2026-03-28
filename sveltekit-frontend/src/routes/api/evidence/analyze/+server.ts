import { json } from '@sveltejs/kit';
/**
 * /api/evidence/analyze → proxy to /api/evidence/analysis
 * Callers: EvidenceUploadModal.svelte, Gemma270MWebAssembly.svelte
 */
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, fetch, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	return fetch(`/api/evidence/analysis${url.search}`);
};

export const POST: RequestHandler = async ({ request, fetch, locals }) => {
	if (!locals.user?.id) return json({ error: 'Unauthorized' }, { status: 401 });
	return fetch('/api/evidence/analysis', {
		method: 'POST',
		headers: request.headers,
		body: request.body,
		// @ts-expect-error -- SvelteKit internal fetch supports duplex
		duplex: 'half',
	});
};