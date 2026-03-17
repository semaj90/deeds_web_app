import { db } from '$lib/server/db/client';
import { statutes, legalGlossary } from '$lib/server/db/schema-postgres';
import { desc, sql } from 'drizzle-orm';
import type { PageServerLoad } from './$types.js';

export const load: PageServerLoad = async () => {
	const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

	const [recentStatutes, glossaryTerms, stats] = await Promise.all([
		safe(
			db
				.select({
					id: statutes.id,
					title: statutes.title,
					section: statutes.section,
					jurisdiction: statutes.jurisdiction,
					category: statutes.category,
					effectiveDate: statutes.effectiveDate,
					sourceUrl: statutes.sourceUrl,
				})
				.from(statutes)
				.orderBy(desc(statutes.updatedAt))
				.limit(20),
			[]
		),
		safe(
			db
				.select({
					id: legalGlossary.id,
					term: legalGlossary.term,
					definition: legalGlossary.definition,
					category: legalGlossary.category,
					jurisdiction: legalGlossary.jurisdiction,
					relatedTerms: legalGlossary.relatedTerms,
				})
				.from(legalGlossary)
				.orderBy(legalGlossary.term)
				.limit(50),
			[]
		),
		safe(
			db
				.execute(sql`
					SELECT
						(SELECT count(*) FROM statutes) AS statute_count,
						(SELECT count(*) FROM legal_glossary) AS glossary_count,
						(SELECT count(*) FROM legal_precedents) AS precedent_count,
						(SELECT count(DISTINCT jurisdiction) FROM statutes WHERE jurisdiction IS NOT NULL) AS jurisdiction_count
				`)
				.then((r) => {
					const rows = r as unknown as Record<string, unknown>[];
					const row = rows[0];
					return {
						statutes: Number(row?.statute_count ?? 0),
						glossary: Number(row?.glossary_count ?? 0),
						precedents: Number(row?.precedent_count ?? 0),
						jurisdictions: Number(row?.jurisdiction_count ?? 0),
					};
				}),
			{ statutes: 0, glossary: 0, precedents: 0, jurisdictions: 0 }
		),
	]);

	return { recentStatutes, glossaryTerms, stats, loadError: null };
};
