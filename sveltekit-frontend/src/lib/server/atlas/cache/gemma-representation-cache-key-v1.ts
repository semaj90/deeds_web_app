import { z } from 'zod';
import { canonicalSha256V1, sha256HexSchema } from '../prefill/canonical-hash-v1.js';

export const GEMMA_REPRESENTATION_CACHE_KEY_V1_SCHEMA =
	'parent-atlas.gemma-representation-cache-key.v1' as const;

const revision = z.string().trim().min(1);

export const GemmaRepresentationCacheIdentityV1Schema = z
	.object({
		schema: z.literal(GEMMA_REPRESENTATION_CACHE_KEY_V1_SCHEMA),
		representationId: revision,
		representationRevision: revision,
		modelRevision: revision,
		adapterRevision: revision.nullable(),
		tokenizerRevision: revision,
		templateRevision: revision,
		canonicalId: revision,
		sourceRevision: revision,
		sourceContentChecksum: sha256HexSchema,
		featureRevision: revision.nullable(),
		graphRevision: revision.nullable(),
		tokenizationPolicyRevision: revision,
		maxTokens: z.number().int().positive(),
		dimension: z.union([z.literal(32), z.literal(64), z.literal(128)]),
		normalizationRevision: revision,
		/** Checksum of the produced token matrix, not a substitute for source identity. */
		representationChecksum: sha256HexSchema,
	})
	.strict();

export type GemmaRepresentationCacheIdentityV1 = z.infer<
	typeof GemmaRepresentationCacheIdentityV1Schema
>;

export interface GemmaRepresentationCacheReceiptV1 {
	cacheKey: string;
	representationChecksum: string;
	status: 'PROVEN' | 'FAILED' | 'PARTIAL';
}

/**
 * A final, content-addressed key for a reusable Gemma token representation.
 * This is an identity contract only: it does not read or write BitFrost,
 * Valkey, Redis, files, tensors, or hidden model state.
 */
export function buildGemmaRepresentationCacheKeyV1(
	input: GemmaRepresentationCacheIdentityV1,
): string {
	const identity = GemmaRepresentationCacheIdentityV1Schema.parse(input);
	return `atlas:gemma-representation:v1:${canonicalSha256V1(identity)}`;
}

export function canReuseGemmaRepresentationV1(
	input: GemmaRepresentationCacheIdentityV1,
	receipt: GemmaRepresentationCacheReceiptV1 | null | undefined,
): boolean {
	const identity = GemmaRepresentationCacheIdentityV1Schema.parse(input);
	return Boolean(
		receipt &&
		receipt.status === 'PROVEN' &&
		receipt.cacheKey === buildGemmaRepresentationCacheKeyV1(identity) &&
		receipt.representationChecksum === identity.representationChecksum,
	);
}
