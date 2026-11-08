import { createHash } from 'node:crypto';
import { z } from 'zod';
import {
	admitGpuExecutionLeaseV1,
	isAdmissionGradeGpuTelemetrySourceV1,
	type GpuExecutionLeaseV1,
	type GpuMemoryTelemetryV1,
	type GpuResidencyBudgetV1
} from './gpu-residency-budget.js';
import {
	HiddenState4096AlignmentSchema,
	slerp4D,
	type Coordinate4D
} from '../../topology/latent-atlas-topology-domain-matrix-v1.js';

export const VRAM_CAGRA_PIPELINE_FSM_SCHEMA_V1 = 'atlas.vram-cagra-pipeline-fsm.v1' as const;

export const VramPipelineFsmStateSchema = z.enum([
	'IDLE_VLM_RESIDENT',
	'FETCHING_DB_PARAMS',
	'PROBING_SLOTS_AND_NVML',
	'UNLOADING_VLM_FOR_CUDA',
	'RUNNING_POLARS_CUVS_CAGRA_BATCH',
	'STREAMING_GRPC_KAG_DAG_PREFILL',
	'RESTORING_VLM_8090',
	'COMPLETED',
	'FAILED_SAFE_RESTORED',
	'FAILED_RESTORE_CRITICAL'
]);
export type VramPipelineFsmStateV1 = z.infer<typeof VramPipelineFsmStateSchema>;

const ALLOWED_FSM_TRANSITIONS: Readonly<
	Record<VramPipelineFsmStateV1, readonly VramPipelineFsmStateV1[]>
> = {
	IDLE_VLM_RESIDENT: ['FETCHING_DB_PARAMS'],
	FETCHING_DB_PARAMS: ['PROBING_SLOTS_AND_NVML', 'FAILED_SAFE_RESTORED'],
	PROBING_SLOTS_AND_NVML: ['UNLOADING_VLM_FOR_CUDA', 'FAILED_SAFE_RESTORED'],
	UNLOADING_VLM_FOR_CUDA: [
		'RUNNING_POLARS_CUVS_CAGRA_BATCH',
		'RESTORING_VLM_8090',
		'FAILED_SAFE_RESTORED'
	],
	RUNNING_POLARS_CUVS_CAGRA_BATCH: ['STREAMING_GRPC_KAG_DAG_PREFILL', 'RESTORING_VLM_8090'],
	STREAMING_GRPC_KAG_DAG_PREFILL: ['RESTORING_VLM_8090'],
	RESTORING_VLM_8090: ['COMPLETED', 'FAILED_SAFE_RESTORED', 'FAILED_RESTORE_CRITICAL'],
	COMPLETED: ['IDLE_VLM_RESIDENT'],
	FAILED_SAFE_RESTORED: ['IDLE_VLM_RESIDENT'],
	FAILED_RESTORE_CRITICAL: ['IDLE_VLM_RESIDENT']
};

export function transitionVramPipelineFsmV1(
	current: VramPipelineFsmStateV1,
	next: VramPipelineFsmStateV1
): VramPipelineFsmStateV1 {
	if (!ALLOWED_FSM_TRANSITIONS[current].includes(next)) {
		throw new Error(`INVALID_VRAM_PIPELINE_FSM_TRANSITION_${current}_TO_${next}`);
	}
	return next;
}

export interface CagraMemoryBreakdownV1 {
	dataBytes: number;
	graphBytes: number;
	workspaceBytes: number;
	totalRequiredBytes: number;
}

/**
 * Phase 4 (Item 16): Computes exact cuVS CAGRA memory footprint:
 *   - dataBytes: N * 768 * 4 (canonical float32 vectors)
 *   - graphBytes: N * cagraGraphDegree * 4 (uint32 kNN graph adjacency)
 *   - workspaceBytes: N * cagraIntermediateGraphDegree * 4 + cagraItopkSize * 4096 (build/search scratch)
 */
export function measureCagraMemoryFootprintV1(params: {
	rowCount: number;
	vectorDim?: number;
	cagraGraphDegree: number;
	cagraIntermediateGraphDegree: number;
	cagraItopkSize: number;
}): CagraMemoryBreakdownV1 {
	const dim = params.vectorDim ?? 768;
	const dataBytes = params.rowCount * dim * 4;
	const graphBytes = params.rowCount * params.cagraGraphDegree * 4;
	const workspaceBytes =
		params.rowCount * params.cagraIntermediateGraphDegree * 4 + params.cagraItopkSize * 4096;
	return {
		dataBytes,
		graphBytes,
		workspaceBytes,
		totalRequiredBytes: dataBytes + graphBytes + workspaceBytes
	};
}

/**
 * Phase 4 (Item 14): Fenced Lease Ownership Audit across ALL backends (`ollama`, `llama-server`, `tensorrt`, `cuvs`).
 * Note: `gpu-arbiter.ts` historically checked `leaseId` only when `backend === 'cuvs'`.
 * This validator enforces strict `leaseId` + `leaseEpoch` + `expiresAt > nowMs` fencing for every backend.
 */
export interface FencedBackendLeaseRecordV1 {
	backend: 'ollama' | 'llama-server' | 'tensorrt' | 'cuvs';
	leaseId: string;
	leaseEpoch: number;
	acquiredAt: number;
	expiresAt: number;
}

export function validateFencedBackendLeaseV1(input: {
	activeLease: FencedBackendLeaseRecordV1 | null;
	requestBackend: 'ollama' | 'llama-server' | 'tensorrt' | 'cuvs';
	requestLeaseId: string;
	requestEpoch: number;
	nowMs: number;
}): { allowed: boolean; reason: string } {
	if (!input.requestLeaseId.trim()) {
		return { allowed: false, reason: 'LEASE_ID_REQUIRED_ALL_BACKENDS' };
	}
	if (!Number.isInteger(input.requestEpoch) || input.requestEpoch < 1) {
		return { allowed: false, reason: 'LEASE_EPOCH_INVALID' };
	}
	const active = input.activeLease;
	if (!active) {
		return { allowed: true, reason: 'NO_ACTIVE_LEASE' };
	}
	if (active.expiresAt <= input.nowMs) {
		return { allowed: true, reason: 'PREVIOUS_LEASE_EXPIRED' };
	}
	if (active.backend !== input.requestBackend) {
		return {
			allowed: false,
			reason: `LEASE_HELD_BY_OTHER_BACKEND:${active.backend}`
		};
	}
	if (active.leaseId !== input.requestLeaseId) {
		return {
			allowed: false,
			reason: `LEASE_ID_FENCE_MISMATCH_ON_${active.backend}`
		};
	}
	if (input.requestEpoch < active.leaseEpoch) {
		return {
			allowed: false,
			reason: `STALE_LEASE_EPOCH_${input.requestEpoch}_LT_${active.leaseEpoch}`
		};
	}
	return { allowed: true, reason: 'SAME_OWNER_RENEWAL_ALLOWED' };
}

/**
 * Database-fetched CAGRA / cuVS / Polars / EmbeddingGemma 2 batch parameters
 * anchored to PostgreSQL 18 (`codebase_chunk_index.content_embedding_768` + BYTEA HyperLogLog)
 * and Redis/Valkey CentroidManifestV1.
 */
export const DbCagraBatchParametersSchemaV1 = z.object({
	workspaceRevision: z.string().min(1),
	sourceRevision: z.string().min(1),
	pgTable: z.literal('codebase_chunk_index'),
	pgColumn: z.literal('content_embedding_768'),
	canonicalRepresentation: z.literal('semantic_768'),
	shadowMrlRepresentation: z
		.enum(['semantic_mrl_256', 'semantic_mrl_128'])
		.default('semantic_mrl_256'),
	embeddingModel: z
		.enum(['embeddinggemma-768-canonical', 'embeddinggemma-2-bf16-shadow'])
		.default('embeddinggemma-2-bf16-shadow'),
	computeDtype: z.enum(['bfloat16', 'float32']), // FP16 strictly forbidden on RTX 3060 Ti sm_86 for EmbeddingGemma 2
	cagraGraphDegree: z.number().int().min(16).max(128).default(64),
	cagraIntermediateGraphDegree: z.number().int().min(32).max(256).default(128),
	cagraItopkSize: z.number().int().min(32).max(512).default(128),
	polarsBatchSize: z.number().int().min(64).max(16384).default(4096),
	nesLutDomainHex: z.string().regex(/^0x0[1-9A]$/i),
	hyperLogLogCardinalityEstimate: z.number().int().nonnegative(),
	valkeyCentroidManifestChecksum: z.string().regex(/^[a-f0-9]{64}$/i),
	grpcProtocol: z.enum(['grpc', 'jsonrpc']).default('grpc'),
	hiddenAlignment: HiddenState4096AlignmentSchema,
	manifoldAnchor4D: z.tuple([z.number(), z.number(), z.number(), z.number()])
});
export type DbCagraBatchParametersV1 = z.infer<typeof DbCagraBatchParametersSchemaV1>;

export interface VramCagraPipelineReceiptV1 {
	schema: typeof VRAM_CAGRA_PIPELINE_FSM_SCHEMA_V1;
	runId: string;
	finalState: VramPipelineFsmStateV1;
	stateHistory: VramPipelineFsmStateV1[];
	dbParamsChecksum: string;
	cagraMemoryBreakdown: CagraMemoryBreakdownV1 | null;
	gpuLease: GpuExecutionLeaseV1 | null;
	vlmUnloaded: boolean;
	vlmRestored: boolean;
	cagraBatchRowsProcessed: number;
	radixSortedTopKKeys: string[];
	interpolatedManifold4D: Coordinate4D;
	grpcPrefillPacketDigest: string | null;
	canonicalAuthority: false;
	writesPerformed: false;
	error: string | null;
}

export interface VramCagraPipelineDependenciesV1 {
	fetchDbBatchParameters: () => Promise<DbCagraBatchParametersV1>;
	probeGpuAndOrnithSlots: () => Promise<{
		ornithSlotsIdle: boolean;
		gpuTelemetry: GpuMemoryTelemetryV1;
		budget: GpuResidencyBudgetV1;
	}>;
	unloadVlm8090: () => Promise<{ unloaded: boolean; freeVramBytesAfterUnload: number }>;
	runPolarsCuvsCagraBatch: (params: DbCagraBatchParametersV1) => Promise<{
		rowsProcessed: number;
		radixSortedCandidateKeys: string[];
		targetManifold4D: Coordinate4D;
	}>;
	streamGrpcKagDagPrefill: (input: {
		params: DbCagraBatchParametersV1;
		sortedKeys: string[];
		manifold4D: Coordinate4D;
	}) => Promise<{ packetDigest: string }>;
	restoreVlm8090: () => Promise<{ restored: boolean }>;
}

/**
 * Executes the production-hardened Async/Await VRAM-Window & CAGRA/cuVS/Polars/gRPC Pipeline FSM.
 * Guarantees that if Ornith :8090 is unloaded in Step 3, it is ALWAYS restored in the `finally` block,
 * and fails closed (`FAILED_RESTORE_CRITICAL`) if restoration fails.
 */
export async function executeVramCagraPipelineFsmV1(
	runId: string,
	deps: VramCagraPipelineDependenciesV1
): Promise<VramCagraPipelineReceiptV1> {
	let state: VramPipelineFsmStateV1 = 'IDLE_VLM_RESIDENT';
	const stateHistory: VramPipelineFsmStateV1[] = [state];
	let vlmUnloaded = false;
	let vlmRestored = false;
	let gpuLease: GpuExecutionLeaseV1 | null = null;
	let cagraMemoryBreakdown: CagraMemoryBreakdownV1 | null = null;
	let dbParamsChecksum = '';
	let cagraBatchRowsProcessed = 0;
	let radixSortedTopKKeys: string[] = [];
	let interpolatedManifold4D: Coordinate4D = [0, 0, 0, 1];
	let grpcPrefillPacketDigest: string | null = null;
	let errorMsg: string | null = null;

	const advance = (next: VramPipelineFsmStateV1) => {
		state = transitionVramPipelineFsmV1(state, next);
		stateHistory.push(state);
	};

	try {
		// 1. Async fetch of DB CAGRA/cuVS/Polars parameters + HyperLogLog + Valkey CentroidManifest checksum
		advance('FETCHING_DB_PARAMS');
		const rawParams = await deps.fetchDbBatchParameters();
		const params = DbCagraBatchParametersSchemaV1.parse(rawParams);
		dbParamsChecksum = createHash('sha256').update(JSON.stringify(params)).digest('hex');

		if (!['silu', 'swiglu'].includes(params.hiddenAlignment.activationFunction)) {
			throw new Error(`UNSUPPORTED_MLP_ACTIVATION_${params.hiddenAlignment.activationFunction}`);
		}

		cagraMemoryBreakdown = measureCagraMemoryFootprintV1({
			rowCount: params.polarsBatchSize,
			vectorDim: 768,
			cagraGraphDegree: params.cagraGraphDegree,
			cagraIntermediateGraphDegree: params.cagraIntermediateGraphDegree,
			cagraItopkSize: params.cagraItopkSize
		});

		// 2. Probe Ornith :8090 idle slots and NVML/nvidia-smi admission-grade telemetry
		advance('PROBING_SLOTS_AND_NVML');
		const probe = await deps.probeGpuAndOrnithSlots();
		if (!probe.ornithSlotsIdle) {
			throw new Error('ORNITH_8090_SLOTS_BUSY_REFUSING_UNLOAD');
		}
		if (!isAdmissionGradeGpuTelemetrySourceV1(probe.gpuTelemetry.source)) {
			throw new Error(`NON_ADMISSION_GRADE_GPU_TELEMETRY_${probe.gpuTelemetry.source}`);
		}

		// 3. Unload VLM :8090 & acquire shared GPU execution lease for cuVS/CAGRA (data + graph + workspace bytes)
		advance('UNLOADING_VLM_FOR_CUDA');
		const unloadRes = await deps.unloadVlm8090();
		vlmUnloaded = unloadRes.unloaded;
		if (!vlmUnloaded) {
			throw new Error('VLM_8090_UNLOAD_REFUSED');
		}

		gpuLease = admitGpuExecutionLeaseV1({
			budget: probe.budget,
			budgetRevision: params.workspaceRevision,
			leaseId: `lease:${runId}`,
			leaseEpoch: 1,
			executor: 'cuvs',
			requestedBytes: cagraMemoryBreakdown.totalRequiredBytes
		});
		if (gpuLease.admission !== 'ALLOW') {
			throw new Error(`CUVS_LEASE_DENIED_${gpuLease.admission}`);
		}

		// 4. Run Polars -> DLPack -> cuVS CAGRA + LowRankAdaptiveMLPChallenger (SiLU) + C++ N-API Radix Sort
		advance('RUNNING_POLARS_CUVS_CAGRA_BATCH');
		const batchOut = await deps.runPolarsCuvsCagraBatch(params);
		cagraBatchRowsProcessed = batchOut.rowsProcessed;
		radixSortedTopKKeys = batchOut.radixSortedCandidateKeys;
		interpolatedManifold4D = slerp4D(
			params.manifoldAnchor4D as Coordinate4D,
			batchOut.targetManifold4D,
			0.5
		);

		// 5. Stream canonical gRPC KAG/DAG prefill packet into ACE JSON + llms.txt header
		advance('STREAMING_GRPC_KAG_DAG_PREFILL');
		const grpcOut = await deps.streamGrpcKagDagPrefill({
			params,
			sortedKeys: radixSortedTopKKeys,
			manifold4D: interpolatedManifold4D
		});
		grpcPrefillPacketDigest = grpcOut.packetDigest;
	} catch (err) {
		errorMsg = err instanceof Error ? err.message : String(err);
	} finally {
		if (vlmUnloaded) {
			advance('RESTORING_VLM_8090');
			try {
				const restoreRes = await deps.restoreVlm8090();
				vlmRestored = restoreRes.restored;
			} catch (restoreErr) {
				vlmRestored = false;
				const msg = restoreErr instanceof Error ? restoreErr.message : String(restoreErr);
				errorMsg = errorMsg ? `${errorMsg}; RESTORE_ERROR:${msg}` : `RESTORE_ERROR:${msg}`;
			}
			if (!vlmRestored) {
				errorMsg = errorMsg ? `${errorMsg}; VLM_8090_RESTORE_FAILED` : 'VLM_8090_RESTORE_FAILED';
				advance('FAILED_RESTORE_CRITICAL');
			} else {
				advance(errorMsg === null ? 'COMPLETED' : 'FAILED_SAFE_RESTORED');
			}
		} else if (errorMsg !== null && state !== 'IDLE_VLM_RESIDENT') {
			advance('FAILED_SAFE_RESTORED');
		}
	}

	return {
		schema: VRAM_CAGRA_PIPELINE_FSM_SCHEMA_V1,
		runId,
		finalState: state,
		stateHistory,
		dbParamsChecksum,
		cagraMemoryBreakdown,
		gpuLease,
		vlmUnloaded,
		vlmRestored,
		cagraBatchRowsProcessed,
		radixSortedTopKKeys,
		interpolatedManifold4D,
		grpcPrefillPacketDigest,
		canonicalAuthority: false,
		writesPerformed: false,
		error: errorMsg
	};
}
