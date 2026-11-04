/**
 * Purpose-specific SeaweedFS bucket resolution.
 *
 * - evidence: original legal uploads. Read by the document processor, which accepts only legal-evidence.
 * - artifacts: derived assets (Atlas backups, XGBoost artifacts, scene binaries).
 *
 * The shared SEAWEED_S3_BUCKET variable is no longer the evidence default. Its other readers
 * are unchanged here and must be audited before it is retired.
 */
import { z } from 'zod';

export const EVIDENCE_BUCKET = 'legal-evidence' as const;
export const ARTIFACTS_BUCKET = 'atlas-artifacts' as const;

const bucketName = z
	.string()
	.regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'invalid bucket name');
const optionalBucketName = z.preprocess(
	(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
	bucketName.optional()
);

const storageEnv = z.object({
	SEAWEED_EVIDENCE_BUCKET: optionalBucketName,
	SEAWEED_ARTIFACTS_BUCKET: optionalBucketName
});

/** Resolve buckets from an env-like record. Defaults are fixed and never fall through to each other. */
export function resolveStorageBuckets(env: Record<string, string | undefined>) {
	const parsed = storageEnv.parse(env);
	const evidence = parsed.SEAWEED_EVIDENCE_BUCKET ?? EVIDENCE_BUCKET;
	const artifacts = parsed.SEAWEED_ARTIFACTS_BUCKET ?? ARTIFACTS_BUCKET;
	if (evidence === artifacts) {
		throw new Error('STORAGE_BUCKET_COLLISION: evidence and artifacts must be different buckets');
	}
	return { evidence, artifacts } as const;
}

export const storageBuckets = resolveStorageBuckets(process.env);

/** Guard for the document processor: only original evidence objects may be read through it. */
export function assertEvidenceBucket(bucket: string): void {
	if (bucket !== storageBuckets.evidence) {
		throw new Error(`EVIDENCE_BUCKET_MISMATCH: expected ${storageBuckets.evidence}, got ${bucket}`);
	}
}

/** Guard for derived artifacts: never allow them to enter the legal-originals bucket. */
export function assertArtifactBucket(bucket: string): void {
	if (bucket === EVIDENCE_BUCKET || bucket === storageBuckets.evidence) {
		throw new Error('ARTIFACT_BUCKET_MISMATCH: evidence and derived artifacts must use separate buckets');
	}
	if (bucket !== storageBuckets.artifacts) {
		throw new Error(`ARTIFACT_BUCKET_MISMATCH: expected ${storageBuckets.artifacts}, got ${bucket}`);
	}
}
