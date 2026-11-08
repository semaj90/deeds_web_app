/**
 * TASK_DOMAIN_LUT_RECONCILIATION_V1
 *
 * Reconciles the 10-domain Prosecutor 5W1H / OpenSpec Task Taxonomy (`openspec-task-taxonomy-v2`)
 * with the canonical `nes-domain-palette-v1` (`scripts/atlas/data/nes-domain-palette-v1.json`)
 * and `20261018_atlas_nes_lut_v1.sql` (`atlas.nes-lut.v1`) at the classification boundary.
 *
 * Strictly separates three independent values:
 *   1. `primaryLutByte` (uint8 1..10): Task-domain code in `openspec-task-taxonomy-v2`
 *   2. `domainBitmask` (uint16 1..1023): 10-bit multi-label membership mask
 *   3. `nesHex` (`0x16`, `0x2A`, ...): Canonical NES hardware palette color byte from `nes-domain-palette-v1`
 */

export const TASK_TAXONOMY_REVISION_V2 = 'openspec-task-taxonomy-v2' as const;
export const CANONICAL_NES_PALETTE_REVISION_V1 = 'nes-domain-palette-v1' as const;
export const CANONICAL_SQL_LUT_REVISION_V1 = 'atlas.nes-lut.v1' as const;

export const TASK_DOMAIN_COUNT = 10;
export const VALID_TASK_DOMAIN_MASK = (1 << TASK_DOMAIN_COUNT) - 1; // 0x03FF = 1023

export type CanonicalPaletteDomainKey =
	| 'auth'
	| 'ui'
	| 'retrieval'
	| 'network'
	| 'database'
	| 'cache'
	| 'agent'
	| 'graph'
	| 'ml'
	| 'general';

export type TaskDomainKeyV2 =
	| 'WHO_IDENTITY_AUTH'
	| 'WHAT_STATUTE_CORPUS'
	| 'WHY_LEDGER_MOTIVE'
	| 'HOW_SCENE_3D_GLB'
	| 'STORAGE_SEAWEED_S3'
	| 'DATA_PG18_DRIZZLE'
	| 'ENGINE_BVH_N64_ARENA'
	| 'SPLAT_SPZ_SOG_LOD'
	| 'AGENT_ORNITH_RAG_GPU'
	| 'UI_SVELTE5_BOARD';

export interface CanonicalPaletteEntryV1 {
	readonly lutRevision: typeof CANONICAL_NES_PALETTE_REVISION_V1;
	readonly domainKey: CanonicalPaletteDomainKey;
	/** JSON palette lutByte (1..10) */
	readonly jsonLutByte: number;
	/** SQL seed `20261018_atlas_nes_lut_v1.sql` lut_byte (`general` is 0 in SQL seed, 10 in JSON) */
	readonly sqlSeedLutByte: number;
	/** Hardware NES palette color byte (never interchangeable with lutByte) */
	readonly nesHex: string;
	readonly label: string;
	readonly priorWeight: number;
}

export const CANONICAL_NES_PALETTE_V1: Readonly<Record<CanonicalPaletteDomainKey, CanonicalPaletteEntryV1>> =
	Object.freeze({
		auth: {
			lutRevision: CANONICAL_NES_PALETTE_REVISION_V1,
			domainKey: 'auth',
			jsonLutByte: 1,
			sqlSeedLutByte: 1,
			nesHex: '0x16',
			label: 'DOM_AUTH_GUARD',
			priorWeight: 0.9
		},
		ui: {
			lutRevision: CANONICAL_NES_PALETTE_REVISION_V1,
			domainKey: 'ui',
			jsonLutByte: 2,
			sqlSeedLutByte: 2,
			nesHex: '0x2A',
			label: 'DOM_UI_SVELTE5_RUNES',
			priorWeight: 0.85
		},
		retrieval: {
			lutRevision: CANONICAL_NES_PALETTE_REVISION_V1,
			domainKey: 'retrieval',
			jsonLutByte: 3,
			sqlSeedLutByte: 3,
			nesHex: '0x21',
			label: 'DOM_RETRIEVAL_ANN_RRF',
			priorWeight: 0.95
		},
		network: {
			lutRevision: CANONICAL_NES_PALETTE_REVISION_V1,
			domainKey: 'network',
			jsonLutByte: 4,
			sqlSeedLutByte: 4,
			nesHex: '0x2C',
			label: 'DOM_NETWORK_HTTP_TRPC',
			priorWeight: 0.8
		},
		database: {
			lutRevision: CANONICAL_NES_PALETTE_REVISION_V1,
			domainKey: 'database',
			jsonLutByte: 5,
			sqlSeedLutByte: 5,
			nesHex: '0x12',
			label: 'DOM_PG18_DRIZZLE',
			priorWeight: 0.95
		},
		cache: {
			lutRevision: CANONICAL_NES_PALETTE_REVISION_V1,
			domainKey: 'cache',
			jsonLutByte: 6,
			sqlSeedLutByte: 6,
			nesHex: '0x27',
			label: 'DOM_VALKEY_BITFROST_LRU',
			priorWeight: 0.88
		},
		agent: {
			lutRevision: CANONICAL_NES_PALETTE_REVISION_V1,
			domainKey: 'agent',
			jsonLutByte: 7,
			sqlSeedLutByte: 7,
			nesHex: '0x24',
			label: 'DOM_AGENT_OAK_RLM_DSPY',
			priorWeight: 0.92
		},
		graph: {
			lutRevision: CANONICAL_NES_PALETTE_REVISION_V1,
			domainKey: 'graph',
			jsonLutByte: 8,
			sqlSeedLutByte: 8,
			nesHex: '0x1A',
			label: 'DOM_GRAPH_CUGRAPH_PAGERANK',
			priorWeight: 0.9
		},
		ml: {
			lutRevision: CANONICAL_NES_PALETTE_REVISION_V1,
			domainKey: 'ml',
			jsonLutByte: 9,
			sqlSeedLutByte: 9,
			nesHex: '0x14',
			label: 'DOM_ML_ATEN_TENSORRT_GEMM',
			priorWeight: 0.94
		},
		general: {
			lutRevision: CANONICAL_NES_PALETTE_REVISION_V1,
			domainKey: 'general',
			jsonLutByte: 10,
			sqlSeedLutByte: 0,
			nesHex: '0x0F',
			label: 'DOM_GENERAL_FALLBACK',
			priorWeight: 0.4
		}
	});

export interface TaskDomainTranslationEntryV2 {
	readonly taskTaxonomyRevision: typeof TASK_TAXONOMY_REVISION_V2;
	readonly taskLutByte: number; // 1..10
	readonly taskLutHex: string; // '0x01'..'0x0A'
	readonly taskDomainKey: TaskDomainKeyV2;
	readonly pillar: 'WHO' | 'WHAT' | 'WHY' | 'HOW' | 'INGEST' | 'DATA' | 'ENGINE' | 'RENDER' | 'AGENT' | 'UI';
	readonly canonicalPaletteDomain: CanonicalPaletteDomainKey;
	readonly canonicalPalette: CanonicalPaletteEntryV1;
}

/**
 * Audited translation table mapping `openspec-task-taxonomy-v2` (0x01..0x0A)
 * to the canonical `nes-domain-palette-v1` domains without mutating `atlas_nes_lut_v1`.
 */
export const TASK_TO_CANONICAL_LUT_BRIDGE_V2: Readonly<Record<number, TaskDomainTranslationEntryV2>> =
	Object.freeze({
		1: {
			taskTaxonomyRevision: TASK_TAXONOMY_REVISION_V2,
			taskLutByte: 1,
			taskLutHex: '0x01',
			taskDomainKey: 'WHO_IDENTITY_AUTH',
			pillar: 'WHO',
			canonicalPaletteDomain: 'auth',
			canonicalPalette: CANONICAL_NES_PALETTE_V1.auth
		},
		2: {
			taskTaxonomyRevision: TASK_TAXONOMY_REVISION_V2,
			taskLutByte: 2,
			taskLutHex: '0x02',
			taskDomainKey: 'WHAT_STATUTE_CORPUS',
			pillar: 'WHAT',
			canonicalPaletteDomain: 'retrieval',
			canonicalPalette: CANONICAL_NES_PALETTE_V1.retrieval
		},
		3: {
			taskTaxonomyRevision: TASK_TAXONOMY_REVISION_V2,
			taskLutByte: 3,
			taskLutHex: '0x03',
			taskDomainKey: 'WHY_LEDGER_MOTIVE',
			pillar: 'WHY',
			canonicalPaletteDomain: 'cache',
			canonicalPalette: CANONICAL_NES_PALETTE_V1.cache
		},
		4: {
			taskTaxonomyRevision: TASK_TAXONOMY_REVISION_V2,
			taskLutByte: 4,
			taskLutHex: '0x04',
			taskDomainKey: 'HOW_SCENE_3D_GLB',
			pillar: 'HOW',
			canonicalPaletteDomain: 'graph',
			canonicalPalette: CANONICAL_NES_PALETTE_V1.graph
		},
		5: {
			taskTaxonomyRevision: TASK_TAXONOMY_REVISION_V2,
			taskLutByte: 5,
			taskLutHex: '0x05',
			taskDomainKey: 'STORAGE_SEAWEED_S3',
			pillar: 'INGEST',
			canonicalPaletteDomain: 'network',
			canonicalPalette: CANONICAL_NES_PALETTE_V1.network
		},
		6: {
			taskTaxonomyRevision: TASK_TAXONOMY_REVISION_V2,
			taskLutByte: 6,
			taskLutHex: '0x06',
			taskDomainKey: 'DATA_PG18_DRIZZLE',
			pillar: 'DATA',
			canonicalPaletteDomain: 'database',
			canonicalPalette: CANONICAL_NES_PALETTE_V1.database
		},
		7: {
			taskTaxonomyRevision: TASK_TAXONOMY_REVISION_V2,
			taskLutByte: 7,
			taskLutHex: '0x07',
			taskDomainKey: 'ENGINE_BVH_N64_ARENA',
			pillar: 'ENGINE',
			canonicalPaletteDomain: 'ml',
			canonicalPalette: CANONICAL_NES_PALETTE_V1.ml
		},
		8: {
			taskTaxonomyRevision: TASK_TAXONOMY_REVISION_V2,
			taskLutByte: 8,
			taskLutHex: '0x08',
			taskDomainKey: 'SPLAT_SPZ_SOG_LOD',
			pillar: 'RENDER',
			canonicalPaletteDomain: 'general',
			canonicalPalette: CANONICAL_NES_PALETTE_V1.general
		},
		9: {
			taskTaxonomyRevision: TASK_TAXONOMY_REVISION_V2,
			taskLutByte: 9,
			taskLutHex: '0x09',
			taskDomainKey: 'AGENT_ORNITH_RAG_GPU',
			pillar: 'AGENT',
			canonicalPaletteDomain: 'agent',
			canonicalPalette: CANONICAL_NES_PALETTE_V1.agent
		},
		10: {
			taskTaxonomyRevision: TASK_TAXONOMY_REVISION_V2,
			taskLutByte: 10,
			taskLutHex: '0x0A',
			taskDomainKey: 'UI_SVELTE5_BOARD',
			pillar: 'UI',
			canonicalPaletteDomain: 'ui',
			canonicalPalette: CANONICAL_NES_PALETTE_V1.ui
		}
	});

/**
 * Encodes 1-based task-domain codes (1..10) into a 10-bit uint16 membership mask (0..1023).
 */
export function encodeTaskDomains(codes: readonly number[]): number {
	let mask = 0;
	for (const code of codes) {
		if (!Number.isInteger(code) || code < 1 || code > TASK_DOMAIN_COUNT) {
			throw new RangeError(`Unknown task-domain code: ${code}`);
		}
		mask |= 1 << (code - 1);
	}
	return mask;
}

/**
 * Decodes a 10-bit uint16 membership mask (0..1023) back into sorted 1-based task-domain codes (1..10).
 */
export function decodeTaskDomains(mask: number): number[] {
	if (!Number.isInteger(mask) || mask < 0 || (mask & ~VALID_TASK_DOMAIN_MASK) !== 0) {
		throw new RangeError(`Invalid task-domain bitmask: ${mask}`);
	}
	return Array.from({ length: TASK_DOMAIN_COUNT }, (_, i) => i + 1).filter(
		(code) => (mask & (1 << (code - 1))) !== 0
	);
}

export function translateTaskLutToCanonicalPalette(taskLutByte: number): TaskDomainTranslationEntryV2 {
	const entry = TASK_TO_CANONICAL_LUT_BRIDGE_V2[taskLutByte];
	if (!entry) {
		throw new RangeError(`Unknown taskLutByte: ${taskLutByte}`);
	}
	return entry;
}
