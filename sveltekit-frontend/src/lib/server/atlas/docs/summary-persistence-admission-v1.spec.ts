// @vitest-environment node
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { canonicalSha256V1 } from '../prefill/canonical-hash-v1.js';
import { evaluateSummaryPersistenceAdmissionV1, partitionByAdmissionV1, SUMMARY_PERSISTENCE_ADMISSION_SCHEMA } from './summary-persistence-admission-v1.js';

const H = (c: string) => c.repeat(64);
	const candidate = { chunkId: 'doc:pgvector:fe883c75f323441d:22', chunkEvidenceRevision: `sha256:${H('b')}`, inputChecksum: H('d'), outputSha256: H('c') };
const claim = (i: number, decision = 'ADMIT') => ({ claimOrdinal: i, claimChecksum: H('1'), validationId: `scv:${H('2')}`, validationChecksum: H('3'), decision, resolutionLayer: 'COMPOSITE', judgeInputChecksum: H('4') });
function seal(patch: Record<string, unknown> = {}) {
	const claims = (patch.claims as ReturnType<typeof claim>[] | undefined) ?? [claim(0), claim(1)];
	const body = {
		schema: SUMMARY_PERSISTENCE_ADMISSION_SCHEMA, chunkId: candidate.chunkId, chunkEvidenceRevision: candidate.chunkEvidenceRevision, summaryInputChecksum: candidate.inputChecksum, summaryOutputSha256: candidate.outputSha256,
		summaryOutputChecksum: H('5'), splitterRevision: 'claims-of:sentence-regex-v1', claimCount: claims.length, claims,
		wholeSummaryEligible: claims.length > 0 && claims.every((c) => c.decision === 'ADMIT'), resolverRevision: 'summary-claim-resolution:val-09-v1', validatorRevision: 'summary-claim-validator:val-10-replay-v1',
		judgePromptRevision: 'summary-claim-judge-prompt:val-07-v1', judgeModelRevision: 'ornith-1.5-9b:hforf.gguf', canonicalAuthority: false, ...patch
	};
	return { ...body, admissionChecksum: canonicalSha256V1(body) };
}

describe('VAL10B cross-language seal parity (report sealed by python/atlas_summary_admission_v1.py)', () => {
	const fx = JSON.parse(readFileSync(new URL('./__fixtures__/summary-persistence-admission-v1.fixture.json', import.meta.url), 'utf8')) as Record<'eligible' | 'ineligible', { summaryText: string; summaryInputChecksum: string; report: { chunkId: string; chunkEvidenceRevision: string } }>;
	const cand = (k: 'eligible' | 'ineligible') => ({ chunkId: fx[k].report.chunkId, chunkEvidenceRevision: fx[k].report.chunkEvidenceRevision, inputChecksum: fx[k].summaryInputChecksum, outputSha256: createHash('sha256').update(fx[k].summaryText, 'utf8').digest('hex') });
	it('verifies the Python seal and permits the all-ADMIT summary', () => {
		expect(evaluateSummaryPersistenceAdmissionV1(cand('eligible'), fx.eligible.report)).toEqual({ eligible: true, reasons: [] });
	});
	it('verifies the Python seal but rejects the summary whose claim is not ADMIT; a one-byte text change is OUTPUT_CHANGED', () => {
		expect(evaluateSummaryPersistenceAdmissionV1(cand('ineligible'), fx.ineligible.report).reasons).toEqual(['CLAIM_REJECT']);
		expect(evaluateSummaryPersistenceAdmissionV1({ ...cand('eligible'), outputSha256: createHash('sha256').update(fx.eligible.summaryText + ' ', 'utf8').digest('hex') }, fx.eligible.report).reasons).toEqual(['OUTPUT_CHANGED']);
	});
});

describe('VAL10B summary persistence admission', () => {
	it('permits a sealed report where every claim is ADMIT and identity/text match', () => {
		expect(evaluateSummaryPersistenceAdmissionV1(candidate, seal())).toEqual({ eligible: true, reasons: [] });
	});
	it('rejects missing, malformed and unsealed (tampered) reports', () => {
		expect(evaluateSummaryPersistenceAdmissionV1(candidate, undefined).reasons).toEqual(['REPORT_MISSING']);
		expect(evaluateSummaryPersistenceAdmissionV1(candidate, { nope: 1 }).reasons).toEqual(['REPORT_INVALID']);
		const tampered = { ...seal(), chunkId: 'doc:other:1' };
		expect(evaluateSummaryPersistenceAdmissionV1(candidate, tampered).reasons).toEqual(['UNSEALED']);
		expect(evaluateSummaryPersistenceAdmissionV1(candidate, { ...seal(), admissionChecksum: H('0') }).reasons).toEqual(['UNSEALED']);
	});
	it('rejects a wrong chunk, wrong revision, or a summary changed after admission', () => {
		expect(evaluateSummaryPersistenceAdmissionV1({ ...candidate, chunkId: 'doc:x:1' }, seal()).reasons).toContain('CHUNK_MISMATCH');
		expect(evaluateSummaryPersistenceAdmissionV1({ ...candidate, chunkEvidenceRevision: `sha256:${H('9')}` }, seal()).reasons).toContain('REVISION_MISMATCH');
		expect(evaluateSummaryPersistenceAdmissionV1({ ...candidate, outputSha256: H('d') }, seal()).reasons).toContain('OUTPUT_CHANGED');
		expect(evaluateSummaryPersistenceAdmissionV1({ ...candidate, inputChecksum: H('e') }, seal()).reasons).toContain('INPUT_CHANGED');
	});
	it('rejects the whole summary when any claim is REJECT or REVIEW, or a claim is missing', () => {
		expect(evaluateSummaryPersistenceAdmissionV1(candidate, seal({ claims: [claim(0), claim(1, 'REJECT')] })).reasons).toEqual(['CLAIM_REJECT']);
		expect(evaluateSummaryPersistenceAdmissionV1(candidate, seal({ claims: [claim(0, 'REVIEW'), claim(1)] })).reasons).toEqual(['CLAIM_REVIEW']);
		expect(evaluateSummaryPersistenceAdmissionV1(candidate, seal({ claims: [claim(0), claim(1, 'PENDING')] })).reasons).toEqual(['CLAIM_NOT_ADMIT']);
		expect(evaluateSummaryPersistenceAdmissionV1(candidate, seal({ claims: [] })).reasons).toContain('NO_CLAIMS');
		expect(evaluateSummaryPersistenceAdmissionV1(candidate, seal({ claimCount: 3 })).reasons).toContain('CLAIM_COUNT_MISMATCH');
		expect(evaluateSummaryPersistenceAdmissionV1(candidate, seal({ claims: [claim(0), claim(2)] })).reasons).toContain('CLAIM_ORDINALS_NOT_CONTIGUOUS');
	});
	it('rejects an eligibility flag that disagrees with the claim decisions', () => {
		expect(evaluateSummaryPersistenceAdmissionV1(candidate, seal({ claims: [claim(0), claim(1, 'REJECT')], wholeSummaryEligible: true })).reasons).toContain('ELIGIBILITY_FLAG_INCONSISTENT');
	});
	it('partition writes nothing and excludes the negative control and any candidate without a report', () => {
		const a = { ...candidate, outputSha256: H('a'), id: 'a' };
		const b = { ...candidate, outputSha256: H('b'), id: 'b' };
		const c = { ...candidate, outputSha256: H('c'), id: 'c' };
		const reports = new Map<string, unknown>([['a', seal({ summaryOutputSha256: H('a') })], ['b', seal({ summaryOutputSha256: H('b'), claims: [claim(0), claim(1, 'REJECT')] })]]);
		const { admitted, rejected } = partitionByAdmissionV1([a, b, c], reports, (x) => x.id);
		expect(admitted.map((x) => x.id)).toEqual(['a']);
		expect(rejected.map((x) => [x.candidate.id, x.reasons[0]])).toEqual([['b', 'CLAIM_REJECT'], ['c', 'REPORT_MISSING']]);
	});
});
