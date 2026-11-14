import { createHash } from 'node:crypto';
import * as THREE from 'three';
import { z } from 'zod';
import {
	MATRIX_STRIDE,
	TRANSFORM_CAPACITY
} from '$lib/n64-fsm/scene-fsm-cache.js';
import {
	ScenePrimitiveManager,
	type ScenePrimitiveSnapshot
} from '$lib/n64-fsm/scene-primitive-sync.js';
import {
	ALLOWED_IMAGE_EVIDENCE_MIMES
} from '$lib/server/evidence/evidence-image-analysis-contract-v1.js';
import {
	DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1,
	checkModelLicenseAdmissionV1,
	planLongformMediaPartitionsV1,
	type LongformMediaPartitionPlanV1
} from '$lib/server/evidence/video/longform-video-speaker-ledger-v1.js';
import { SPZ_EVIDENCE_SOURCE_MAX_POINTS } from '$lib/server/splat/evidence-source-v1.js';
import { admitSpzSceneV1 } from '$lib/server/splat/scene-admission-v1.js';
import {
	SPZ_DECODER_REVISION_V1,
	SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1
} from '$lib/splat/scene-document-v1.js';
import {
	SPZ_DEFAULT_MAX_DECODED_BYTES,
	SPZ_DEFAULT_MAX_SOURCE_BYTES
} from '$lib/splat/spz-loader.js';
import {
	MBVH4_MAX_SUPPORTED_DEPTH,
	MBVH4_NODE_STRIDE_BYTES,
	assertMbvh4SupportedDepth,
	packMbvh4Nodes,
	type MBVH4NodeInput,
	type Vec3
} from '$lib/webgpu/mbvh4-accelerator.js';
import { batchTraverseMbvh4Cpu } from '$lib/webgpu/mbvh4-webgpu-engine.js';

export const MultimodalEvidenceModalityV1Schema = z.enum([
	'image_2d',
	'depth_2_5d',
	'spz_gaussian_3d',
	'bvh_mbvh4_3d',
	'video_longform'
]);

export type MultimodalEvidenceModalityV1 = z.infer<typeof MultimodalEvidenceModalityV1Schema>;

export type MultimodalClassificationErrorCode =
	| 'MULTIMODAL_MIME_EXTENSION_MISMATCH'
	| 'MULTIMODAL_MODALITY_MISMATCH'
	| 'MULTIMODAL_UNSUPPORTED_MEDIA_TYPE'
	| 'MULTIMODAL_RAY_DIRECTION_ZERO'
	| 'MULTIMODAL_SPZ_NOT_ADMITTED'
	| 'MULTIMODAL_MODEL_LICENSE_BLOCKED';

export class MultimodalUploadContractError extends Error {
	constructor(
		readonly code: MultimodalClassificationErrorCode,
		message: string = code
	) {
		super(message);
		this.name = 'MultimodalUploadContractError';
	}
}

const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.tif', '.tiff']);
const IMAGE_MIME_EXTENSIONS: Readonly<Record<string, ReadonlySet<string>>> = {
	'image/jpeg': new Set(['.jpg', '.jpeg']),
	'image/png': new Set(['.png']),
	'image/webp': new Set(['.webp']),
	'image/tiff': new Set(['.tif', '.tiff'])
};

const SPZ_MIMES = new Set(['model/x-spz', 'application/vnd.spz']);
const GLTF_MIME_EXTENSIONS: Readonly<Record<string, ReadonlySet<string>>> = {
	'model/gltf-binary': new Set(['.glb']),
	'model/gltf+json': new Set(['.gltf'])
};

const VIDEO_MIME_EXTENSIONS: Readonly<Record<string, ReadonlySet<string>>> = {
	'video/mp4': new Set(['.mp4', '.m4v']),
	'video/webm': new Set(['.webm']),
	'video/quicktime': new Set(['.mov', '.qt'])
};
const ALL_VIDEO_EXTENSIONS = new Set(['.mp4', '.m4v', '.webm', '.mov', '.qt']);

function extractLowerExtension(fileName: string): string {
	const trimmed = fileName.trim();
	const dotIdx = trimmed.lastIndexOf('.');
	if (dotIdx <= 0 || dotIdx === trimmed.length - 1) return '';
	return trimmed.slice(dotIdx).toLowerCase();
}

function normalizeMime(mimeType: string): string {
	return mimeType.split(';', 1)[0]?.trim().toLowerCase() ?? '';
}

function assertRequestedModalityMatches(
	detected: MultimodalEvidenceModalityV1,
	requested?: MultimodalEvidenceModalityV1
): MultimodalEvidenceModalityV1 {
	if (!requested) return detected;
	if (detected === 'image_2d' && requested === 'depth_2_5d') {
		return 'depth_2_5d';
	}
	if (requested !== detected) {
		throw new MultimodalUploadContractError(
			'MULTIMODAL_MODALITY_MISMATCH',
			`Requested modality "${requested}" conflicts with detected modality "${detected}".`
		);
	}
	return detected;
}

/**
 * Deterministically classify an uploaded evidence asset into one of the five supported
 * spatial/media analysis modalities, failing closed on MIME/extension mismatches or unknown types.
 */
export function classifyEvidenceUploadModalityV1(
	mimeType: string,
	fileName: string,
	requestedModality?: MultimodalEvidenceModalityV1
): MultimodalEvidenceModalityV1 {
	const cleanMime = normalizeMime(mimeType);
	const ext = extractLowerExtension(fileName);

	if (requestedModality !== undefined) {
		MultimodalEvidenceModalityV1Schema.parse(requestedModality);
	}

	if ((ALLOWED_IMAGE_EVIDENCE_MIMES as readonly string[]).includes(cleanMime)) {
		const validExts = IMAGE_MIME_EXTENSIONS[cleanMime];
		if (ext && validExts && !validExts.has(ext)) {
			throw new MultimodalUploadContractError('MULTIMODAL_MIME_EXTENSION_MISMATCH');
		}
		return assertRequestedModalityMatches('image_2d', requestedModality);
	}

	if (SPZ_MIMES.has(cleanMime)) {
		if (ext && ext !== '.spz') {
			throw new MultimodalUploadContractError('MULTIMODAL_MIME_EXTENSION_MISMATCH');
		}
		return assertRequestedModalityMatches('spz_gaussian_3d', requestedModality);
	}

	if (cleanMime in GLTF_MIME_EXTENSIONS) {
		const validExts = GLTF_MIME_EXTENSIONS[cleanMime]!;
		if (ext && !validExts.has(ext)) {
			throw new MultimodalUploadContractError('MULTIMODAL_MIME_EXTENSION_MISMATCH');
		}
		return assertRequestedModalityMatches('bvh_mbvh4_3d', requestedModality);
	}

	if (cleanMime in VIDEO_MIME_EXTENSIONS) {
		const validExts = VIDEO_MIME_EXTENSIONS[cleanMime]!;
		if (ext && !validExts.has(ext)) {
			throw new MultimodalUploadContractError('MULTIMODAL_MIME_EXTENSION_MISMATCH');
		}
		return assertRequestedModalityMatches('video_longform', requestedModality);
	}

	if (cleanMime === 'application/octet-stream' || cleanMime === '') {
		if (ext === '.spz') return assertRequestedModalityMatches('spz_gaussian_3d', requestedModality);
		if (ext === '.glb' || ext === '.gltf') {
			return assertRequestedModalityMatches('bvh_mbvh4_3d', requestedModality);
		}
		if (ALL_VIDEO_EXTENSIONS.has(ext)) {
			return assertRequestedModalityMatches('video_longform', requestedModality);
		}
		if (IMAGE_EXTENSIONS.has(ext)) {
			return assertRequestedModalityMatches('image_2d', requestedModality);
		}
	}

	throw new MultimodalUploadContractError(
		'MULTIMODAL_UNSUPPORTED_MEDIA_TYPE',
		`Unsupported evidence MIME "${cleanMime || '(empty)'}" / file extension "${ext || '(none)'}".`
	);
}

const finiteVec3Schema = z.tuple([z.number().finite(), z.number().finite(), z.number().finite()]);
const positiveVec3Schema = z.tuple([
	z.number().finite().positive(),
	z.number().finite().positive(),
	z.number().finite().positive()
]);

const admittedSpzSceneSchema = z.object({
	status: z.literal('SCENE_ADMITTED'),
	caseId: z.string().uuid(),
	sceneId: z.string().uuid(),
	sceneRevision: z.number().int().positive(),
	evidenceId: z.string().uuid(),
	sourceRevision: z.string().regex(/^sha256:[a-f0-9]{64}$/),
	sourceSha256: z.string().regex(/^[a-f0-9]{64}$/),
	byteLength: z.number().int().positive().max(SPZ_DEFAULT_MAX_SOURCE_BYTES),
	decodedByteLength: z.number().int().positive().max(SPZ_DEFAULT_MAX_DECODED_BYTES),
	pointCount: z.number().int().positive().max(SPZ_EVIDENCE_SOURCE_MAX_POINTS),
	coordinateSystem: z.literal('RUB'),
	decoderRevision: z.literal(SPZ_DECODER_REVISION_V1),
	representationRevision: z.literal(SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1)
});

const spzProxyMbvh4InputSchema = z.object({
	admittedScene: admittedSpzSceneSchema,
	primitiveId: z.string().trim().min(1).max(128).optional(),
	label: z.string().trim().min(1).max(200).optional(),
	originMeters: finiteVec3Schema,
	extentsMeters: positiveVec3Schema,
	slotIndex: z.number().int().min(0).max(TRANSFORM_CAPACITY - 1).default(0),
	lodTier: z.number().int().min(0).max(3).default(0)
});

export type AdmittedSpzSceneV1 = ReturnType<typeof admitSpzSceneV1>;

export interface SpzProxyMbvh4RootV1 {
	schema: 'atlas.spz-proxy-mbvh4-root.v1';
	caseId: string;
	sceneId: string;
	sceneRevision: number;
	evidenceId: string;
	sourceRevision: string;
	coordinateSystem: 'RUB';
	primitiveId: string;
	slotIndex: number;
	originMeters: [number, number, number];
	extentsMeters: [number, number, number];
	nodes: [MBVH4NodeInput];
	packedBuffer: ArrayBuffer;
	packedByteLength: number;
	primitiveSnapshot: ScenePrimitiveSnapshot;
	canonicalAuthority: false;
}

/**
 * Bind an admitted SPZ Gaussian Splat scene to a 128-byte aligned mBVH4 proxy bounding volume
 * and an isolated N64 16 KB primitive arena slot for demonstrative ray picking and caliper bounds.
 */
export function buildSpzProxyMbvh4RootV1(
	input: z.input<typeof spzProxyMbvh4InputSchema>
): SpzProxyMbvh4RootV1 {
	const parsed = spzProxyMbvh4InputSchema.parse(input);
	if (parsed.admittedScene.sourceRevision !== `sha256:${parsed.admittedScene.sourceSha256}`) {
		throw new MultimodalUploadContractError('MULTIMODAL_SPZ_NOT_ADMITTED');
	}

	const [ox, oy, oz] = parsed.originMeters;
	const [w, h, d] = parsed.extentsMeters;
	const halfW = w / 2;
	const halfH = h / 2;
	const halfD = d / 2;

	const rootNode: MBVH4NodeInput = {
		bminX: [ox - halfW, 0, 0, 0],
		bmaxX: [ox + halfW, 0, 0, 0],
		bminY: [oy - halfH, 0, 0, 0],
		bmaxY: [oy + halfH, 0, 0, 0],
		bminZ: [oz - halfD, 0, 0, 0],
		bmaxZ: [oz + halfD, 0, 0, 0],
		childIndices: [~0, -1, -1, -1],
		parentIndex: 0,
		validChildMask: 0b0001,
		lodTier: parsed.lodTier
	};

	const nodes: [MBVH4NodeInput] = [rootNode];
	assertMbvh4SupportedDepth(nodes);
	const packedBuffer = packMbvh4Nodes(nodes);

	const primitiveId = parsed.primitiveId ?? `SPZ_PROXY_${parsed.admittedScene.evidenceId.slice(0, 8).toUpperCase()}`;
	const isolatedArena = new Float32Array(TRANSFORM_CAPACITY * MATRIX_STRIDE);
	const manager = new ScenePrimitiveManager(isolatedArena);
	const proxyMesh = new THREE.Mesh(
		new THREE.BoxGeometry(w, h, d),
		new THREE.MeshBasicMaterial()
	);
	proxyMesh.position.set(ox, oy, oz);
	proxyMesh.updateMatrixWorld(true);

	manager.register({
		id: primitiveId,
		slotIndex: parsed.slotIndex,
		type: 'EXHIBIT_OBB',
		mesh: proxyMesh,
		metadata: {
			dimensions: [w, h, d],
			position: [ox, oy, oz],
			label: parsed.label ?? primitiveId,
			sha256: parsed.admittedScene.sourceSha256
		}
	});
	const primitiveSnapshot = manager.getSnapshot(primitiveId);
	if (!primitiveSnapshot) {
		throw new Error('SPZ_PROXY_PRIMITIVE_SNAPSHOT_MISSING');
	}

	return {
		schema: 'atlas.spz-proxy-mbvh4-root.v1',
		caseId: parsed.admittedScene.caseId,
		sceneId: parsed.admittedScene.sceneId,
		sceneRevision: parsed.admittedScene.sceneRevision,
		evidenceId: parsed.admittedScene.evidenceId,
		sourceRevision: parsed.admittedScene.sourceRevision,
		coordinateSystem: 'RUB',
		primitiveId,
		slotIndex: parsed.slotIndex,
		originMeters: [ox, oy, oz],
		extentsMeters: [w, h, d],
		nodes,
		packedBuffer,
		packedByteLength: packedBuffer.byteLength,
		primitiveSnapshot,
		canonicalAuthority: false
	};
}

const rayEvalInputSchema = z.object({
	origin: finiteVec3Schema,
	dir: finiteVec3Schema,
	tMin: z.number().finite().nonnegative().default(0),
	tMax: z.number().finite().positive().default(1e6)
});

export interface SpzBoundingVolumeRayResultV1 {
	hit: boolean;
	hitLeafId: number;
	closestT: number;
	promotedLodTier: number;
	nodesVisited: number;
	packedByteLength: number;
	primitiveSnapshot: ScenePrimitiveSnapshot;
}

/**
 * Evaluate a ray query against an SPZ proxy mBVH4 bounding volume on CPU stackless traversal.
 */
export function evaluateSpzBoundingVolumeRayV1(
	proxyRoot: SpzProxyMbvh4RootV1,
	ray: z.input<typeof rayEvalInputSchema>
): SpzBoundingVolumeRayResultV1 {
	const parsedRay = rayEvalInputSchema.parse(ray);
	const [dx, dy, dz] = parsedRay.dir;
	if (Math.hypot(dx, dy, dz) < 1e-12) {
		throw new MultimodalUploadContractError('MULTIMODAL_RAY_DIRECTION_ZERO');
	}

	const [ox, oy, oz] = parsedRay.origin;
	const origin: Vec3 = [ox ?? 0, oy ?? 0, oz ?? 0];
	const dir: Vec3 = [dx ?? 0, dy ?? 0, dz ?? 0];

	assertMbvh4SupportedDepth(proxyRoot.nodes);
	const [res] = batchTraverseMbvh4Cpu(proxyRoot.nodes, [
		{
			origin,
			dir,
			tMin: parsedRay.tMin,
			tMax: parsedRay.tMax
		}
	]);

	return {
		hit: res.hitLeafId >= 0,
		hitLeafId: res.hitLeafId,
		closestT: res.closestT,
		promotedLodTier: res.promotedLodTier,
		nodesVisited: res.nodesVisited,
		packedByteLength: proxyRoot.packedBuffer.byteLength,
		primitiveSnapshot: proxyRoot.primitiveSnapshot
	};
}

const bucketSchema = z.string().regex(/^[a-z0-9][a-z0-9._-]{1,62}$/i);
const objectKeySchema = z
	.string()
	.min(1)
	.max(1024)
	.refine(
		(value) =>
			value.startsWith('evidence/') &&
			!value.includes('\\') &&
			!value.split('/').some((segment) => segment === '.' || segment === '..'),
		'Invalid SeaweedFS evidence objectKey'
	);

const runtimeCapabilitiesSchema = z
	.object({
		ffmpegConfigured: z.boolean().default(false),
		ffprobeConfigured: z.boolean().default(false),
		fasterWhisperAvailable: z.boolean().default(false),
		webgpuAvailable: z.boolean().default(false),
		vlmConfigured: z.boolean().default(false),
		depthModelConfigured: z.boolean().default(false),
		yoloSam2Configured: z.boolean().default(false)
	})
	.default({
		ffmpegConfigured: false,
		ffprobeConfigured: false,
		fasterWhisperAvailable: false,
		webgpuAvailable: false,
		vlmConfigured: false,
		depthModelConfigured: false,
		yoloSam2Configured: false
	});

const multimodalUploadJobInputSchema = z
	.object({
		caseId: z.string().uuid().nullable().default(null),
		evidenceId: z.string().uuid(),
		sourceSha256: z.string().regex(/^(?:sha256:)?[a-f0-9]{64}$/i),
		objectBucket: bucketSchema,
		objectKey: objectKeySchema,
		mimeType: z.string().max(255),
		fileName: z.string().trim().min(1).max(512),
		byteSize: z.number().int().positive(),
		requestedModality: MultimodalEvidenceModalityV1Schema.optional(),
		runtimeCapabilities: runtimeCapabilitiesSchema,
		allowCcByAttribution: z.boolean().default(false),
		video: z
			.object({
				durationMs: z.number().int().positive().max(86_400_000).optional(),
				partitionDurationMs: z.number().int().positive().optional(),
				audioWindowMs: z.number().int().positive().optional(),
				overlapMs: z.number().int().min(0).optional()
			})
			.strict()
			.optional(),
		spz: z
			.object({
				pointCount: z.number().int().positive().optional(),
				decodedByteLength: z.number().int().positive().optional()
			})
			.strict()
			.optional(),
		mesh3d: z
			.object({
				mbvh4Depth: z.number().int().positive().optional(),
				nodeCount: z.number().int().positive().optional(),
				indexedTriangleCount: z.number().int().nonnegative().optional()
			})
			.strict()
			.optional(),
		depth25d: z
			.object({
				width: z.number().int().positive().max(8192).optional(),
				height: z.number().int().positive().max(8192).optional(),
				modelId: z.string().min(1).max(256).default(DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1.depth)
			})
			.strict()
			.optional()
	})
	.strict();

export type MultimodalJobStageStatusV1 = 'ready' | 'blocked_runtime_dependency' | 'optional_skipped';

export interface MultimodalJobStageV1 {
	stageId: string;
	status: MultimodalJobStageStatusV1;
	requiredRuntime: string | null;
	modelId?: string;
	reason?: string;
	details?: Record<string, unknown>;
}

export interface MultimodalEvidenceUploadJobPlanV1 {
	schema: 'atlas.multimodal-upload-job-plan.v1';
	modality: MultimodalEvidenceModalityV1;
	jobType: 'upload_pipeline';
	status: 'queued';
	caseId: string | null;
	evidenceId: string;
	sourceSha256: string;
	sourceRevision: string;
	objectBucket: string;
	objectKey: string;
	byteSize: number;
	idempotencyKey: string;
	seaweedSourceAdmitted: true;
	executionTarget: 'server_worker' | 'server_admission_browser_gpu';
	canonicalAuthority: false;
	writesPerformed: false;
	runtimeGates: z.infer<typeof runtimeCapabilitiesSchema>;
	stages: MultimodalJobStageV1[];
	videoPartitionPlan?: LongformMediaPartitionPlanV1;
	mbvh4Constraints?: {
		nodeStrideBytes: number;
		maxSupportedDepth: number;
		traversalBackend: 'webgpu_compute' | 'cpu_bitstack_fallback';
	};
}

function buildStagesForModality(input: {
	modality: MultimodalEvidenceModalityV1;
	evidenceId: string;
	sourceSha256: string;
	byteSize: number;
	parsed: z.infer<typeof multimodalUploadJobInputSchema>;
}): {
	executionTarget: 'server_worker' | 'server_admission_browser_gpu';
	stages: MultimodalJobStageV1[];
	videoPartitionPlan?: LongformMediaPartitionPlanV1;
	mbvh4Constraints?: MultimodalEvidenceUploadJobPlanV1['mbvh4Constraints'];
} {
	const { modality, evidenceId, sourceSha256, byteSize, parsed } = input;
	const caps = parsed.runtimeCapabilities;
	const baseStage: MultimodalJobStageV1 = {
		stageId: 'seaweedfs_source_verify',
		status: 'ready',
		requiredRuntime: null,
		details: { objectBucket: parsed.objectBucket, objectKey: parsed.objectKey }
	};

	switch (modality) {
		case 'image_2d':
			return {
				executionTarget: 'server_worker',
				stages: [
					baseStage,
					{
						stageId: 'yolo_sam2_detection',
						status: caps.yoloSam2Configured ? 'ready' : 'optional_skipped',
						requiredRuntime: 'vision-worker',
						modelId: DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1.segmentation
					},
					{
						stageId: 'vlm_caption_proposal',
						status: caps.vlmConfigured ? 'ready' : 'optional_skipped',
						requiredRuntime: 'vlm-endpoint',
						modelId: DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1.ocr
					},
					{
						stageId: 'monocular_depth_sidecar',
						status: caps.depthModelConfigured ? 'ready' : 'optional_skipped',
						requiredRuntime: 'depth-worker',
						modelId: DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1.depth
					}
				]
			};

		case 'depth_2_5d': {
			const depthModelId =
				parsed.depth25d?.modelId ?? DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1.depth;
			const licenseCheck = checkModelLicenseAdmissionV1({
				modelId: depthModelId,
				purpose: 'factual_evidence',
				allowCcByAttribution: parsed.allowCcByAttribution
			});
			if ('reason' in licenseCheck) {
				throw new MultimodalUploadContractError(
					'MULTIMODAL_MODEL_LICENSE_BLOCKED',
					licenseCheck.reason
				);
			}
			return {
				executionTarget: 'server_worker',
				stages: [
					baseStage,
					{
						stageId: 'monocular_depth_estimation',
						status: caps.depthModelConfigured ? 'ready' : 'blocked_runtime_dependency',
						requiredRuntime: 'depth-worker',
						modelId: depthModelId,
						reason: caps.depthModelConfigured
							? undefined
							: 'Depth model runtime not configured in worker environment.',
						details: {
							artifactKind: 'monocular_depth_map_2d',
							is3DReconstruction: false,
							license: licenseCheck.entry.license
						}
					}
				]
			};
		}

		case 'spz_gaussian_3d': {
			if (byteSize > SPZ_DEFAULT_MAX_SOURCE_BYTES) {
				throw new RangeError('SCENE_ADMISSION_SOURCE_TOO_LARGE');
			}
			if (
				parsed.spz?.decodedByteLength !== undefined &&
				parsed.spz.decodedByteLength > SPZ_DEFAULT_MAX_DECODED_BYTES
			) {
				throw new RangeError('SCENE_ADMISSION_DECODED_TOO_LARGE');
			}
			if (
				parsed.spz?.pointCount !== undefined &&
				parsed.spz.pointCount > SPZ_EVIDENCE_SOURCE_MAX_POINTS
			) {
				throw new RangeError('SCENE_ADMISSION_POINT_LIMIT');
			}
			return {
				executionTarget: 'server_admission_browser_gpu',
				stages: [
					baseStage,
					{
						stageId: 'spz_manifest_admission',
						status: 'ready',
						requiredRuntime: null,
						details: {
							coordinateSystem: 'RUB',
							decoderRevision: SPZ_DECODER_REVISION_V1,
							representationRevision: SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1
						}
					},
					{
						stageId: 'spz_proxy_mbvh4_obb',
						status: 'ready',
						requiredRuntime: null,
						details: {
							mbvh4NodeStrideBytes: MBVH4_NODE_STRIDE_BYTES,
							traversalBackend: caps.webgpuAvailable ? 'webgpu_compute' : 'cpu_bitstack_fallback'
						}
					}
				],
				mbvh4Constraints: {
					nodeStrideBytes: MBVH4_NODE_STRIDE_BYTES,
					maxSupportedDepth: MBVH4_MAX_SUPPORTED_DEPTH,
					traversalBackend: caps.webgpuAvailable ? 'webgpu_compute' : 'cpu_bitstack_fallback'
				}
			};
		}

		case 'bvh_mbvh4_3d': {
			if (
				parsed.mesh3d?.mbvh4Depth !== undefined &&
				parsed.mesh3d.mbvh4Depth > MBVH4_MAX_SUPPORTED_DEPTH
			) {
				throw new RangeError(`MBVH4_MAX_DEPTH_EXCEEDED:${MBVH4_MAX_SUPPORTED_DEPTH}`);
			}
			const traversalBackend = caps.webgpuAvailable ? 'webgpu_compute' : 'cpu_bitstack_fallback';
			return {
				executionTarget: 'server_admission_browser_gpu',
				stages: [
					baseStage,
					{
						stageId: 'cpu_tlas_blas_index',
						status: 'ready',
						requiredRuntime: null,
						details: {
							backend: 'three-mesh-bvh',
							indexedTriangleCount: parsed.mesh3d?.indexedTriangleCount ?? null
						}
					},
					{
						stageId: 'mbvh4_pack_and_traversal',
						status: 'ready',
						requiredRuntime: null,
						details: {
							nodeStrideBytes: MBVH4_NODE_STRIDE_BYTES,
							maxSupportedDepth: MBVH4_MAX_SUPPORTED_DEPTH,
							traversalBackend
						}
					}
				],
				mbvh4Constraints: {
					nodeStrideBytes: MBVH4_NODE_STRIDE_BYTES,
					maxSupportedDepth: MBVH4_MAX_SUPPORTED_DEPTH,
					traversalBackend
				}
			};
		}

		case 'video_longform': {
			const videoPartitionPlan =
				parsed.video?.durationMs !== undefined
					? planLongformMediaPartitionsV1({
							evidenceId,
							sourceSha256,
							durationMs: parsed.video.durationMs,
							partitionDurationMs: parsed.video.partitionDurationMs,
							audioWindowMs: parsed.video.audioWindowMs,
							overlapMs: parsed.video.overlapMs
						})
					: undefined;

			return {
				executionTarget: 'server_worker',
				videoPartitionPlan,
				stages: [
					baseStage,
					{
						stageId: 'ffprobe_media_probe',
						status: caps.ffprobeConfigured ? 'ready' : 'blocked_runtime_dependency',
						requiredRuntime: 'ffprobe',
						reason: caps.ffprobeConfigured ? undefined : 'ffprobe binary is not configured.'
					},
					{
						stageId: 'ffmpeg_dhash_keyframe_cut',
						status: caps.ffmpegConfigured ? 'ready' : 'blocked_runtime_dependency',
						requiredRuntime: 'ffmpeg',
						reason: caps.ffmpegConfigured ? undefined : 'ffmpeg binary is not configured.'
					},
					{
						stageId: 'whisper_asr_diarization',
						status: caps.fasterWhisperAvailable ? 'ready' : 'blocked_runtime_dependency',
						requiredRuntime: 'faster-whisper',
						modelId: DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1.asr,
						reason: caps.fasterWhisperAvailable
							? undefined
							: 'faster-whisper is not installed in Python media worker.'
					},
					{
						stageId: 'ornith_timeline_synthesis',
						status: caps.vlmConfigured ? 'ready' : 'optional_skipped',
						requiredRuntime: 'ornith-llm',
						modelId: DEFAULT_PERMISSIVE_LONGFORM_MODEL_STACK_V1.reasoning
					}
				]
			};
		}
	}
}

/**
 * Validate upload metadata and produce a durable `upload_pipeline` job plan across
 * 2D images, 2.5D depth relief, 3D SPZ Gaussian splats, 3D BVH/mBVH4 meshes, and longform video.
 */
export function planMultimodalEvidenceUploadJobV1(
	input: z.input<typeof multimodalUploadJobInputSchema>
): MultimodalEvidenceUploadJobPlanV1 {
	const parsed = multimodalUploadJobInputSchema.parse(input);
	const rawSha = parsed.sourceSha256.toLowerCase();
	const sourceSha256 = rawSha.startsWith('sha256:') ? rawSha.slice('sha256:'.length) : rawSha;
	const sourceRevision = `sha256:${sourceSha256}`;

	const modality = classifyEvidenceUploadModalityV1(
		parsed.mimeType,
		parsed.fileName,
		parsed.requestedModality
	);

	const idempotencyKey = createHash('sha256')
		.update(
			JSON.stringify({
				caseId: parsed.caseId,
				evidenceId: parsed.evidenceId,
				modality,
				sourceRevision,
				objectBucket: parsed.objectBucket,
				objectKey: parsed.objectKey
			})
		)
		.digest('hex');

	const built = buildStagesForModality({
		modality,
		evidenceId: parsed.evidenceId,
		sourceSha256,
		byteSize: parsed.byteSize,
		parsed
	});

	return {
		schema: 'atlas.multimodal-upload-job-plan.v1',
		modality,
		jobType: 'upload_pipeline',
		status: 'queued',
		caseId: parsed.caseId,
		evidenceId: parsed.evidenceId,
		sourceSha256,
		sourceRevision,
		objectBucket: parsed.objectBucket,
		objectKey: parsed.objectKey,
		byteSize: parsed.byteSize,
		idempotencyKey,
		seaweedSourceAdmitted: true,
		executionTarget: built.executionTarget,
		canonicalAuthority: false,
		writesPerformed: false,
		runtimeGates: parsed.runtimeCapabilities,
		stages: built.stages,
		...(built.videoPartitionPlan ? { videoPartitionPlan: built.videoPartitionPlan } : {}),
		...(built.mbvh4Constraints ? { mbvh4Constraints: built.mbvh4Constraints } : {})
	};
}
