// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { ExternalDocAnalysisV1 } from './external-doc-intelligence-contracts-v1.js';
import { admitFrozenSummaryCandidateV1, persistEligibleSummaryCandidatesV1, type PersistenceDeps, type SummaryPersistencePolicyV1 } from './summary-candidate-persistence-v1.js';
import {
	CHUNK_IDENTITY_VERSION_V1, SUMMARY_ELIGIBILITY_SCHEMA, buildSummaryCandidateV1, buildSummaryClaimSetV1, computeCandidateCohortChecksumV1, computeChunkCohortChecksumV1, computeEligibilityChecksumV1,
	verifySummaryCandidateV1, type SummaryCandidateV1
} from './summary-candidate-v1.js';

const H = (c: string) => c.repeat(64);
const policy: SummaryPersistencePolicyV1 = {
	allowedResolverPolicyRevisions: ['summary-claim-resolution:val-09-v1'], allowedValidationContractRevisions: ['summary-claim-validator:val-10-candidate-v1'],
	allowedExtractorRevisions: ['claims-of:sentence-regex-v1'], allowedJudgePromptRevisions: ['summary-claim-judge-prompt:val-07-v1'], allowedIdentityVersions: [CHUNK_IDENTITY_VERSION_V1]
};
const TEXT = 'pgvector supports HNSW iterative scans. It adds hnsw.iterative_scan.';
const candidate = (over: Record<string, unknown> = {}, text = TEXT): SummaryCandidateV1 => buildSummaryCandidateV1({
	chunkId: 'doc:pgvector:fe883c75f323441d:22', chunkEvidenceRevision: `sha256:${H('b')}`, identityVersion: CHUNK_IDENTITY_VERSION_V1, producerId: 'atlas-external-doc-summarizer', producerRevision: 'external-doc-summary-writer-v1',
	modelId: 'ornith-1.5-9b', modelRevision: 'ornith-1.5-9b@hforf.gguf@b1', promptRevision: 'external-doc-summary-prompt-v1@sha256:x', inputChecksum: H('1'), summaryText: text,
	generationMetadata: { backend: 'llama-server', baseUrl: 'http://127.0.0.1:8090', temperature: 0.2, seed: 1729, maxTokens: 300, finishReason: 'stop', completionTokens: 30, productName: 'pgvector', versionLabel: '0.8' }, ...over
});
function evidence(cand = candidate(), decisions: string[] = ['ADMIT', 'ADMIT'], tweak: Record<string, unknown> = {}) {
	const claimSet = buildSummaryClaimSetV1({ candidateId: cand.candidateId, extractorRevision: 'claims-of:sentence-regex-v1', claimTexts: ['pgvector supports HNSW iterative scans.', 'It adds hnsw.iterative_scan.'].slice(0, decisions.length) });
	const body = {
		schema: SUMMARY_ELIGIBILITY_SCHEMA, candidateId: cand.candidateId, claimSetChecksum: claimSet.claimSetChecksum, validationContractRevision: 'summary-claim-validator:val-10-candidate-v1', spineRevision: H('9'),
		judgePromptRevision: 'summary-claim-judge-prompt:val-07-v1', judgeModelRevision: 'ornith-1.5-9b:hforf.gguf', resolverPolicyRevision: 'summary-claim-resolution:val-09-v1',
		resolutions: claimSet.claimList.map((c, i) => ({ claimOrdinal: c.claimOrdinal, claimChecksum: c.claimChecksum, validationId: `scv:${H('2')}`, validationChecksum: H('3'), judgeInputChecksum: H('4'), decision: decisions[i]!, resolutionLayer: 'COMPOSITE' })),
		eligible: decisions.every((d) => d === 'ADMIT'), ...tweak
	};
	return { candidate: cand, claimSet, eligibility: { ...body, eligibilityChecksum: computeEligibilityChecksumV1(body as never) } };
}
function deps(opts: { current?: boolean } = {}) {
	const inserted: ExternalDocAnalysisV1[] = [];
	const d: PersistenceDeps = { chunkRevisionIsCurrent: async () => opts.current ?? true, insertAnalysis: async (row) => { inserted.push(row); return 1; }, now: () => '2026-09-23T00:00:00.000Z' };
	return { d, inserted };
}

describe('SummaryCandidateV1 identity', () => {
	it('is deterministic from immutable content (no time, no attempt) and changes with any byte', () => {
		expect(candidate().candidateId).toBe(candidate().candidateId);
		expect(candidate({}, TEXT + ' ').candidateId).not.toBe(candidate().candidateId);
		expect(candidate({ inputChecksum: H('2') }).candidateId).not.toBe(candidate().candidateId);
		expect(candidate({ chunkEvidenceRevision: `sha256:${H('c')}` }).candidateId).not.toBe(candidate().candidateId);
		expect(verifySummaryCandidateV1(candidate())).toMatchObject({ ok: true });
	});
	it('cohort checksums are order independent and bind exact members', () => {
		const a = { chunkId: 'a', chunkEvidenceRevision: `sha256:${H('a')}` }, b = { chunkId: 'b', chunkEvidenceRevision: `sha256:${H('b')}` };
		expect(computeChunkCohortChecksumV1([a, b])).toBe(computeChunkCohortChecksumV1([b, a]));
		expect(computeChunkCohortChecksumV1([a, b])).not.toBe(computeChunkCohortChecksumV1([a, { ...b, chunkEvidenceRevision: `sha256:${H('c')}` }]));
		expect(computeCandidateCohortChecksumV1(['sc:1', 'sc:2'])).toBe(computeCandidateCohortChecksumV1(['sc:2', 'sc:1']));
	});
});

describe('VAL-10B writer admission (no durable write)', () => {
	it('admits an all-ADMIT frozen candidate and persists its EXACT bytes through the injected boundary', async () => {
		const { d, inserted } = deps();
		const r = await persistEligibleSummaryCandidatesV1([evidence()], policy, d, 20);
		expect(r.insertCalls).toBe(1);
		expect(inserted[0]!.summaryText).toBe(TEXT);
		expect(inserted[0]!.outputChecksum).toBe(candidate().outputChecksum);
		expect(inserted[0]!.canonicalAuthority).toBe(false);
		expect(inserted[0]!.metadata.admission).toMatchObject({ candidateId: candidate().candidateId });
	});
	it('one changed byte (period -> comma) fails before any insert', async () => {
		const e = evidence();
		const tampered = { ...e, candidate: { ...e.candidate, summaryText: e.candidate.summaryText.replace('scans.', 'scans,') } };
		const { d } = deps();
		const r = await persistEligibleSummaryCandidatesV1([tampered], policy, d, 20);
		expect(r.refused[0]!.reasons).toEqual(['SUMMARY_OUTPUT_CHECKSUM_MISMATCH']);
		expect(r.insertCalls).toBe(0);
	});
	it('changed chunk revision or swapped candidateId fails the id seal; a different candidate claim set or eligibility fails the binding', async () => {
		const e = evidence();
		const { d } = deps();
		const revChanged = { ...e, candidate: { ...e.candidate, chunkEvidenceRevision: `sha256:${H('d')}` } };
		expect((await persistEligibleSummaryCandidatesV1([revChanged], policy, d, 20)).refused[0]!.reasons).toEqual(['CANDIDATE_ID_MISMATCH']);
		const other = evidence(candidate({ inputChecksum: H('5') }));
		expect(admitFrozenSummaryCandidateV1({ ...e, claimSet: other.claimSet }, policy)).toMatchObject({ decision: 'PERSISTENCE_NOT_AUTHORIZED', reasons: expect.arrayContaining(['CLAIM_SET_CANDIDATE_MISMATCH']) });
		expect(admitFrozenSummaryCandidateV1({ ...e, eligibility: other.eligibility }, policy)).toMatchObject({ decision: 'PERSISTENCE_NOT_AUTHORIZED', reasons: expect.arrayContaining(['ELIGIBILITY_CANDIDATE_MISMATCH']) });
		expect(d.insertAnalysis).toBeDefined();
	});
	it('a changed claim set (text or checksum) is rejected', () => {
		const e = evidence();
		const edited = { ...e.claimSet, claimList: e.claimSet.claimList.map((c, i) => (i === 0 ? { ...c, claimText: 'pgvector supports HNSW.' } : c)) };
		expect(admitFrozenSummaryCandidateV1({ ...e, claimSet: edited }, policy)).toMatchObject({ decision: 'PERSISTENCE_NOT_AUTHORIZED', reasons: expect.arrayContaining(['CLAIM_SET_INVALID']) });
	});
	it('missing, unsealed, REJECT, REVIEW and stale-policy evidence are all refused', () => {
		const e = evidence();
		expect(admitFrozenSummaryCandidateV1({ candidate: e.candidate, claimSet: e.claimSet }, policy)).toMatchObject({ reasons: ['MISSING_EVIDENCE'] });
		expect(admitFrozenSummaryCandidateV1({ ...e, eligibility: { ...e.eligibility, eligibilityChecksum: H('0') } }, policy)).toMatchObject({ reasons: expect.arrayContaining(['ELIGIBILITY_UNSEALED']) });
		expect(admitFrozenSummaryCandidateV1(evidence(candidate(), ['ADMIT', 'REJECT']), policy)).toMatchObject({ reasons: expect.arrayContaining(['CLAIM_REJECT', 'NOT_ELIGIBLE']) });
		expect(admitFrozenSummaryCandidateV1(evidence(candidate(), ['REVIEW', 'ADMIT']), policy)).toMatchObject({ reasons: expect.arrayContaining(['CLAIM_REVIEW', 'NOT_ELIGIBLE']) });
		expect(admitFrozenSummaryCandidateV1(evidence(candidate(), ['ADMIT', 'ADMIT'], { resolverPolicyRevision: 'summary-claim-resolution:val-08-old' }), policy)).toMatchObject({ reasons: expect.arrayContaining(['RESOLVER_POLICY_STALE']) });
		expect(admitFrozenSummaryCandidateV1(evidence(candidate(), ['ADMIT', 'ADMIT'], { validationContractRevision: 'old' }), policy)).toMatchObject({ reasons: expect.arrayContaining(['VALIDATION_CONTRACT_STALE']) });
		expect(admitFrozenSummaryCandidateV1(evidence(candidate({ identityVersion: 'external-doc-chunk-id:v2' })), policy)).toMatchObject({ reasons: expect.arrayContaining(['IDENTITY_VERSION_NOT_ALLOWED']) });
	});
	it('an eligibility flag or resolution list that disagrees with the claim set is refused', () => {
		expect(admitFrozenSummaryCandidateV1(evidence(candidate(), ['ADMIT', 'REJECT'], { eligible: true }), policy)).toMatchObject({ reasons: expect.arrayContaining(['ELIGIBILITY_FLAG_INCONSISTENT']) });
		const e = evidence();
		const short = { ...e.eligibility, resolutions: e.eligibility.resolutions.slice(0, 1) };
		const { eligibilityChecksum: _drop, ...sealedBody } = short;
		const resealed = { ...short, eligibilityChecksum: computeEligibilityChecksumV1(sealedBody as never) };
		expect(admitFrozenSummaryCandidateV1({ ...e, eligibility: resealed }, policy)).toMatchObject({ reasons: expect.arrayContaining(['RESOLUTIONS_INCOMPLETE']) });
	});
	it('a stale chunk revision at write time is refused before the insert', async () => {
		const { d } = deps({ current: false });
		const r = await persistEligibleSummaryCandidatesV1([evidence()], policy, d, 20);
		expect(r.refused[0]!.reasons).toEqual(['STALE_CHUNK_REVISION']);
		expect(r.insertCalls).toBe(0);
	});
	it('limit is a ceiling, duplicates are written once, and the rejected control is never written', async () => {
		const ok = (n: number) => evidence(candidate({ inputChecksum: H(String(n)) }));
		const { d, inserted } = deps();
		const items = [ok(1), ok(2), ok(3), ok(2), evidence(candidate({ inputChecksum: H('7') }), ['ADMIT', 'REJECT'])];
		const r = await persistEligibleSummaryCandidatesV1(items, policy, d, 2);
		expect(r.insertCalls).toBe(2);
		expect(inserted.length).toBe(2);
		expect(r.refused.some((x) => x.reasons.includes('CLAIM_REJECT'))).toBe(true);
		expect(r.refused.some((x) => x.reasons.includes('ABOVE_LIMIT_CEILING'))).toBe(true);
	});
});

describe('VAL-10D counters, idempotence and reconciliation (stubbed, no durable write)', () => {
	const ok = (n: number) => evidence(candidate({ inputChecksum: H(String(n)) }));
	/** a conflict-aware stub mimicking INSERT ... ON CONFLICT (analysis_id) DO NOTHING */
	function conflictAware() {
		const table = new Map<string, ExternalDocAnalysisV1>();
		const d: PersistenceDeps = { chunkRevisionIsCurrent: async () => true, insertAnalysis: async (row) => { if (table.has(row.analysisId)) return 0; table.set(row.analysisId, row); return 1; }, now: () => '2026-09-23T00:00:00.000Z' };
		return { d, table };
	}
	it('counts every outcome exactly and reconciles: admitted = inserted + alreadyPresent + duplicates + ceiling + stale + failed + notAttempted', async () => {
		const { d } = conflictAware();
		const items = [ok(1), ok(2), ok(3), ok(2), evidence(candidate({ inputChecksum: H('7') }), ['ADMIT', 'REJECT'])];
		const r = await persistEligibleSummaryCandidatesV1(items, policy, d, 2);
		expect(r.counts).toMatchObject({ considered: 5, rejectedByAdmission: 1, admitted: 4, inserted: 2, alreadyPresent: 0, duplicateInInput: 1, ceilingDeferred: 1, staleRefused: 0, failed: 0, notAttempted: 0 });
		expect(r.reconciles).toBe(true);
	});
	it('re-applying the SAME frozen cohort writes nothing new: every row is reported alreadyPresent', async () => {
		const { d, table } = conflictAware();
		const items = [ok(1), ok(2), ok(3)];
		const first = await persistEligibleSummaryCandidatesV1(items, policy, d, 20);
		const rowsAfterFirst = table.size;
		const second = await persistEligibleSummaryCandidatesV1(items, policy, d, 20);
		expect(first.counts.inserted).toBe(3);
		expect(second.counts).toMatchObject({ inserted: 0, alreadyPresent: 3 });
		expect(second.persisted).toEqual([]);
		expect(table.size).toBe(rowsAfterFirst);
		expect(first.reconciles && second.reconciles).toBe(true);
	});
	it('a stale chunk revision is counted, not written', async () => {
		const stub = deps({ current: false });
		const r = await persistEligibleSummaryCandidatesV1([ok(1)], policy, stub.d, 20);
		expect(r.counts).toMatchObject({ staleRefused: 1, inserted: 0 });
		expect(r.reconciles).toBe(true);
	});
	it('a mutation failure stops the run immediately: the failure is reported, the remainder is notAttempted, nothing after it is inserted', async () => {
		let calls = 0;
		const d: PersistenceDeps = { chunkRevisionIsCurrent: async () => true, now: () => '2026-09-23T00:00:00.000Z', insertAnalysis: async () => { calls += 1; if (calls === 2) throw new Error('boom'); return 1; } };
		const r = await persistEligibleSummaryCandidatesV1([ok(1), ok(2), ok(3), ok(4)], policy, d, 20);
		expect(calls).toBe(2);
		expect(r.counts).toMatchObject({ inserted: 1, failed: 1, notAttempted: 2 });
		expect(r.failures).toEqual([{ candidateId: candidate({ inputChecksum: H('2') }).candidateId, error: 'boom' }]);
		expect(r.reconciles).toBe(true);
	});
});
