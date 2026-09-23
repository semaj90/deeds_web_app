// @vitest-environment node
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import {
	buildSummaryClaimValidationV1, pendingSummaryClaimValidationV1, SummaryClaimValidationV1Schema, SUMMARY_CLAIM_VALIDATION_SCHEMA,
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
	technical: { status: 'PASS', technicalTokens: ['HNSW'], exactTokens: ['HNSW'], missingTokens: [] },
	numeric: { status: 'PASS', numbers: [], missingNumbers: [] },
	version: { status: 'PASS', versions: [], missingVersions: [] },
	sourceSpan: { status: 'NO_CLAIMED_SPAN', spans: [] },
	semantic: { status: 'JUDGED', verdict: 'PARTIALLY_SUPPORTED', citedSpans: [], unsupportedFragment: 'low-selectivity', judgeModelId: 'ornith-1.5-9b', judgeModelRevision: 'llama-server:8090/props', judgePromptRevision: 'summary-claim-judge-prompt-v0', independenceClass: 'SAME_MODEL_SEMANTIC_JUDGE' },
	ontology: { status: 'NOT_APPLICABLE', kernelRevision: null, assertions: [] },
	result: { decision: 'PENDING', escalationRevision: null },
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

	it('cannot decide while any validator slot is NOT_RUN, and a decision needs the VAL-09 revision', () => {
		expect(() => buildSummaryClaimValidationV1({ ...populated, result: { decision: 'ADMIT', escalationRevision: 'val-09' }, ontology: { status: 'NOT_RUN', kernelRevision: null, assertions: [] } })).toThrow();
		expect(() => buildSummaryClaimValidationV1({ ...populated, result: { decision: 'REVIEW', escalationRevision: null } })).toThrow();
		expect(() => buildSummaryClaimValidationV1({ ...populated, result: { decision: 'PENDING', escalationRevision: 'val-09' } })).toThrow();
		expect(buildSummaryClaimValidationV1({ ...populated, result: { decision: 'REVIEW', escalationRevision: 'val-09' } }).result.decision).toBe('REVIEW');
	});

	it('ADMIT is structurally impossible with a failed slot, an UNSUPPORTED verdict or unverified spans', () => {
		const admit = { decision: 'ADMIT', escalationRevision: 'val-09' } as const;
		expect(() => buildSummaryClaimValidationV1({ ...populated, result: admit, technical: { status: 'FAIL', technicalTokens: ['x.y'], exactTokens: [], missingTokens: ['x.y'] } })).toThrow();
		expect(() => buildSummaryClaimValidationV1({ ...populated, result: admit, semantic: { ...populated.semantic, verdict: 'UNSUPPORTED' } })).toThrow();
		expect(() => buildSummaryClaimValidationV1({ ...populated, result: admit, sourceSpan: { status: 'UNVERIFIED', spans: [] } })).toThrow();
		expect(buildSummaryClaimValidationV1({ ...populated, result: admit, semantic: { ...populated.semantic, verdict: 'SUPPORTED', unsupportedFragment: null } }).result.decision).toBe('ADMIT');
	});

	it('semantic slot: a verdict only when JUDGED, judge provenance required, NOT_RUN must be empty', () => {
		const sem = populated.semantic;
		expect(() => buildSummaryClaimValidationV1({ ...populated, semantic: { ...sem, status: 'NOT_RUN' } })).toThrow();
		expect(() => buildSummaryClaimValidationV1({ ...populated, semantic: { ...sem, judgeModelId: null } })).toThrow();
		expect(() => buildSummaryClaimValidationV1({ ...populated, semantic: { ...sem, verdict: null } })).toThrow();
		expect(buildSummaryClaimValidationV1({ ...populated, semantic: { status: 'JUDGE_ERROR', verdict: null, citedSpans: [], unsupportedFragment: null, judgeModelId: null, judgeModelRevision: null, judgePromptRevision: null, independenceClass: null } }).semantic.status).toBe('JUDGE_ERROR');
	});

	it('ontology slot applies to typed assertions only and needs a kernel revision when run', () => {
		expect(() => buildSummaryClaimValidationV1({ ...populated, ontology: { status: 'PASS', kernelRevision: null, assertions: [] } })).toThrow();
		expect(() => buildSummaryClaimValidationV1({ ...populated, ontology: { status: 'NOT_APPLICABLE', kernelRevision: null, assertions: [{ subject: 'a', predicate: 'IS_A', object: 'b', oakStatus: 'VALID' }] } })).toThrow();
		expect(buildSummaryClaimValidationV1({ ...populated, ontology: { status: 'PASS', kernelRevision: 'oak-kernel:r1', assertions: [{ subject: 'hnsw.iterative_scan', predicate: 'PART_OF', object: 'pgvector', oakStatus: 'VALID' }] } }).ontology.status).toBe('PASS');
	});

	it('spans are chunk-relative, non-empty ranges with a checksum', () => {
		const span = { startByte: 10, endByte: 20, spanChecksum: sum('bytes') };
		expect(buildSummaryClaimValidationV1({ ...populated, sourceSpan: { status: 'VERIFIED', spans: [span] } }).sourceSpan.spans[0]).toEqual(span);
		expect(() => buildSummaryClaimValidationV1({ ...populated, sourceSpan: { status: 'VERIFIED', spans: [{ ...span, endByte: 10 }] } })).toThrow();
	});

	it('requires chunk-grain identity (sha256: chunk evidence revision, not a bare hash)', () => {
		expect(() => buildSummaryClaimValidationV1({ ...populated, chunkEvidenceRevision: 'b4ac81deeb1a9e4d3cb6c3e4c4f047dd744739a4a7b0cd573f7ff3dba0ab195a' })).toThrow();
	});
});
