import { legalAIService } from '$lib/server/unified/legal-ai-service.js';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ parent }) => {
	const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

	const health = await safe(
		legalAIService.healthCheck(),
		{ postgresql: false, qdrant: false, minio: false, overall: 'down' as const }
	);

	// Get user from parent layout
	const { user } = await parent();

	return {
		serviceHealth: health,
		user
	};
};
