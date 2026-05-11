import { redirect } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db/client';
import { evidence } from '$lib/server/db/schema-postgres';
import { and, desc, eq } from 'drizzle-orm';

export const load: PageServerLoad = async ({ url, locals }) => {
	if (!locals.user) throw redirect(302, '/login');
	
	const caseId = url.searchParams.get('caseId') ?? '';
	const userId = Number(locals.user.id);

	try {
		const conditions = [eq(evidence.uploadedBy, userId)];
		if (caseId && caseId.length === 36) { // Basic UUID check
			conditions.push(eq(evidence.caseId, caseId));
		}

		const items = await db
			.select()
			.from(evidence)
			.where(and(...conditions))
			.orderBy(desc(evidence.createdAt))
			.limit(50);

		return { 
			caseId, 
			evidenceItems: items.map(item => ({
				...item,
				// Ensure dates are strings for serialization
				createdAt: item.createdAt?.toISOString(),
				updatedAt: item.updatedAt?.toISOString(),
				uploadedAt: item.uploadedAt || item.createdAt?.toISOString(),
				collectedAt: item.collectedAt?.toISOString(),
			}))
		};
	} catch (error) {
		console.error('[Evidence Library] Failed to load evidence:', error);
		return { caseId, evidenceItems: [], error: 'Failed to load evidence' };
	}
};

