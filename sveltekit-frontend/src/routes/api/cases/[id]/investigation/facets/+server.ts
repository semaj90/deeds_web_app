import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { authorizeCaseActor, errorResponse } from '$lib/server/investigation/investigation-http-v1.js';
import { createFacet, listInvestigation } from '$lib/server/investigation/investigation-v1.js';
import { FACET_KINDS } from '$lib/server/investigation/investigation-manifest-v1.js';
import type { RequestHandler } from './$types';

const createFacetBody = z.object({
	facetKind: z.enum(FACET_KINDS),
	claimText: z.string().trim().min(1).max(2000),
	confidence: z.number().min(0).max(1).nullable().optional(),
	personId: z.uuid().nullable().optional()
});

export const POST: RequestHandler = async ({ locals, params, request }) => {
	const access = await authorizeCaseActor(locals, params.id);
	if ('response' in access) return access.response;

	const parsed = createFacetBody.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ success: false, data: null, message: 'Invalid facet payload' }, { status: 400 });
	}
	try {
		const row = await createFacet({
			caseId: params.id,
			actorId: access.actorId,
			facetKind: parsed.data.facetKind,
			claimText: parsed.data.claimText,
			confidence: parsed.data.confidence ?? null,
			personId: parsed.data.personId ?? null
		});
		return json({ success: true, data: row, message: 'Facet created' }, { status: 201 });
	} catch (cause) {
		return errorResponse(cause, 'create facet');
	}
};

export const GET: RequestHandler = async ({ locals, params }) => {
	const access = await authorizeCaseActor(locals, params.id);
	if ('response' in access) return access.response;
	try {
		return json({ success: true, data: await listInvestigation(params.id), message: 'OK' });
	} catch (cause) {
		return errorResponse(cause, 'list facets');
	}
};
