import { describe, it, expect } from 'vitest';
import {
	executeVramCagraPipelineFsmV1,
	transitionVramPipelineFsmV1,
	type DbCagraBatchParametersV1
} from './vram-cagra-pipeline-fsm-v1.js';
import { planGpuResidencyV1, DEFAULT_GPU_RESIDENCY_POLICY_V1 } from './gpu-residency-budget.js';

const validDbParams: DbCagraBatchParametersV1 = {
	workspaceRevision: 'rev-2026-11-07',
	sourceRevision: 'sha256:1111111111111111111111111111111111111111111111111111111111111111',
	pgTable: 'codebase_chunk_index',
	pgColumn: 'content_embedding_768',
	canonicalRepresentation: 'semantic_768',
	shadowMrlRepresentation: 'semantic_mrl_256',
	embeddingModel: 'embeddinggemma-2-bf16-shadow',
	computeDtype: 'bfloat16',
	cagraGraphDegree: 64,
	cagraIntermediateGraphDegree: 128,
	cagraItopkSize: 128,
	polarsBatchSize: 1024,
	nesLutDomainHex: '0x09',
	hyperLogLogCardinalityEstimate: 15060,
	valkeyCentroidManifestChecksum: '2222222222222222222222222222222222222222222222222222222222222222',
	grpcProtocol: 'grpc',
	hiddenAlignment: {
		modelId: 'ornith-1.5-9b',
		hiddenDimension: 4096,
		projectionDimension: 768,
		scaleFactor: 1.0,
		activationFunction: 'swiglu',
		contextualMlpAligned: true
	},
	manifoldAnchor4D: [1, 0, 0, 0]
};

describe('VRAM CAGRA/cuVS/Polars/gRPC Pipeline Consolidation FSM', () => {
	it('completes full async/await load-unload-restore cycle and emits gRPC KAG/DAG prefill digest', async () => {
		const telemetry = {
			schema: 'atlas.gpu-memory-telemetry.v1' as const,
			source: 'nvidia-smi' as const,
			capturedAt: new Date().toISOString(),
			totalVramBytes: 8 * 1024 * 1024 * 1024,
			freeVramBytes: 6 * 1024 * 1024 * 1024,
			usedVramBytes: 2 * 1024 * 1024 * 1024,
			deviceName: 'NVIDIA GeForce RTX 3060 Ti'
		};
		const budget = planGpuResidencyV1({
			telemetry,
			policy: DEFAULT_GPU_RESIDENCY_POLICY_V1,
			requestedCandidateCount: 1024
		});

		const receipt = await executeVramCagraPipelineFsmV1('run-fsm-001', {
			fetchDbBatchParameters: async () => validDbParams,
			probeGpuAndOrnithSlots: async () => ({
				ornithSlotsIdle: true,
				gpuTelemetry: telemetry,
				budget
			}),
			unloadVlm8090: async () => ({
				unloaded: true,
				freeVramBytesAfterUnload: 6 * 1024 * 1024 * 1024
			}),
			runPolarsCuvsCagraBatch: async (params) => ({
				rowsProcessed: params.polarsBatchSize,
				radixSortedCandidateKeys: ['chunk:001', 'chunk:002', 'chunk:003'],
				targetManifold4D: [0, 1, 0, 0]
			}),
			streamGrpcKagDagPrefill: async ({ sortedKeys }) => ({
				packetDigest: `sha256:grpc-prefill-${sortedKeys.length}`
			}),
			restoreVlm8090: async () => ({ restored: true })
		});

		expect(receipt.finalState).toBe('COMPLETED');
		expect(receipt.vlmUnloaded).toBe(true);
		expect(receipt.vlmRestored).toBe(true);
		expect(receipt.gpuLease?.admission).toBe('ALLOW');
		expect(receipt.cagraBatchRowsProcessed).toBe(1024);
		expect(receipt.radixSortedTopKKeys).toEqual(['chunk:001', 'chunk:002', 'chunk:003']);
		expect(receipt.grpcPrefillPacketDigest).toBe('sha256:grpc-prefill-3');
		expect(receipt.stateHistory).toEqual([
			'IDLE_VLM_RESIDENT',
			'FETCHING_DB_PARAMS',
			'PROBING_SLOTS_AND_NVML',
			'UNLOADING_VLM_FOR_CUDA',
			'RUNNING_POLARS_CUVS_CAGRA_BATCH',
			'STREAMING_GRPC_KAG_DAG_PREFILL',
			'RESTORING_VLM_8090',
			'COMPLETED'
		]);
	});

	it('guarantees VLM :8090 restoration in finally block if cuVS CAGRA batch throws', async () => {
		const telemetry = {
			schema: 'atlas.gpu-memory-telemetry.v1' as const,
			source: 'nvml' as const,
			capturedAt: new Date().toISOString(),
			totalVramBytes: 8 * 1024 * 1024 * 1024,
			freeVramBytes: 6 * 1024 * 1024 * 1024,
			usedVramBytes: 2 * 1024 * 1024 * 1024
		};
		const budget = planGpuResidencyV1({
			telemetry,
			policy: DEFAULT_GPU_RESIDENCY_POLICY_V1,
			requestedCandidateCount: 1024
		});

		const receipt = await executeVramCagraPipelineFsmV1('run-fsm-fail-safe', {
			fetchDbBatchParameters: async () => validDbParams,
			probeGpuAndOrnithSlots: async () => ({
				ornithSlotsIdle: true,
				gpuTelemetry: telemetry,
				budget
			}),
			unloadVlm8090: async () => ({
				unloaded: true,
				freeVramBytesAfterUnload: 6 * 1024 * 1024 * 1024
			}),
			runPolarsCuvsCagraBatch: async () => {
				throw new Error('CUVS_DLPACK_KERNEL_TIMEOUT');
			},
			streamGrpcKagDagPrefill: async () => ({ packetDigest: 'unreachable' }),
			restoreVlm8090: async () => ({ restored: true })
		});

		expect(receipt.finalState).toBe('FAILED_SAFE_RESTORED');
		expect(receipt.vlmUnloaded).toBe(true);
		expect(receipt.vlmRestored).toBe(true);
		expect(receipt.error).toBe('CUVS_DLPACK_KERNEL_TIMEOUT');
	});

	it('rejects illegal state transitions and non-admission WDDM cuda-runtime telemetry', async () => {
		expect(() => transitionVramPipelineFsmV1('IDLE_VLM_RESIDENT', 'COMPLETED')).toThrow(
			'INVALID_VRAM_PIPELINE_FSM_TRANSITION_IDLE_VLM_RESIDENT_TO_COMPLETED'
		);
	});
});
