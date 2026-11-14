import crypto from 'node:crypto';
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { types } from 'node:util';
import { z } from 'zod';
import {
	BITFROST_STATE_MEANINGS_V1,
	BitFrostTokenFsmManagerV1,
	compileFsmContextManifestV1,
} from '../cache/bitfrost-token-fsm-v1.js';
import type { FanoutEvidenceBundleV1, FanoutEvidenceCandidateV1 } from '../context/fanout-evidence-bundle-v1.js';
import {
	type BoundedCsrGraph,
	type CsrGraphCursor,
	type TraversalStepResult,
	traverseCsrWithCursor,
} from '../graph/csr-traversal-cursor.js';
import {
	type TaskLifecycleStateV1,
	type TaskTransitionReceiptV1,
	transitionTaskLifecycleV1,
} from '../orchestration/task-execution-lifecycle-fsm-v1.js';
import type { CanonicalFeatureLabel } from '../taxonomy/feature-taxonomy-v1.js';
import {
	type TaskDomainTranslationEntryV2,
	VALID_TASK_DOMAIN_MASK,
	decodeTaskDomains,
	translateTaskLutToCanonicalPalette,
} from '../taxonomy/task-domain-lut-reconciliation-v1.js';
import { NesFeatureFsm, type CacheInstructionsTensorDescriptorV1 } from './nes-feature-fsm.js';

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const MAX_NES_FSM_BATCH_RECORDS_V1 = 256;
export const MAX_NATIVE_RADIX_ROWS_V1 = 65_536;
export const NES_FSM_BINARY_SCHEMA_REVISION_V1 = 'atlas.nes-fsm-binary-descriptor.v1' as const;
export const NES_FSM_BINARY_MAGIC_LE = 0x4e455331; // "NES1" as LE uint32 value
export const NES_FSM_BINARY_ENDIAN_TAG_LE = 0x01020304;
export const NES_FSM_BINARY_ENDIAN_TAG_BE = 0x04030201;
export const NES_FSM_BINARY_HEADER_BYTES = 64;
export const NES_FSM_BINARY_RECORD_BYTES = 16;
export const NES_FSM_BINARY_ALIGNMENT_BYTES = 64;

// Stable fixture identities, deliberately not Git or live workspace revisions.
export const FROZEN_SOURCE_REVISION_V1 = 'fixture:parent-atlas-nes-fsm-native-runtime-v1:source' as const;
export const FROZEN_WORKSPACE_REVISION_V1 = 'fixture:parent-atlas-nes-fsm-native-runtime-v1:workspace' as const;
export const FROZEN_GRAPH_REVISION_V1 =
	'sha256:4e07408562bedb8b60ce05c1decfe3ad16b72230967de01f640b7e4729b49fce' as const;
export const FROZEN_EDGE_POLICY_REVISION_V1 = 'atlas.edge-policy.v1' as const;

export const TASK_LIFECYCLE_STATE_CODES_V1: Readonly<Record<TaskLifecycleStateV1, number>> = Object.freeze({
	DISCOVERED: 1,
	CLASSIFIED: 2,
	RANKED: 3,
	DEPENDENCY_CHECKED: 4,
	BLOCKED: 5,
	READY: 6,
	RUNNING: 7,
	VERIFIED: 8,
	FAILED: 9,
});

export type NesFsmEventV1 = 'EVALUATE_READY' | 'HOLD_BLOCKED';

export interface NesFsmTransitionTableRuleV1 {
	readonly fromState: TaskLifecycleStateV1;
	readonly event: NesFsmEventV1;
	readonly toState: TaskLifecycleStateV1;
	readonly requiresPolicyGrant: boolean;
}

export const NES_FSM_TRANSITION_TABLE_V1: readonly NesFsmTransitionTableRuleV1[] = Object.freeze([
	{
		fromState: 'DEPENDENCY_CHECKED',
		event: 'EVALUATE_READY',
		toState: 'READY',
		requiresPolicyGrant: true,
	},
	{
		fromState: 'DEPENDENCY_CHECKED',
		event: 'HOLD_BLOCKED',
		toState: 'BLOCKED',
		requiresPolicyGrant: false,
	},
]);

export interface FrozenCandidateInputRecordV1 {
	readonly candidateOrdinal: number;
	readonly kmeansClusterId: number;
	readonly somBmuId: number;
	readonly primaryLutByte: number;
	readonly domainBitmask: number;
	/** Descriptive metadata only; never a security/authorization claim */
	readonly featureLabel: CanonicalFeatureLabel;
	readonly sourceRef: string;
	readonly tokenCount: number;
}

export interface FrozenCandidateBatchV1 {
	readonly schema: 'atlas.frozen-candidate-batch.v1';
	readonly sourceRevision: string;
	readonly workspaceRevision: string;
	readonly records: readonly FrozenCandidateInputRecordV1[];
}

export interface PolicyAuthorizationGrantV1 {
	readonly grantKind: 'EXPLICIT_POLICY_GRANT';
	readonly actor: string;
	readonly taskId: string;
	readonly sourceRevision: string;
	readonly grantedPolicyMask: number;
	readonly requiredPolicyMask: number;
	readonly inputsPresent: boolean;
	readonly unresolvedDependencies: readonly string[];
}

export interface AtlasNativeCoreBindings {
	radixSortSomCandidateIndicesV1(
		kmeansClusterIds: Uint16Array,
		somBmuIds: Uint16Array,
		candidateOrdinals: Uint32Array
	): Uint32Array;
	detectRfcOrLanguage?(input: string): {
		matched: boolean;
		authority: string;
		domainTopic: string;
		rfcId: string;
		featureLabel: string;
		languageId: string;
		byteOffset: number;
		stateTransitions: number;
	};
}

export interface NativeAddonGuardVerificationV1 {
	addonLoaded: boolean;
	addonPath: string;
	max65536RowsEnforced: boolean;
	duplicateOrdinalsEnforced: boolean;
	somBmuRange400Enforced: boolean;
}

export interface ResolvedCandidateDomainRecordV1 extends FrozenCandidateInputRecordV1 {
	readonly sourceIndex: number;
	readonly translation: TaskDomainTranslationEntryV2;
	readonly decodedDomainCodes: readonly number[];
	/** Visual NES color byte only; never an authorization grant */
	readonly nesHex: string;
	readonly nesPaletteByte: number;
}

export interface SortedCandidateOutputRecordV1 extends ResolvedCandidateDomainRecordV1 {
	readonly sortedRank: number;
	readonly bitfrostState: 'ADMITTED' | 'RESIDENT';
	readonly bitfrostStateCode: 1 | 2;
}

export interface BinaryDescriptorReadbackSummaryV1 {
	readonly schema: typeof NES_FSM_BINARY_SCHEMA_REVISION_V1;
	readonly magicHex: string;
	readonly endianness: 'LE';
	readonly endianTagHex: string;
	readonly schemaVersion: number;
	readonly serializedLayoutAlignmentBytes: number;
	readonly totalByteLength: number;
	readonly candidateCount: number;
	readonly primaryLutByte: number;
	readonly nesPaletteByte: number;
	readonly domainBitmask: number;
	readonly policyAuthorizationMask: number;
	readonly fromStateCode: number;
	readonly toStateCode: number;
	readonly authorityFlagsByte: number;
	readonly canonicalAuthority: false;
	readonly promotionEligible: false;
	readonly writesPerformed: false;
	readonly csrTotalVisited: number;
	readonly payloadDigestMatch: boolean;
	readonly sourceRevisionPrefixMatch: boolean;
	readonly ordinalMapPrefixMatch: boolean;
	readonly csrCursorPrefixMatch: boolean;
	readonly recordCount: number;
}

export class DoubleBufferDescriptorSlotV1 {
	private activeBuffer: Uint8Array | null = null;
	private activeChecksum: string | null = null;
	private activeRevision: string | null = null;
	private swapCount = 0;

	public getSnapshot(): {
		hasActive: boolean;
		activeChecksum: string | null;
		activeRevision: string | null;
		activeByteLength: number;
		swapCount: number;
		activeBufferCopy: Uint8Array | null;
	} {
		return {
			hasActive: this.activeBuffer !== null,
			activeChecksum: this.activeChecksum,
			activeRevision: this.activeRevision,
			activeByteLength: this.activeBuffer?.byteLength ?? 0,
			swapCount: this.swapCount,
			activeBufferCopy: this.activeBuffer ? new Uint8Array(this.activeBuffer) : null,
		};
	}

	public commitValidatedScratch(
		scratchBuffer: Uint8Array,
		checksum: string,
		sourceRevision: string
	): { previousActiveChecksum: string | null; swapCount: number } {
		const previousActiveChecksum = this.activeChecksum;
		this.activeBuffer = new Uint8Array(scratchBuffer);
		this.activeChecksum = checksum;
		this.activeRevision = sourceRevision;
		this.swapCount += 1;
		return { previousActiveChecksum, swapCount: this.swapCount };
	}
}

export interface NesFsmNativeRuntimeOptionsV1 {
	batch?: FrozenCandidateBatchV1;
	expectedSourceRevision?: string;
	authorizationGrant?: PolicyAuthorizationGrantV1;
	event?: NesFsmEventV1;
	csrCursor?: CsrGraphCursor;
	tokenBudget?: number;
	runId?: string;
	query?: string;
	bufferSlot?: DoubleBufferDescriptorSlotV1;
	signal?: AbortSignal;
	addonOverride?: AtlasNativeCoreBindings;
}

export interface NesFsmNativeRuntimeReportV1 {
	readonly schema: 'atlas.nes-fsm-native-runtime-report.v1';
	readonly canonicalAuthority: false;
	readonly promotionEligible: false;
	readonly writesPerformed: false;
	readonly valkeyWritesPerformed: false;
	readonly runId: string;
	readonly sourceRevision: string;
	readonly workspaceRevision: string;
	readonly binarySchemaRevision: typeof NES_FSM_BINARY_SCHEMA_REVISION_V1;
	readonly endianness: 'LE';
	readonly serializedLayoutAlignmentBytes: typeof NES_FSM_BINARY_ALIGNMENT_BYTES;
	readonly descriptorByteLength: number;
	readonly candidateCount: number;
	readonly batchPrimaryLutByte: number;
	readonly batchDomainBitmask: number;
	readonly batchNesHex: string;
	readonly candidateOrdinalMapChecksum: string;
	readonly inputBufferChecksum: string;
	readonly outputBufferChecksum: string;
	readonly nativeGuards: NativeAddonGuardVerificationV1;
	readonly nativeDfaProposal: {
		matched: boolean;
		authority: string;
		rfcId: string;
		featureLabel: string;
	} | null;
	readonly csrResult: TraversalStepResult;
	readonly taskTransition: TaskTransitionReceiptV1;
	readonly nesFeatureFsmState: string;
	readonly nesFeatureDescriptor: CacheInstructionsTensorDescriptorV1;
	readonly bitfrostResidentOrdinals: readonly number[];
	readonly bitfrostAdmittedOrdinals: readonly number[];
	readonly bitfrostLeaseReleasedCount: number;
	readonly bitfrostMeaningsSummary: {
		resident: string;
		admitted: string;
	};
	readonly bufferSwap: {
		bufferSwapped: boolean;
		swapCount: number;
		previousActiveChecksum: string | null;
		activeChecksum: string;
		readbackVerified: boolean;
	};
	readonly readback: BinaryDescriptorReadbackSummaryV1;
	readonly sortedRecords: readonly SortedCandidateOutputRecordV1[];
	readonly descriptorHex: string;
	readonly blockedProductionGates: readonly string[];
}

export const FROZEN_NES_FSM_BATCH_V1: FrozenCandidateBatchV1 = Object.freeze({
	schema: 'atlas.frozen-candidate-batch.v1',
	sourceRevision: FROZEN_SOURCE_REVISION_V1,
	workspaceRevision: FROZEN_WORKSPACE_REVISION_V1,
	records: Object.freeze([
		{ candidateOrdinal: 142, kmeansClusterId: 2, somBmuId: 17,  primaryLutByte: 10, domainBitmask: 0x0202, featureLabel: 'canvas',          sourceRef: 'src/lib/server/atlas/fsm/nes-feature-fsm.ts',               tokenCount: 128 },
		{ candidateOrdinal: 108, kmeansClusterId: 1, somBmuId: 6,   primaryLutByte: 2,  domainBitmask: 0x0002, featureLabel: 'search_rag',      sourceRef: 'src/lib/server/search/qdrant-search.ts',                  tokenCount: 128 },
		{ candidateOrdinal: 115, kmeansClusterId: 2, somBmuId: 7,   primaryLutByte: 1,  domainBitmask: 0x0001, featureLabel: 'auth',            sourceRef: 'src/lib/server/lucia.ts',                                 tokenCount: 128 },
		{ candidateOrdinal: 101, kmeansClusterId: 0, somBmuId: 12,  primaryLutByte: 6,  domainBitmask: 0x0022, featureLabel: 'cases',           sourceRef: 'src/lib/server/db/client.ts',                             tokenCount: 128 },
		{ candidateOrdinal: 130, kmeansClusterId: 3, somBmuId: 42,  primaryLutByte: 9,  domainBitmask: 0x0104, featureLabel: 'ai_chat',         sourceRef: 'src/lib/server/atlas/fsm/nes-feature-token-pipeline.ts',  tokenCount: 128 },
		{ candidateOrdinal: 121, kmeansClusterId: 1, somBmuId: 6,   primaryLutByte: 10, domainBitmask: 0x0200, featureLabel: 'canvas',          sourceRef: 'src/lib/server/atlas/rendering/nes-glyph-canvas-renderer-v1.ts', tokenCount: 128 },
		{ candidateOrdinal: 104, kmeansClusterId: 0, somBmuId: 3,   primaryLutByte: 2,  domainBitmask: 0x0006, featureLabel: 'search_rag',      sourceRef: 'src/lib/server/retrieval/orchestrator.ts',                tokenCount: 128 },
		{ candidateOrdinal: 155, kmeansClusterId: 3, somBmuId: 88,  primaryLutByte: 8,  domainBitmask: 0x0080, featureLabel: 'reconstruction_sim', sourceRef: 'src/lib/gpu/nes-glyph-webgpu.ts',                      tokenCount: 128 },
		{ candidateOrdinal: 111, kmeansClusterId: 1, somBmuId: 19,  primaryLutByte: 5,  domainBitmask: 0x0010, featureLabel: 'upload_ingest',   sourceRef: 'src/lib/server/seaweed-client.ts',                        tokenCount: 128 },
		{ candidateOrdinal: 127, kmeansClusterId: 2, somBmuId: 7,   primaryLutByte: 3,  domainBitmask: 0x0024, featureLabel: 'evidence',        sourceRef: 'src/lib/server/atlas/cache/bitfrost-token-fsm-v1.ts',     tokenCount: 128 },
		{ candidateOrdinal: 136, kmeansClusterId: 3, somBmuId: 15,  primaryLutByte: 7,  domainBitmask: 0x0040, featureLabel: 'code_intel',      sourceRef: 'src/lib/server/atlas/taxonomy/task-domain-lut-reconciliation-v1.ts', tokenCount: 128 },
		{ candidateOrdinal: 102, kmeansClusterId: 0, somBmuId: 3,   primaryLutByte: 1,  domainBitmask: 0x0003, featureLabel: 'auth',            sourceRef: 'src/lib/server/atlas/orchestration/task-execution-lifecycle-fsm-v1.ts', tokenCount: 128 },
		{ candidateOrdinal: 148, kmeansClusterId: 2, somBmuId: 210, primaryLutByte: 4,  domainBitmask: 0x0008, featureLabel: 'knowledge_graph', sourceRef: 'src/lib/server/atlas/graph/csr-traversal-cursor.ts',      tokenCount: 128 },
		{ candidateOrdinal: 119, kmeansClusterId: 1, somBmuId: 14,  primaryLutByte: 6,  domainBitmask: 0x0020, featureLabel: 'cases',           sourceRef: 'src/lib/server/atlas/kanban-task-board.ts',               tokenCount: 128 },
		{ candidateOrdinal: 109, kmeansClusterId: 0, somBmuId: 12,  primaryLutByte: 2,  domainBitmask: 0x000A, featureLabel: 'wiki',            sourceRef: 'src/lib/server/features/codebase-intel/indexer/karpathy-wiki.ts', tokenCount: 128 },
		{ candidateOrdinal: 124, kmeansClusterId: 2, somBmuId: 7,   primaryLutByte: 10, domainBitmask: 0x0202, featureLabel: 'admin_ops',       sourceRef: 'src/lib/server/atlas/fsm/nes-fsm-native-runtime-v1.ts',   tokenCount: 128 },
	]),
});

export function buildFrozenCsrGraphFixtureV1(): BoundedCsrGraph {
	return {
		numNodes: 16,
		numEdges: 16,
		rowOffsets: Uint32Array.from([0, 2, 4, 5, 7, 8, 10, 11, 12, 13, 14, 15, 16, 16, 16, 16, 16]),
		colIndices: Uint32Array.from([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 0]),
		graphRevision: FROZEN_GRAPH_REVISION_V1,
		edgePolicyRevision: FROZEN_EDGE_POLICY_REVISION_V1,
	};
}

export const DEFAULT_POLICY_GRANT_V1: PolicyAuthorizationGrantV1 = Object.freeze({
	grantKind: 'EXPLICIT_POLICY_GRANT',
	actor: 'system:cpu-vertical-slice-verifier',
	taskId: 'PARENT-ATLAS-NES-FSM-NATIVE-RUNTIME-01',
	sourceRevision: FROZEN_SOURCE_REVISION_V1,
	grantedPolicyMask: 0x000f,
	requiredPolicyMask: 0x0007,
	inputsPresent: true,
	unresolvedDependencies: Object.freeze([]),
});

export function resolveAtlasNativeAddonPath(): string {
	const explicitPath = process.env.ATLAS_NATIVE_CORE_NODE_PATH;
	if (explicitPath && existsSync(explicitPath)) {
		return explicitPath;
	}
	const repoRoot = path.resolve(__dirname, '../../../../../..');
	const candidates =
		process.platform === 'win32'
			? [
					path.join(repoRoot, 'packages/atlas-native-core/build/Release/atlas_native_core.node'),
					path.join(repoRoot, 'packages/atlas-native-core/build/atlas_native_core.node'),
					path.resolve(process.cwd(), '../packages/atlas-native-core/build/Release/atlas_native_core.node'),
					path.resolve(process.cwd(), 'packages/atlas-native-core/build/Release/atlas_native_core.node'),
				]
			: [
					path.join(repoRoot, 'packages/atlas-native-core/build/atlas_native_core.node'),
					path.join(repoRoot, 'packages/atlas-native-core/build/Release/atlas_native_core.node'),
					path.resolve(process.cwd(), '../packages/atlas-native-core/build/atlas_native_core.node'),
					path.resolve(process.cwd(), 'packages/atlas-native-core/build/atlas_native_core.node'),
				];

	for (const candidate of candidates) {
		if (existsSync(candidate)) {
			return candidate;
		}
	}
	throw new Error(`NATIVE_ADDON_MISSING: tried ${candidates.join(', ')}`);
}

export function loadAtlasNativeCoreAddon(): { addonPath: string; addon: AtlasNativeCoreBindings } {
	const addonPath = resolveAtlasNativeAddonPath();
	const addon = require(addonPath) as AtlasNativeCoreBindings;
	if (typeof addon?.radixSortSomCandidateIndicesV1 !== 'function') {
		throw new Error(`NATIVE_ADDON_EXPORT_MISSING: radixSortSomCandidateIndicesV1 in ${addonPath}`);
	}
	return { addonPath, addon };
}

/**
 * Actively probes the loaded Node-API addon boundary to prove the local binary enforces
 * the 65,536-row limit, duplicate candidateOrdinal rejection, and SOM cell bounds (0..399).
 */
export function verifyNativeRadixAddonGuardsV1(
	addon: AtlasNativeCoreBindings,
	addonPath: string
): NativeAddonGuardVerificationV1 {
	let max65536RowsEnforced = false;
	try {
		addon.radixSortSomCandidateIndicesV1(
			new Uint16Array(MAX_NATIVE_RADIX_ROWS_V1 + 1),
			new Uint16Array(MAX_NATIVE_RADIX_ROWS_V1 + 1),
			new Uint32Array(MAX_NATIVE_RADIX_ROWS_V1 + 1)
		);
	} catch (err) {
		if (err instanceof Error && /SOM_RADIX_CANDIDATE_LIMIT_EXCEEDED/.test(err.message)) {
			max65536RowsEnforced = true;
		}
	}

	let duplicateOrdinalsEnforced = false;
	try {
		addon.radixSortSomCandidateIndicesV1(
			Uint16Array.from([1, 1]),
			Uint16Array.from([2, 2]),
			Uint32Array.from([8, 8])
		);
	} catch (err) {
		if (err instanceof Error && /SOM_RADIX_CANDIDATE_ORDINALS_MUST_BE_UNIQUE/.test(err.message)) {
			duplicateOrdinalsEnforced = true;
		}
	}

	let somBmuRange400Enforced = false;
	try {
		addon.radixSortSomCandidateIndicesV1(
			Uint16Array.from([1]),
			Uint16Array.from([400]),
			Uint32Array.from([0])
		);
	} catch (err) {
		if (err instanceof Error && /SOM_BMU_ID_OUT_OF_RANGE/.test(err.message)) {
			somBmuRange400Enforced = true;
		}
	}

	if (!max65536RowsEnforced || !duplicateOrdinalsEnforced || !somBmuRange400Enforced) {
		throw new Error(
			`NATIVE_ADDON_GUARD_PROBE_FAILED: max65536=${max65536RowsEnforced}, dup=${duplicateOrdinalsEnforced}, som400=${somBmuRange400Enforced}`
		);
	}

	return {
		addonLoaded: true,
		addonPath,
		max65536RowsEnforced,
		duplicateOrdinalsEnforced,
		somBmuRange400Enforced,
	};
}

export function sha256Hex(input: string | Uint8Array): string {
	return crypto.createHash('sha256').update(input).digest('hex');
}

export function computeCandidateOrdinalMapChecksumV1(
	records: readonly FrozenCandidateInputRecordV1[],
	sourceRevision: string
): string {
	const canonical = records
		.map((rec, index) => `${index}|${rec.candidateOrdinal}|${rec.sourceRef}|${sourceRevision}\n`)
		.join('');
	return sha256Hex(canonical);
}

/**
 * Serializes the raw unsorted input batch deterministically as little-endian 16-byte records
 * for input buffer checksumming (16 records = 256 bytes, a multiple of 64 bytes).
 */
export function serializeInputBatchBufferLE(records: readonly FrozenCandidateInputRecordV1[]): Uint8Array {
	const rawSize = records.length * 16;
	const alignedSize = (rawSize + 63) & ~63;
	const buf = new Uint8Array(alignedSize);
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
	for (let i = 0; i < records.length; i += 1) {
		const rec = records[i]!;
		const base = i * 16;
		view.setUint32(base + 0, rec.candidateOrdinal >>> 0, true);
		view.setUint16(base + 4, rec.kmeansClusterId & 0xffff, true);
		view.setUint16(base + 6, rec.somBmuId & 0xffff, true);
		view.setUint16(base + 8, rec.domainBitmask & 0xffff, true);
		buf[base + 10] = rec.primaryLutByte & 0xff;
		buf[base + 11] = 0;
		view.setUint16(base + 12, rec.tokenCount & 0xffff, true);
		view.setUint16(base + 14, 0, true);
	}
	return buf;
}

const PolicyGrantSchema = z
	.object({
		grantKind: z.literal('EXPLICIT_POLICY_GRANT'),
		actor: z.string().min(1),
		taskId: z.string().min(1),
		sourceRevision: z.string().min(1),
		grantedPolicyMask: z.number().int().nonnegative(),
		requiredPolicyMask: z.number().int().positive(),
		inputsPresent: z.boolean(),
		unresolvedDependencies: z.array(z.string()),
	})
	.strict();

export function assertPolicyAuthorizationGrantV1(
	grant: PolicyAuthorizationGrantV1,
	expectedSourceRevision: string,
	requireGranted: boolean
): void {
	const candidateObj = grant as unknown as Record<string, unknown>;
	if ('nesHex' in candidateObj || 'domainBitmask' in candidateObj) {
		throw new Error('NON_AUTHORIZING_FIELD_PASSED_AS_POLICY_GRANT');
	}
	const parsed = PolicyGrantSchema.safeParse(grant);
	if (!parsed.success) {
		throw new Error(`POLICY_GRANT_SCHEMA_INVALID: ${parsed.error.issues[0]?.message ?? 'unknown'}`);
	}
	if (grant.sourceRevision !== expectedSourceRevision) {
		throw new Error(`FSM_REVISION_MISMATCH: expected ${expectedSourceRevision}, got ${grant.sourceRevision}`);
	}
	const authorized = (grant.grantedPolicyMask & grant.requiredPolicyMask) === grant.requiredPolicyMask;
	if (requireGranted && !authorized) {
		throw new Error(
			`POLICY_AUTHORIZATION_DENIED: granted=0x${grant.grantedPolicyMask.toString(16)} required=0x${grant.requiredPolicyMask.toString(16)}`
		);
	}
}

export function resolveAndValidateDomainRecordsV1(
	records: readonly FrozenCandidateInputRecordV1[]
): ResolvedCandidateDomainRecordV1[] {
	if (records.length === 0) {
		throw new Error('NES_FSM_BATCH_EMPTY');
	}
	if (records.length > MAX_NES_FSM_BATCH_RECORDS_V1) {
		throw new Error(`NES_FSM_BATCH_LIMIT_EXCEEDED: ${records.length} > ${MAX_NES_FSM_BATCH_RECORDS_V1}`);
	}
	const seenOrdinals = new Set<number>();
	return records.map((rec, sourceIndex) => {
		if (!Number.isInteger(rec.candidateOrdinal) || rec.candidateOrdinal < 0 || rec.candidateOrdinal > 0xffffffff) {
			throw new RangeError(`CANDIDATE_ORDINAL_INVALID at ${sourceIndex}: ${rec.candidateOrdinal}`);
		}
		if (seenOrdinals.has(rec.candidateOrdinal)) {
			throw new Error(`SOM_RADIX_CANDIDATE_ORDINALS_MUST_BE_UNIQUE: ${rec.candidateOrdinal}`);
		}
		seenOrdinals.add(rec.candidateOrdinal);

		if (rec.domainBitmask <= 0 || (rec.domainBitmask & ~VALID_TASK_DOMAIN_MASK) !== 0) {
			throw new RangeError(`INVALID_DOMAIN_BITMASK: 0x${rec.domainBitmask.toString(16)}`);
		}
		const decodedDomainCodes = decodeTaskDomains(rec.domainBitmask);
		const translation = translateTaskLutToCanonicalPalette(rec.primaryLutByte);
		if (!decodedDomainCodes.includes(rec.primaryLutByte)) {
			throw new Error(
				`PRIMARY_LUT_NOT_IN_DOMAIN_BITMASK: lut=${rec.primaryLutByte}, mask=0x${rec.domainBitmask.toString(16)}`
			);
		}
		const nesHex = translation.canonicalPalette.nesHex;
		const nesPaletteByte = Number.parseInt(nesHex, 16) & 0xff;
		return {
			...rec,
			sourceIndex,
			translation,
			decodedDomainCodes,
			nesHex,
			nesPaletteByte,
		};
	});
}

export function serializeBinaryDescriptorV1(input: {
	sourceRevision: string;
	candidateOrdinalMapChecksum: string;
	csrCursorChecksum: string;
	primaryLutByte: number;
	nesPaletteByte: number;
	domainBitmask: number;
	policyAuthorizationMask: number;
	fromStateCode: number;
	toStateCode: number;
	csrTotalVisited: number;
	sortedRecords: readonly SortedCandidateOutputRecordV1[];
}): Uint8Array {
	const count = input.sortedRecords.length;
	const rawPayloadBytes = count * NES_FSM_BINARY_RECORD_BYTES;
	const totalBytes =
		(NES_FSM_BINARY_HEADER_BYTES + rawPayloadBytes + (NES_FSM_BINARY_ALIGNMENT_BYTES - 1)) &
		~(NES_FSM_BINARY_ALIGNMENT_BYTES - 1);

	const buffer = new Uint8Array(totalBytes);
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);

	// Header 0..23
	view.setUint32(0, NES_FSM_BINARY_MAGIC_LE, true);
	view.setUint32(4, NES_FSM_BINARY_ENDIAN_TAG_LE, true);
	view.setUint16(8, 1, true);
	view.setUint16(10, count, true);
	buffer[12] = input.primaryLutByte & 0xff;
	buffer[13] = input.nesPaletteByte & 0xff;
	view.setUint16(14, input.domainBitmask & 0xffff, true);
	view.setUint32(16, input.policyAuthorizationMask >>> 0, true);
	buffer[20] = input.fromStateCode & 0xff;
	buffer[21] = input.toStateCode & 0xff;
	// authorityFlagsByte = 0x00 (bit0 canonicalAuthority=0, bit1 promotionEligible=0, bit2 writesPerformed=0)
	buffer[22] = 0x00;
	buffer[23] = input.csrTotalVisited & 0xff;

	// Header 24..47: first 8 bytes of SHA-256 digests
	const sourceRevHash = crypto.createHash('sha256').update(input.sourceRevision).digest();
	const ordinalMapHash = Buffer.from(input.candidateOrdinalMapChecksum, 'hex');
	const csrCursorHash = Buffer.from(input.csrCursorChecksum, 'hex');
	buffer.set(sourceRevHash.subarray(0, 8), 24);
	buffer.set(ordinalMapHash.subarray(0, 8), 32);
	buffer.set(csrCursorHash.subarray(0, 8), 40);

	// Candidate records starting at byte 64
	for (let i = 0; i < count; i += 1) {
		const rec = input.sortedRecords[i]!;
		const base = NES_FSM_BINARY_HEADER_BYTES + i * NES_FSM_BINARY_RECORD_BYTES;
		view.setUint32(base + 0, rec.candidateOrdinal >>> 0, true);
		view.setUint16(base + 4, rec.kmeansClusterId & 0xffff, true);
		view.setUint16(base + 6, rec.somBmuId & 0xffff, true);
		view.setUint16(base + 8, rec.sourceIndex & 0xffff, true);
		view.setUint16(base + 10, rec.domainBitmask & 0xffff, true);
		buffer[base + 12] = rec.primaryLutByte & 0xff;
		buffer[base + 13] = rec.bitfrostStateCode & 0xff;
		view.setUint16(base + 14, rec.tokenCount & 0xffff, true);
	}

	// Header 48..63: first 16 bytes of SHA-256(payload[64 .. 64 + count*16])
	const payloadSlice = buffer.subarray(
		NES_FSM_BINARY_HEADER_BYTES,
		NES_FSM_BINARY_HEADER_BYTES + rawPayloadBytes
	);
	const payloadDigest = crypto.createHash('sha256').update(payloadSlice).digest();
	buffer.set(payloadDigest.subarray(0, 16), 48);

	return buffer;
}

/**
 * Independently reads back and verifies a binary descriptor buffer before buffer swap.
 */
export function readbackAndVerifyBinaryDescriptorV1(
	buffer: Uint8Array,
	expected: {
		sourceRevision: string;
		candidateOrdinalMapChecksum: string;
		csrCursorChecksum: string;
		sortedRecords?: readonly SortedCandidateOutputRecordV1[];
	}
): BinaryDescriptorReadbackSummaryV1 {
	if (buffer.byteLength < NES_FSM_BINARY_HEADER_BYTES || buffer.byteLength % NES_FSM_BINARY_ALIGNMENT_BYTES !== 0) {
		throw new Error(`BINARY_DESCRIPTOR_ALIGNMENT_INVALID: byteLength=${buffer.byteLength}`);
	}
	const view = new DataView(buffer.buffer, buffer.byteOffset, buffer.byteLength);
	const magicLE = view.getUint32(0, true);
	const endianTagLE = view.getUint32(4, true);
	if (endianTagLE === NES_FSM_BINARY_ENDIAN_TAG_BE || magicLE === 0x3153454e) {
		throw new Error('BINARY_DESCRIPTOR_ENDIANNESS_MISMATCH: expected little-endian (0x01020304)');
	}
	if (endianTagLE !== NES_FSM_BINARY_ENDIAN_TAG_LE || magicLE !== NES_FSM_BINARY_MAGIC_LE) {
		throw new Error(
			`BINARY_DESCRIPTOR_MAGIC_OR_ENDIAN_INVALID: magic=0x${magicLE.toString(16)} tag=0x${endianTagLE.toString(16)}`
		);
	}

	const schemaVersion = view.getUint16(8, true);
	if (schemaVersion !== 1) {
		throw new Error(`BINARY_DESCRIPTOR_SCHEMA_VERSION_UNSUPPORTED: ${schemaVersion}`);
	}
	const candidateCount = view.getUint16(10, true);
	if (candidateCount === 0 || candidateCount > MAX_NES_FSM_BATCH_RECORDS_V1) {
		throw new Error(`BINARY_DESCRIPTOR_COUNT_OUT_OF_RANGE: ${candidateCount}`);
	}
	const requiredLen = NES_FSM_BINARY_HEADER_BYTES + candidateCount * NES_FSM_BINARY_RECORD_BYTES;
	if (buffer.byteLength < requiredLen) {
		throw new Error(`BINARY_DESCRIPTOR_TRUNCATED: ${buffer.byteLength} < ${requiredLen}`);
	}

	const primaryLutByte = buffer[12]!;
	const nesPaletteByte = buffer[13]!;
	const domainBitmask = view.getUint16(14, true);
	const policyAuthorizationMask = view.getUint32(16, true);
	const fromStateCode = buffer[20]!;
	const toStateCode = buffer[21]!;
	const authorityFlagsByte = buffer[22]!;
	const csrTotalVisited = buffer[23]!;

	if (authorityFlagsByte !== 0) {
		throw new Error(`BINARY_DESCRIPTOR_NON_ZERO_AUTHORITY_FLAGS: 0x${authorityFlagsByte.toString(16)}`);
	}
	decodeTaskDomains(domainBitmask);
	translateTaskLutToCanonicalPalette(primaryLutByte);

	const expectedSourceRevPrefix = crypto.createHash('sha256').update(expected.sourceRevision).digest().subarray(0, 8);
	const expectedOrdinalPrefix = Buffer.from(expected.candidateOrdinalMapChecksum, 'hex').subarray(0, 8);
	const expectedCsrPrefix = Buffer.from(expected.csrCursorChecksum, 'hex').subarray(0, 8);

	const sourceRevisionPrefixMatch = Buffer.compare(buffer.subarray(24, 32), expectedSourceRevPrefix) === 0;
	const ordinalMapPrefixMatch = Buffer.compare(buffer.subarray(32, 40), expectedOrdinalPrefix) === 0;
	const csrCursorPrefixMatch = Buffer.compare(buffer.subarray(40, 48), expectedCsrPrefix) === 0;
	if (!sourceRevisionPrefixMatch) throw new Error('BINARY_DESCRIPTOR_STALE_SOURCE_REVISION');
	if (!ordinalMapPrefixMatch) throw new Error('BINARY_DESCRIPTOR_ORDINAL_MAP_CHECKSUM_MISMATCH');
	if (!csrCursorPrefixMatch) throw new Error('BINARY_DESCRIPTOR_CSR_CURSOR_CHECKSUM_MISMATCH');

	const payloadSlice = buffer.subarray(NES_FSM_BINARY_HEADER_BYTES, requiredLen);
	const actualPayloadDigest = crypto.createHash('sha256').update(payloadSlice).digest().subarray(0, 16);
	const payloadDigestMatch = Buffer.compare(buffer.subarray(48, 64), actualPayloadDigest) === 0;
	if (!payloadDigestMatch) {
		throw new Error('BINARY_DESCRIPTOR_PAYLOAD_CHECKSUM_MISMATCH');
	}

	const seenOrdinals = new Set<number>();
	let prevKey = -1n;
	for (let i = 0; i < candidateCount; i += 1) {
		const base = NES_FSM_BINARY_HEADER_BYTES + i * NES_FSM_BINARY_RECORD_BYTES;
		const ordinal = view.getUint32(base + 0, true);
		const cluster = view.getUint16(base + 4, true);
		const somCell = view.getUint16(base + 6, true);
		const recBitmask = view.getUint16(base + 10, true);
		const recLut = buffer[base + 12]!;

		if (seenOrdinals.has(ordinal)) {
			throw new Error(`BINARY_DESCRIPTOR_DUPLICATE_ORDINAL: ${ordinal}`);
		}
		seenOrdinals.add(ordinal);

		if (somCell >= 400) {
			throw new Error(`BINARY_DESCRIPTOR_SOM_CELL_OUT_OF_RANGE: ${somCell}`);
		}
		if (recBitmask === 0 || (recBitmask & ~VALID_TASK_DOMAIN_MASK) !== 0 || !decodeTaskDomains(recBitmask).includes(recLut)) {
			throw new Error(`BINARY_DESCRIPTOR_RECORD_MASK_INVALID at ${i}`);
		}

		const compositeKey = (BigInt(cluster) << 48n) | (BigInt(somCell) << 32n) | BigInt(ordinal);
		if (compositeKey <= prevKey) {
			throw new Error(`BINARY_DESCRIPTOR_NOT_RADIX_SORTED at ${i}`);
		}
		prevKey = compositeKey;

		if (expected.sortedRecords && expected.sortedRecords[i]?.candidateOrdinal !== ordinal) {
			throw new Error(`BINARY_DESCRIPTOR_RECORD_ORDINAL_MISMATCH at ${i}`);
		}
	}

	return {
		schema: NES_FSM_BINARY_SCHEMA_REVISION_V1,
		magicHex: `0x${magicLE.toString(16).toUpperCase()}`,
		endianness: 'LE',
		endianTagHex: `0x0${endianTagLE.toString(16)}`,
		schemaVersion,
		serializedLayoutAlignmentBytes: NES_FSM_BINARY_ALIGNMENT_BYTES,
		totalByteLength: buffer.byteLength,
		candidateCount,
		primaryLutByte,
		nesPaletteByte,
		domainBitmask,
		policyAuthorizationMask,
		fromStateCode,
		toStateCode,
		authorityFlagsByte: 0,
		canonicalAuthority: false,
		promotionEligible: false,
		writesPerformed: false,
		csrTotalVisited,
		payloadDigestMatch,
		sourceRevisionPrefixMatch,
		ordinalMapPrefixMatch,
		csrCursorPrefixMatch,
		recordCount: candidateCount,
	};
}

function throwIfAborted(signal?: AbortSignal): void {
	if (signal?.aborted) {
		throw new Error('NES_FSM_RUNTIME_CANCELLED');
	}
}

/**
 * Executes the full CPU-only, proposal-only 10-step PARENT-ATLAS-NES-FSM-NATIVE-RUNTIME-01 vertical slice.
 * Never mutates PostgreSQL, Valkey, Qdrant, or `:8090`.
 */
export function runNesFsmNativeRuntimeV1(
	options: NesFsmNativeRuntimeOptionsV1 = {}
): NesFsmNativeRuntimeReportV1 {
	throwIfAborted(options.signal);

	const batch = options.batch ?? FROZEN_NES_FSM_BATCH_V1;
	const expectedSourceRevision = options.expectedSourceRevision ?? batch.sourceRevision;
	if (batch.sourceRevision !== expectedSourceRevision) {
		throw new Error(`FSM_REVISION_MISMATCH: expected ${expectedSourceRevision}, got ${batch.sourceRevision}`);
	}
	const authorizationGrant = options.authorizationGrant ?? DEFAULT_POLICY_GRANT_V1;
	const event: NesFsmEventV1 = options.event ?? 'EVALUATE_READY';
	const runId = options.runId ?? 'nes-fsm-native-v1-frozen-run';
	const tokenBudget = options.tokenBudget ?? 1536;
	const query = options.query ?? 'canvas topology evidence reconstruction';
	const bufferSlot = options.bufferSlot ?? new DoubleBufferDescriptorSlotV1();

	// Step 2 & Step 3: Validate frozen batch <= 256, domain LUT + bitmask separation
	const resolvedRecords = resolveAndValidateDomainRecordsV1(batch.records);
	const candidateOrdinalMapChecksum = computeCandidateOrdinalMapChecksumV1(batch.records, batch.sourceRevision);
	const inputBuffer = serializeInputBatchBufferLE(batch.records);
	const inputBufferChecksum = sha256Hex(inputBuffer);

	const rule = NES_FSM_TRANSITION_TABLE_V1.find(
		(entry) => entry.fromState === 'DEPENDENCY_CHECKED' && entry.event === event
	);
	if (!rule) {
		throw new Error(`NES_FSM_UNKNOWN_EVENT: ${event}`);
	}
	assertPolicyAuthorizationGrantV1(authorizationGrant, expectedSourceRevision, rule.requiresPolicyGrant);

	// Step 4: Native Node-API radixSortSomCandidateIndicesV1 + active guard verification
	const loaded = options.addonOverride
		? { addonPath: 'override', addon: options.addonOverride }
		: loadAtlasNativeCoreAddon();
	const nativeGuards = verifyNativeRadixAddonGuardsV1(loaded.addon, loaded.addonPath);

	const clusters = Uint16Array.from(resolvedRecords, (r) => r.kmeansClusterId);
	const somCells = Uint16Array.from(resolvedRecords, (r) => r.somBmuId);
	const ordinals = Uint32Array.from(resolvedRecords, (r) => r.candidateOrdinal);
	const sortedSourceIndices = loaded.addon.radixSortSomCandidateIndicesV1(clusters, somCells, ordinals);

	if (!types.isUint32Array(sortedSourceIndices) || sortedSourceIndices.length !== resolvedRecords.length) {
		throw new Error('SOM_RADIX_NATIVE_RESULT_SHAPE_INVALID');
	}

	const nativeDfaProposal = loaded.addon.detectRfcOrLanguage
		? (() => {
				const d = loaded.addon.detectRfcOrLanguage!(`${query} detect turbovec som_bmu pgvector`);
				if (d.authority !== 'PROPOSAL_ONLY') {
					throw new Error(`NATIVE_DFA_AUTHORITY_ESCALATION_FORBIDDEN: ${d.authority}`);
				}
				return {
					matched: d.matched,
					authority: d.authority,
					rfcId: d.rfcId,
					featureLabel: d.featureLabel,
				};
			})()
		: null;

	throwIfAborted(options.signal);

	// Step 5: Bounded CSR traversal seeded from top sorted candidate indices
	const csrGraph = buildFrozenCsrGraphFixtureV1();
	const csrSeeds = [
		sortedSourceIndices[0]! % csrGraph.numNodes,
		(sortedSourceIndices[1] ?? sortedSourceIndices[0]!) % csrGraph.numNodes,
	];
	const csrResult = traverseCsrWithCursor(
		csrGraph,
		csrSeeds,
		{
			maxDepth: 2,
			maxNodesPerStep: 16,
			edgePolicyRevision: csrGraph.edgePolicyRevision,
		},
		options.csrCursor
	);

	throwIfAborted(options.signal);

	// Step 6: Execute validated FSM transitions (TaskLifecycleFSM + NesFeatureFsm + BitFrostTokenFsm)
	const leadRecord = resolvedRecords[sortedSourceIndices[0]!]!;
	const policyAuthorized =
		(authorizationGrant.grantedPolicyMask & authorizationGrant.requiredPolicyMask) ===
		authorizationGrant.requiredPolicyMask;
	const targetLifecycleState: TaskLifecycleStateV1 =
		rule.toState === 'READY' && policyAuthorized && authorizationGrant.inputsPresent && authorizationGrant.unresolvedDependencies.length === 0
			? 'READY'
			: 'BLOCKED';

	const taskTransition = transitionTaskLifecycleV1({
		taskId: authorizationGrant.taskId,
		runId,
		actor: authorizationGrant.actor,
		sourceRevision: batch.sourceRevision,
		fromState: rule.fromState,
		toState: targetLifecycleState,
		primaryLutByte: leadRecord.primaryLutByte,
		domainBitmask: leadRecord.domainBitmask,
		unresolvedDependencies: [...authorizationGrant.unresolvedDependencies],
		authorizationGranted: policyAuthorized,
		inputsPresent: authorizationGrant.inputsPresent,
	});

	const nesFeatureFsm = new NesFeatureFsm();
	nesFeatureFsm.stepQuery(query);
	nesFeatureFsm.stepClassify(leadRecord.featureLabel);
	nesFeatureFsm.stepLowRankUnavailable();
	nesFeatureFsm.stepProposeAcePacket();
	const nesFeatureDescriptor = nesFeatureFsm.buildCacheDescriptor(runId);

	// BitFrost Token FSM lifecycle (UNLOADED -> ADMITTED -> RESIDENT under tokenBudget)
	const bitfrost = new BitFrostTokenFsmManagerV1({
		tokenBudget: 8192,
		maxSlots: MAX_NES_FSM_BATCH_RECORDS_V1,
	});
	const orderedRecordsInRadixOrder = Array.from(sortedSourceIndices, (srcIdx) => resolvedRecords[srcIdx]!);
	const bundleCandidates: FanoutEvidenceCandidateV1[] = [];
	for (const rec of orderedRecordsInRadixOrder) {
		const packetKey = `ace:packet:${rec.featureLabel}:${rec.candidateOrdinal}`;
		bitfrost.registerUnloaded({
			candidateOrdinal: rec.candidateOrdinal,
			packetKey,
			sourceRef: rec.sourceRef,
			sourceRevision: batch.sourceRevision,
			tokenCount: rec.tokenCount,
		});
		bitfrost.admitCandidate({
			candidateOrdinal: rec.candidateOrdinal,
			sourceRevision: batch.sourceRevision,
			expectedRevision: batch.sourceRevision,
		});
		bundleCandidates.push({
			candidateOrdinal: rec.candidateOrdinal,
			packetKey,
			sourceRef: rec.sourceRef,
			sourceRevision: batch.sourceRevision,
			evidence: [
				{
					evidenceId: `ev:${rec.candidateOrdinal}`,
					kind: 'DOMAIN_HINT',
					sourceRef: rec.sourceRef,
					sourceRevision: batch.sourceRevision,
					extractorRevision: 'nes-fsm-native-v1',
					text: `ord=${rec.candidateOrdinal} lut=${rec.primaryLutByte}`,
					startByte: null,
					endByte: null,
					confidence: null,
				},
			],
		});
	}

	const summaryChecksum = `sha256:${sha256Hex(candidateOrdinalMapChecksum)}`;
	const bundle: FanoutEvidenceBundleV1 = {
		schema: 'atlas.fanout-evidence-bundle.v1',
		workspaceRevision: batch.workspaceRevision,
		candidateSnapshotRevision: batch.sourceRevision,
		ordinalMapChecksum: `sha256:${candidateOrdinalMapChecksum}`,
		representationRevisions: { 'nes-lut-v1': '1' },
		edgePolicyRevision: csrGraph.edgePolicyRevision,
		maxHopDepth: 2,
		candidates: bundleCandidates,
		summary: {
			tokenizerRevision: 'cpu-token-estimate-v1',
			tokenBudget,
			text: `batch=${orderedRecordsInRadixOrder.length}`,
			evidenceOrder: bundleCandidates.map((c) => `ev:${c.candidateOrdinal}`),
			checksum: summaryChecksum,
		},
		canonicalAuthority: false,
		bundleChecksum: `sha256:${sha256Hex(JSON.stringify(bundleCandidates))}`,
	};

	const compiledManifest = compileFsmContextManifestV1({
		fsm: bitfrost,
		bundle,
		tokenBudget,
		requestId: runId,
		snapshotId: batch.sourceRevision,
		query,
		producerRevision: 'nes-fsm-native-runtime-v1',
		beforeCommit: () => {
			throwIfAborted(options.signal);
		},
	});
	const releasedLeaseCount = bitfrost.releaseRequest(runId);

	const residentSet = new Set(compiledManifest.residentOrdinals);
	const sortedRecords: SortedCandidateOutputRecordV1[] = orderedRecordsInRadixOrder.map((rec, sortedRank) => {
		const isResident = residentSet.has(rec.candidateOrdinal);
		return {
			...rec,
			sortedRank,
			bitfrostState: isResident ? 'RESIDENT' : 'ADMITTED',
			bitfrostStateCode: isResident ? 2 : 1,
		};
	});

	// Step 7 & Step 8: Build compact binary descriptor in scratch buffer, validate + readback, then swap
	const scratchBuffer = serializeBinaryDescriptorV1({
		sourceRevision: batch.sourceRevision,
		candidateOrdinalMapChecksum,
		csrCursorChecksum: csrResult.cursor.discoveryPrefixChecksum,
		primaryLutByte: leadRecord.primaryLutByte,
		nesPaletteByte: leadRecord.nesPaletteByte,
		domainBitmask: leadRecord.domainBitmask,
		policyAuthorizationMask: authorizationGrant.grantedPolicyMask,
		fromStateCode: TASK_LIFECYCLE_STATE_CODES_V1[rule.fromState],
		toStateCode: TASK_LIFECYCLE_STATE_CODES_V1[targetLifecycleState],
		csrTotalVisited: csrResult.totalVisited,
		sortedRecords,
	});

	throwIfAborted(options.signal);

	const readback = readbackAndVerifyBinaryDescriptorV1(scratchBuffer, {
		sourceRevision: batch.sourceRevision,
		candidateOrdinalMapChecksum,
		csrCursorChecksum: csrResult.cursor.discoveryPrefixChecksum,
		sortedRecords,
	});
	const outputBufferChecksum = sha256Hex(scratchBuffer);
	const swapOutcome = bufferSlot.commitValidatedScratch(
		scratchBuffer,
		outputBufferChecksum,
		batch.sourceRevision
	);

	return {
		schema: 'atlas.nes-fsm-native-runtime-report.v1',
		canonicalAuthority: false,
		promotionEligible: false,
		writesPerformed: false,
		valkeyWritesPerformed: false,
		runId,
		sourceRevision: batch.sourceRevision,
		workspaceRevision: batch.workspaceRevision,
		binarySchemaRevision: NES_FSM_BINARY_SCHEMA_REVISION_V1,
		endianness: 'LE',
		serializedLayoutAlignmentBytes: NES_FSM_BINARY_ALIGNMENT_BYTES,
		descriptorByteLength: scratchBuffer.byteLength,
		candidateCount: sortedRecords.length,
		batchPrimaryLutByte: leadRecord.primaryLutByte,
		batchDomainBitmask: leadRecord.domainBitmask,
		batchNesHex: leadRecord.nesHex,
		candidateOrdinalMapChecksum,
		inputBufferChecksum,
		outputBufferChecksum,
		nativeGuards,
		nativeDfaProposal,
		csrResult,
		taskTransition,
		nesFeatureFsmState: nesFeatureFsm.getState(),
		nesFeatureDescriptor,
		bitfrostResidentOrdinals: compiledManifest.residentOrdinals,
		bitfrostAdmittedOrdinals: compiledManifest.unselectedOrdinals,
		bitfrostLeaseReleasedCount: releasedLeaseCount,
		bitfrostMeaningsSummary: {
			resident: BITFROST_STATE_MEANINGS_V1.RESIDENT.candidateMeaning,
			admitted: BITFROST_STATE_MEANINGS_V1.ADMITTED.candidateMeaning,
		},
		bufferSwap: {
			bufferSwapped: true,
			swapCount: swapOutcome.swapCount,
			previousActiveChecksum: swapOutcome.previousActiveChecksum,
			activeChecksum: outputBufferChecksum,
			readbackVerified: readback.payloadDigestMatch && readback.ordinalMapPrefixMatch,
		},
		readback,
		sortedRecords,
		descriptorHex: Buffer.from(scratchBuffer).toString('hex'),
		blockedProductionGates: [
			'CANONICAL_CANDIDATE_IDENTITY: Requires PG18 codebase_chunk_index live ordinal binding (proposal-only fixture used here)',
			'VALKEY_PUBLICATION: Shared Valkey keys disabled (valkeyWritesPerformed=false)',
			'ACP_MCP_TOOL_DISPATCH: No registered mutation action admitted without human/policy promotion receipt',
			'LIVE_8098_CUVS_GPU_PARITY: CPU-only slice; WSL2 RAPIDS cuVS/CAGRA admission remains separate gate',
		],
	};
}
