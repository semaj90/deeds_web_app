import { createHash } from 'node:crypto';

export type ComputationStageV1 =
	| 'lexical'
	| 'ast'
	| 'langextract'
	| 'semantic_embedding'
	| 'candidate_fanout'
	| 'graph_projection'
	| 'pagerank'
	| 'ppr'
	| 'community'
	| 'feature_matrix'
	| 'feature_subspace_fit'
	| 'feature_projection'
	| 'feature_subspace_drift'
	| 'cross_encoder'
	| 'cross_encoder_calibration'
	| 'exact_promotion'
	| 'dspy_program'
	| 'gepa_evaluation'
	| 'training_dataset';

export type JsonPrimitive = string | number | boolean | null;
export type JsonValue = JsonPrimitive | readonly JsonValue[] | { readonly [key: string]: JsonValue };

export interface ComputationRevisionsV1 {
	workspace: string;
	source?: string;
	chunk?: string;
	taxonomy?: string;
	graph?: string;
	semantic?: string;
	feature?: string;
	model?: string;
	program?: string;
	metric?: string;
	calibration?: string;
}

export interface ComputationCacheDescriptorV1 {
	schema: 'atlas.computation-cache-descriptor.v1';
	stage: ComputationStageV1;
	producerRevision: string;
	revisions: ComputationRevisionsV1;
	/** Content-addressed inputs consumed by this stage. Order is not significant. */
	dependencyRefs: readonly string[];
	/** Parameters that can change the numerical or semantic output. */
	parameters?: Readonly<Record<string, JsonValue>>;
	/** Optional parity contract, e.g. fp32-reference-v1 or cugraph-parity-v2. */
	numericContractRevision?: string;
}

/**
 * Durable lineage receipt. Postgres should own this metadata. `artifactRef`
 * points to immutable Arrow/binary storage; Valkey/BitFrost may cache only a
 * hot pointer from cacheKey -> artifactId/artifactRef.
 */
export interface ComputationArtifactReceiptV1 {
	schema: 'atlas.computation-artifact-receipt.v1';
	artifactId: string;
	cacheKey: string;
	stage: ComputationStageV1;
	dependencyRefs: readonly string[];
	inputHash: string;
	artifactRef: string;
	artifactHash: string;
	producerRevision: string;
	numericContractRevision: string | null;
	status: 'proven' | 'failed' | 'partial';
	durationMs: number;
	byteLength: number;
	runtime: string;
	createdAt: string;
	proofRefs: readonly string[];
}

function canonicalize(value: JsonValue): JsonValue {
	if (Array.isArray(value)) return value.map(canonicalize);
	if (value !== null && typeof value === 'object') {
		return Object.fromEntries(
			Object.entries(value)
				.sort(([left], [right]) => left.localeCompare(right))
				.map(([key, child]) => [key, canonicalize(child)]),
		) as { readonly [key: string]: JsonValue };
	}
	if (typeof value === 'number' && !Number.isFinite(value)) {
		throw new Error('cache descriptors cannot contain NaN or Infinity');
	}
	return value;
}

export function stableComputationDescriptorJson(descriptor: ComputationCacheDescriptorV1): string {
	if (!descriptor.producerRevision.trim()) throw new Error('producerRevision is required');
	if (!descriptor.revisions.workspace.trim()) throw new Error('workspace revision is required');
	if (descriptor.dependencyRefs.some((ref) => !ref.trim())) throw new Error('dependencyRefs cannot contain empty refs');

	const normalized: JsonValue = {
		schema: descriptor.schema,
		stage: descriptor.stage,
		producerRevision: descriptor.producerRevision,
		revisions: descriptor.revisions as unknown as JsonValue,
		dependencyRefs: [...new Set(descriptor.dependencyRefs)].sort(),
		parameters: (descriptor.parameters ?? {}) as JsonValue,
		numericContractRevision: descriptor.numericContractRevision ?? null,
	};

	return JSON.stringify(canonicalize(normalized));
}

export function buildComputationInputHash(descriptor: ComputationCacheDescriptorV1): string {
	return `sha256:${createHash('sha256').update(stableComputationDescriptorJson(descriptor)).digest('hex')}`;
}

export function buildComputationCacheKey(descriptor: ComputationCacheDescriptorV1): string {
	const digest = buildComputationInputHash(descriptor).slice('sha256:'.length);
	return `atlas:compute:v1:${descriptor.stage}:${digest}`;
}

export function validateComputationArtifactReceiptV1(receipt: ComputationArtifactReceiptV1): ComputationArtifactReceiptV1 {
	if (receipt.schema !== 'atlas.computation-artifact-receipt.v1') throw new Error('receipt schema mismatch');
	for (const [name, value] of [
		['artifactId', receipt.artifactId],
		['cacheKey', receipt.cacheKey],
		['inputHash', receipt.inputHash],
		['artifactRef', receipt.artifactRef],
		['artifactHash', receipt.artifactHash],
		['producerRevision', receipt.producerRevision],
		['runtime', receipt.runtime],
	] as const) {
		if (!value.trim()) throw new Error(`${name} is required`);
	}
	if (!Number.isFinite(receipt.durationMs) || receipt.durationMs < 0) throw new Error('durationMs must be finite/non-negative');
	if (!Number.isInteger(receipt.byteLength) || receipt.byteLength < 0) throw new Error('byteLength must be a non-negative integer');
	if (!Number.isFinite(Date.parse(receipt.createdAt))) throw new Error('createdAt must be an ISO timestamp');
	if (receipt.dependencyRefs.some((ref) => !ref.trim())) throw new Error('dependencyRefs cannot contain empty refs');
	if (receipt.proofRefs.some((ref) => !ref.trim())) throw new Error('proofRefs cannot contain empty refs');
	return receipt;
}

/**
 * Reuse is deliberately strict: only a PROVEN receipt for the exact derived
 * cache key and input hash may skip execution. No destructive invalidation is
 * required when inputs change: new dependency hashes produce a new key.
 */
export function canReuseComputation(
	descriptor: ComputationCacheDescriptorV1,
	receipt: ComputationArtifactReceiptV1 | null | undefined,
): boolean {
	if (!receipt) return false;
	try {
		validateComputationArtifactReceiptV1(receipt);
	} catch {
		return false;
	}
	return Boolean(
		receipt.status === 'proven'
		&& receipt.stage === descriptor.stage
		&& receipt.cacheKey === buildComputationCacheKey(descriptor)
		&& receipt.inputHash === buildComputationInputHash(descriptor)
		&& receipt.artifactRef.trim()
		&& receipt.artifactHash.trim(),
	);
}
