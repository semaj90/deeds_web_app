/**
 * OBS-03: Valkey HyperLogLog breadth sketch for snapshot-qualified symbol coverage.
 *
 * Tracks approximate distinct retrieved symbols against a frozen snapshot's exact eligible count:
 *
 *   Estimated coverage = HLL(distinct qualified symbols retrieved) / (exact eligible count)
 *
 * Valkey's PFADD / PFCOUNT provide bounded O(1) memory (~12 KB per register) for cardinality estimation.
 * Note: HyperLogLog is strictly an approximate register for observability telemetry, never canonical admission authority.
 * Uses dedicated, isolated namespace `hll:snapshot:<snapshotRevision>:symbols`.
 */

export interface HllClient {
	pfadd(key: string, ...elements: string[]): Promise<number>;
	pfcount(...keys: string[]): Promise<number>;
	expire?(key: string, seconds: number): Promise<number>;
}

export interface RecordSymbolsOptions {
	client: HllClient;
	snapshotRevision: string;
	symbols: string[];
	ttlSeconds?: number;
}

export interface EstimateCoverageOptions {
	client: HllClient;
	snapshotRevision: string;
	exactEligibleCount: number;
}

export interface SymbolCoverageEstimate {
	schema: 'atlas.valkey-hll-coverage-estimate.v1';
	snapshotRevision: string;
	hllEstimatedCount: number;
	exactEligibleCount: number;
	estimatedCoverage: number;
	timestamp: string;
}

export function formatHllKey(snapshotRevision: string): string {
	const sanitized = snapshotRevision.replace(/[^a-zA-Z0-9_:-]/g, '_');
	return `hll:snapshot:${sanitized}:symbols`;
}

/**
 * Record distinct qualified symbol identifiers into the snapshot's HLL sketch.
 * Returns the number of registers altered (0 if all elements already observed, 1 otherwise).
 */
export async function recordSnapshotSymbolsHLL({
	client,
	snapshotRevision,
	symbols,
	ttlSeconds = 86400,
}: RecordSymbolsOptions): Promise<{ altered: number; key: string }> {
	if (!snapshotRevision?.trim()) {
		throw new Error('SNAPSHOT_REVISION_REQUIRED');
	}
	if (!symbols || symbols.length === 0) {
		return { altered: 0, key: formatHllKey(snapshotRevision) };
	}

	const key = formatHllKey(snapshotRevision);
	// Chunk symbols in batches of 500 to keep network packets bounded
	let alteredTotal = 0;
	const chunkSize = 500;
	for (let i = 0; i < symbols.length; i += chunkSize) {
		const chunk = symbols.slice(i, i + chunkSize);
		const altered = await client.pfadd(key, ...chunk);
		alteredTotal += altered;
	}

	if (ttlSeconds && client.expire) {
		await client.expire(key, ttlSeconds);
	}

	return { altered: alteredTotal, key };
}

/**
 * Estimate corpus breadth coverage for a snapshot.
 * Requires that both numerator and denominator reference the exact same snapshot revision.
 */
export async function estimateSnapshotSymbolCoverage({
	client,
	snapshotRevision,
	exactEligibleCount,
}: EstimateCoverageOptions): Promise<SymbolCoverageEstimate> {
	if (!snapshotRevision?.trim()) {
		throw new Error('SNAPSHOT_REVISION_REQUIRED');
	}
	if (typeof exactEligibleCount !== 'number' || exactEligibleCount < 0) {
		throw new Error('INVALID_EXACT_ELIGIBLE_COUNT');
	}

	const key = formatHllKey(snapshotRevision);
	const hllCount = await client.pfcount(key);

	const estimatedCoverage = exactEligibleCount > 0
		? Math.min(1.0, Number((hllCount / exactEligibleCount).toFixed(6)))
		: 0;

	return {
		schema: 'atlas.valkey-hll-coverage-estimate.v1',
		snapshotRevision,
		hllEstimatedCount: hllCount,
		exactEligibleCount,
		estimatedCoverage,
		timestamp: new Date().toISOString(),
	};
}
