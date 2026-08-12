// @vitest-environment node
//
// Real-Postgres integration test for CODE_EVIDENCE_LEDGER_READBACK_PROVEN.
// Deliberately NOT mocked (unlike analysis-pass-results.idempotency.spec.ts) —
// the acceptance criteria require proving persist -> readback against the
// actual writer and actual read path, not a stand-in.
//
// If Postgres is unreachable this reports BLOCKED_BY_RUNTIME_DEPENDENCY via
// a skipped test with a clear console reason, not a failure — a connection
// timeout is an infrastructure condition, not evidence the readback path is
// broken. See docs/reports/parent-atlas-open-lanes-todo.md, CODE EVIDENCE
// LOWER LANE section.

import './test-env-bootstrap.js';

import { randomUUID } from 'node:crypto';
import { beforeAll, describe, expect, it } from 'vitest';

import { computePacketKey } from '$lib/server/atlas/identity/packet-key-builder.js';
import {
	buildCodeEvidenceSynthesizerReceiptFromSource,
	buildCodeEvidenceLedgerInputFromSource,
} from './code-evidence-synthesizer.js';
import { recordAnalysisPassResult } from './analysis-pass-results.js';
import { readCodeEvidenceLedgerEntry } from './code-evidence-readback.js';
import { stableStringify, sha256Hex } from './stable-hash.js';

let dbAvailable = true;
let dbUnavailableReason = '';

beforeAll(async () => {
	try {
		const { pool } = await import('$lib/server/db/client.js');
		await pool.query('SELECT 1');
	} catch (err) {
		dbAvailable = false;
		dbUnavailableReason = `BLOCKED_BY_RUNTIME_DEPENDENCY: POSTGRES_CONNECTION_TIMEOUT — ${String(err)}`;
	}
});

describe('code-evidence-readback (integration)', () => {
	it('proves enqueue -> persist -> readback identity round-trip', async (ctx) => {
		if (!dbAvailable) {
			console.warn(dbUnavailableReason);
			ctx.skip();
			return;
		}

		// Unique identity per run — this hits a real, persistent DB, so a fixed
		// identity would collide with rows left by prior runs.
		const runId = randomUUID();
		const sourceRef = `src/lib/server/readback-fixture-${runId}.ts`;
		const packetKey = computePacketKey(sourceRef, `tree:node:${runId}`, `title:${runId}`);

		// ── Step 1: build ledger input from a real synthesized receipt ──────────
		const synthesized = await buildCodeEvidenceSynthesizerReceiptFromSource({
			packetKey,
			sourceRef,
			sourceRevision: `source:${runId}`,
			treeNodeId: `tree:node:${runId}`,
			titleId: `title:${runId}`,
			featureId: `feature:readback-${runId}`,
			featureLabel: 'Readback fixture',
			text: 'export class ReadbackFixture { run(id: string) { return id; } }',
			isCode: true,
			representationRevision: 'semantic_768@1',
			producerId: 'code-evidence-readback-spec',
			producerRevision: 'code-evidence-readback-spec-v1',
			featureRevision: 'feature:v1',
			semanticConceptIds: ['concept:readback'],
			ontologyIds: ['ontology:readback-fixture'],
			extractedFeatures: [
				{
					type: 'ast_class',
					name: 'ReadbackFixture',
					description: 'Class ReadbackFixture',
					source: 'ast-grep',
					lineNumber: 1,
					confidence: 0.95,
				},
			],
		});
		expect(synthesized).not.toBeNull();
		if (!synthesized) return;

		const expectedSynthesisReceiptHash = sha256Hex(stableStringify(synthesized.receipt));
		const expectedPosConceptPacketHash = sha256Hex(stableStringify(synthesized.packet));

		const ledgerInput = buildCodeEvidenceLedgerInputFromSource({
			analysisJobId: runId,
			evidenceId: runId,
			jobType: 'code_feature_registry',
			packetKey,
			sourceRef,
			sourceRevision: `source:${runId}`,
			representationRevision: 'semantic_768@1',
			family: 'code_evidence',
			passName: 'code_feature_registry',
			passRevision: 'code-feature-registry-v1',
			backend: 'native-ts',
			backendVersion: 'code-evidence-readback-spec-v1',
			device: 'cpu',
			startedAt: new Date().toISOString(),
			completedAt: new Date().toISOString(),
			analysisWorkerProducerId: 'code-evidence-readback-spec',
			analysisWorkerProducerRevision: 'code-evidence-readback-spec-v1',
			synthesized,
		});
		expect(ledgerInput).not.toBeNull();
		if (!ledgerInput) return;

		// ── Step 2 + 3: persist through the existing writer, obtain the durable
		// row identity (passKey) the caller uses to read it back later. ────────
		const persisted = await recordAnalysisPassResult(ledgerInput);
		expect(persisted).not.toBeNull();
		if (!persisted) return;
		expect(persisted.inserted).toBe(true);
		expect(persisted.idempotencyKey).toBeTruthy();

		// ── Step 4 + 5: read back through the canonical read path and verify
		// every identity field matches what was actually enqueued. ─────────────
		const readback = await readCodeEvidenceLedgerEntry(persisted.idempotencyKey, {
			sourceRef,
			sourceRevision: `source:${runId}`,
			packetKey,
			schemaRevision: synthesized.receipt.schemaVersion,
			// buildCodeEvidenceLedgerInputFromSource sets ledgerInput.producerRevision
			// = analysisWorkerProducerRevision (below), and normalizeAnalysisPassLedgerInput
			// carries that straight into provenance.producerRevision.
			producerRevision: 'code-evidence-readback-spec-v1',
			synthesisReceiptHash: expectedSynthesisReceiptHash,
			posConceptPacketHash: expectedPosConceptPacketHash,
		});

		expect(readback.status).toBe('FOUND');
		expect(readback.mismatches).toEqual([]);
		expect(readback.evidenceId).toBeTruthy();
		expect(readback.sourceRef).toBe(sourceRef);
		expect(readback.sourceRevision).toBe(`source:${runId}`);
		expect(readback.packetKey).toBe(packetKey);
		expect(readback.schemaRevision).toBe(synthesized.receipt.schemaVersion);
		expect(readback.synthesisReceiptHash).toBe(expectedSynthesisReceiptHash);
		expect(readback.posConceptPacketHash).toBe(expectedPosConceptPacketHash);

		// ── Step 6: missing row returns typed NOT_FOUND, not an empty FOUND. ────
		const missing = await readCodeEvidenceLedgerEntry(`analysis-pass:does-not-exist-${runId}`);
		expect(missing.status).toBe('NOT_FOUND');
		expect(missing.sourceRef).toBeNull();

		// ── Step 7: mismatched revision does not silently fall back — it must
		// come back REVISION_MISMATCH with the exact field(s) that diverged. ───
		const mismatchCheck = await readCodeEvidenceLedgerEntry(persisted.idempotencyKey, {
			sourceRevision: `source:WRONG-${runId}`,
		});
		expect(mismatchCheck.status).toBe('REVISION_MISMATCH');
		expect(mismatchCheck.mismatches.length).toBeGreaterThan(0);
		expect(mismatchCheck.mismatches[0]).toContain('sourceRevision');

		// ── Step 8: replay of the same logical input, classified according to
		// EXISTING ledger semantics (not changed here). 'code_feature_registry'
		// is not in KNOWN_PASS_EXECUTION_SEMANTICS, so resolveExecutionSemantics
		// falls back to 'observed_event' — every execution is a distinct
		// observed event, so a replay with identical input is expected to
		// insert a SECOND row rather than being deduplicated/rejected. This is
		// the actual, current, documented behavior — proving it, not asserting
		// what would be "nicer."
		const replay = await recordAnalysisPassResult(ledgerInput);
		expect(replay).not.toBeNull();
		if (!replay) return;
		expect(replay.inserted).toBe(true);
		expect(replay.row.id).not.toBe(persisted.row.id);
	});
});
