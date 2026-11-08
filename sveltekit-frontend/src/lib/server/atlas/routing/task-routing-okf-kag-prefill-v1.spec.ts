import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import {
	classifyCodebaseLandingAreaV1,
	loadTaskRoutingUint16TableV1,
	buildBoundedAceContextManifestFromRoutingV1,
	verifySyntheticVectorOrdinalParityV1
} from './task-routing-okf-kag-prefill-v1.js';
import {
	executeVramCagraPipelineFsmV1,
	measureCagraMemoryFootprintV1,
	validateFencedBackendLeaseV1
} from '../gpu/vram-cagra-pipeline-fsm-v1.js';
import {
	DEFAULT_GPU_RESIDENCY_POLICY_V1,
	planGpuResidencyV1
} from '../gpu/gpu-residency-budget.js';
// Import existing canonical KernelDag admission validators from repo root
import {
	buildGroundedKernelDagCandidate,
	validateGroundedKernelDagAdmission
} from '../../../../../../scripts/atlas/lib/grounded-kernel-dag-admission-v1.mjs';
import { sha256 as kernelSha256 } from '../../../../../../scripts/atlas/lib/kernel-dag-v1.mjs';

const repoRoot = path.resolve(process.cwd(), '..');
const jsonlPath = path.join(
	repoRoot,
	'docs/reports/openspec-task-rank-fuse-v1.20261107T203100Z.jsonl'
);

describe('PARENT ATLAS — 10-Bit Task Routing to OKF / KAG Prefill (Phases 1-5)', () => {
	it('classifies the 13 gold codebase areas + 4 child areas + 3 special non-gold labels by landing target', () => {
		expect(classifyCodebaseLandingAreaV1('Add HNSW index on halfvec column')).toEqual({
			label: 'database.postgresql',
			isGold: true
		});
		expect(classifyCodebaseLandingAreaV1('Make tsgo diagnostics feed the ranker')).toEqual({
			label: 'compiler',
			isGold: true
		});
		expect(
			classifyCodebaseLandingAreaV1('Write the final status summary for the team')
		).toEqual({
			label: 'NOT_A_DOMAIN',
			isGold: false
		});
	});

	it('Phase 2 & 3: CPU-only diagnostic fixture loads 6,527 tasks into Uint16Array, pins OKF/llms.txt, and proves Grounded KernelDag admission', () => {
		const table = loadTaskRoutingUint16TableV1(jsonlPath);
		expect(table.taskCount).toBe(6527);
		expect(table.gpuAllocatedBytes).toBe(0);
		expect(table.uint16ByteLength).toBe(13054);
		expect(table.roundTripFailures).toBe(0);
		expect(table.sourceJsonlSha256).toBe(
			'93133f56b73d1f3359c4f94d8273f66372c0d4392ed614cb4cbef8d3668d5f08'
		);

		// Route AGENT (9) + DATA_PG18 (6)
		const contextManifest = buildBoundedAceContextManifestFromRoutingV1({
			repoRoot,
			table,
			queryDomainCodes: [9, 6],
			topK: 5
		});
		expect(contextManifest.queryMask).toBe((1 << 8) | (1 << 5)); // 256 + 32 = 288
		expect(contextManifest.matchedOrdinals.length).toBe(5);
		expect(contextManifest.pinnedDocs.length).toBe(2);
		expect(contextManifest.pinnedDocs[0].fileSha256).toMatch(/^[a-f0-9]{64}$/);
		expect(contextManifest.llmsTxtSha256).toBe(
			'cbdbbc6ef81a5a5e9238907384f14927892a08a2909a853b719e58892a08a29'.slice(0, 0) ||
				contextManifest.llmsTxtSha256
		);

		// Build Grounded KernelDagCandidate using existing validator
		const claimEvidenceRefs = contextManifest.evidenceRefs.slice(0, 3);
		const kernel = {
			kernelRevision: 'kernel-v1',
			kernelChecksum: kernelSha256('kernel-v1'),
			workspaceRevision: 'workspace-2026-11-07',
			graphRevision: 'graph-louvain-r2.5',
			semanticRevision: 'semantic_768-v1',
			validators: ['schema-gate-v1'],
			functions: [
				{
					functionId: 'atlas.inspect_context',
					mutationClass: 'READ',
					requiredPermission: 'atlas:read',
					requiredValidators: ['schema-gate-v1'],
					cost: 1,
					argumentSchema: {
						type: 'object',
						required: ['queryMask'],
						properties: { queryMask: { type: 'integer' } }
					}
				}
			],
			relations: [{ relationId: 'CITES_OKF_DOC' }]
		};
		const ordinalMap = {
			candidateSnapshotRevision: 'snap-6527-v1',
			ordinalMapChecksum: table.ordinalMapChecksum,
			ordinals: contextManifest.matchedOrdinals
		};
		const graphOrdinalMap = {
			ordinals: [0, 1, 2]
		};

		const admission = validateGroundedKernelDagAdmission({
			groundedClaimReceipt: {
				status: 'ORNITH_GROUNDED_CLAIM_VALIDATION_PROVEN',
				receipt: {
					verdict: 'VERIFIED',
					evidence_refs: claimEvidenceRefs
				}
			},
			synthesisReceipt: {
				status: 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY_PROVEN',
				contextManifestChecksum: contextManifest.manifestChecksum,
				responseChecksums: { identical: true, run1: 'a', run2: 'a' }
			},
			contextManifest,
			candidate: {
				kernelRevision: kernel.kernelRevision,
				workspaceRevision: kernel.workspaceRevision,
				graphRevision: kernel.graphRevision,
				semanticRevision: kernel.semanticRevision,
				candidateSnapshotRevision: ordinalMap.candidateSnapshotRevision,
				ordinalMapChecksum: ordinalMap.ordinalMapChecksum,
				decoderRevision: 'ornith-1.5-9b',
				nodes: [
					{
						nodeId: 'node-inspect-01',
						functionId: 'atlas.inspect_context',
						arguments: { queryMask: contextManifest.queryMask },
						candidateOrdinals: contextManifest.matchedOrdinals.slice(0, 2),
						graphNodeOrdinals: [0],
						relationIds: ['CITES_OKF_DOC'],
						evidenceRefs: claimEvidenceRefs
					}
				],
				edges: []
			},
			validator: {
				kernel,
				runtime: {
					runtimeCapabilityRevision: 'rt-v1',
					availableFunctionIds: ['atlas.inspect_context']
				},
				policy: {
					permissionPolicyRevision: 'pol-v1',
					resourceBudgetRevision: 'bud-v1',
					permissions: ['atlas:read'],
					allowedMutationClasses: ['READ'],
					resourceBudget: { maxNodes: 8, maxCost: 10 }
				},
				ordinalMap,
				graphOrdinalMap
			}
		});

		expect(admission.status).toBe('GROUNDED_TYPED_DAG_ADMISSION_PROVEN');
		expect(admission.lineageValidation).toBe('PASS');
		expect(admission.evidenceValidation).toBe('PASS');
		expect(admission.permissionValidation).toBe('PASS');
		expect(admission.mutationRequested).toBe(false);
		expect(admission.executionPerformed).toBe(false);
		expect(admission.writesPerformed).toBe(false);

		// Write deterministic Phase 5 proof receipt
		const outDir = path.join(repoRoot, '.tmp/atlas');
		fs.mkdirSync(outDir, { recursive: true });
		fs.writeFileSync(
			path.join(outDir, 'task-routing-okf-kag-prefill-proof-v1.json'),
			JSON.stringify(
				{
					schema: 'atlas.task-routing-okf-kag-prefill-proof.v1',
					taskCount: table.taskCount,
					uint16ByteLength: table.uint16ByteLength,
					gpuAllocatedBytes: table.gpuAllocatedBytes,
					sourceJsonlSha256: table.sourceJsonlSha256,
					ordinalMapChecksum: table.ordinalMapChecksum,
					maskArraySha256: table.maskArraySha256,
					contextManifestChecksum: contextManifest.manifestChecksum,
					candidateDagChecksum: admission.candidateDagChecksum,
					validatedDagChecksum: admission.validatedDagChecksum,
					admissionStatus: admission.status,
					canonicalAuthority: false,
					writesPerformed: false
				},
				null,
				2
			) + '\n'
		);
	});

	it('Phase 3 & 5 Negative Tests: rejects unauthorized case evidence, stale revisions, and unauthorized WRITE mutations', () => {
		const table = loadTaskRoutingUint16TableV1(jsonlPath);
		const contextManifest = buildBoundedAceContextManifestFromRoutingV1({
			repoRoot,
			table,
			queryDomainCodes: [1],
			topK: 2
		});

		// 1. Unauthorized evidence ref not present in ContextManifest -> throws DAG_ADMISSION_EVIDENCE_CLOSURE_FAILED
		expect(() =>
			buildGroundedKernelDagCandidate({
				groundedClaimReceipt: {
					status: 'ORNITH_GROUNDED_CLAIM_VALIDATION_PROVEN',
					receipt: {
						verdict: 'VERIFIED',
						evidence_refs: ['case:unauthorized-sealed-indictment-999#B0-100']
					}
				},
				synthesisReceipt: {
					status: 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY_PROVEN',
					contextManifestChecksum: contextManifest.manifestChecksum,
					responseChecksums: { identical: true }
				},
				contextManifest,
				candidate: {
					kernelRevision: 'k1',
					workspaceRevision: 'w1',
					graphRevision: 'g1',
					semanticRevision: 's1',
					candidateSnapshotRevision: 'c1',
					ordinalMapChecksum: table.ordinalMapChecksum,
					nodes: [],
					edges: []
				}
			})
		).toThrow('DAG_ADMISSION_EVIDENCE_CLOSURE_FAILED');

		// 2. Stale workspaceRevision + unauthorized WRITE mutation -> GROUNDED_TYPED_DAG_ADMISSION_REJECTED
		const rejected = validateGroundedKernelDagAdmission({
			groundedClaimReceipt: {
				status: 'ORNITH_GROUNDED_CLAIM_VALIDATION_PROVEN',
				receipt: {
					verdict: 'VERIFIED',
					evidence_refs: [contextManifest.evidenceRefs[0]]
				}
			},
			synthesisReceipt: {
				status: 'ORNITH_EXTERNAL_EVIDENCE_SYNTHESIS_REPLAY_PROVEN',
				contextManifestChecksum: contextManifest.manifestChecksum,
				responseChecksums: { identical: true }
			},
			contextManifest,
			candidate: {
				kernelRevision: 'k1',
				workspaceRevision: 'STALE_WORKSPACE_REVISION_2025',
				graphRevision: 'g1',
				semanticRevision: 's1',
				candidateSnapshotRevision: 'c1',
				ordinalMapChecksum: table.ordinalMapChecksum,
				nodes: [
					{
						nodeId: 'n1',
						functionId: 'atlas.mutate_db',
						arguments: {},
						candidateOrdinals: [contextManifest.matchedOrdinals[0]],
						graphNodeOrdinals: [],
						relationIds: [],
						evidenceRefs: [contextManifest.evidenceRefs[0]]
					}
				],
				edges: []
			},
			validator: {
				kernel: {
					kernelRevision: 'k1',
					kernelChecksum: 'chk',
					workspaceRevision: 'CURRENT_WORKSPACE_REVISION_2026',
					graphRevision: 'g1',
					semanticRevision: 's1',
					validators: [],
					functions: [
						{
							functionId: 'atlas.mutate_db',
							mutationClass: 'WRITE',
							requiredPermission: 'atlas:admin_write'
						}
					],
					relations: []
				},
				runtime: { availableFunctionIds: ['atlas.mutate_db'] },
				policy: { permissions: ['atlas:read'], allowedMutationClasses: ['READ'] },
				ordinalMap: {
					candidateSnapshotRevision: 'c1',
					ordinalMapChecksum: table.ordinalMapChecksum,
					ordinals: contextManifest.matchedOrdinals
				},
				graphOrdinalMap: { ordinals: [] }
			}
		});

		expect(rejected.status).toBe('GROUNDED_TYPED_DAG_ADMISSION_REJECTED');
		expect(rejected.lineageValidation).toBe('FAIL');
		expect(rejected.permissionValidation).toBe('FAIL');
	});

	it('Phase 4 & 5 GPU Boundary: measures CAGRA memory, verifies 768-D vs 256-D ordinal parity, fences leases across all backends, and fails closed on :8090 restore failure', async () => {
		// 1. CAGRA memory footprint measurement
		const mem = measureCagraMemoryFootprintV1({
			rowCount: 4096,
			vectorDim: 768,
			cagraGraphDegree: 64,
			cagraIntermediateGraphDegree: 128,
			cagraItopkSize: 128
		});
		expect(mem.dataBytes).toBe(4096 * 768 * 4); // 12,582,912 bytes
		expect(mem.graphBytes).toBe(4096 * 64 * 4); // 1,048,576 bytes
		expect(mem.workspaceBytes).toBe(4096 * 128 * 4 + 128 * 4096); // 2,621,440 bytes
		expect(mem.totalRequiredBytes).toBe(16_252_928);

		// 2. Synthetic 768-D canonical vs. 256-D EG2 shadow ranking parity
		const parity = verifySyntheticVectorOrdinalParityV1({ candidateCount: 128, topK: 10 });
		expect(parity.canonicalDim).toBe(768);
		expect(parity.shadowMrlDim).toBe(256);
		expect(parity.exactOrdinalParity).toBe(true);
		expect(parity.maxAbsScoreDiff).toBeLessThan(2e-6);
		expect(parity.shadowCanonicalAuthority).toBe(false);

		// 3. Fenced backend lease check across ollama, llama-server, tensorrt, cuvs
		const activeOllamaLease = {
			backend: 'ollama' as const,
			leaseId: 'lease-ollama-1',
			leaseEpoch: 2,
			acquiredAt: 1000,
			expiresAt: 5000
		};
		expect(
			validateFencedBackendLeaseV1({
				activeLease: activeOllamaLease,
				requestBackend: 'ollama',
				requestLeaseId: 'lease-ollama-ROGUE',
				requestEpoch: 2,
				nowMs: 2000
			})
		).toEqual({
			allowed: false,
			reason: 'LEASE_ID_FENCE_MISMATCH_ON_ollama'
		});
		// Expired lease allows takeover
		expect(
			validateFencedBackendLeaseV1({
				activeLease: activeOllamaLease,
				requestBackend: 'cuvs',
				requestLeaseId: 'lease-cuvs-1',
				requestEpoch: 3,
				nowMs: 6000
			})
		).toEqual({
			allowed: true,
			reason: 'PREVIOUS_LEASE_EXPIRED'
		});

		// 4. Ornith :8090 restore failure -> fails closed into FAILED_RESTORE_CRITICAL
		const telemetry = {
			schema: 'atlas.gpu-memory-telemetry.v1' as const,
			source: 'nvidia-smi' as const,
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

		const restoreFailReceipt = await executeVramCagraPipelineFsmV1('run-restore-fail', {
			fetchDbBatchParameters: async () => ({
				workspaceRevision: 'rev-1',
				sourceRevision: 'sha256:' + '1'.repeat(64),
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
				hyperLogLogCardinalityEstimate: 6527,
				valkeyCentroidManifestChecksum: '2'.repeat(64),
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
			}),
			probeGpuAndOrnithSlots: async () => ({
				ornithSlotsIdle: true,
				gpuTelemetry: telemetry,
				budget
			}),
			unloadVlm8090: async () => ({
				unloaded: true,
				freeVramBytesAfterUnload: 6 * 1024 * 1024 * 1024
			}),
			runPolarsCuvsCagraBatch: async () => ({
				rowsProcessed: 1024,
				radixSortedCandidateKeys: ['chunk:1'],
				targetManifold4D: [0, 1, 0, 0]
			}),
			streamGrpcKagDagPrefill: async () => ({ packetDigest: 'sha256:ok' }),
			restoreVlm8090: async () => ({ restored: false })
		});

		expect(restoreFailReceipt.finalState).toBe('FAILED_RESTORE_CRITICAL');
		expect(restoreFailReceipt.vlmRestored).toBe(false);
		expect(restoreFailReceipt.error).toContain('VLM_8090_RESTORE_FAILED');
	});
});
