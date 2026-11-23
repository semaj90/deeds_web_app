import { json } from '@sveltejs/kit';
import { and, inArray, isNull, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types.js';
import { db } from '$lib/server/db/client.js';
import { evidence } from '$lib/server/db/schema-postgres.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { readSceneDocumentRevisionV1 } from '$lib/server/scene-document-revisions-v1.js';
import { buildCaseSceneFetchParametersV1 } from '$lib/server/reconstruction/case-scene-fetch-parameters-v1.js';
import { CaseSceneFetchParametersInputV1Schema, CaseSceneIntakeContextV1Schema } from '$lib/reconstruction/case-scene-fetch-contract-v1.js';
import { isUuid } from '$lib/server/validation.js';

const responseHeaders = { 'cache-control': 'private, no-store' };
const failure = (message: string, status: number) => json({ ok: false, parameters: null, error: message }, { status, headers: responseHeaders });

/** Validate a user-authored case brief into bounded procedural-scene fetch parameters. Read-only. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user?.id) return failure('Unauthorized', 401);
	const caseId = params.id;
	if (!isUuid(caseId)) return failure('Invalid case ID', 400);
	let body: unknown;
	try {
		const text = await request.text();
		if (text.length > 131_072) return failure('Reconstruction parameter body exceeds 128 KiB', 413);
		body = JSON.parse(text);
	} catch { return failure('Invalid JSON body', 400); }
	const parsed = CaseSceneFetchParametersInputV1Schema.safeParse(body);
	if (!parsed.success) return failure(parsed.error.issues[0]?.message ?? 'Invalid reconstruction parameters', 400);

	const actorId = Number(locals.user.id);
	if (!Number.isSafeInteger(actorId) || actorId <= 0) return failure('Invalid user identity', 401);
	try {
		const authorized = await getAuthorizedCase(caseId, actorId);
		if (!authorized) return failure('Case not found', 404);
		const caseMetadata = authorized.metadata && typeof authorized.metadata === 'object' && !Array.isArray(authorized.metadata)
			? authorized.metadata as Record<string, unknown> : {};
		const intakeResult = CaseSceneIntakeContextV1Schema.safeParse(caseMetadata.caseSceneIntakeV1);
		const caseIntake = intakeResult.success ? intakeResult.data : null;

		const current = await readSceneDocumentRevisionV1({ caseId, sceneId: parsed.data.sceneId });
		const currentRevision = current?.revision ?? 0;
		if (parsed.data.expectedRevision !== currentRevision) {
			return json({ ok: false, parameters: null, error: 'Scene revision changed', currentRevision }, { status: 409, headers: responseHeaders });
		}

		const rows = parsed.data.sourceEvidenceIds.length
			? await db.select({ id: evidence.id, hash: evidence.hash })
				.from(evidence)
				.where(and(eq(evidence.caseId, caseId), isNull(evidence.deletedAt), inArray(evidence.id, parsed.data.sourceEvidenceIds)))
			: [];
		const verifiedIds = new Set(rows.map((row) => row.id));
		if (rows.length !== parsed.data.sourceEvidenceIds.length || parsed.data.sourceEvidenceIds.some((id) => !verifiedIds.has(id))) {
			return failure('Selected evidence is missing or outside this case', 404);
		}

		const parameters = buildCaseSceneFetchParametersV1({
			caseId,
			request: parsed.data,
			caseIntake,
			verifiedEvidence: rows.map((row) => ({ id: row.id, hash: row.hash, hashAlgorithm: row.hash ? 'sha256' : null }))
		});
		return json({ ok: true, parameters, error: null }, { headers: responseHeaders });
	} catch (error) {
		console.error('[scene-reconstruction-parameters] Failed to prepare request', error);
		return failure('Unable to prepare reconstruction parameters', 500);
	}
};
