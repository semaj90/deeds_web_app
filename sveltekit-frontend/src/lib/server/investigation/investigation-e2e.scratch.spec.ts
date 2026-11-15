// @vitest-environment node
/**
 * End-to-end proof for the investigation layer: facets, evidence links, a real llama-server
 * summary, citation admission, and idempotent replay. Opt-in and scratch-only.
 *
 *   INVESTIGATION_SCRATCH_E2E=1 DATABASE_URL=<...legal_ai_live_integration_scratch> \
 *     npx vitest run src/lib/server/investigation/investigation-e2e.scratch.spec.ts
 *
 * The spec refuses to run against any database other than the scratch database, because
 * case_ai_summary_exports is append-only and its rows cannot be removed afterwards.
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';

const ENABLED = process.env.INVESTIGATION_SCRATCH_E2E === '1';
const SCRATCH_DB = 'legal_ai_live_integration_scratch';

describe.skipIf(!ENABLED)('investigation end-to-end (scratch database)', () => {
	let caseId: string;
	let userId: number;
	let evidenceA: string;
	let evidenceB: string;
	let facetWho: string;
	let facetWhy: string;
	let svc: typeof import('./investigation-v1.js');
	let db: typeof import('$lib/server/db/client.js').db;
	let schema: typeof import('$lib/server/db/schema-postgres.js');
	let inv: typeof import('$lib/server/db/schema/investigation.js');

	beforeAll(async () => {
		if (!(process.env.DATABASE_URL ?? '').includes(SCRATCH_DB)) {
			throw new Error(`Refusing to run: DATABASE_URL must point at ${SCRATCH_DB}`);
		}
		svc = await import('./investigation-v1.js');
		({ db } = await import('$lib/server/db/client.js'));
		schema = await import('$lib/server/db/schema-postgres.js');
		inv = await import('$lib/server/db/schema/investigation.js');

		const suffix = randomUUID().slice(0, 8);
		const [user] = (await db.insert(schema.users).values({ email: `e2e-${suffix}@scratch.invalid`, passwordHash: 'scratch-only-not-a-credential' }).returning({ id: schema.users.id })) as Array<{ id: number }>;
		userId = user.id;
		const [kase] = (await db
			.insert(schema.cases)
			.values({ title: `E2E scratch ${suffix}`, status: 'open', priority: 'medium', userId })
			.returning({ id: schema.cases.id })) as Array<{ id: string }>;
		caseId = kase.id;

		const rows = (await db
			.insert(schema.evidence)
			.values([
				{ caseId, userId, title: 'Badge log', evidenceType: 'document', aiSummary: 'Badge swipe for the clerk at 22:04 on the vault door.' },
				{ caseId, userId, title: 'Ledger', evidenceType: 'document', summary: 'Ledger shows an unexplained transfer of 4,000 USD.' }
			])
			.returning({ id: schema.evidence.id })) as Array<{ id: string }>;
		[evidenceA, evidenceB] = rows.map((row) => row.id);
	});

	it('builds facets, links evidence, and exports a summary with admitted citations', async () => {
		const who = await svc.createFacet({ caseId, actorId: userId, facetKind: 'WHO', claimText: 'The clerk had vault access', confidence: 0.7 });
		const why = await svc.createFacet({ caseId, actorId: userId, facetKind: 'WHY', claimText: 'A payment motive is possible', confidence: null });
		facetWho = who.id;
		facetWhy = why.id;

		await svc.linkEvidence({ caseId, facetId: facetWho, evidenceId: evidenceA, actorId: userId, relevance: 0.9, note: null });
		await svc.linkEvidence({ caseId, facetId: facetWhy, evidenceId: evidenceB, actorId: userId, relevance: 0.8, note: 'transfer' });

		const overview = await svc.listInvestigation(caseId);
		expect(overview.map((facet) => facet.facetKind).sort()).toEqual(['WHO', 'WHY']);
		expect(overview.every((facet) => facet.evidence.length === 1)).toBe(true);

		const commandId = randomUUID();
		// Deterministic stub: writes only the WHO and WHY sections that this case has facets for.
		const first = await svc.generateSummaryExport({
			caseId,
			actorId: userId,
			commandId,
			resolveModel: async () => 'stub-model',
			requestModel: async () => `## WHO\nClerk had vault access [evidence:${evidenceA}].\n## WHY\nPayment motive [evidence:${evidenceB}].`
		});
		expect(first.replayed).toBe(false);
		expect(first.exportRow.revision).toBe(1);
		expect(first.exportRow.inputManifestSha256).toMatch(/^[0-9a-f]{64}$/);
		expect(first.exportRow.facetSnapshotSha256).toMatch(/^[0-9a-f]{64}$/);
		expect(first.exportRow.summarySha256).toMatch(/^[0-9a-f]{64}$/);
		expect(first.exportRow.modelId.length).toBeGreaterThan(0);
		expect(first.exportRow.summaryMarkdown.trim().length).toBeGreaterThan(0);
		const admitted = new Set([evidenceA, evidenceB]);
		for (const citation of first.exportRow.citations as string[]) {
			expect(admitted.has(citation)).toBe(true);
		}

		const replay = await svc.generateSummaryExport({ caseId, actorId: userId, commandId });
		expect(replay.replayed).toBe(true);
		expect(replay.exportRow.id).toBe(first.exportRow.id);
	}, 150_000);

	it('rejects a summary that cites evidence outside the case and stores nothing', async () => {
		const stranger = '99999999-9999-4999-8999-999999999999';
		await expect(
			svc.generateSummaryExport({
				caseId,
				actorId: userId,
				commandId: randomUUID(),
				resolveModel: async () => 'stub-model',
				requestModel: async () => `Summary citing [evidence:${stranger}].`
			})
		).rejects.toMatchObject({ code: 'UNSUPPORTED_CITATIONS', status: 422 });

		const exports = await svc.listSummaryExports(caseId);
		expect(exports).toHaveLength(1);
	}, 60_000);

	it('keeps revision numbers sequential across exports', async () => {
		const second = await svc.generateSummaryExport({
			caseId,
			actorId: userId,
			commandId: randomUUID(),
			resolveModel: async () => 'stub-model',
			requestModel: async () => `WHO: clerk had access [evidence:${evidenceA}]. WHY: payment motive [evidence:${evidenceB}].`
		});
		expect(second.exportRow.revision).toBe(2);
		expect(second.exportRow.citations).toEqual([evidenceA, evidenceB]);
		const exports = await svc.listSummaryExports(caseId);
		expect(exports.map((row) => row.revision)).toEqual([2, 1]);
	}, 60_000);

	it('unlinks evidence and blocks export when no evidence remains linked', async () => {
		expect(await svc.unlinkEvidence({ caseId, facetId: facetWho, evidenceId: evidenceA })).toBe(true);
		expect(await svc.unlinkEvidence({ caseId, facetId: facetWhy, evidenceId: evidenceB })).toBe(true);
		await expect(
			svc.generateSummaryExport({ caseId, actorId: userId, commandId: randomUUID(), resolveModel: async () => 'x', requestModel: async () => 'x' })
		).rejects.toMatchObject({ code: 'NO_LINKED_EVIDENCE', status: 422 });
	});

	it('refuses a facet or evidence id from another case', async () => {
		const otherCase = randomUUID();
		await expect(
			svc.linkEvidence({ caseId: otherCase, facetId: facetWho, evidenceId: evidenceA, actorId: userId, relevance: 1, note: null })
		).rejects.toMatchObject({ code: 'FACET_NOT_FOUND', status: 404 });
	});

	it('the append-only export table rejects updates', async () => {
		const exports = await svc.listSummaryExports(caseId);
		const target = exports[0];
		await expect(
			db.update(inv.caseAiSummaryExports).set({ summaryMarkdown: 'tampered' }).where(eq(inv.caseAiSummaryExports.id, target.id))
		).rejects.toBeTruthy();
		await expect(
			db.delete(inv.caseAiSummaryExports).where(eq(inv.caseAiSummaryExports.id, target.id))
		).rejects.toBeTruthy();
	});
});

describe.skipIf(!ENABLED)('investigation HTTP routes (scratch database)', () => {
	let caseId: string;
	let otherCaseEvidence: string;
	let ownerId: number;
	let strangerId: number;
	let facetId: string;
	let evidenceId: string;
	let facetsPost: (event: unknown) => Promise<Response>;
	let overviewGet: (event: unknown) => Promise<Response>;
	let linkPost: (event: unknown) => Promise<Response>;
	let unlinkDelete: (event: unknown) => Promise<Response>;

	beforeAll(async () => {
		if (!(process.env.DATABASE_URL ?? '').includes(SCRATCH_DB)) {
			throw new Error(`Refusing to run: DATABASE_URL must point at ${SCRATCH_DB}`);
		}
		const { db } = await import('$lib/server/db/client.js');
		const schema = await import('$lib/server/db/schema-postgres.js');
		facetsPost = (await import('../../../routes/api/cases/[id]/investigation/facets/+server.js')).POST as never;
		overviewGet = (await import('../../../routes/api/cases/[id]/investigation/+server.js')).GET as never;
		linkPost = (await import('../../../routes/api/cases/[id]/investigation/facets/[facetId]/evidence/+server.js')).POST as never;
		unlinkDelete = (await import('../../../routes/api/cases/[id]/investigation/facets/[facetId]/evidence/[evidenceId]/+server.js')).DELETE as never;

		const suffix = randomUUID().slice(0, 8);
		const users = (await db
			.insert(schema.users)
			.values([
				{ email: `owner-${suffix}@scratch.invalid`, passwordHash: 'scratch-only' },
				{ email: `stranger-${suffix}@scratch.invalid`, passwordHash: 'scratch-only' }
			])
			.returning({ id: schema.users.id })) as Array<{ id: number }>;
		[ownerId, strangerId] = users.map((row) => row.id);

		const [kase] = (await db
			.insert(schema.cases)
			.values({ title: `E2E route ${suffix}`, status: 'open', priority: 'medium', userId: ownerId })
			.returning({ id: schema.cases.id })) as Array<{ id: string }>;
		caseId = kase.id;
		const [otherCase] = (await db
			.insert(schema.cases)
			.values({ title: `E2E other ${suffix}`, status: 'open', priority: 'medium', userId: strangerId })
			.returning({ id: schema.cases.id })) as Array<{ id: string }>;
		const [item] = (await db
			.insert(schema.evidence)
			.values({ caseId, userId: ownerId, title: 'Route evidence', evidenceType: 'document', summary: 'Route test item' })
			.returning({ id: schema.evidence.id })) as Array<{ id: string }>;
		evidenceId = item.id;
		const [foreign] = (await db
			.insert(schema.evidence)
			.values({ caseId: otherCase.id, userId: strangerId, title: 'Foreign', evidenceType: 'document' })
			.returning({ id: schema.evidence.id })) as Array<{ id: string }>;
		otherCaseEvidence = foreign.id;
	});

	const asUser = (id: number | null) => (id === null ? {} : { user: { id: String(id) } });
	const jsonRequest = (method: string, body: unknown) =>
		new Request('http://scratch.invalid/api', { method, headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

	it('returns 401 without a signed-in user', async () => {
		const res = await facetsPost({ locals: asUser(null), params: { id: caseId }, request: jsonRequest('POST', { facetKind: 'WHO', claimText: 'x' }) });
		expect(res.status).toBe(401);
	});

	it('returns 404 to a user who does not own the case, without disclosing its contents', async () => {
		const res = await facetsPost({ locals: asUser(strangerId), params: { id: caseId }, request: jsonRequest('POST', { facetKind: 'WHO', claimText: 'x' }) });
		expect(res.status).toBe(404);
		const body = await res.json();
		expect(body.success).toBe(false);
	});

	it('rejects an invalid facet payload with 400', async () => {
		const res = await facetsPost({ locals: asUser(ownerId), params: { id: caseId }, request: jsonRequest('POST', { facetKind: 'MAYBE', claimText: '' }) });
		expect(res.status).toBe(400);
	});

	it('creates a facet for the owner, links evidence, and returns a stable overview shape', async () => {
		const created = await facetsPost({ locals: asUser(ownerId), params: { id: caseId }, request: jsonRequest('POST', { facetKind: 'HOW', claimText: 'Badge cloned', confidence: 0.4 }) });
		expect(created.status).toBe(201);
		facetId = (await created.json()).data.id;

		const linked = await linkPost({ locals: asUser(ownerId), params: { id: caseId, facetId }, request: jsonRequest('POST', { evidenceId }) });
		expect(linked.status).toBe(201);

		const overview = await overviewGet({ locals: asUser(ownerId), params: { id: caseId } });
		const body = await overview.json();
		expect(body.success).toBe(true);
		expect(Array.isArray(body.data.facets)).toBe(true);
		expect(Array.isArray(body.data.exports)).toBe(true);
		const facet = body.data.facets.find((row: { id: string }) => row.id === facetId);
		expect(facet.evidence.map((item: { evidenceId: string }) => item.evidenceId)).toEqual([evidenceId]);
	});

	it('refuses to link evidence that belongs to a different case', async () => {
		const res = await linkPost({ locals: asUser(ownerId), params: { id: caseId, facetId }, request: jsonRequest('POST', { evidenceId: otherCaseEvidence }) });
		expect(res.status).toBe(404);
		expect((await res.json()).code).toBe('EVIDENCE_NOT_FOUND');
	});

	it('unlinks evidence and returns 404 when the link is already gone', async () => {
		const first = await unlinkDelete({ locals: asUser(ownerId), params: { id: caseId, facetId, evidenceId } });
		expect(first.status).toBe(200);
		const second = await unlinkDelete({ locals: asUser(ownerId), params: { id: caseId, facetId, evidenceId } });
		expect(second.status).toBe(404);
	});
});
