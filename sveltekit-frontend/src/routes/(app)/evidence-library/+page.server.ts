import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url }) => {
	const caseId = url.searchParams.get('caseId') ?? '';
	return { caseId };
};
