// @vitest-environment node
/**
 * Duplicate command-ID proofs (scratch database only):
 *   INVESTIGATION_SCRATCH_E2E=1 DATABASE_URL=<...legal_ai_live_integration_scratch> npx vitest run <this file>
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeAll } from 'vitest';
import { eq } from 'drizzle-orm';

const ENABLED = process.env.INVESTIGATION_SCRATCH_E2E === '1';
const SCRATCH_DB = 'legal_ai_live_integration_scratch';
// Each injected winner needs a revision no other test has used on the shared case.
const nextRevision = () => 1000 + Math.floor(Math.random() * 1_000_000);

describe.skipIf(!ENABLED)('investigation duplicate command IDs (scratch database)', () => {
	let caseId: string;
	let evidenceId: string;
	let userId = 1;

	beforeAll(async () => {
		if (!(process.env.DATABASE_URL ?? '').includes(SCRATCH_DB)) {
			throw new Error(`Refusing to run: DATABASE_URL must point at ${SCRATCH_DB}`);
		}
		const { db } = await import('$lib/server/db/client.js');
		const schema = await import('$lib/server/db/schema-postgres.js');
		const svc = await import('./investigation-v1.js');
		const [kase] = (await db
			.insert(schema.cases)
			.values({ title: `Race ${randomUUID().slice(0, 8)}`, status: 'open', priority: 'medium', userId })
			.returning({ id: schema.cases.id })) as Array<{ id: string }>;
		caseId = kase.id;
		const [item] = (await db
			.insert(schema.evidence)
			.values({ caseId, userId, title: 'Race exhibit', evidenceType: 'document', aiSummary: 'Race fixture text.' })
			.returning({ id: schema.evidence.id })) as Array<{ id: string }>;
		evidenceId = item.id;
		const facet = await svc.createFacet({ caseId, actorId: userId, facetKind: 'WHAT', claimText: 'Race claim', confidence: null });
		await svc.linkEvidence({ caseId, facetId: facet.id, evidenceId, actorId: userId, relevance: 1, note: null });
	});

	const model = (_prompt: string, _model: string) => Promise.resolve(`WHAT: race claim [evidence:${evidenceId}].`);

	it('two concurrent requests with one commandId produce one revision and one replay, never a 500', async () => {
		const svc = await import('./investigation-v1.js');
		const commandId = randomUUID();
		const run = () => svc.generateSummaryExport({ caseId, actorId: userId, commandId, resolveModel: async () => 'stub', requestModel: model });
		const results = await Promise.allSettled([run(), run()]);
		const fulfilled = results.filter((r): r is PromiseFulfilledResult<Awaited<ReturnType<typeof run>>> => r.status === 'fulfilled');
		expect(fulfilled).toHaveLength(2);
		expect(fulfilled.filter((r) => r.value.replayed === false)).toHaveLength(1);
		expect(new Set(fulfilled.map((r) => r.value.exportRow.id)).size).toBe(1);
	}, 120_000);

	it('forces a real 23505 on command_id and returns the committed export as a replay', async () => {
		const svc = await import('./investigation-v1.js');
		const { db } = await import('$lib/server/db/client.js');
		const { caseAiSummaryExports } = await import('$lib/server/db/schema/investigation.js');
		const commandId = randomUUID();
		const current = await svc.buildInvestigationManifest(caseId);
		const { buildHashes } = await import('./investigation-manifest-v1.js');
		const hashes = buildHashes(current);
		// The competing command is committed after our pre-check missed and before our insert.
		let injected: string | null = null;
		const winnerRun = async () => {
			const [winner] = (await db
				.insert(caseAiSummaryExports)
				.values({
					caseId, revision: nextRevision(), commandId,
					inputManifestSha256: hashes.inputManifestSha256,
					facetSnapshotSha256: hashes.facetSnapshotSha256,
					summarySha256: 'a'.repeat(64), modelId: 'winner', summaryMarkdown: 'winner text', citations: [], createdBy: userId
				})
				.returning({ id: caseAiSummaryExports.id })) as Array<{ id: string }>;
			injected = winner.id;
		};
		const result = await svc.generateSummaryExport({
			caseId, actorId: userId, commandId, resolveModel: async () => 'stub', requestModel: model, beforeInsert: winnerRun
		});
		expect(injected).not.toBeNull();
		expect(result.replayed).toBe(true);
		expect(result.exportRow.id).toBe(injected);
		const rows = await db.select().from(caseAiSummaryExports).where(eq(caseAiSummaryExports.commandId, commandId));
		expect(rows).toHaveLength(1);
	}, 120_000);

	it('rejects a recovered duplicate whose investigation state differs, instead of replaying it', async () => {
		const svc = await import('./investigation-v1.js');
		const { db } = await import('$lib/server/db/client.js');
		const { caseAiSummaryExports } = await import('$lib/server/db/schema/investigation.js');
		const commandId = randomUUID();
		const winnerRun = async () => {
			await db.insert(caseAiSummaryExports).values({
				caseId, revision: nextRevision(), commandId,
				inputManifestSha256: 'f'.repeat(64), facetSnapshotSha256: 'f'.repeat(64), summarySha256: 'f'.repeat(64),
				modelId: 'winner', summaryMarkdown: 'other state', citations: [], createdBy: userId
			});
		};
		await expect(
			svc.generateSummaryExport({ caseId, actorId: userId, commandId, resolveModel: async () => 'stub', requestModel: model, beforeInsert: winnerRun })
		).rejects.toMatchObject({ code: 'COMMAND_REUSED', status: 409 });
		const rows = await db.select().from(caseAiSummaryExports).where(eq(caseAiSummaryExports.commandId, commandId));
		expect(rows).toHaveLength(1);
	}, 120_000);

	it('rejects a pre-check replay whose investigation state differs, without calling the model', async () => {
		const svc = await import('./investigation-v1.js');
		const { db } = await import('$lib/server/db/client.js');
		const { caseAiSummaryExports } = await import('$lib/server/db/schema/investigation.js');
		const commandId = randomUUID();
		await db.insert(caseAiSummaryExports).values({
			caseId, revision: nextRevision(), commandId,
			inputManifestSha256: 'e'.repeat(64), facetSnapshotSha256: 'e'.repeat(64), summarySha256: 'e'.repeat(64),
			modelId: 'old', summaryMarkdown: 'old state', citations: [], createdBy: userId
		});
		let modelCalls = 0;
		await expect(
			svc.generateSummaryExport({ caseId, actorId: userId, commandId, resolveModel: async () => 'stub', requestModel: async () => { modelCalls++; return 'x'; } })
		).rejects.toMatchObject({ code: 'COMMAND_REUSED', status: 409 });
		expect(modelCalls).toBe(0);
	}, 120_000);
});
