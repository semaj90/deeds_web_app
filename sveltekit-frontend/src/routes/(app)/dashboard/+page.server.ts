import { redirect } from '@sveltejs/kit';
import { count, desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { cases, evidence } from '$lib/server/db/schema-postgres.js';
import type { PageServerLoad } from './$types';

/** safe() — graceful fallback per CLAUDE.md degraded-response contract. */
const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

/**
 * Dashboard SSR load. Per triage doc §3 Proposal 4: previously NO +page.server.ts
 * existed; every dashboard widget client-fetched its own data after onMount,
 * which meant white-screen for the first ~500ms even for the most-loaded route.
 *
 * This load returns lightweight summary data so the dashboard paints with
 * real numbers on first SSR pass.
 *
 * Schema notes:
 *   - cases.userId is integer (post-finalization) — query gracefully returns
 *     0 rows pre-migration (live DB is still uuid → Number() cast returns null
 *     → no match), real count post-migration.
 *   - evidence.uploadedBy is integer in both Drizzle + live DB (already aligned
 *     per commit 230d084fef). Works pre- and post-finalization.
 *   - DOES NOT use criminals, auditLog, chatMessages — those are scope-down
 *     candidates in the 2026-05-11_schema_finalization.sql migration.
 *   - Recent cases query has no user filter (shows scope-wide recent 5)
 *     because the per-user filter returns 0 pre-migration.
 */
export const load: PageServerLoad = async ({ locals }) => {
	const user = locals.user;

	if (!user) {
		throw redirect(302, '/login');
	}

	const userId = Number(user.id);

	const [casesCountResult, evidenceCountResult, recentCasesResult] = await Promise.all([
		safe(
			db.select({ count: count() }).from(cases).where(eq(cases.userId, userId)),
			[{ count: 0 }]
		),
		safe(
			db
				.select({ count: count() })
				.from(evidence)
				.where(eq(evidence.uploadedBy, userId)),
			[{ count: 0 }]
		),
		safe(
			db.select().from(cases).orderBy(desc(cases.updatedAt)).limit(5),
			[]
		),
	]);

	return {
		user,
		stats: {
			activeCases:   Number(casesCountResult[0]?.count ?? 0),
			evidenceItems: Number(evidenceCountResult[0]?.count ?? 0),
		},
		recentCases: recentCasesResult,
	};
};