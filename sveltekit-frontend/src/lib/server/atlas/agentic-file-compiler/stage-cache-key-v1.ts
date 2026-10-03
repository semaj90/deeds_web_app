import { z } from 'zod';
import { sha256Stable } from './contracts.js';

// AFC-CACHE-01: stage-specific, revision-qualified cache key contract. Each pipeline
// stage (classification / keywordRecognition / queryExpansion / helperEligibility /
// retrievalPlan) is keyed on its OWN upstream checksum plus its OWN revision fields —
// so a service-availability change invalidates only helperEligibility/retrievalPlan
// without forcing keywordRecognition to recompute, and vice versa.
//
// This is a pure key-shape contract: it computes a deterministic cache key string, it
// does not read or write any cache backend (Redis/Valkey/BitFrost). Wiring an actual
// cache backend behind this shape is separate, later work.

export const STAGE_CACHE_KEY_SCHEMA_V1 = 'atlas.stage-cache-key.v1' as const;

export const AtlasFileCompilerStageSchema = z.enum([
	'classification',
	'keywordRecognition',
	'queryExpansion',
	'helperEligibility',
	'retrievalPlan',
]);
export type AtlasFileCompilerStage = z.infer<typeof AtlasFileCompilerStageSchema>;

export const StageCacheKeyV1Schema = z.object({
	schema: z.literal(STAGE_CACHE_KEY_SCHEMA_V1),
	stage: AtlasFileCompilerStageSchema,
	upstreamChecksum: z.string().regex(/^[a-f0-9]{64}$/),
	revisionFields: z.record(z.string().min(1), z.string().min(1)),
	revisionFingerprint: z.string().regex(/^[a-f0-9]{64}$/),
	cacheKey: z.string().min(1),
	checksum: z.string().regex(/^[a-f0-9]{64}$/),
}).strict();
export type StageCacheKeyV1 = z.infer<typeof StageCacheKeyV1Schema>;

const CACHE_KEY_NAMESPACE = 'atlas:afc:cache' as const;

export function buildStageCacheKeyV1(input: {
	stage: AtlasFileCompilerStage;
	upstreamChecksum: string;
	revisionFields: Readonly<Record<string, string>>;
}): StageCacheKeyV1 {
	if (Object.keys(input.revisionFields).length === 0) {
		throw new Error(`STAGE_CACHE_KEY_REQUIRES_REVISION_FIELDS:${input.stage}`);
	}
	const sortedRevisionFields = Object.fromEntries(
		Object.entries(input.revisionFields).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)),
	);
	const revisionFingerprint = sha256Stable(sortedRevisionFields);
	const cacheKey = `${CACHE_KEY_NAMESPACE}:${input.stage}:${input.upstreamChecksum}:${revisionFingerprint}`;
	const body = {
		schema: STAGE_CACHE_KEY_SCHEMA_V1,
		stage: input.stage,
		upstreamChecksum: input.upstreamChecksum,
		revisionFields: sortedRevisionFields,
		revisionFingerprint,
		cacheKey,
	};
	return StageCacheKeyV1Schema.parse({ ...body, checksum: sha256Stable(body) });
}

export function assertStageCacheKeyV1(value: StageCacheKeyV1): StageCacheKeyV1 {
	const key = StageCacheKeyV1Schema.parse(value);
	const { checksum, ...body } = key;
	if (sha256Stable(body) !== checksum) throw new Error('STAGE_CACHE_KEY_CHECKSUM_MISMATCH');
	const recomputed = buildStageCacheKeyV1({ stage: key.stage, upstreamChecksum: key.upstreamChecksum, revisionFields: key.revisionFields });
	if (recomputed.cacheKey !== key.cacheKey) throw new Error('STAGE_CACHE_KEY_DERIVATION_MISMATCH');
	return key;
}
