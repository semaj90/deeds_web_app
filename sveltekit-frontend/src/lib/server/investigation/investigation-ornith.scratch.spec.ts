// @vitest-environment node
/**
 * Real-model contract (scratch database only, requires llama-server on :8090):
 * a case with WHO and WHAT facets and NO WHY/HOW facets. Either the server accepts an export that
 * states no invented WHY/HOW conclusion, or it rejects the model output with UNSUPPORTED_SECTION.
 *   INVESTIGATION_SCRATCH_E2E=1 DATABASE_URL=<...legal_ai_live_integration_scratch> npx vitest run <this file>
 */
import { randomUUID } from 'node:crypto';
import { describe, expect, it, beforeAll } from 'vitest';

const ENABLED = process.env.INVESTIGATION_SCRATCH_E2E === '1';
const SCRATCH_DB = 'legal_ai_live_integration_scratch';

describe.skipIf(!ENABLED)('ornith summary contract: WHO/WHAT facets, no WHY/HOW (scratch database)', () => {
	let caseId: string;
	let userId = 1;
	let evidenceId: string;

	beforeAll(async () => {
		if (!(process.env.DATABASE_URL ?? '').includes(SCRATCH_DB)) {
			throw new Error(`Refusing to run: DATABASE_URL must point at ${SCRATCH_DB}`);
		}
		const { db } = await import('$lib/server/db/client.js');
		const schema = await import('$lib/server/db/schema-postgres.js');
		const svc = await import('./investigation-v1.js');
		const [kase] = (await db
			.insert(schema.cases)
			.values({ title: `Ornith ${randomUUID().slice(0, 8)}`, status: 'open', priority: 'medium', userId })
			.returning({ id: schema.cases.id })) as Array<{ id: string }>;
		caseId = kase.id;
		const [item] = (await db
			.insert(schema.evidence)
			.values({ caseId, userId, title: 'Badge log', evidenceType: 'document', aiSummary: 'Badge swipe for the clerk at 22:04 on the vault door.' })
			.returning({ id: schema.evidence.id })) as Array<{ id: string }>;
		evidenceId = item.id;
		const who = await svc.createFacet({ caseId, actorId: userId, facetKind: 'WHO', claimText: 'The clerk had vault access', confidence: null });
		const what = await svc.createFacet({ caseId, actorId: userId, facetKind: 'WHAT', claimText: 'The vault was opened at 22:04', confidence: null });
		await svc.linkEvidence({ caseId, facetId: who.id, evidenceId, actorId: userId, relevance: 1, note: null });
		await svc.linkEvidence({ caseId, facetId: what.id, evidenceId, actorId: userId, relevance: 1, note: null });
	});

	it('real model output is either admissible (no invented WHY/HOW) or rejected as UNSUPPORTED_SECTION', async () => {
		const svc = await import('./investigation-v1.js');
		const { unsupportedSections } = await import('./investigation-manifest-v1.js');
		let outcome: string;
		try {
			const result = await svc.generateSummaryExport({ caseId, actorId: userId, commandId: randomUUID() });
			const invented = unsupportedSections(result.exportRow.summaryMarkdown, ['WHO', 'WHAT']);
			expect(invented).toEqual([]);
			outcome = `ACCEPTED model=${result.exportRow.modelId}`;
		} catch (error) {
			expect(error).toMatchObject({ code: 'UNSUPPORTED_SECTION', status: 422 });
			outcome = `REJECTED UNSUPPORTED_SECTION sections=${JSON.stringify((error as { details?: unknown }).details)}`;
		}
		console.log(`[ornith-contract] ${outcome}`);
	}, 240_000);
});
