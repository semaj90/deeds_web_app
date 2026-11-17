import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const requestedCaseId = url.searchParams.get('caseId');
	const caseId = requestedCaseId && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(requestedCaseId)
		? requestedCaseId
		: '11111111-1111-4111-8111-111111111111';
	return {
		caseId,
		binding: {
			evidenceId: '33333333-3333-4333-8333-333333333333',
			sourceRevision: `sha256:${'a'.repeat(64)}`,
			analysisRevision: 'scene-event-browser-fixture-v1',
			eventId: '55555555-5555-4555-8555-555555555555',
			startMs: 1_250,
			endMs: 1_400,
			reviewState: 'APPROVED_FOR_SCENE_PROPOSAL' as const
		}
	};
};
