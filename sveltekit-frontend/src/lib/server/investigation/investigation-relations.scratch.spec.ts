// @vitest-environment node
/**
 * Relations, lineage and review proof for the investigation layer. Opt-in and scratch-only:
 *   INVESTIGATION_SCRATCH_E2E=1 DATABASE_URL=<...legal_ai_live_integration_scratch> npx vitest run <this file>
 * Refuses to run against any other database, because the ledgers are append-only.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';

const ENABLED = process.env.INVESTIGATION_SCRATCH_E2E === '1';
const SCRATCH_DB = 'legal_ai_live_integration_scratch';

describe.skipIf(!ENABLED)('investigation relations, lineage and review (scratch database)', () => {
	let caseId: string;
	let otherCaseId: string;
	let authorId: number;
	let reviewerId: number;
	let evidenceId: string;
	let facetId: string;
	let exportId: string;
	let caseNoteId: string;
	let otherCaseNoteId: string;
	let personInCase: string;

	beforeAll(async () => {
		if (!(process.env.DATABASE_URL ?? '').includes(SCRATCH_DB)) {
			throw new Error(`Refusing to run: DATABASE_URL must point at ${SCRATCH_DB}`);
		}
		const { db } = await import('$lib/server/db/client.js');
		const schema = await import('$lib/server/db/schema-postgres.js');
		const { casePersons } = await import('$lib/server/db/schema/persons.js');
		const svc = await import('./investigation-v1.js');

		const suffix = randomUUID().slice(0, 8);
		const users = (await db
			.insert(schema.users)
			.values([
				{ email: `author-${suffix}@scratch.invalid`, passwordHash: 'scratch-only' },
				{ email: `reviewer-${suffix}@scratch.invalid`, passwordHash: 'scratch-only' }
			])
			.returning({ id: schema.users.id })) as Array<{ id: number }>;
		authorId = users[0].id;
		reviewerId = users[1].id;

		const cases = (await db
			.insert(schema.cases)
			.values([
				{ title: `E2E rel ${suffix}`, status: 'open', priority: 'medium', userId: authorId },
				{ title: `E2E rel other ${suffix}`, status: 'open', priority: 'medium', userId: authorId }
			])
			.returning({ id: schema.cases.id })) as Array<{ id: string }>;
		caseId = cases[0].id;
		otherCaseId = cases[1].id;

		const [item] = (await db
			.insert(schema.evidence)
			.values({ caseId, userId: authorId, title: 'Relation evidence', evidenceType: 'document', aiSummary: 'Item used for relation proof.' })
			.returning({ id: schema.evidence.id })) as Array<{ id: string }>;
		evidenceId = item.id;

		const notes = (await db
			.insert(schema.caseNotes)
			.values([
				{ caseId, title: 'Case note', content: 'Summary note' },
				{ caseId: otherCaseId, title: 'Foreign note', content: 'x' }
			])
			.returning({ id: schema.caseNotes.id })) as Array<{ id: string }>;
		caseNoteId = notes[0].id;
		otherCaseNoteId = notes[1].id;

		const [poi] = (await db
			.insert(schema.personsOfInterest)
			.values({ name: `Scratch Subject ${suffix}` } as never)
			.returning({ id: schema.personsOfInterest.id })) as Array<{ id: string }>;
		personInCase = poi.id;
		await db.insert(casePersons).values({ caseId, personId: personInCase } as never);

		const facet = await svc.createFacet({ caseId, actorId: authorId, facetKind: 'WHO', claimText: 'Relation facet', confidence: null, personId: personInCase });
		facetId = facet.id;
		await svc.linkEvidence({ caseId, facetId, evidenceId, actorId: authorId, relevance: 0.9, note: null });
	});

	it('links a case note to a facet and refuses a note from another case', async () => {
		const svc = await import('./investigation-v1.js');
		await svc.linkCaseNote({ caseId, facetId, caseNoteId, actorId: authorId });
		const overview = await svc.listInvestigation(caseId);
		const facet = overview.find((row) => row.id === facetId)!;
		expect(facet.notes.map((note) => note.noteId)).toEqual([caseNoteId]);
		await expect(svc.linkCaseNote({ caseId, facetId, caseNoteId: otherCaseNoteId, actorId: authorId })).rejects.toMatchObject({ code: 'NOTE_NOT_FOUND', status: 404 });
	});

	it('refuses a person of interest who is not linked to the case', async () => {
		const svc = await import('./investigation-v1.js');
		await expect(
			svc.createFacet({ caseId, actorId: authorId, facetKind: 'WHO', claimText: 'Stranger', confidence: null, personId: randomUUID() })
		).rejects.toMatchObject({ code: 'PERSON_NOT_IN_CASE', status: 404 });
	});

	it('records export lineage in the same transaction as the export', async () => {
		const svc = await import('./investigation-v1.js');
		const { db } = await import('$lib/server/db/client.js');
		const { caseAiSummaryExportSources } = await import('$lib/server/db/schema/investigation.js');
		const result = await svc.generateSummaryExport({
			caseId,
			actorId: authorId,
			commandId: randomUUID(),
			resolveModel: async () => 'stub-model',
			requestModel: async () => `WHO: relation facet [evidence:${evidenceId}].`
		});
		exportId = result.exportRow.id;
		expect(result.exportRow.revision).toBe(1);
		const sources = (await db.select().from(caseAiSummaryExportSources).where(eq(caseAiSummaryExportSources.exportId, exportId))) as Array<{ facetId: string; evidenceId: string }>;
		expect(sources).toEqual([expect.objectContaining({ facetId, evidenceId })]);
	}, 60_000);

	it('starts a summary as DRAFT and blocks self-review (four-eyes)', async () => {
		const svc = await import('./investigation-v1.js');
		const listed = (await svc.listSummaryExports(caseId)).find((row) => row.id === exportId)!;
		expect(listed.status).toBe('DRAFT');
		await expect(svc.reviewSummaryExport({ caseId, exportId, actorId: authorId, decision: 'APPROVED', note: null })).rejects.toMatchObject({ code: 'SELF_REVIEW_FORBIDDEN', status: 403 });
	});

	it('records an independent rejection then approval; the latest review sets the status', async () => {
		const svc = await import('./investigation-v1.js');
		await svc.reviewSummaryExport({ caseId, exportId, actorId: reviewerId, decision: 'REJECTED', note: 'needs source check' });
		await svc.reviewSummaryExport({ caseId, exportId, actorId: reviewerId, decision: 'APPROVED', note: null });
		const listed = (await svc.listSummaryExports(caseId)).find((row) => row.id === exportId)!;
		expect(listed.status).toBe('APPROVED');
		expect(listed.latestReview?.reviewedBy).toBe(reviewerId);
	});

	it('keeps every review row: the review ledger is append-only', async () => {
		const { db } = await import('$lib/server/db/client.js');
		const { caseAiSummaryExportReviews } = await import('$lib/server/db/schema/investigation.js');
		const rows = await db.select().from(caseAiSummaryExportReviews).where(eq(caseAiSummaryExportReviews.exportId, exportId));
		expect(rows).toHaveLength(2);
		await expect(db.update(caseAiSummaryExportReviews).set({ decision: 'APPROVED' }).where(eq(caseAiSummaryExportReviews.exportId, exportId))).rejects.toBeTruthy();
		await expect(db.delete(caseAiSummaryExportReviews).where(eq(caseAiSummaryExportReviews.exportId, exportId))).rejects.toBeTruthy();
	});

	it('sets analysis review status only for results attached to this case', async () => {
		const { db } = await import('$lib/server/db/client.js');
		const schema = await import('$lib/server/db/schema-postgres.js');
		const svc = await import('./investigation-v1.js');
		const [row] = (await db
			.insert(schema.evidenceAnalysisCache)
			.values({ evidenceId, caseId, analysisType: 'scratch-review', result: { ok: true } } as never)
			.returning({ id: schema.evidenceAnalysisCache.id })) as Array<{ id: string }>;
		const updated = await svc.reviewAnalysisResult({ caseId, analysisId: row.id, actorId: reviewerId, status: 'ACCEPTED' });
		expect(updated.reviewStatus).toBe('ACCEPTED');
		await expect(svc.reviewAnalysisResult({ caseId: randomUUID(), analysisId: row.id, actorId: reviewerId, status: 'REJECTED' })).rejects.toMatchObject({ code: 'ANALYSIS_NOT_FOUND', status: 404 });
	});

	it('loads crime-scene data for the case from PostgreSQL', async () => {
		const { load } = await import('../../../routes/(app)/cases/[id]/crime-scene/+page.server.js');
		const data = (await (load as unknown as (event: unknown) => Promise<Record<string, unknown>>)({
			params: { id: caseId },
			parent: async () => ({ caseData: { title: 'E2E rel', caseNumber: null } })
		})) as { facets: Array<{ id: string; notes: unknown[] }>; loadError: string | null; latestExport: { status: string } | null };
		expect(data.loadError).toBeNull();
		expect(data.facets.map((facet) => facet.id)).toEqual([facetId]);
		expect(data.facets[0].notes).toHaveLength(1);
		expect(data.latestExport?.status).toBe('APPROVED');
	});
});
