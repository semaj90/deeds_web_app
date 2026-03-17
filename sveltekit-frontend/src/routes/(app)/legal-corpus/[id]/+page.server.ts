import { db } from '$lib/server/db/client';
import { statutes, statuteChunks, caseStatuteLinks, legalPrecedents, legalGlossary, cases } from '$lib/server/db/schema-postgres';
import { eq, desc, sql, ilike } from 'drizzle-orm';
import type { PageServerLoad } from './$types.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const load: PageServerLoad = async ({ params }) => {
	if (!UUID_PATTERN.test(params.id)) {
		return { statute: null, chunks: [], precedents: [], caseLinks: [], glossaryTerms: [], relatedStatutes: [], loadError: 'Invalid statute ID' };
	}

	const safe = <T>(p: Promise<T>, fallback: T): Promise<T> => p.catch(() => fallback);

	const [statuteRows, chunks, caseLinks, precedents] = await Promise.all([
		safe(
			db.select().from(statutes).where(eq(statutes.id, params.id)).limit(1),
			[]
		),
		safe(
			db
				.select({
					id: statuteChunks.id,
					chunkIndex: statuteChunks.chunkIndex,
					content: statuteChunks.content,
				})
				.from(statuteChunks)
				.where(eq(statuteChunks.statuteId, params.id))
				.orderBy(statuteChunks.chunkIndex),
			[]
		),
		safe(
			db
				.select({
					id: caseStatuteLinks.id,
					caseId: caseStatuteLinks.caseId,
					linkType: caseStatuteLinks.linkType,
					notes: caseStatuteLinks.notes,
					createdAt: caseStatuteLinks.createdAt,
				})
				.from(caseStatuteLinks)
				.where(eq(caseStatuteLinks.statuteId, params.id))
				.orderBy(desc(caseStatuteLinks.createdAt))
				.limit(20),
			[]
		),
		safe(
			db
				.select()
				.from(legalPrecedents)
				.orderBy(desc(legalPrecedents.decisionDate))
				.limit(10),
			[]
		),
	]);

	const statute = statuteRows[0];
	if (!statute) {
		return { statute: null, chunks: [], precedents: [], caseLinks: [], glossaryTerms: [], relatedStatutes: [], loadError: 'Statute not found' };
	}

	// Secondary queries: glossary terms + related statutes in same jurisdiction
	const [glossaryTerms, relatedStatutes, linkedCaseDetails] = await Promise.all([
		safe(
			db
				.select({
					id: legalGlossary.id,
					term: legalGlossary.term,
					definition: legalGlossary.definition,
					category: legalGlossary.category,
					relatedTerms: legalGlossary.relatedTerms,
				})
				.from(legalGlossary)
				.where(
					statute.jurisdiction
						? eq(legalGlossary.jurisdiction, statute.jurisdiction)
						: sql`TRUE`
				)
				.orderBy(legalGlossary.term)
				.limit(20),
			[]
		),
		safe(
			statute.jurisdiction
				? db
					.select({
						id: statutes.id,
						title: statutes.title,
						section: statutes.section,
						category: statutes.category,
					})
					.from(statutes)
					.where(eq(statutes.jurisdiction, statute.jurisdiction))
					.limit(10)
				: Promise.resolve([]),
			[]
		),
		safe(
			caseLinks.length > 0
				? db
					.select({
						id: cases.id,
						title: cases.title,
						status: cases.status,
					})
					.from(cases)
					.where(sql`${cases.id} IN (${sql.join(caseLinks.map(l => sql`${l.caseId}`), sql`, `)})`)
				: Promise.resolve([]),
			[]
		),
	]);

	// Build case details map for display
	const caseDetailsMap = new Map(linkedCaseDetails.map(c => [c.id, c]));

	return {
		statute: {
			id: statute.id,
			title: statute.title,
			content: statute.content,
			section: statute.section,
			jurisdiction: statute.jurisdiction,
			category: statute.category,
			sourceUrl: statute.sourceUrl,
			effectiveDate: statute.effectiveDate?.toISOString() ?? null,
			createdAt: statute.createdAt?.toISOString() ?? '',
			updatedAt: statute.updatedAt?.toISOString() ?? '',
		},
		chunks: chunks.map((c) => ({
			id: c.id,
			chunkIndex: c.chunkIndex,
			content: c.content,
		})),
		precedents: precedents.map((p) => ({
			id: p.id,
			title: p.title,
			summary: p.summary,
			citation: p.citation,
			court: p.court,
			decisionDate: p.decisionDate?.toISOString() ?? null,
		})),
		caseLinks: caseLinks.map((l) => ({
			id: l.id,
			caseId: l.caseId,
			linkType: l.linkType,
			notes: l.notes,
			createdAt: l.createdAt?.toISOString() ?? '',
			caseTitle: caseDetailsMap.get(l.caseId)?.title ?? null,
			caseStatus: caseDetailsMap.get(l.caseId)?.status ?? null,
		})),
		glossaryTerms: glossaryTerms.map((t) => ({
			id: t.id,
			term: t.term,
			definition: t.definition,
			category: t.category,
			relatedTerms: t.relatedTerms as string[] | null,
		})),
		relatedStatutes: relatedStatutes
			.filter(s => s.id !== statute.id)
			.map((s) => ({
				id: s.id,
				title: s.title,
				section: s.section,
				category: s.category,
			})),
		loadError: null,
	};
};
