/**
 * Purpose-specific SeaweedFS bucket resolution.
 *
 * - evidence: original legal uploads. Read by the document processor, which accepts only legal-evidence.
 * - artifacts: derived assets (Atlas backups, XGBoost artifacts, scene binaries).
 * - legalCorpus: primary general legal corpus repository.
 * - federalLaw: federal statutory, regulatory, and supreme court case law.
 * - stateLaw: state-level statutes, codes, and appellate/supreme court records.
 * - localLaw: municipal ordinances, county codes, and local jurisdiction rules.
 *
 * The shared SEAWEED_S3_BUCKET variable is no longer the evidence default. Its other readers
 * are unchanged here and must be audited before it is retired.
 */
import { z } from 'zod';

export const EVIDENCE_BUCKET = 'legal-evidence' as const;
export const ARTIFACTS_BUCKET = 'atlas-artifacts' as const;
export const LEGAL_CORPUS_BUCKET = 'legal-corpus' as const;
export const FEDERAL_LAW_BUCKET = 'federal-law' as const;
export const STATE_LAW_BUCKET = 'state-law' as const;
export const LOCAL_LAW_BUCKET = 'local-law' as const;

const bucketName = z
	.string()
	.regex(/^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$/, 'invalid bucket name');
const optionalBucketName = z.preprocess(
	(value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
	bucketName.optional()
);

const storageEnv = z.object({
	SEAWEED_EVIDENCE_BUCKET: optionalBucketName,
	SEAWEED_ARTIFACTS_BUCKET: optionalBucketName,
	SEAWEED_LEGAL_CORPUS_BUCKET: optionalBucketName,
	SEAWEED_FEDERAL_LAW_BUCKET: optionalBucketName,
	SEAWEED_STATE_LAW_BUCKET: optionalBucketName,
	SEAWEED_LOCAL_LAW_BUCKET: optionalBucketName
});

/** Resolve buckets from an env-like record. Defaults are fixed and never fall through to each other. */
export function resolveStorageBuckets(env: Record<string, string | undefined>) {
	const parsed = storageEnv.parse(env);
	const evidence = parsed.SEAWEED_EVIDENCE_BUCKET ?? EVIDENCE_BUCKET;
	const artifacts = parsed.SEAWEED_ARTIFACTS_BUCKET ?? ARTIFACTS_BUCKET;
	const legalCorpus = parsed.SEAWEED_LEGAL_CORPUS_BUCKET ?? LEGAL_CORPUS_BUCKET;
	const federalLaw = parsed.SEAWEED_FEDERAL_LAW_BUCKET ?? FEDERAL_LAW_BUCKET;
	const stateLaw = parsed.SEAWEED_STATE_LAW_BUCKET ?? STATE_LAW_BUCKET;
	const localLaw = parsed.SEAWEED_LOCAL_LAW_BUCKET ?? LOCAL_LAW_BUCKET;

	const all = [evidence, artifacts, legalCorpus, federalLaw, stateLaw, localLaw];
	const unique = new Set(all);
	if (unique.size !== all.length) {
		throw new Error(
			'STORAGE_BUCKET_COLLISION: All storage buckets (evidence, artifacts, legal-corpus, federal-law, state-law, local-law) must be distinct'
		);
	}
	return { evidence, artifacts, legalCorpus, federalLaw, stateLaw, localLaw } as const;
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

/** Guard for legal corpus: ensures general corpus objects reside in legal-corpus. */
export function assertLegalCorpusBucket(bucket: string): void {
	if (bucket !== storageBuckets.legalCorpus) {
		throw new Error(`LEGAL_CORPUS_BUCKET_MISMATCH: expected ${storageBuckets.legalCorpus}, got ${bucket}`);
	}
}

/** Guard for federal law: statutes, CFR, SCOTUS, Circuit cases. */
export function assertFederalLawBucket(bucket: string): void {
	if (bucket !== storageBuckets.federalLaw) {
		throw new Error(`FEDERAL_LAW_BUCKET_MISMATCH: expected ${storageBuckets.federalLaw}, got ${bucket}`);
	}
}

/** Guard for state law: state statutes, state supreme courts, state codes. */
export function assertStateLawBucket(bucket: string): void {
	if (bucket !== storageBuckets.stateLaw) {
		throw new Error(`STATE_LAW_BUCKET_MISMATCH: expected ${storageBuckets.stateLaw}, got ${bucket}`);
	}
}

/** Guard for local law: municipal ordinances, county codes. */
export function assertLocalLawBucket(bucket: string): void {
	if (bucket !== storageBuckets.localLaw) {
		throw new Error(`LOCAL_LAW_BUCKET_MISMATCH: expected ${storageBuckets.localLaw}, got ${bucket}`);
	}
}
