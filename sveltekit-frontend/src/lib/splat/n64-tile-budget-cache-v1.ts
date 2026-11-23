/**
 * N64-style memory helpers (v1): a byte-budgeted LRU cache for packed tiles, and a budget report
 * for packed scene assets against the 8 MiB target from the design review.
 *
 * Pure module. It does not decode textures or touch the GPU. Byte sizes are the packed byte
 * lengths the caller supplies (for 4bpp tiles, width * height / 2). The 4bpp codec itself lives in
 * indexed-palette-texture-v1.ts and is not duplicated here.
 *
 * The budget governs packed assets and resident tiles, not decoded GPU buffers or total browser memory.
 */

export const PACKED_ASSET_BUDGET_BYTES_V1 = 8 * 1024 * 1024;

export const PACKED_ASSET_CATEGORY_BUDGET_V1 = Object.freeze({
	lowPolyGlbAndCharacters: 2.0 * 1024 * 1024,
	indexedTexturesAndPalettes: 1.0 * 1024 * 1024,
	animationAndFsmData: 0.5 * 1024 * 1024,
	bvhAndSelectionStructures: 1.0 * 1024 * 1024,
	optionalCompressedSpz: 2.5 * 1024 * 1024,
	metadataAndReserved: 1.0 * 1024 * 1024,
} as const);

export type TileBudgetStatsV1 = {
	bytes: number;
	count: number;
	maxBytes: number;
	hits: number;
	misses: number;
	evictions: number;
};

export type TileBudgetCacheV1<T> = {
	get(key: string): T | undefined;
	put(key: string, value: T, bytes: number): void;
	has(key: string): boolean;
	delete(key: string): boolean;
	stats(): TileBudgetStatsV1;
};

/**
 * LRU cache with a hard byte budget. The least recently used entries are evicted until a new entry
 * fits. An entry larger than the whole budget is refused rather than evicting everything for it.
 */
export function createTileBudgetCacheV1<T>(maxBytes: number): TileBudgetCacheV1<T> {
	if (!Number.isInteger(maxBytes) || maxBytes <= 0) throw new Error('TILE_BUDGET_MUST_BE_POSITIVE_INTEGER');
	// Map preserves insertion order; re-inserting on access makes the first entry the LRU.
	const entries = new Map<string, { value: T; bytes: number }>();
	let bytes = 0;
	let hits = 0;
	let misses = 0;
	let evictions = 0;

	const evictUntil = (needed: number) => {
		for (const [key, entry] of entries) {
			if (bytes + needed <= maxBytes) break;
			entries.delete(key);
			bytes -= entry.bytes;
			evictions++;
		}
	};

	return {
		get(key) {
			const entry = entries.get(key);
			if (!entry) {
				misses++;
				return undefined;
			}
			hits++;
			entries.delete(key);
			entries.set(key, entry);
			return entry.value;
		},
		put(key, value, entryBytes) {
			if (!Number.isInteger(entryBytes) || entryBytes < 0) throw new Error('TILE_BYTES_INVALID');
			if (entryBytes > maxBytes) throw new Error('TILE_LARGER_THAN_BUDGET');
			const existing = entries.get(key);
			if (existing) {
				entries.delete(key);
				bytes -= existing.bytes;
			}
			evictUntil(entryBytes);
			entries.set(key, { value, bytes: entryBytes });
			bytes += entryBytes;
		},
		has(key) {
			return entries.has(key);
		},
		delete(key) {
			const entry = entries.get(key);
			if (!entry) return false;
			entries.delete(key);
			bytes -= entry.bytes;
			return true;
		},
		stats() {
			return { bytes, count: entries.size, maxBytes, hits, misses, evictions };
		},
	};
}

export type PackedAssetV1 = { category: keyof typeof PACKED_ASSET_CATEGORY_BUDGET_V1; bytes: number; label?: string };

export type PackedBudgetReportV1 = {
	totalBytes: number;
	budgetBytes: number;
	withinTotalBudget: boolean;
	categories: Array<{ category: string; bytes: number; budgetBytes: number; withinBudget: boolean }>;
};

/** Sums packed asset bytes per category and checks each against its design budget. */
export function packedBudgetReportV1(assets: PackedAssetV1[]): PackedBudgetReportV1 {
	const totals = new Map<string, number>();
	for (const a of assets) {
		if (!(a.category in PACKED_ASSET_CATEGORY_BUDGET_V1)) throw new Error('PACKED_ASSET_CATEGORY_UNKNOWN');
		if (!Number.isFinite(a.bytes) || a.bytes < 0) throw new Error('PACKED_ASSET_BYTES_INVALID');
		totals.set(a.category, (totals.get(a.category) ?? 0) + a.bytes);
	}
	const categories = (Object.keys(PACKED_ASSET_CATEGORY_BUDGET_V1) as Array<keyof typeof PACKED_ASSET_CATEGORY_BUDGET_V1>).map((c) => {
		const bytes = totals.get(c) ?? 0;
		const budgetBytes = PACKED_ASSET_CATEGORY_BUDGET_V1[c];
		return { category: c, bytes, budgetBytes, withinBudget: bytes <= budgetBytes };
	});
	const totalBytes = categories.reduce((n, c) => n + c.bytes, 0);
	return {
		totalBytes,
		budgetBytes: PACKED_ASSET_BUDGET_BYTES_V1,
		withinTotalBudget: totalBytes <= PACKED_ASSET_BUDGET_BYTES_V1,
		categories,
	};
}
