import { json } from '@sveltejs/kit';
import { z } from 'zod';
import type { RequestHandler } from './$types';
import {
	enqueueScenePaletteJobV1, reopenScenePaletteJobV1, scenePaletteRequestSchemaV1, scenePaletteJobIdV1,
} from '$lib/server/analysis/scene-palette-job-v1.js';

const sourceSchema = z.object({
	actorId: z.number().int().positive(),
	caseId: z.uuid().transform((value) => value.toLowerCase()),
	evidenceId: z.uuid().transform((value) => value.toLowerCase()),
});
type PaletteSource = { actorId: number; caseId: string; evidenceId: string };
const headers = { 'Cache-Control': 'private, no-store' };
const locatorSchema = z.union([
	z.object({ jobId: z.uuid().transform((value) => value.toLowerCase()), download: z.literal('1').optional() }).strict(),
	z.object({
		runId: scenePaletteRequestSchemaV1.shape.runId,
		sequenceId: z.string().regex(/^\d{1,10}$/).transform(Number).pipe(scenePaletteRequestSchemaV1.shape.sequenceId),
		download: z.literal('1').optional(),
	}).strict(),
]);

export const POST: RequestHandler = async ({ params, locals, request }) => {
	if (!locals.user?.id) return json({ status: 'UNAUTHORIZED' }, { status: 401, headers });
	const source = sourceSchema.safeParse({ actorId: Number(locals.user.id), caseId: params.id, evidenceId: params.evidenceId });
	const payload = scenePaletteRequestSchemaV1.safeParse(await request.json().catch(() => null));
	if (!source.success || !payload.success) return json({ status: 'INVALID_REQUEST' }, { status: 400, headers });
	const sourceData = source.data as PaletteSource;
	try {
		const result = await enqueueScenePaletteJobV1(sourceData, payload.data);
		const status = result.status === 'ACCEPTED' ? 202 : result.status === 'NOT_FOUND' ? 404
			: result.status === 'UNSUPPORTED_MEDIA' ? 415 : result.status === 'UNAVAILABLE' ? 503 : 409;
		return json(result, { status, headers });
	} catch {
		return json({ status: 'UNAVAILABLE' }, { status: 503, headers });
	}
};

export const GET: RequestHandler = async ({ params, locals, url }) => {
	const respond = (status: string, code: number) => json({ status, jobStatus: null, sourceRevision: null, artifact: null }, { status: code, headers });
	if (!locals.user?.id) return respond('UNAUTHORIZED', 401);
	const source = sourceSchema.safeParse({ actorId: Number(locals.user.id), caseId: params.id, evidenceId: params.evidenceId });
	const locator = locatorSchema.safeParse(Object.fromEntries(url.searchParams));
	if (!source.success || !locator.success) return respond('INVALID_REQUEST', 400);
	const sourceData = source.data as PaletteSource;
	const locatorData = locator.data as { jobId?: string; runId?: string; sequenceId?: number; download?: '1' };
	try {
		let id: string;
		if (typeof locatorData.jobId === 'string') {
			id = locatorData.jobId;
		} else if (typeof locatorData.runId === 'string' && typeof locatorData.sequenceId === 'number') {
			id = scenePaletteJobIdV1({ caseId: sourceData.caseId, runId: locatorData.runId, sequenceId: locatorData.sequenceId });
		} else {
			return respond('INVALID_REQUEST', 400);
		}
		const result = await reopenScenePaletteJobV1(sourceData, id, locatorData.download === '1');
		if (result.status === 'NOT_FOUND') return respond(result.status, 404);
		if (result.status === 'STALE_SOURCE') return respond(result.status, 409);
		if (result.status === 'UNAVAILABLE') return respond(result.status, 503);
		if (!('artifact' in result)) {
			return json({ status: result.status, jobStatus: result.jobStatus, sourceRevision: null, artifact: null }, { headers });
		}
		if (result.bytes) {
			return new Response(new Uint8Array(result.bytes), { headers: {
				...headers, 'Content-Type': 'application/octet-stream',
				'Content-Disposition': 'attachment; filename="scene-palette.bin"',
				'X-Content-Type-Options': 'nosniff',
			} });
		}
		return json({ status: 'READY', jobStatus: 'completed', sourceRevision: result.sourceRevision, artifact: result.artifact }, { headers });
	} catch {
		return respond('UNAVAILABLE', 503);
	}
};
