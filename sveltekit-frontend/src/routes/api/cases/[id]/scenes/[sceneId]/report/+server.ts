import { json } from '@sveltejs/kit';
import { z } from 'zod';
import { buildSceneRevisionReportV1 } from '$lib/reconstruction/scene-revision-report-v1.js';
import { getAuthorizedCase } from '$lib/server/case-access.js';
import { ENV } from '$lib/server/env.server.js';
import { readSceneDocumentRevisionV1 } from '$lib/server/scene-document-revisions-v1.js';
import type { RequestHandler } from './$types';

const uuid = z.uuid();

export const GET: RequestHandler = async ({ locals, params, url }) => {
	if (!locals.user?.id) return json({ success: false, data: null, message: 'Unauthorized' }, { status: 401 });
	const caseId = uuid.safeParse(params.id);
	const sceneId = uuid.safeParse(params.sceneId);
	const revision = Number(url.searchParams.get('revision'));
	if (!caseId.success || !sceneId.success) return json({ success: false, data: null, message: 'Invalid identifiers' }, { status: 400 });
	if (!Number.isSafeInteger(revision) || revision < 1) return json({ success: false, data: null, message: 'A saved scene revision is required' }, { status: 400 });
	let authorized: Awaited<ReturnType<typeof getAuthorizedCase>>;
	try { authorized = await getAuthorizedCase(caseId.data, Number(locals.user.id)); }
	catch { return json({ success: false, data: null, message: 'Case authorization failed' }); }
	if (!authorized) return json({ success: false, data: null, message: 'Case not found' }, { status: 404 });
	if (!ENV.SCENE_PERSISTENCE_ENABLED) return json({ success: false, data: null, message: 'Scene persistence is disabled pending schema admission' }, { status: 503 });
	try {
		const row = await readSceneDocumentRevisionV1({ caseId: caseId.data, sceneId: sceneId.data, revision });
		if (!row) return json({ success: false, data: null, message: 'Scene revision not found' }, { status: 404 });
		const report = await buildSceneRevisionReportV1({ manifest: row.manifest, manifestSha256: row.manifestSha256 });
		if (report.caseId !== caseId.data || report.sceneId !== sceneId.data || report.revision !== revision) {
			return json({ success: false, data: null, message: 'Scene report scope mismatch' }, { status: 409 });
		}
		return json({ success: true, data: report, message: 'OK' }, {
			headers: { 'content-disposition': `attachment; filename="scene-review-r${revision}.json"`, 'cache-control': 'private, no-store' }
		});
	} catch (cause) {
		const message = cause instanceof Error ? cause.message : 'Scene report failed';
		console.error('[scene-report] export failed', { caseId: caseId.data, sceneId: sceneId.data, revision, message });
		return json({ success: false, data: null, message: 'Scene report readback failed' });
	}
};
