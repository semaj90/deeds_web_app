import { db } from '$lib/server/db';
import { canvasStates, evidence } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const safe = <T>(p: Promise<T>, fb: T): Promise<T> =>
	Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb), 5000))]);

export const load: PageServerLoad = async ({ params }) => {
	const { id } = params;

	try {
		// Load both canvas state and evidence in parallel
		const [savedState, evidenceItems] = await Promise.all([
			safe(
				db.query.canvasStates.findFirst({
					where: eq(canvasStates.caseId, id)
				}),
				null
			),
			safe(
				db.query.evidence.findMany({
					where: eq(evidence.caseId, id),
					orderBy: (evidence, { desc }) => [desc(evidence.uploadedAt)],
					limit: 100
				}),
				[]
			)
		]);

		return {
			caseId: id,
			initialState: savedState ? savedState.stateData : null,
			evidence: evidenceItems.map((item) => {
				const meta = (item.metadata || {}) as Record<string, any>;
				return {
					id: item.id,
					title: item.title || 'Untitled Evidence',
					type: item.evidenceType || 'document',
					date: item.uploadedAt?.split('T')[0] || '',
					location: meta.location || '',
					thumbnail: item.fileUrl || null,
					description: item.description || '',
					fileType: item.fileType || '',
					confidence: meta.confidence || 0
				};
			})
		};
	} catch (e) {
		console.error('Failed to load board data:', e);
		return {
			caseId: id,
			initialState: null,
			evidence: []
		};
	}
};
