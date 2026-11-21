import { loadSceneGenerationPlanV1, SceneGenerationPlanLoadErrorV1 } from '$lib/server/reconstruction/load-scene-generation-plan-v1.js';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { SceneGenerationPlanV1BodySchema } from '$lib/reconstruction/scene-generation-plan-v1.js';
import { SceneGenerationPlanResolutionErrorV1 } from '$lib/server/reconstruction/resolve-scene-generation-plan-v1.js';
import { isUuid } from '$lib/server/validation.js';

const headers = { 'cache-control': 'private, no-store' };
const fail = (message: string, status: number) => json({ ok: false, plan: null, error: message }, { status, headers });

/** Resolve a candidate plan against the authenticated case and canonical source/review owners. Read-only. */
export const POST: RequestHandler = async ({ locals, params, request }) => {
	if (!locals.user?.id) return fail('Unauthorized', 401);
	const caseId = params.id;
	if (!isUuid(caseId)) return fail('Invalid case ID', 400);
	let raw: unknown;
	try {
		const text = await request.text();
		if (text.length > 512 * 1024) return fail('Generation plan exceeds 512 KiB', 413);
		raw = JSON.parse(text);
	} catch { return fail('Invalid JSON body', 400); }
	const parsed = SceneGenerationPlanV1BodySchema.safeParse(raw);
	if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid generation plan', 400);
	const actorId = Number(locals.user.id);
	if (!Number.isSafeInteger(actorId) || actorId <= 0) return fail('Invalid user identity', 401);
	try {
		const plan = await loadSceneGenerationPlanV1({ caseId, actorId, candidate: parsed.data });
		return json({ ok: true, plan, error: null }, { headers });
	} catch (error) {
		if (error instanceof SceneGenerationPlanLoadErrorV1) return fail(error.message, error.status);
		if (error instanceof SceneGenerationPlanResolutionErrorV1) {
			const status = error.code === 'SOURCE_NOT_AUTHORIZED' || error.code === 'PLAN_CASE_SCOPE_MISMATCH' ? 404 : 409;
			return fail(error.code, status);
		}
		console.error('[scene-generation-plan] Failed to resolve candidate', error);
		return fail('Unable to resolve generation plan', 500);
	}
};

