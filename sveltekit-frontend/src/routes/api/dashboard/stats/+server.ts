import { db } from '$lib/server/db/client';
import { json, type RequestHandler } from '@sveltejs/kit';
import { sql, count } from 'drizzle-orm';
import { legalGlossary, statutes, legalPrecedents } from '$lib/server/db/schema-postgres.js';

/**
 * GET /api/dashboard/stats
 * Aggregate counts for the dashboard overview + knowledge base
 */
export const GET: RequestHandler = async () => {
	const exec = async (query: ReturnType<typeof sql>) => {
		try {
			const result = await db.execute(query);
			const rows = Array.isArray(result) ? result : [];
			return (rows[0] as Record<string, unknown>) ?? {};
		} catch {
			return {};
		}
	};

	const [cases, evidence, persons, citations, glossaryCount, statuteCount, precedentCount] = await Promise.all([
		exec(sql`SELECT
			COUNT(*) FILTER (WHERE status IN ('open', 'active', 'investigating')) as active,
			COUNT(*) as total
			FROM cases`),
		exec(sql`SELECT
			COUNT(*) FILTER (WHERE status = 'pending') as pending,
			COUNT(*) FILTER (WHERE status = 'approved') as approved
			FROM evidence`),
		exec(sql`SELECT COUNT(*) as total FROM persons_of_interest`),
		exec(sql`SELECT COUNT(*) as total FROM saved_citations`),
		db.select({ value: count() }).from(legalGlossary).then(r => r[0]?.value ?? 0).catch(() => 0),
		db.select({ value: count() }).from(statutes).then(r => r[0]?.value ?? 0).catch(() => 0),
		db.select({ value: count() }).from(legalPrecedents).then(r => r[0]?.value ?? 0).catch(() => 0),
	]);

	return json({
		activeCases: Number(cases.active ?? 0),
		pendingEvidence: Number(evidence.pending ?? 0),
		approvedEvidence: Number(evidence.approved ?? 0),
		personsOfInterest: Number(persons.total ?? 0),
		totalCitations: Number(citations.total ?? 0),
		recentActivity: Number(cases.total ?? 0),
		knowledgeBase: {
			glossary: Number(glossaryCount),
			statutes: Number(statuteCount),
			precedents: Number(precedentCount),
			total: Number(glossaryCount) + Number(statuteCount) + Number(precedentCount),
		},
	});
};
