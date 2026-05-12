// ── Encoded cluster prefilter — shared types ──────────────────────────────────

export type EncodedPrefilterMode = 'off' | 'shadow' | 'boost' | 'enforce';

export interface EncodedPrefilterConfig {
	topK:    number;
	enabled: boolean;
	mode:    EncodedPrefilterMode;
}

export interface TopKCluster {
	id:    number;
	score: number;
}

/** In-process centroid cache entry. */
export interface CentroidCacheEntry {
	/** Flat array: [cluster0_dim0, cluster0_dim1, ..., clusterN_dim63] */
	data:      Float32Array;
	ids:       number[];
	trainedAt: string;
	count:     number;
	loadedAt:  number;
}

/** Back-compat alias — the original exported name. */
export type Centroids64 = CentroidCacheEntry;

export interface PrefilterOptions {
	/** Number of clusters to keep. Default: 5. */
	topK?: number;
	/** Bypass feature flag check. Default: false. */
	forceEnable?: boolean;
}

export interface PrefilterResult {
	/** Cluster IDs ordered by cosine similarity to query. */
	clusterIds: number[];
	/** Cosine score per cluster, same order. */
	scores: number[];
	/** Total scan duration. */
	durationMs: number;
	/** True when prefilter ran and returned clusters. */
	applied: boolean;
	/** Diagnostic — undefined on success, error description on skip/fail. */
	fallbackReason?: string;
	/** Qdrant `should` filter ready for injection into ANN search. */
	filter?: { should: { key: string; match: { value: number } }[] };
	/** Source — how centroids were obtained. */
	centroidSource?: 'process-cache' | 'redis';
}

/** A skipped/failed result — `applied` is always false and `fallbackReason` is always set. */
export interface PrefilterDecision extends PrefilterResult {
	applied: false;
	fallbackReason: string;
}
