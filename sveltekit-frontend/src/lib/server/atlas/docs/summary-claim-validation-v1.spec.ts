// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
	buildSummaryClaimValidationV1, computeSummaryClaimChecksumV1, pendingSummaryClaimValidationV1, SummaryClaimValidationV1Schema, SUMMARY_CLAIM_VALIDATION_SCHEMA, verifySummaryClaimByteSpanV1,
	type SummaryClaimValidationInputV1
} from './summary-claim-validation-v1.js';

const FIXTURE = resolve(import.meta.dirname, '__fixtures__/summary-claim-validation-v1.fixture.json');
const sum = (t: string) => canonicalSha256V1({ text: t });

const base = {
	chunkId: 'doc:pgvector:fe883c75f323441d:22',
	chunkEvidenceRevision: 'sha256:b4ac81deeb1a9e4d3cb6c3e4c4f047dd744739a4a7b0cd573f7ff3dba0ab195a',
	analysisId: null,
	summaryInputChecksum: sum('chunk input'),
	summaryOutputChecksum: sum('summary output'),
	claimOrdinal: 0,
	claimText: 'Queries with low-selectivity filters can return fewer results under HNSW.',
	validatorRevision: 'summary-claim-validator:val-01-contract-only'
};

const populated: SummaryClaimValidationInputV1 = {
	...base,
	schema: SUMMARY_CLAIM_VALIDATION_SCHEMA,
	technical: { status: 'PASS', sourceTokens: ['HNSW'], claimTokens: ['HNSW'], missingTechnicalTokens: [], unexpectedTechnicalTokens: [] },
	numeric: { status: 'PASS', sourceValues: [], claimValues: [], unsupportedValues: [] },
	version: { status: 'PASS', sourceVersions: [], claimVersions: [], unsupportedVersions: [] },
	sourceSpan: { status: 'NO_CLAIMED_SPAN', spans: [] },
	semantic: { status: 'NOT_RUN', verdict: null, citedSpans: [], unsupportedFragment: null, judgeModelId: null, judgeModelRevision: null, judgePromptRevision: null, independenceClass: null },
	ontology: { status: 'NOT_APPLICABLE', kernelRevision: null, assertions: [] },
	result: { decision: 'PENDING', escalationRevision: null },
	resolutionLayer: 'NOT_RESOLVED',
	canonicalAuthority: false
};

const build = () => ({ skeleton: pendingSummaryClaimValidationV1(base), populated: buildSummaryClaimValidationV1(populated) });

describe('SummaryClaimValidationV1 (VAL-01, contract only)', () => {
	it('matches the canonical JSON fixture the VAL-02 Pydantic mirror parses (UPDATE_FIXTURE=1 regenerates)', () => {
		if (process.env.UPDATE_FIXTURE === '1' || !existsSync(FIXTURE)) writeFileSync(FIXTURE, JSON.stringify(build(), null, 2) + '\n');
		expect(JSON.parse(readFileSync(FIXTURE, 'utf8'))).toEqual(JSON.parse(JSON.stringify(build())));
	});

	it('is deterministic, idempotent for the same inputs, and appends for a new validator revision', () => {
		const a = buildSummaryClaimValidationV1(populated);
		expect(buildSummaryClaimValidationV1(populated)).toEqual(a);
		const b = buildSummaryClaimValidationV1({ ...populated, validatorRevision: 'summary-claim-validator:next' });
		expect(b.validationId).not.toBe(a.validationId);
		expect(buildSummaryClaimValidationV1({ ...populated, claimOrdinal: 1 }).validationId).not.toBe(a.validationId);
	});

	it('the skeleton has every slot NOT_RUN and a PENDING decision, and is never canonical authority', () => {
		const s = pendingSummaryClaimValidationV1(base);
		expect([s.technical.status, s.numeric.status, s.version.status, s.sourceSpan.status, s.semantic.status, s.ontology.status]).toEqual(Array(6).fill('NOT_RUN'));
		expect(s.result).toEqual({ decision: 'PENDING', escalationRevision: null });
		expect(s.canonicalAuthority).toBe(false);
	});

	it('rejects tampering (checksum/id are recomputed) and unknown fields', () => {
		const good = buildSummaryClaimValidationV1(populated);
		expect(SummaryClaimValidationV1Schema.safeParse({ ...good, claimText: 'changed' }).success).toBe(false);
		expect(SummaryClaimValidationV1Schema.safeParse({ ...good, validationId: `scv:${'0'.repeat(64)}` }).success).toBe(false);
		expect(SummaryClaimValidationV1Schema.safeParse({ ...good, extra: 1 }).success).toBe(false);
		expect(SummaryClaimValidationV1Schema.safeParse({ ...good, canonicalAuthority: true }).success).toBe(false);
	});

	it('accepts structurally valid result values without implementing the VAL-09 decision algorithm', () => {
		const result = { decision: 'ADMIT', escalationRevision: null } as const;
		const pendingWithUnrunSlots = pendingSummaryClaimValidationV1(base);
		expect(buildSummaryClaimValidationV1({ ...populated, result, technical: pendingWithUnrunSlots.technical }).result.decision).toBe('ADMIT');
		expect(buildSummaryClaimValidationV1({ ...populated, result: { decision: 'REVIEW', escalationRevision: null } }).result.decision).toBe('REVIEW');
	});

	it('accepts the full semantic verdict taxonomy without executing a judge', () => {
		const schemaOnlyJudgeShape = { ...populated.semantic, status: 'JUDGED' as const, verdict: 'UNKNOWN' as const, judgeModelId: 'fixture-only', judgeModelRevision: 'fixture-model:r1', judgePromptRevision: 'fixture-prompt:r1', independenceClass: 'SAME_MODEL_SEMANTIC_JUDGE' as const };
		for (const verdict of ['SUPPORTED', 'SUPPORTED_PARAPHRASE', 'SUPPORTED_WITH_OMISSION', 'PARTIALLY_SUPPORTED', 'UNSUPPORTED_CLAIM', 'CONTRADICTED', 'INSUFFICIENT_EVIDENCE', 'UNKNOWN'] as const) {
			expect(buildSummaryClaimValidationV1({ ...populated, semantic: { ...schemaOnlyJudgeShape, verdict } }).semantic.verdict).toBe(verdict);
		}
	});

	it('semantic slot: a verdict only when JUDGED, judge provenance required, NOT_RUN must be empty', () => {
		const sem = { ...populated.semantic, status: 'JUDGED' as const, verdict: 'SUPPORTED' as const, citedSpans: [], unsupportedFragment: null, judgeModelId: 'fixture-only', judgeModelRevision: 'fixture-model:r1', judgePromptRevision: 'fixture-prompt:r1', independenceClass: 'SAME_MODEL_SEMANTIC_JUDGE' as const };
		expect(() => buildSummaryClaimValidationV1({ ...populated, semantic: { ...sem, status: 'NOT_RUN' } })).toThrow();
		expect(() => buildSummaryClaimValidationV1({ ...populated, semantic: { ...sem, judgeModelId: null } })).toThrow();
		expect(() => buildSummaryClaimValidationV1({ ...populated, semantic: { ...sem, verdict: null } })).toThrow();
		expect(buildSummaryClaimValidationV1({ ...populated, semantic: { status: 'JUDGE_ERROR', verdict: null, citedSpans: [], unsupportedFragment: null, judgeModelId: null, judgeModelRevision: null, judgePromptRevision: null, independenceClass: null } }).semantic.status).toBe('JUDGE_ERROR');
	});

	it('ontology slot applies to typed assertions only and needs a kernel revision when run', () => {
		expect(() => buildSummaryClaimValidationV1({ ...populated, ontology: { status: 'PASS', kernelRevision: null, assertions: [] } })).toThrow();
		expect(() => buildSummaryClaimValidationV1({ ...populated, ontology: { status: 'NOT_APPLICABLE', kernelRevision: null, assertions: [{ subject: 'a', predicate: 'IS_A', object: 'b', status: 'SUPPORTED', evidenceRef: 'span:0-1' }] } })).toThrow();
		expect(buildSummaryClaimValidationV1({ ...populated, ontology: { status: 'PASS', kernelRevision: 'oak-kernel:r1', assertions: [{ subject: 'hnsw.iterative_scan', predicate: 'PART_OF', object: 'pgvector', status: 'SUPPORTED', evidenceRef: 'span:10-20' }] } }).ontology.status).toBe('PASS');
	});

	it('spans are chunk-relative, non-empty ranges with a checksum', () => {
		const span = { startByte: 10, endByte: 20, textChecksum: sum('bytes') };
		expect(buildSummaryClaimValidationV1({ ...populated, sourceSpan: { status: 'VERIFIED', spans: [span] } }).sourceSpan.spans[0]).toEqual(span);
		expect(() => buildSummaryClaimValidationV1({ ...populated, sourceSpan: { status: 'VERIFIED', spans: [{ ...span, endByte: 10 }] } })).toThrow();
	});

	it('VAL-05 verifies exact UTF-8 byte spans, revision binding and checksums independently', () => {
		const chunkEvidenceRevision = base.chunkEvidenceRevision;
		const bytes = Buffer.from('alpha 🧭 beta', 'utf8');
		const startByte = Buffer.from('alpha ', 'utf8').byteLength;
		const selected = Buffer.from('🧭', 'utf8');
		const span = { startByte, endByte: startByte + selected.byteLength, textChecksum: createHash('sha256').update(selected).digest('hex') };
		expect(verifySummaryClaimByteSpanV1({ canonicalChunkEvidenceRevision: chunkEvidenceRevision, claimedChunkEvidenceRevision: chunkEvidenceRevision, canonicalChunkBytes: bytes, span })).toEqual({ verified: true, status: 'VERIFIED', reason: 'EXACT' });
		expect(verifySummaryClaimByteSpanV1({ canonicalChunkEvidenceRevision: chunkEvidenceRevision, claimedChunkEvidenceRevision: `sha256:${'0'.repeat(64)}`, canonicalChunkBytes: bytes, span }).reason).toBe('REVISION_MISMATCH');
		expect(verifySummaryClaimByteSpanV1({ canonicalChunkEvidenceRevision: chunkEvidenceRevision, claimedChunkEvidenceRevision: chunkEvidenceRevision, canonicalChunkBytes: bytes, span: { ...span, endByte: bytes.byteLength + 1 } }).reason).toBe('OUT_OF_BOUNDS');
		expect(verifySummaryClaimByteSpanV1({ canonicalChunkEvidenceRevision: chunkEvidenceRevision, claimedChunkEvidenceRevision: chunkEvidenceRevision, canonicalChunkBytes: bytes, span: { ...span, textChecksum: sum('different') } }).reason).toBe('CHECKSUM_MISMATCH');
		expect(verifySummaryClaimByteSpanV1({ canonicalChunkEvidenceRevision: chunkEvidenceRevision, claimedChunkEvidenceRevision: chunkEvidenceRevision, canonicalChunkBytes: bytes, span: { ...span, startByte: startByte + 1, endByte: startByte + 3 } }).reason).toBe('INVALID_UTF8');
	});

	it('requires chunk-grain identity (sha256: chunk evidence revision, not a bare hash)', () => {
		expect(() => buildSummaryClaimValidationV1({ ...populated, chunkEvidenceRevision: 'b4ac81deeb1a9e4d3cb6c3e4c4f047dd744739a4a7b0cd573f7ff3dba0ab195a' })).toThrow();
	});

	it('claim checksum is canonical and independent of execution-local ordinal', () => {
		const claimChecksum = computeSummaryClaimChecksumV1(populated.claimText);
		const first = buildSummaryClaimValidationV1(populated);
		const second = buildSummaryClaimValidationV1({ ...populated, claimOrdinal: 7 });
		expect(first.claimChecksum).toBe(claimChecksum);
		expect(second.claimChecksum).toBe(claimChecksum);
		expect(computeSummaryClaimChecksumV1(`${populated.claimText} Changed.`)).not.toBe(claimChecksum);
		expect(first.resolutionLayer).toBe('NOT_RESOLVED');
		const left = { claim: { text: populated.claimText, kind: 'FACT' }, lineage: { chunkId: base.chunkId, ordinal: 1 } };
		const right = { lineage: { ordinal: 1, chunkId: base.chunkId }, claim: { kind: 'FACT', text: populated.claimText } };
		expect(canonicalSha256V1(left)).toBe(canonicalSha256V1(right));
	});

	it('rejects empty identity, placeholder revision, negative ordinal and bad checksum fields', () => {
		expect(() => buildSummaryClaimValidationV1({ ...populated, chunkId: '' })).toThrow();
		expect(() => buildSummaryClaimValidationV1({ ...populated, validatorRevision: 'latest' })).toThrow();
		expect(() => buildSummaryClaimValidationV1({ ...populated, claimOrdinal: -1 })).toThrow();
		expect(SummaryClaimValidationV1Schema.safeParse({ ...buildSummaryClaimValidationV1(populated), claimChecksum: 'not-a-sha256' }).success).toBe(false);
	});
});
