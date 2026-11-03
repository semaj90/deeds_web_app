import { redirect } from '@sveltejs/kit';
import { and, desc, eq, or } from 'drizzle-orm';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import { isUuid } from '$lib/server/validation.js';

/**
 * Relief demo beside the evidence board: lists this case's image evidence and offers the textured depth-relief
 * view only where a SOURCE-BOUND depth map exists (same rule as the board loader: depthAnalysis.sourceRevision
 * must equal the evidence hash). Never pairs an image with a depth map from a different source.
 */
export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.user?.id) throw redirect(302, '/login');
	const caseId = params.id;
	const empty = { caseId, items: [] as ReliefItem[], loadError: null as string | null };
	if (!isUuid(caseId)) return { ...empty, loadError: 'Invalid case ID' };

	try {
		const uid = Number(locals.user.id);
		const [access] = await db
			.select({ id: cases.id })
			.from(cases)
			.where(and(eq(cases.id, caseId), or(eq(cases.userId, uid), eq(cases.assignedAttorney, uid))))
			.limit(1);
		if (!access) return { ...empty, loadError: 'Case not found' };

		const rows = await db
			.select({
				id: evidence.id,
				title: evidence.title,
				mimeType: evidence.mimeType,
				fileType: evidence.fileType,
				hash: evidence.hash,
				aiAnalysis: evidence.aiAnalysis
			})
			.from(evidence)
			.where(eq(evidence.caseId, caseId))
			.orderBy(desc(evidence.createdAt))
			.limit(200);

		const items: ReliefItem[] = rows
			.filter((r) => /^image\//i.test(r.mimeType ?? r.fileType ?? ''))
			.map((r) => {
				const analysis = (r.aiAnalysis ?? {}) as Record<string, any>;
				const depthRev = (analysis.depthAnalysis as { sourceRevision?: string } | undefined)?.sourceRevision;
				const rev = typeof r.hash === 'string' ? (r.hash.startsWith('sha256:') ? r.hash : `sha256:${r.hash}`) : null;
				const bound = Boolean(depthRev && depthRev === rev);
				const id = encodeURIComponent(r.id);
				return {
					id: r.id,
					title: r.title || 'Untitled evidence',
					imageUrl: `/api/evidence/${id}/download?inline=1&caseId=${encodeURIComponent(caseId)}`,
					depthUrl: bound ? `/api/evidence/${id}/depth-map` : null
				};
			});
		return { caseId, items, loadError: null as string | null };
	} catch {
		return { ...empty, loadError: 'Could not load evidence' };
	}
};

export interface ReliefItem {
	id: string;
	title: string;
	imageUrl: string;
	depthUrl: string | null;
}
