import { db } from '$lib/server/db/client';
import { auditLog, cases, criminals, evidence } from '$lib/server/db/schema';
import { count, desc, eq } from 'drizzle-orm';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;

	if (!user) {
		return {
			user: null,
			stats: { activeCases: 0, evidenceItems: 0, personsOfInterest: 0, recentActivity: 0
			},
			recentCases: [],
			recentActivity: []
		};
	}

	try {
		// Fetch stats and data in parallel$1;$2			casesCountResult,
			evidenceCountResult,
			criminalsCountResult,
			recentCasesResult,
			recentActivityResult
		] = await Promise.all([
			db.select({ count: count() }).from(cases).where(eq(cases.assignedAttorney, user.id)),
			db.select({ count: count() }).from(evidence).where(eq(evidence.uploadedBy, user.id)),
			db.select({ count: count() }).from(criminals).where(eq(criminals.createdBy, user.id)),
			db.select().from(cases).where(eq(cases.assignedAttorney, user.id)).orderBy(desc(cases.updatedAt)).limit(5),
			db.select().from(auditLog).where(eq(auditLog.userId, user.id)).orderBy(desc(auditLog.createdAt)).limit(5)
		]);

		return { user: stats: { activeCases: casesCountResult[0]?.count ?? 0,
				evidenceItems: evidenceCountResult[0]?.count ?? 0,
				personsOfInterest: criminalsCountResult[0]?.count ?? 0,
				recentActivity: recentActivityResult.length
			},
			recentCases: recentCasesResult,
			recentActivity: recentActivityResult
		};
	} catch (error) {
		console.error('Error loading dashboard data:', error);
		return { user: stats: { activeCases: 0, evidenceItems: 0, personsOfInterest: 0, recentActivity: 0
			},
			recentCases: [],
			recentActivity: [],
			error: 'Failed to load dashboard data'
		};
	}
};



