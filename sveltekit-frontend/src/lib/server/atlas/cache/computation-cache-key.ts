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
	| 'cross_encoder'
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

export interface ComputationArtifactReceiptV1 {
	cacheKey: string;
	artifactRef: string;
	artifactHash: string;
	status: 'proven' | 'failed' | 'partial';
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

export function buildComputationCacheKey(descriptor: ComputationCacheDescriptorV1): string {
	const digest = createHash('sha256').update(stableComputationDescriptorJson(descriptor)).digest('hex');
	return `atlas:compute:v1:${descriptor.stage}:${digest}`;
}

/**
 * Reuse is deliberately strict: only a PROVEN receipt for the exact derived
 * cache key may skip execution. A partial/failed artifact is evidence, not a
 * reusable result.
 */
export function canReuseComputation(
	descriptor: ComputationCacheDescriptorV1,
	receipt: ComputationArtifactReceiptV1 | null | undefined,
): boolean {
	return Boolean(
		receipt
		&& receipt.status === 'proven'
		&& receipt.cacheKey === buildComputationCacheKey(descriptor)
		&& receipt.artifactRef.trim()
		&& receipt.artifactHash.trim(),
	);
}
