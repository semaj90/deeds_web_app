import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { buildNesChrom97ProposalReceiptV1, readNesChrom97RegistryV1 } from '$lib/server/cartridge/neschrom97-upsert-receipt-v1.js';

const MAX_REQUEST_BYTES = 64 * 1024;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user?.id) return json({ error: 'UNAUTHENTICATED', receipt: null }, { status: 401 });
	const raw = await request.text();
	if (Buffer.byteLength(raw, 'utf8') > MAX_REQUEST_BYTES) return json({ error: 'REQUEST_TOO_LARGE', receipt: null }, { status: 413 });
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return json({ error: 'INVALID_JSON', receipt: null }, { status: 400 });
	}
	const result = buildNesChrom97ProposalReceiptV1(body, readNesChrom97RegistryV1());
	if (!result.ok) {
		const status = result.status === 'REGISTRY_UNAVAILABLE' ? 503 : result.status === 'REGISTRY_CARD_NOT_FOUND' ? 404 : 400;
		return json({ error: result.status, receipt: null }, { status });
	}
	return json({ error: null, status: result.status, receipt: result.receipt }, { status: 200 });
};
