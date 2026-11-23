/**
 * Parent Atlas 8s/20s FFmpeg Keyframe + Depth Anything V2 Small / Video Depth Anything Small
 * Motion Classifier, Q4 Depth Preview Codec (`Q4_RELATIVE_V1`), `atlas.depth-map.v1` Descriptor,
 * Ontology Animation/Mesh Concept Mapper & SPDX License Gate (v1)
 *
 * Invariants:
 * - Only `depth-anything/Depth-Anything-V2-Small-hf` and `depth-anything/Video-Depth-Anything-Small`
 *   (both Apache-2.0) are admitted for production depth; Base/Large variants are CC-BY-NC-4.0 and blocked.
 * - `Q4_RELATIVE_V1` (4-bit quantized relative depth preview tile: 320x180x64 frames = 1.76 MiB) is
 *   distinct from `IQ4_XS` (4.25 bpw GGUF LLM weight quantization on llama-server :8090).
 * - Authoritative derived depth remains `FLOAT32` in SeaweedFS; Q4 is strictly a reversible preview cache.
 */

import { z } from 'zod';
import type { CharacterFsmStateV1, SourceClockFsmCueV1 } from '$lib/characters/character-behavior-haircard-v1.js';

// ============================================================================
// 1. SPDX License Policy & Commercial-Safe Dataset/Model Registry
// ============================================================================

export const SPDX_LICENSE_POLICY_V1 = Object.freeze({
	approved_licenses: ['Apache-2.0', 'MIT', 'BSD-2-Clause', 'BSD-3-Clause', 'BSL-1.0', 'ISC'] as const,
	manual_review: ['LGPL-2.1-or-later', 'LGPL-3.0-or-later'] as const,
	blocked_by_default: ['CC-BY-NC-4.0', 'GPL-2.0-only', 'GPL-3.0-only', 'unknown', 'custom-unreviewed'] as const
});

export type LicenseTierV1 =
	| 'APACHE_2_0'
	| 'MIT'
	| 'BSL_1_0'
	| 'LGPL_2_1_MANUAL_REVIEW'
	| 'PUBLIC_DOMAIN_CC0'
	| 'CC_BY_4_0'
	| 'GEMMA_TERMS'
	| 'CC_BY_NC_4_0_NON_COMMERCIAL'
	| 'NVIDIA_RESEARCH_NON_COMMERCIAL'
	| 'OPENAI_TOS_NON_COMMERCIAL_DISTILLATION';

export const ARTIFACT_LICENSE_REGISTRY_V1: Readonly<
	Record<string, { license: LicenseTierV1; spdx: string; commercialSafe: boolean; notes: string }>
> = Object.freeze({
	// Vision & Depth Models (Apache-2.0 Permitted vs. CC-BY-NC-4.0 Blocked)
	'depth-anything/Depth-Anything-V2-Small-hf': {
		license: 'APACHE_2_0',
		spdx: 'Apache-2.0',
		commercialSafe: true,
		notes: 'Small checkpoint is Apache-2.0; relative_monocular only.'
	},
	'depth-anything/Video-Depth-Anything-Small': {
		license: 'APACHE_2_0',
		spdx: 'Apache-2.0',
		commercialSafe: true,
		notes: 'Temporal Video Depth Anything Small checkpoint is Apache-2.0 (run offline with GPU lease).'
	},
	'depth-anything/Depth-Anything-V2-Base-hf': {
		license: 'CC_BY_NC_4_0_NON_COMMERCIAL',
		spdx: 'CC-BY-NC-4.0',
		commercialSafe: false,
		notes: 'Base and Large checkpoints are CC-BY-NC-4.0 (non-commercial research only).'
	},
	'yolox_nano.onnx': {
		license: 'APACHE_2_0',
		spdx: 'Apache-2.0',
		commercialSafe: true,
		notes: 'Megvii YOLOX Apache-2.0.'
	},
	'facebook/sam2-hiera-tiny': {
		license: 'APACHE_2_0',
		spdx: 'Apache-2.0',
		commercialSafe: true,
		notes: 'Meta SAM 2 code and checkpoints Apache-2.0.'
	},
	'gemma4-legal-iq4xs-direct.gguf': {
		license: 'APACHE_2_0',
		spdx: 'Apache-2.0',
		commercialSafe: true,
		notes: 'Gemma 4 Apache-2.0 base + verified legal merge served on :8090.'
	},

	// Native & Image/Video Dependencies
	'opencv-4.5+': {
		license: 'APACHE_2_0',
		spdx: 'Apache-2.0',
		commercialSafe: true,
		notes: 'OpenCV 4.5+ is Apache-2.0.'
	},
	'boost-cpp': {
		license: 'BSL_1_0',
		spdx: 'BSL-1.0',
		commercialSafe: true,
		notes: 'Boost Software License 1.0 (permissive; prefer C++20 std::span/std::vector first).'
	},
	'ffmpeg-lgpl-2.1': {
		license: 'LGPL_2_1_MANUAL_REVIEW',
		spdx: 'LGPL-2.1-or-later',
		commercialSafe: true,
		notes: 'Verify binary buildconf omits --enable-gpl and --enable-nonfree.'
	},

	// Datasets — Commercial-Safe (Public Domain / MIT / CC-BY-4.0 / First-Party)
	'pile-of-law/pile-of-law': {
		license: 'PUBLIC_DOMAIN_CC0',
		spdx: 'CC0-1.0',
		commercialSafe: true,
		notes: 'US federal/state court opinions, statutes, and regulations.'
	},
	'coastalcph/lex_glue': {
		license: 'CC_BY_4_0',
		spdx: 'CC-BY-4.0',
		commercialSafe: true,
		notes: 'SCOTUS, LEDGAR, CaseHOLD legal benchmarks.'
	},
	'openai/gsm8k': {
		license: 'MIT',
		spdx: 'MIT',
		commercialSafe: true,
		notes: 'MIT-licensed math reasoning dataset for GRPO verifiable rewards.'
	},
	'parent-atlas.qlora-scene-example.v1': {
		license: 'APACHE_2_0',
		spdx: 'Apache-2.0',
		commercialSafe: true,
		notes: 'First-party synthetic 506-concept scene-plan & N64 FSM supervision dataset.'
	},

	// Datasets & Motion Repos — Non-Commercial / Research-Only (Blocked in Production Merge)
	'liuhaotian/LLaVA-Instruct-150K': {
		license: 'CC_BY_NC_4_0_NON_COMMERCIAL',
		spdx: 'CC-BY-NC-4.0',
		commercialSafe: false,
		notes: 'GPT-4 generated supervision; restricted to non-commercial research (CC-BY-NC-4.0).'
	},
	'HuggingFaceH4/CodeAlpaca_20K': {
		license: 'OPENAI_TOS_NON_COMMERCIAL_DISTILLATION',
		spdx: 'custom-unreviewed',
		commercialSafe: false,
		notes: 'text-davinci-003 distilled outputs; subject to OpenAI non-compete/research terms.'
	},
	'Salesforce/xlam-function-calling-60k': {
		license: 'CC_BY_NC_4_0_NON_COMMERCIAL',
		spdx: 'CC-BY-NC-4.0',
		commercialSafe: false,
		notes: 'Licensed under CC-BY-NC-4.0 on HuggingFace.'
	},
	'NVlabs/motionbricks': {
		license: 'NVIDIA_RESEARCH_NON_COMMERCIAL',
		spdx: 'custom-unreviewed',
		commercialSafe: false,
		notes: 'NVIDIA research license; use only in isolated sandbox experiments.'
	},
	'nv-tlabs/kimodo': {
		license: 'NVIDIA_RESEARCH_NON_COMMERCIAL',
		spdx: 'custom-unreviewed',
		commercialSafe: false,
		notes: 'Checkpoint license requires separate non-commercial review.'
	}
});

export function validateArtifactLicenseForQloraMergeV1(
	artifactId: string,
	mode: 'production_merge' | 'research_sandbox' = 'production_merge'
): { admitted: boolean; license: LicenseTierV1 | 'UNKNOWN'; spdx: string; reason: string } {
	const entry = ARTIFACT_LICENSE_REGISTRY_V1[artifactId];
	if (!entry) {
		return { admitted: false, license: 'UNKNOWN', spdx: 'unknown', reason: `UNREGISTERED_ARTIFACT_LICENSE:${artifactId}` };
	}
	if (mode === 'production_merge' && !entry.commercialSafe) {
		return {
			admitted: false,
			license: entry.license,
			spdx: entry.spdx,
			reason: `NON_COMMERCIAL_BLOCKED_IN_PRODUCTION:${artifactId} (${entry.spdx})`
		};
	}
	return { admitted: true, license: entry.license, spdx: entry.spdx, reason: entry.notes };
}

// ============================================================================
// 2. Ontology-Linked Taxonomy Mapping for Animation, Pose & Mesh Creation
// ============================================================================

export const FSM_TO_SCENE_ONTOLOGY_CONCEPTS_V1: Readonly<
	Record<
		CharacterFsmStateV1,
		{
			cueConceptId: string;
			poseConceptId: string;
			motionConceptId: string;
			actorMeshConceptId: string;
		}
	>
> = Object.freeze({
	IDLE: {
		cueConceptId: 'pa:event.cue.presence',
		poseConceptId: 'pa:actor.pose.idle',
		motionConceptId: 'pa:event.motion.static-preview',
		actorMeshConceptId: 'pa:geometry.representation.skinned-mesh'
	},
	WALK: {
		cueConceptId: 'pa:event.cue.move',
		poseConceptId: 'pa:actor.pose.standing',
		motionConceptId: 'pa:event.motion.proposed-trajectory',
		actorMeshConceptId: 'pa:geometry.representation.skinned-mesh'
	},
	INSPECT: {
		cueConceptId: 'pa:event.cue.inspect',
		poseConceptId: 'pa:actor.pose.crouching',
		motionConceptId: 'pa:event.motion.proposed-trajectory',
		actorMeshConceptId: 'pa:geometry.representation.skinned-mesh'
	},
	REACH: {
		cueConceptId: 'pa:event.cue.interact',
		poseConceptId: 'pa:actor.pose.standing',
		motionConceptId: 'pa:event.motion.proposed-trajectory',
		actorMeshConceptId: 'pa:geometry.representation.skinned-mesh'
	},
	DIALOGUE: {
		cueConceptId: 'pa:event.cue.dialogue',
		poseConceptId: 'pa:actor.pose.standing',
		motionConceptId: 'pa:event.motion.static-preview',
		actorMeshConceptId: 'pa:geometry.representation.skinned-mesh'
	}
});

// ============================================================================
// 3. `atlas.depth-map.v1` Descriptor, Q4 Preview Codec (`Q4_RELATIVE_V1`) & Cache Key
// ============================================================================

export const APPROVED_DEPTH_MODELS_V1 = [
	'depth-anything/Depth-Anything-V2-Small-hf',
	'depth-anything/Video-Depth-Anything-Small'
] as const;

export type ApprovedDepthModelIdV1 = (typeof APPROVED_DEPTH_MODELS_V1)[number];

export const atlasDepthMapDescriptorV1Schema = z.object({
	schema: z.literal('atlas.depth-map.v1'),
	evidence_id: z.string().uuid(),
	source_sha256: z.string().regex(/^[0-9a-f]{64}$/i),
	source_revision: z.string().min(1).max(128),
	source_time_ms: z.number().int().nonnegative(),
	analysis_revision: z.string().min(1).max(128),
	model: z.enum(APPROVED_DEPTH_MODELS_V1),
	model_sha256: z.string().regex(/^[0-9a-f]{64}$/i),
	depth_units: z.literal('relative'),
	width: z.number().int().min(1).max(4096),
	height: z.number().int().min(1).max(4096),
	preview_encoding: z.literal('Q4_RELATIVE_V1'),
	archival_encoding: z.literal('FLOAT32'),
	normalization: z.object({
		method: z.literal('sequence-fixed-range'),
		min: z.number().finite(),
		max: z.number().finite()
	}).strict().refine((n) => n.max > n.min, 'normalization max must exceed min'),
	review_status: z.enum(['model_proposed', 'human_reviewed', 'disputed']),
	asset_ref: z.string().min(1).max(200)
}).strict();

export type AtlasDepthMapDescriptorV1 = z.infer<typeof atlasDepthMapDescriptorV1Schema>;

export function depthPreviewCacheKeyV1(input: {
	caseId: string;
	evidenceId: string;
	sourceRevision: string;
	sourceTimeMs: number;
	modelRevision: string;
	preprocessingRevision: string;
	normalizationRevision: string;
	previewCodec?: 'Q4_RELATIVE_V1';
}): string {
	const codec = input.previewCodec ?? 'Q4_RELATIVE_V1';
	return `pa:depth:preview:v1:${input.caseId}:${input.evidenceId}:${input.sourceRevision}:${input.sourceTimeMs}:${input.modelRevision}:${input.preprocessingRevision}:${input.normalizationRevision}:${codec}`;
}

export interface PackedDepthQ4TileV1 {
	packedQ4: Uint8Array;
	validityMaskLsb0: Uint8Array;
	pixelCount: number;
	validCount: number;
	normalization: { min: number; max: number };
}

/**
 * Packs contiguous Float32 relative depth samples into 4-bit `Q4_RELATIVE_V1` preview nibbles
 * (matching C++20 `packDepthQ4`: `packed[i / 2] |= q << ((i % 2) * 4)`) plus a separate
 * LSB0 validity bitset so NaN / infinite / masked-out samples are never conflated with depth 0.
 *
 * Memory savings for 64 frames at 320x180:
 * - R8 (1 byte/pixel): 3.52 MiB
 * - Packed Q4 (0.5 byte/pixel): 1.76 MiB (fits within 8 MiB N64 working set budget)
 */
export function packDepthQ4WithValidityMaskV1(
	depthSamples: Float32Array,
	range?: { min: number; max: number }
): PackedDepthQ4TileV1 {
	const pixelCount = depthSamples.length;
	if (pixelCount === 0) throw new RangeError('depthSamples cannot be empty');

	let min = range?.min ?? Number.POSITIVE_INFINITY;
	let max = range?.max ?? Number.NEGATIVE_INFINITY;

	if (!range) {
		for (let i = 0; i < pixelCount; i++) {
			const v = depthSamples[i];
			if (Number.isFinite(v)) {
				if (v < min) min = v;
				if (v > max) max = v;
			}
		}
		if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
			min = 0.0;
			max = 1.0;
		}
	} else if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
		throw new RangeError('invalid sequence normalization range');
	}

	const span = max - min;
	const packedQ4 = new Uint8Array(Math.ceil(pixelCount / 2));
	const validityMaskLsb0 = new Uint8Array(Math.ceil(pixelCount / 8));
	let validCount = 0;

	for (let i = 0; i < pixelCount; i++) {
		const raw = depthSamples[i];
		if (!Number.isFinite(raw)) continue;
		const normalized = Math.max(0.0, Math.min(1.0, (raw - min) / span));
		const q = Math.round(normalized * 15.0) & 0x0f;
		packedQ4[i >>> 1] |= q << ((i & 1) * 4);
		validityMaskLsb0[i >>> 3] |= 1 << (i & 7);
		validCount++;
	}

	return {
		packedQ4,
		validityMaskLsb0,
		pixelCount,
		validCount,
		normalization: { min, max }
	};
}

/**
 * Unpacks a `Q4_RELATIVE_V1` preview buffer back into an `R8` (`Uint8Array`, 0..255) buffer
 * suitable for a reversible Three.js `DataTexture(RedFormat, UnsignedByteType)` depth overlay.
 * Invalid pixels (where validity bit == 0) are set to 0.
 */
export function unpackDepthQ4ToR8V1(tile: PackedDepthQ4TileV1): Uint8Array {
	const r8 = new Uint8Array(tile.pixelCount);
	for (let i = 0; i < tile.pixelCount; i++) {
		const isValid = (tile.validityMaskLsb0[i >>> 3] & (1 << (i & 7))) !== 0;
		if (!isValid) {
			r8[i] = 0;
			continue;
		}
		const byte = tile.packedQ4[i >>> 1];
		const q = (byte >>> ((i & 1) * 4)) & 0x0f;
		r8[i] = q * 17; // Maps 0..15 linearly to 0..255
	}
	return r8;
}

// ============================================================================
// 4. FFmpeg 8s / 20s Keyframe + Depth Anything V2 Small Motion Classifier
// ============================================================================

export interface KeyframePerceptionSampleV1 {
	frameIndex: number;
	ptsTimeMs: number;
	isSceneCut: boolean;
	dHashHex: string; // 16-char (64-bit) perceptual dHash
	bboxNormalized: readonly [number, number, number, number]; // [x0, y0, x1, y1] in [0, 1]
	relativeDepthMedian01: number; // Depth Anything V2 Small relative_monocular in [0, 1]
	upperBodyMaskDelta01: number; // SAM 2 silhouette upper-limb expansion delta in [0, 1]
	hasTranscriptSpeech: boolean; // :8095 NLP transcript alignment active at this PTS
}

export interface ClassifyVideoClipMotionInputV1 {
	evidenceId: string;
	sourceRevision: string;
	clipWindowSeconds: 8 | 20;
	depthModelId: string;
	keyframes: readonly KeyframePerceptionSampleV1[];
}

export interface ClassifiedOntologyMotionCueV1 extends SourceClockFsmCueV1 {
	cueConceptId: string;
	poseConceptId: string;
	motionConceptId: string;
	actorMeshConceptId: string;
}

export interface ClassifyVideoClipMotionOutputV1 {
	clockId: string;
	clipWindowSeconds: 8 | 20;
	depthAuthority: 'RELATIVE_MONOCULAR_ORDERING_ONLY';
	dedupedKeyframeCount: number;
	droppedDuplicateFrames: number;
	proposedFsmCues: ClassifiedOntologyMotionCueV1[];
}

function hammingDistanceHex64(hexA: string, hexB: string): number {
	const a = BigInt(`0x${hexA}`);
	const b = BigInt(`0x${hexB}`);
	let xor = a ^ b;
	let bits = 0;
	while (xor > 0n) {
		xor &= xor - 1n;
		bits++;
	}
	return bits;
}

/**
 * Classifies an 8-second or 20-second FFmpeg keyframe window into N64 FSM motion proposals
 * (`IDLE`, `WALK`, `INSPECT`, `REACH`, `DIALOGUE`) linked directly to the 506-concept
 * Scene Ontology (`pa:event.cue.*`, `pa:actor.pose.*`, `pa:event.motion.*`).
 */
export function classifyVideoClipMotionV1(
	input: ClassifyVideoClipMotionInputV1
): ClassifyVideoClipMotionOutputV1 {
	if (!APPROVED_DEPTH_MODELS_V1.includes(input.depthModelId as ApprovedDepthModelIdV1)) {
		throw new Error(`UNAPPROVED_DEPTH_MODEL:${input.depthModelId}`);
	}
	if (input.clipWindowSeconds !== 8 && input.clipWindowSeconds !== 20) {
		throw new RangeError('clipWindowSeconds must be 8 or 20 (SCENE-DEC-A)');
	}
	if (input.keyframes.length < 2) {
		throw new RangeError('at least 2 keyframes are required to classify motion');
	}

	const clockId = `evidence:${input.evidenceId}`;
	const maxWindowMs = input.clipWindowSeconds * 1000;
	const startPtsMs = input.keyframes[0].ptsTimeMs;

	const deduped: KeyframePerceptionSampleV1[] = [];
	let droppedDuplicateFrames = 0;

	for (let i = 0; i < input.keyframes.length; i++) {
		const kf = input.keyframes[i];
		if (kf.ptsTimeMs - startPtsMs > maxWindowMs) break;
		if (
			i > 0 &&
			i < input.keyframes.length - 1 &&
			!kf.isSceneCut &&
			deduped.length > 0 &&
			hammingDistanceHex64(deduped[deduped.length - 1].dHashHex, kf.dHashHex) <= 2
		) {
			droppedDuplicateFrames++;
			continue;
		}
		deduped.push(kf);
	}

	const proposedFsmCues: ClassifiedOntologyMotionCueV1[] = [];

	for (let i = 0; i < deduped.length - 1; i++) {
		const curr = deduped[i];
		const next = deduped[i + 1];
		if (next.ptsTimeMs <= curr.ptsTimeMs) {
			throw new RangeError('keyframes must be strictly monotonic in ptsTimeMs');
		}

		const cx0 = 0.5 * (curr.bboxNormalized[0] + curr.bboxNormalized[2]);
		const cy0 = 0.5 * (curr.bboxNormalized[1] + curr.bboxNormalized[3]);
		const cx1 = 0.5 * (next.bboxNormalized[0] + next.bboxNormalized[2]);
		const cy1 = 0.5 * (next.bboxNormalized[1] + next.bboxNormalized[3]);

		const lateralDelta = Math.hypot(cx1 - cx0, cy1 - cy0);
		const depthDelta = Math.abs(next.relativeDepthMedian01 - curr.relativeDepthMedian01);
		const reachDelta = next.upperBodyMaskDelta01;
		const h0 = curr.bboxNormalized[3] - curr.bboxNormalized[1];
		const h1 = next.bboxNormalized[3] - next.bboxNormalized[1];
		const crouchTilt = h0 > 0 ? (h0 - h1) / h0 : 0;

		let fsmState: CharacterFsmStateV1 = 'IDLE';
		if (lateralDelta >= 0.08 || depthDelta >= 0.12) {
			fsmState = 'WALK';
		} else if (reachDelta >= 0.25) {
			fsmState = 'REACH';
		} else if (crouchTilt >= 0.15) {
			fsmState = 'INSPECT';
		} else if (next.hasTranscriptSpeech) {
			fsmState = 'DIALOGUE';
		}

		const ontologyMapping = FSM_TO_SCENE_ONTOLOGY_CONCEPTS_V1[fsmState];
		const prevCue = proposedFsmCues[proposedFsmCues.length - 1];
		if (prevCue && prevCue.fsmState === fsmState && prevCue.endMs === curr.ptsTimeMs) {
			prevCue.endMs = next.ptsTimeMs;
		} else {
			proposedFsmCues.push({
				eventId: `evt:motion_${input.evidenceId.slice(0, 8)}_${proposedFsmCues.length}`,
				clockId,
				startMs: curr.ptsTimeMs,
				endMs: next.ptsTimeMs,
				fsmState,
				clipDurationSeconds: 1.2,
				reviewStatus: 'UNREVIEWED_HYPOTHESIS',
				...ontologyMapping
			});
		}
	}

	return {
		clockId,
		clipWindowSeconds: input.clipWindowSeconds,
		depthAuthority: 'RELATIVE_MONOCULAR_ORDERING_ONLY',
		dedupedKeyframeCount: deduped.length,
		droppedDuplicateFrames,
		proposedFsmCues
	};
}
