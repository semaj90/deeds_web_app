import { dev } from '$app/environment';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types.js';

const fixtureEvidenceId = '4cf3e0c4-f3c7-4e0a-9a7e-1adf01dd7291';
const fixtureCaseId = 'b8fbe1be-7024-4b72-bdae-e3a1b4a83f8e';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = ({ url }) => {
	if (!dev) error(404, 'Not found');
	const evidenceId = url.searchParams.get('evidenceId') ?? fixtureEvidenceId;
	const caseId = url.searchParams.get('caseId') ?? fixtureCaseId;
	if (!uuid.test(evidenceId) || !uuid.test(caseId)) error(400, 'Invalid evidence fixture identity');
	return { evidenceId, caseId };
};
