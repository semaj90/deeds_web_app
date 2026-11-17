/**
 * Single authorization owner for scene-marker reads and writes (GET, POST, PATCH, DELETE).
 *
 * POLICY (documented; changing it is a product decision):
 *   - A signed-in user may read or write a case's scene markers only if they are the case owner
 *     (cases.user_id) or its assigned attorney (cases.assigned_attorney).
 *   - The global `admin` role does NOT grant case access here. This matches the case layout,
 *     the evidence board, the investigation API and the scene-revision routes.
 *   - A user without access receives 404 "Case not found", so case existence is not disclosed.
 *   - Evidence linked to a marker must belong to the same case (enforced in move-marker.ts,
 *     for administrators too).
 */
import { getAuthorizedCase } from '$lib/server/case-access.js';

export type SceneAccess = { ok: true; userId: number } | { ok: false; status: 401 | 404 | 500; message: string };

export async function authorizeSceneAccess(locals: App.Locals, caseId: string): Promise<SceneAccess> {
	if (!locals.user?.id) return { ok: false, status: 401, message: 'Unauthorized' };
	const userId = Number(locals.user.id);
	if (!Number.isSafeInteger(userId) || userId <= 0) return { ok: false, status: 401, message: 'Unauthorized' };
	let authorized: Awaited<ReturnType<typeof getAuthorizedCase>>;
	try {
		authorized = await getAuthorizedCase(caseId, userId);
	} catch {
		return { ok: false, status: 500, message: 'Case authorization failed' };
	}
	if (!authorized) return { ok: false, status: 404, message: 'Case not found' };
	return { ok: true, userId };
}
