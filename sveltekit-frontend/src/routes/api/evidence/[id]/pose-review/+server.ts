import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { z } from 'zod';
import { ENV } from '$lib/server/env.server.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { isUuid } from '$lib/server/validation.js';
import {
	EvidenceRevisionErrorV1,
	createDrizzleRevisionPortsV1,
	savePoseReviewDecisionV1,
} from '$lib/server/features/evidence/evidence-revision-v1.js';

const requestSchema = z.object({
	schema: z.literal('atlas.pose-review-request.v1'),
	caseId: z.string().uuid(),
	parentSha256: z.string().regex(/^(?:sha256:)?[a-fA-F0-9]{64}$/),
	annotationRevisionId: z.string().uuid(),
	analysisRevision: z.string().min(1).max(256),
	frameIndex: z.number().int().min(0).max(0xffffffff),
	framePtsUs: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
	skeletonSchemaId: z.string().min(1).max(128),
	trackId: z.string().min(1).max(128).nullable(),
	trackScopeId: z.string().min(1).max(256).nullable(),
	decision: z.enum(['ACCEPTED_FOR_SCENE_PROPOSAL', 'REJECTED']),
	notes: z.string().max(1000).optional(),
}).strict();
const MAX_REVIEW_REQUEST_BYTES = 16 * 1024;

async function readBoundedJson(request: Request): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413; error: string }> {
	const declaredLength = Number(request.headers.get('content-length') ?? 0);
	if (Number.isFinite(declaredLength) && declaredLength > MAX_REVIEW_REQUEST_BYTES) return { ok: false, status: 413, error: 'Payload too large' };
	if (!request.body) return { ok: false, status: 400, error: 'Invalid JSON body' };
	const reader = request.body.getReader();
	const chunks: Uint8Array[] = [];
	let byteLength = 0;
	try {
		while (true) {
			const { done, value } = await reader.read();
			if (done) break;
			byteLength += value.byteLength;
			if (byteLength > MAX_REVIEW_REQUEST_BYTES) {
				await reader.cancel();
				return { ok: false, status: 413, error: 'Payload too large' };
			}
			chunks.push(value);
		}
		const bytes = new Uint8Array(byteLength);
		let offset = 0;
		for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
		return { ok: true, value: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown };
	} catch {
		try { await reader.cancel(); } catch { /* stream already closed */ }
		return { ok: false, status: 400, error: 'Invalid JSON body' };
	} finally {
		reader.releaseLock();
	}
}

const response = (evidenceId: string, error: string | null, extra: Record<string, unknown> = {}) => ({
	ok: error === null,
	evidenceId,
	decision: null,
	sceneAdmission: 'NOT_ADMITTED',
	canonicalAuthority: false,
	error,
	...extra,
});

export const POST: RequestHandler = async ({ params, locals, request }) => {
	const evidenceId = params.id;
	if (!locals.user?.id) return json(response(evidenceId, 'Unauthorized'), { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
	if (!ENV.EVIDENCE_TRANSCRIPT_REVIEW_ENABLED) return json(response(evidenceId, 'Pose review is disabled'), { status: 403, headers: { 'Cache-Control': 'private, no-store' } });
	if (!isUuid(evidenceId)) return json(response(evidenceId, 'Invalid evidence ID'), { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
	const userId = Number(locals.user.id);
	if (!Number.isSafeInteger(userId) || userId < 1) return json(response(evidenceId, 'Unauthorized'), { status: 401, headers: { 'Cache-Control': 'private, no-store' } });
	const rawBody = await readBoundedJson(request);
	if (rawBody.ok === false) return json(response(evidenceId, rawBody.error), { status: rawBody.status, headers: { 'Cache-Control': 'private, no-store' } });
	const body = requestSchema.safeParse(rawBody.value);
	if (!body.success) return json(response(evidenceId, 'Invalid pose review payload'), { status: 400, headers: { 'Cache-Control': 'private, no-store' } });
	if (!(await getAuthorizedCase(body.data.caseId, userId))) return json(response(evidenceId, 'Evidence not found or access denied'), { status: 404, headers: { 'Cache-Control': 'private, no-store' } });
	try {
		const receipt = await savePoseReviewDecisionV1({
			...body.data,
			trackId: body.data.trackId ?? null,
			trackScopeId: body.data.trackScopeId ?? null,
			evidenceId,
			actorUserId: userId,
		}, await createDrizzleRevisionPortsV1());
		return json({ ...response(evidenceId, null), ...receipt, evidenceId }, { status: receipt.idempotent ? 200 : 201, headers: { 'Cache-Control': 'private, no-store' } });
	} catch (error) {
		if (error instanceof EvidenceRevisionErrorV1) {
			const status = error.code === 'EVIDENCE_NOT_FOUND' ? 404 : error.code === 'EVIDENCE_CASE_MISMATCH' ? 404 : error.code === 'PARENT_HASH_MISMATCH' ? 409 : 400;
			return json(response(evidenceId, error.message), { status, headers: { 'Cache-Control': 'private, no-store' } });
		}
		console.error('[evidence/pose-review] review write failed:', error);
		return json(response(evidenceId, 'Could not record pose review'), { status: 500, headers: { 'Cache-Control': 'private, no-store' } });
	}
};
