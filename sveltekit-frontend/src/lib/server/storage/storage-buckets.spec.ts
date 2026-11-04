import { describe, expect, it } from 'vitest';
import {
	ARTIFACTS_BUCKET,
	assertArtifactBucket,
	assertEvidenceBucket,
	EVIDENCE_BUCKET,
	resolveStorageBuckets
} from './storage-buckets.js';

describe('resolveStorageBuckets', () => {
	it('defaults evidence to legal-evidence, never to atlas-artifacts', () => {
		const b = resolveStorageBuckets({ SEAWEED_S3_BUCKET: 'atlas-artifacts' });
		expect(b.evidence).toBe(EVIDENCE_BUCKET);
		expect(b.artifacts).toBe(ARTIFACTS_BUCKET);
	});

	it('honours explicit per-purpose settings', () => {
		const b = resolveStorageBuckets({
			SEAWEED_EVIDENCE_BUCKET: 'legal-evidence',
			SEAWEED_ARTIFACTS_BUCKET: 'atlas-artifacts'
		});
		expect(b).toEqual({ evidence: 'legal-evidence', artifacts: 'atlas-artifacts' });
	});

	it('rejects the same bucket for both purposes', () => {
		expect(() =>
			resolveStorageBuckets({ SEAWEED_EVIDENCE_BUCKET: 'x-bucket', SEAWEED_ARTIFACTS_BUCKET: 'x-bucket' })
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
});
