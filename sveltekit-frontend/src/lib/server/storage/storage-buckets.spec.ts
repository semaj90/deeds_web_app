import { describe, expect, it } from 'vitest';
import {
	ARTIFACTS_BUCKET,
	assertArtifactBucket,
	assertEvidenceBucket,
	assertFederalLawBucket,
	assertLegalCorpusBucket,
	assertLocalLawBucket,
	assertStateLawBucket,
	EVIDENCE_BUCKET,
	FEDERAL_LAW_BUCKET,
	LEGAL_CORPUS_BUCKET,
	LOCAL_LAW_BUCKET,
	resolveStorageBuckets,
	STATE_LAW_BUCKET
} from './storage-buckets.js';

describe('resolveStorageBuckets', () => {
	it('defaults buckets to their dedicated purpose names', () => {
		const b = resolveStorageBuckets({ SEAWEED_S3_BUCKET: 'custom-general' });
		expect(b.evidence).toBe(EVIDENCE_BUCKET);
		expect(b.artifacts).toBe(ARTIFACTS_BUCKET);
		expect(b.legalCorpus).toBe(LEGAL_CORPUS_BUCKET);
		expect(b.federalLaw).toBe(FEDERAL_LAW_BUCKET);
		expect(b.stateLaw).toBe(STATE_LAW_BUCKET);
		expect(b.localLaw).toBe(LOCAL_LAW_BUCKET);
	});

	it('honours explicit per-purpose settings', () => {
		const b = resolveStorageBuckets({
			SEAWEED_EVIDENCE_BUCKET: 'custom-evidence',
			SEAWEED_ARTIFACTS_BUCKET: 'custom-artifacts',
			SEAWEED_LEGAL_CORPUS_BUCKET: 'custom-corpus',
			SEAWEED_FEDERAL_LAW_BUCKET: 'custom-fed',
			SEAWEED_STATE_LAW_BUCKET: 'custom-state',
			SEAWEED_LOCAL_LAW_BUCKET: 'custom-local'
		});
		expect(b).toEqual({
			evidence: 'custom-evidence',
			artifacts: 'custom-artifacts',
			legalCorpus: 'custom-corpus',
			federalLaw: 'custom-fed',
			stateLaw: 'custom-state',
			localLaw: 'custom-local'
		});
	});

	it('rejects duplicate buckets across purposes', () => {
		expect(() =>
			resolveStorageBuckets({
				SEAWEED_EVIDENCE_BUCKET: 'shared-bucket',
				SEAWEED_LEGAL_CORPUS_BUCKET: 'shared-bucket'
			})
		).toThrow(/STORAGE_BUCKET_COLLISION/);
	});

	it('rejects invalid bucket names', () => {
		expect(() => resolveStorageBuckets({ SEAWEED_EVIDENCE_BUCKET: 'Bad_Name' })).toThrow();
	});

	it('wrong-bucket guard: evidence reads accept only legal-evidence', () => {
		expect(() => assertEvidenceBucket(EVIDENCE_BUCKET)).not.toThrow();
		expect(() => assertEvidenceBucket(ARTIFACTS_BUCKET)).toThrow(/EVIDENCE_BUCKET_MISMATCH/);
		expect(() => assertEvidenceBucket('evidence')).toThrow(/EVIDENCE_BUCKET_MISMATCH/);
	});

	it('artifact writes accept only the configured artifacts bucket', () => {
		expect(() => assertArtifactBucket(ARTIFACTS_BUCKET)).not.toThrow();
		expect(() => assertArtifactBucket(EVIDENCE_BUCKET)).toThrow(/ARTIFACT_BUCKET_MISMATCH/);
		expect(() => assertArtifactBucket('unexpected-bucket')).toThrow(/ARTIFACT_BUCKET_MISMATCH/);
	});

	it('jurisdiction guards: federal, state, local and legal-corpus enforce purpose isolation', () => {
		expect(() => assertLegalCorpusBucket(LEGAL_CORPUS_BUCKET)).not.toThrow();
		expect(() => assertLegalCorpusBucket(EVIDENCE_BUCKET)).toThrow(/LEGAL_CORPUS_BUCKET_MISMATCH/);

		expect(() => assertFederalLawBucket(FEDERAL_LAW_BUCKET)).not.toThrow();
		expect(() => assertFederalLawBucket(STATE_LAW_BUCKET)).toThrow(/FEDERAL_LAW_BUCKET_MISMATCH/);

		expect(() => assertStateLawBucket(STATE_LAW_BUCKET)).not.toThrow();
		expect(() => assertStateLawBucket(LOCAL_LAW_BUCKET)).toThrow(/STATE_LAW_BUCKET_MISMATCH/);

		expect(() => assertLocalLawBucket(LOCAL_LAW_BUCKET)).not.toThrow();
		expect(() => assertLocalLawBucket(FEDERAL_LAW_BUCKET)).toThrow(/LOCAL_LAW_BUCKET_MISMATCH/);
	});
});
