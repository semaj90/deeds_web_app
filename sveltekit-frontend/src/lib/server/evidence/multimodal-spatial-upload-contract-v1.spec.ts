import { describe, expect, it } from 'vitest';
import {
	createSceneQualityReceiptV1,
	SPZ_DECODER_REVISION_V1,
	SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1
} from '$lib/splat/scene-document-v1.js';
import { admitSpzSceneV1 } from '$lib/server/splat/scene-admission-v1.js';
import {
	MBVH4_MAX_SUPPORTED_DEPTH,
	MBVH4_NODE_STRIDE_BYTES,
	assertMbvh4SupportedDepth,
	packMbvh4Nodes,
	type MBVH4NodeInput
} from '$lib/webgpu/mbvh4-accelerator.js';
import { batchTraverseMbvh4Cpu } from '$lib/webgpu/mbvh4-webgpu-engine.js';
import {
	MultimodalUploadContractError,
	buildSpzProxyMbvh4RootV1,
	classifyEvidenceUploadModalityV1,
	evaluateSpzBoundingVolumeRayV1,
	planMultimodalEvidenceUploadJobV1
} from './multimodal-spatial-upload-contract-v1.js';

const caseId = '11111111-1111-4111-8111-111111111111';
const sceneId = '22222222-2222-4222-8222-222222222222';
const evidenceId = '33333333-3333-4333-8333-333333333333';
const sha256Hex = 'a'.repeat(64);
const sourceRevision = `sha256:${sha256Hex}`;

function buildAdmittedSpzFixture() {
	const manifest = {
		schema: 'parent-atlas.scene-document.v1',
		caseId,
		sceneId,
		status: 'HYPOTHESIS',
		revision: 2,
		parentManifestSha256: 'b'.repeat(64),
		createdAt: '2026-11-13T12:00:00.000Z',
		coordinateFrame: 'SPZ_RUB',
		objects: [],
		animations: [],
		assets: [],
		evidenceSources: [
			{
				evidenceId,
				sourceRevision,
				format: 'SPZ',
				coordinateSystem: 'RUB',
				decoderRevision: SPZ_DECODER_REVISION_V1,
				representationRevision: SPZ_GAUSSIAN_REPRESENTATION_REVISION_V1
			}
		],
		quality: createSceneQualityReceiptV1({ derivedAssetBytes: 0, triangleCount: 0 })
	};

	return admitSpzSceneV1({
		caseId,
		sceneId,
		revision: 2,
		manifest,
		source: {
			caseId,
			evidenceId,
			sourceRevision,
			sourceSha256: sha256Hex,
			mimeType: 'model/x-spz',
			byteLength: 4096,
			decodedByteLength: 32768,
			pointCount: 256
		}
	});
}

describe('Multimodal spatial & media upload admission contract v1', () => {
	it('classifies 2D images, 2.5D depth relief, 3D SPZ splats, 3D GLB meshes, and videos accurately', () => {
		expect(classifyEvidenceUploadModalityV1('image/png', 'exhibit-008.png')).toBe('image_2d');
		expect(classifyEvidenceUploadModalityV1('image/jpeg', 'still.JPG', 'depth_2_5d')).toBe(
			'depth_2_5d'
		);
		expect(classifyEvidenceUploadModalityV1('model/x-spz', 'corridor-scan.spz')).toBe(
			'spz_gaussian_3d'
		);
		expect(classifyEvidenceUploadModalityV1('application/octet-stream', 'scene.glb')).toBe(
			'bvh_mbvh4_3d'
		);
		expect(classifyEvidenceUploadModalityV1('video/mp4', 'cam-042.mp4')).toBe('video_longform');
	});

	it('fails closed on MIME/extension mismatches, conflicting modality hints, and unknown binary files', () => {
		expect(() => classifyEvidenceUploadModalityV1('image/png', 'scan.spz')).toThrowError(
			new MultimodalUploadContractError('MULTIMODAL_MIME_EXTENSION_MISMATCH')
		);
		expect(() =>
			classifyEvidenceUploadModalityV1('video/mp4', 'cam.mp4', 'spz_gaussian_3d')
		).toThrowError(MultimodalUploadContractError);
		expect(() => classifyEvidenceUploadModalityV1('application/octet-stream', 'payload.bin')).toThrowError(
			MultimodalUploadContractError
		);
	});

	it('binds an admitted SPZ scene to a 128-byte mBVH4 proxy OBB and evaluates ray hits at [+4.213, 0.089, -2.97]', () => {
		const admittedScene = buildAdmittedSpzFixture();
		const proxyRoot = buildSpzProxyMbvh4RootV1({
			admittedScene,
			primitiveId: 'EXHIBIT_E002',
			label: 'EXHIBIT E-002 // BOUNDING VOLUME',
			originMeters: [4.213, 0.089, -2.97],
			extentsMeters: [1.24, 0.92, 0.86],
			slotIndex: 2,
			lodTier: 1
		});

		expect(proxyRoot.packedByteLength).toBe(MBVH4_NODE_STRIDE_BYTES);
		expect(proxyRoot.primitiveSnapshot).toMatchObject({
			id: 'EXHIBIT_E002',
			type: 'EXHIBIT_OBB',
			positionMeters: [4.213, 0.089, -2.97],
			dimensionsMeters: [1.24, 0.92, 0.86],
			anchorStatus: 'DEMONSTRATIVE_UNCALIBRATED'
		});

		// Ray along -Z directly through the front face at z = -2.97 + 0.43 = -2.54
		const hitResult = evaluateSpzBoundingVolumeRayV1(proxyRoot, {
			origin: [4.213, 0.089, 2.46],
			dir: [0, 0, -1]
		});
		expect(hitResult.hit).toBe(true);
		expect(hitResult.hitLeafId).toBe(0);
		expect(hitResult.closestT).toBeCloseTo(5.0, 5);
		expect(hitResult.promotedLodTier).toBe(1);

		const missResult = evaluateSpzBoundingVolumeRayV1(proxyRoot, {
			origin: [-10, 0, 2.46],
			dir: [0, 0, -1]
		});
		expect(missResult.hit).toBe(false);
		expect(missResult.hitLeafId).toBe(-1);
	});

	it('validates multi-child 4-wide mBVH4 hierarchy packing and rejects depth > 16', () => {
		const quadNodes: MBVH4NodeInput[] = [
			{
				bminX: [0.5, -4, 0, 0],
				bmaxX: [3.5, -1, 0, 0],
				bminY: [0, 0, 0, 0],
				bmaxY: [2, 2, 0, 0],
				bminZ: [-2, -2, 0, 0],
				bmaxZ: [1, 1, 0, 0],
				childIndices: [1, ~0, -1, -1],
				parentIndex: 0,
				validChildMask: 0b0011,
				lodTier: 1
			},
			{
				bminX: [1.0, 2.2, 0, 0],
				bmaxX: [2.0, 3.2, 0, 0],
				bminY: [0, 0, 0, 0],
				bmaxY: [1.5, 1.5, 0, 0],
				bminZ: [-1, -1, 0, 0],
				bmaxZ: [0.5, 0.5, 0, 0],
				childIndices: [~1, ~2, -1, -1],
				parentIndex: 0,
				validChildMask: 0b0011,
				lodTier: 0
			}
		];

		assertMbvh4SupportedDepth(quadNodes);
		const packed = packMbvh4Nodes(quadNodes);
		expect(packed.byteLength).toBe(2 * MBVH4_NODE_STRIDE_BYTES);

		const [hit] = batchTraverseMbvh4Cpu(quadNodes, [
			{ origin: [2.7, 0.75, 5], dir: [0, 0, -1], tMin: 0, tMax: 100 }
		]);
		expect(hit.hitLeafId).toBe(2);
		expect(hit.promotedLodTier).toBe(0);

		const overDeepTree: MBVH4NodeInput[] = Array.from(
			{ length: MBVH4_MAX_SUPPORTED_DEPTH + 1 },
			(_, idx) => ({
				bminX: [-1, 0, 0, 0],
				bmaxX: [1, 0, 0, 0],
				bminY: [-1, 0, 0, 0],
				bmaxY: [1, 0, 0, 0],
				bminZ: [-1, 0, 0, 0],
				bmaxZ: [1, 0, 0, 0],
				childIndices: [idx < MBVH4_MAX_SUPPORTED_DEPTH ? idx + 1 : ~0, -1, -1, -1],
				parentIndex: idx === 0 ? 0 : idx - 1,
				validChildMask: 0b0001,
				lodTier: 0
			})
		);
		expect(() => assertMbvh4SupportedDepth(overDeepTree)).toThrowError(
			`MBVH4_MAX_DEPTH_EXCEEDED:${MBVH4_MAX_SUPPORTED_DEPTH}`
		);

		expect(() =>
			planMultimodalEvidenceUploadJobV1({
				caseId,
				evidenceId,
				sourceSha256: sha256Hex,
				objectBucket: 'legal-evidence',
				objectKey: `evidence/${caseId}/deep-mesh.glb`,
				mimeType: 'model/gltf-binary',
				fileName: 'deep-mesh.glb',
				byteSize: 2048,
				mesh3d: { mbvh4Depth: MBVH4_MAX_SUPPORTED_DEPTH + 1 }
			})
		).toThrowError(`MBVH4_MAX_DEPTH_EXCEEDED:${MBVH4_MAX_SUPPORTED_DEPTH}`);
	});

	it('plans durable video_longform jobs without failing SeaweedFS admission when ffprobe/faster-whisper are absent, and blocks CC-BY-NC-4.0 depth models', () => {
		const videoPlan = planMultimodalEvidenceUploadJobV1({
			caseId,
			evidenceId,
			sourceSha256: sha256Hex,
			objectBucket: 'legal-evidence',
			objectKey: `evidence/${caseId}/cam-042.mp4`,
			mimeType: 'video/mp4',
			fileName: 'cam-042.mp4',
			byteSize: 512_000_000,
			runtimeCapabilities: {
				ffmpegConfigured: true,
				ffprobeConfigured: false,
				fasterWhisperAvailable: false
			},
			video: {
				durationMs: 14_400_000
			}
		});

		expect(videoPlan.modality).toBe('video_longform');
		expect(videoPlan.jobType).toBe('upload_pipeline');
		expect(videoPlan.status).toBe('queued');
		expect(videoPlan.seaweedSourceAdmitted).toBe(true);
		expect(videoPlan.canonicalAuthority).toBe(false);
		expect(videoPlan.writesPerformed).toBe(false);
		expect(videoPlan.sourceRevision).toBe(sourceRevision);
		expect(videoPlan.videoPartitionPlan?.partitionCount).toBe(16);

		const stageMap = Object.fromEntries(videoPlan.stages.map((s) => [s.stageId, s]));
		expect(stageMap.seaweedfs_source_verify.status).toBe('ready');
		expect(stageMap.ffmpeg_dhash_keyframe_cut.status).toBe('ready');
		expect(stageMap.ffprobe_media_probe.status).toBe('blocked_runtime_dependency');
		expect(stageMap.whisper_asr_diarization.status).toBe('blocked_runtime_dependency');

		expect(() =>
			planMultimodalEvidenceUploadJobV1({
				caseId,
				evidenceId,
				sourceSha256: sha256Hex,
				objectBucket: 'legal-evidence',
				objectKey: `evidence/${caseId}/exhibit.png`,
				mimeType: 'image/png',
				fileName: 'exhibit.png',
				byteSize: 10240,
				requestedModality: 'depth_2_5d',
				depth25d: {
					modelId: 'depth-anything/Depth-Anything-V2-Base-hf'
				}
			})
		).toThrowError(
			new MultimodalUploadContractError(
				'MULTIMODAL_MODEL_LICENSE_BLOCKED',
				'NON_COMMERCIAL_LICENSE_BLOCKED'
			)
		);
	});
});
