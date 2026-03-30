import { db } from '$lib/server/db/client';
import { canvasStates, evidence, evidenceBoardConnections } from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

const safe = <T>(p: Promise<T>, fb: T): Promise<T> =>
	Promise.race([p, new Promise<T>((r) => setTimeout(() => r(fb), 5000))]).catch(() => fb);

export const load: PageServerLoad = async ({ params }) => {
	const { id } = params;

	// Validate UUID format (for test resilience)
	const isValidUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);

	// Return empty data for invalid UUIDs (e.g., test-id) instead of DB error
	if (!isValidUuid) {
		return {
			caseId: id,
			initialState: null,
			evidence: [],
			connections: []
		};
	}

	try {
		// Load canvas state, evidence, and connections in parallel
		const [savedState, evidenceItems, connections] = await Promise.all([
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
			),
			safe(
				db.select().from(evidenceBoardConnections)
					.where(eq(evidenceBoardConnections.caseId, id)),
				[]
			)
		]);

		return {
			caseId: id,
			initialState: savedState ? savedState.stateData : null,
			evidence: evidenceItems.map((item) => {
				const meta = (item.metadata || {}) as Record<string, any>;
				const analysis = (item.aiAnalysis || {}) as Record<string, any>;
				return {
					id: item.id,
					title: item.title || 'Untitled Evidence',
					type: item.evidenceType || 'document',
					date: item.uploadedAt?.split('T')[0] || '',
					location: meta.location || '',
					thumbnail: item.fileUrl || null,
					description: item.description || '',
					fileType: item.fileType || '',
					confidence: meta.confidence || 0,
					keyPoints: (analysis.keyPoints as string[]) ?? []
				};
			}),
			connections: connections.map((c) => ({
				id: c.id,
				fromEvidenceId: c.fromEvidenceId,
				toEvidenceId: c.toEvidenceId,
				connectionType: c.connectionType,
				label: c.label,
				notes: c.notes,
				strength: c.strength,
				isVisible: c.isVisible
			}))
		};
	} catch (e) {
		console.error('Failed to load board data:', e);
		return {
			caseId: id,
			initialState: null,
			evidence: [],
			connections: []
		};
	}
};
