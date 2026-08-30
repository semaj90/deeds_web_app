export const CACHE_EXECUTION_KINDS_V1 = [
	'MISS',
	'COMPUTE',
	'WRITE',
	'READBACK_HIT',
	'INVALIDATE',
	'POST_INVALIDATION_MISS'
] as const;

export type CacheExecutionKindV1 = (typeof CACHE_EXECUTION_KINDS_V1)[number];
export type CacheExecutionTierV1 = 'ace' | 'valkey' | 'bitfrost' | 'kv_prefix';

export type CacheExecutionEventV1 = {
	sequence: number;
	kind: CacheExecutionKindV1;
	observedAt: string;
	latencyMs?: number;
	payloadChecksum?: string;
	pttlMs?: number;
};

export type CacheExecutionReceiptV1 = {
	schema: 'atlas.cache-execution-receipt.v1';
	runId: string;
	tier: CacheExecutionTierV1;
	identityChecksum: string;
	namespace: string;
	cacheKeyDigest: string;
	canonicalAuthority: false;
	events: CacheExecutionEventV1[];
	revisions: {
		workspaceRevision?: string;
		sourceRevision?: string;
		graphRevision?: string;
		representationRevision?: string;
		candidateSnapshotRevision?: string;
		contextManifestChecksum?: string;
		modelRevision?: string;
		tokenizerRevision?: string;
		adapterRevision?: string;
		promptTemplateRevision?: string;
	};
	telemetry: {
		inputTokens?: number;
		outputTokens?: number;
		cacheReadInputTokens?: number;
		cacheWriteInputTokens?: number;
		valkeyHitsObserved: number;
		valkeyMissesObserved: number;
		computeMs?: number;
		hitReadMs?: number;
	};
	status: 'PROVEN' | 'FAILED';
	diagnostics: string[];
};

function isSha256(value: string): boolean {
	return /^[a-f0-9]{64}$/i.test(value);
}

function nonNegative(value: number | undefined): boolean {
	return value === undefined || (Number.isFinite(value) && value >= 0);
}

/**
 * A promotion-grade cache receipt proves the exact bounded state machine:
 * MISS → COMPUTE → WRITE → READBACK_HIT → INVALIDATE → POST_INVALIDATION_MISS.
 */
export function validateCacheExecutionReceiptV1(receipt: CacheExecutionReceiptV1): string[] {
	const errors: string[] = [];
	if (receipt.schema !== 'atlas.cache-execution-receipt.v1') errors.push('INVALID_SCHEMA');
	if (!receipt.runId.trim()) errors.push('RUN_ID_REQUIRED');
	if (!receipt.namespace.trim()) errors.push('NAMESPACE_REQUIRED');
	if (!isSha256(receipt.identityChecksum)) errors.push('IDENTITY_CHECKSUM_INVALID');
	if (!isSha256(receipt.cacheKeyDigest)) errors.push('CACHE_KEY_DIGEST_INVALID');
	if (receipt.canonicalAuthority !== false) errors.push('CACHE_MUST_NOT_BE_CANONICAL_AUTHORITY');

	const expectedKinds: CacheExecutionKindV1[] = [
		'MISS', 'COMPUTE', 'WRITE', 'READBACK_HIT', 'INVALIDATE', 'POST_INVALIDATION_MISS'
	];
	if (receipt.events.length !== expectedKinds.length) errors.push('EVENT_COUNT_INVALID');
	for (let i = 0; i < expectedKinds.length; i++) {
		const event = receipt.events[i];
		if (!event) continue;
		if (event.sequence !== i + 1) errors.push(`EVENT_${i + 1}_SEQUENCE_INVALID`);
		if (event.kind !== expectedKinds[i]) errors.push(`EVENT_${i + 1}_KIND_INVALID`);
		if (!event.observedAt || Number.isNaN(Date.parse(event.observedAt))) errors.push(`EVENT_${i + 1}_TIME_INVALID`);
		if (!nonNegative(event.latencyMs)) errors.push(`EVENT_${i + 1}_LATENCY_INVALID`);
	}

	const [miss, compute, write, hit, invalidate, postMiss] = receipt.events;
	if (miss?.pttlMs !== -2) errors.push('INITIAL_MISS_PTTL_MUST_BE_MINUS_2');
	if (!compute?.payloadChecksum || !isSha256(compute.payloadChecksum)) errors.push('COMPUTE_CHECKSUM_INVALID');
	if (!write?.payloadChecksum || write.payloadChecksum !== compute?.payloadChecksum) errors.push('WRITE_CHECKSUM_MISMATCH');
	if (!hit?.payloadChecksum || hit.payloadChecksum !== compute?.payloadChecksum) errors.push('READBACK_CHECKSUM_MISMATCH');
	if (hit?.pttlMs === undefined || hit.pttlMs <= 0) errors.push('READBACK_PTTL_MUST_BE_POSITIVE');
	if (!invalidate) errors.push('INVALIDATE_EVENT_REQUIRED');
	if (postMiss?.pttlMs !== -2) errors.push('POST_INVALIDATION_MISS_PTTL_MUST_BE_MINUS_2');

	const telemetry = receipt.telemetry;
	for (const [name, value] of Object.entries(telemetry)) {
		if (typeof value === 'number' && !nonNegative(value)) errors.push(`TELEMETRY_${name.toUpperCase()}_INVALID`);
	}
	if (telemetry.valkeyHitsObserved < 1) errors.push('VALKEY_HIT_NOT_OBSERVED');
	if (telemetry.valkeyMissesObserved < 2) errors.push('VALKEY_MISS_COUNT_INSUFFICIENT');
	if (receipt.status === 'PROVEN' && errors.length > 0) errors.push('PROVEN_RECEIPT_HAS_VALIDATION_ERRORS');
	return [...new Set(errors)];
}

export function isCacheExecutionReceiptProvenV1(receipt: CacheExecutionReceiptV1): boolean {
	return receipt.status === 'PROVEN' && validateCacheExecutionReceiptV1(receipt).length === 0;
}
