import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { authorizeCaseActor, errorResponse, uuidSchema } from '$lib/server/investigation/investigation-http-v1.js';
import { generateSummaryExport, listSummaryExports } from '$lib/server/investigation/investigation-v1.js';
import type { RequestHandler } from './$types';

const generateBody = z.object({ commandId: uuidSchema });

export const GET: RequestHandler = async ({ locals, params }) => {
	const access = await authorizeCaseActor(locals, params.id);
	if ('response' in access) return access.response;
	try {
		return json({ success: true, data: await listSummaryExports(params.id), message: 'OK' });
	} catch (cause) {
		return errorResponse(cause, 'list summary exports');
	}
};

/**
 * Generates an immutable AI summary revision from the case's linked evidence. The client sends
 * a commandId so retries are idempotent. Unsupported citations return 422 and nothing is stored.
 */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	const access = await authorizeCaseActor(locals, params.id);
	if ('response' in access) return access.response;

	const parsed = generateBody.safeParse(await request.json().catch(() => null));
	if (!parsed.success) {
		return json({ success: false, data: null, message: 'commandId must be a UUID' }, { status: 400 });
	}
	try {
		const result = await generateSummaryExport({
			caseId: params.id,
			actorId: access.actorId,
			commandId: parsed.data.commandId
		});
		return json(
			{ success: true, data: result.exportRow, message: result.replayed ? 'Replayed existing revision' : 'Summary revision created' },
			{ status: result.replayed ? 200 : 201 }
		);
	} catch (cause) {
		return errorResponse(cause, 'generate summary');
	}
};
