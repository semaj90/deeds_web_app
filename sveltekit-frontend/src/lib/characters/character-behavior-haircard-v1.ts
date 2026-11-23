/**
 * Parent Atlas Character Haircards, Modular Eye Sockets, Male/Female/Neutral Archetypes,
 * N64 Simple FSM / Behavior Tree, AlphaGo PUCT Scorer & 8 MiB Dedupe Queue (v1)
 *
 * Invariants:
 * - Generated humanoid archetypes and haircard meshes are strictly illustrative
 *   (`GENERATED_ILLUSTRATIVE`) and never establish real-person identity, age, or guilt.
 * - FSM state evaluation is driven deterministically by half-open [startMs, endMs) source-clock intervals.
 * - Weight painting (`JOINTS_0` / `WEIGHTS_0`) is normalized per vertex (sum == 1.0).
 */

import * as THREE from 'three';

// ============================================================================
// 1. Humanoid Proportions (Neutral Forensic, Male, Female Archetypes)
// ============================================================================

export const HUMANOID_ARCHETYPES_V1 = Object.freeze({
	neutral_forensic: {
		id: 'neutral_forensic' as const,
		heightMeters: 1.75,
		shoulderWidthMeters: 0.42,
		hipWidthMeters: 0.34,
		headRadiusMeters: 0.11,
		authority: 'GENERATED_ILLUSTRATIVE' as const
	},
	male_archetype: {
		id: 'male_archetype' as const,
		heightMeters: 1.8,
		shoulderWidthMeters: 0.46,
		hipWidthMeters: 0.33,
		headRadiusMeters: 0.115,
		authority: 'GENERATED_ILLUSTRATIVE' as const
	},
	female_archetype: {
		id: 'female_archetype' as const,
		heightMeters: 1.66,
		shoulderWidthMeters: 0.38,
		hipWidthMeters: 0.37,
		headRadiusMeters: 0.105,
		authority: 'GENERATED_ILLUSTRATIVE' as const
	}
});

export type HumanoidArchetypeIdV1 = keyof typeof HUMANOID_ARCHETYPES_V1;

// ============================================================================
// 2. Modular Eye & Part Socket Registry (`MEM-06`)
// ============================================================================

export const CHARACTER_PART_SOCKETS_V1 = Object.freeze({
	'face.eye.left': { boneName: 'Head', boneIndex: 3, localOffset: [-0.035, 0.02, 0.095] as const },
	'face.eye.right': { boneName: 'Head', boneIndex: 3, localOffset: [0.035, 0.02, 0.095] as const },
	'head.eyelid.upper': { boneName: 'Head', boneIndex: 3, localOffset: [0.0, 0.032, 0.098] as const },
	'head.hair.cards_v1': { boneName: 'Head', boneIndex: 3, localOffset: [0.0, 0.0, 0.0] as const }
});

export type CharacterPartSocketIdV1 = keyof typeof CHARACTER_PART_SOCKETS_V1;

export interface MountedPartReceiptV1 {
	socketId: CharacterPartSocketIdV1;
	boneName: string;
	boneIndex: number;
	partId: string;
	worldPositionOffset: readonly [number, number, number];
}

export function mountModularPartToSocketV1(input: {
	socketId: CharacterPartSocketIdV1;
	partId: string;
	headBoneWorldPosition?: readonly [number, number, number];
}): MountedPartReceiptV1 {
	const socket = CHARACTER_PART_SOCKETS_V1[input.socketId];
	if (!socket) {
		throw new Error(`UNKNOWN_CHARACTER_SOCKET:${input.socketId}`);
	}
	const base = input.headBoneWorldPosition ?? [0, 1.62, 0];
	return {
		socketId: input.socketId,
		boneName: socket.boneName,
		boneIndex: socket.boneIndex,
		partId: input.partId,
		worldPositionOffset: [
			base[0] + socket.localOffset[0],
			base[1] + socket.localOffset[1],
			base[2] + socket.localOffset[2]
		]
	};
}

// ============================================================================
// 3. NVIDIA-Style Curved Quad Haircard Strip Generator & 7-Bone Weight Painting
// ============================================================================

export interface HaircardStripGeometryV1 {
	slotTaxonomy: 'head.hair.cards_v1';
	vertexCount: number;
	triangleCount: number;
	positions: Float32Array;
	normals: Float32Array;
	TEXCOORD_0: Float32Array;
	JOINTS_0: Uint16Array;
	WEIGHTS_0: Float32Array;
	indices: Uint16Array;
}

/**
 * Generates curved low-poly quad haircard strips around the Head bone (bone index 3)
 * with root-to-tip UV coordinates (V=0 at scalp, V=1 at tip) and normalized
 * 2-bone soft weight painting (Head bone 3 + Neck bone 2).
 */
export function generateHaircardStripGeometryV1(
	numStrips = 12,
	radiusMeters = 0.11
): HaircardStripGeometryV1 {
	if (!Number.isInteger(numStrips) || numStrips < 3 || numStrips > 128) {
		throw new RangeError('numStrips must be an integer in 3..128');
	}
	if (!Number.isFinite(radiusMeters) || radiusMeters <= 0) {
		throw new RangeError('radiusMeters must be positive');
	}

	const vertsPerStrip = 6; // 3 vertical rows (v = 0, 0.5, 1.0) * 2 columns
	const trisPerStrip = 4; // 2 quad segments * 2 triangles
	const vertexCount = numStrips * vertsPerStrip;
	const triangleCount = numStrips * trisPerStrip;

	const positions = new Float32Array(vertexCount * 3);
	const normals = new Float32Array(vertexCount * 3);
	const TEXCOORD_0 = new Float32Array(vertexCount * 2);
	const JOINTS_0 = new Uint16Array(vertexCount * 4);
	const WEIGHTS_0 = new Float32Array(vertexCount * 4);
	const indices = new Uint16Array(triangleCount * 3);

	const vCoords = [0.0, 0.5, 1.0] as const;
	let vPtr = 0;
	let iPtr = 0;

	for (let s = 0; s < numStrips; s++) {
		const theta0 = (2 * Math.PI * s) / numStrips;
		const theta1 = (2 * Math.PI * (s + 0.8)) / numStrips;
		const baseVertex = vPtr;

		for (let row = 0; row < vCoords.length; row++) {
			const v = vCoords[row];
			const r = radiusMeters * (1.0 + 0.08 * Math.sin(v * Math.PI));
			const y = 1.68 - v * 0.18;

			// Weight painting: scalp root binds 100% to Head (bone 3); tip blends Head (0.85) + Neck (0.15)
			const headWeight = 1.0 - 0.15 * v;
			const neckWeight = 0.15 * v;

			for (let col = 0; col < 2; col++) {
				const th = col === 0 ? theta0 : theta1;
				const nx = Math.cos(th);
				const nz = Math.sin(th);

				positions[vPtr * 3 + 0] = r * nx;
				positions[vPtr * 3 + 1] = y;
				positions[vPtr * 3 + 2] = r * nz;

				normals[vPtr * 3 + 0] = nx;
				normals[vPtr * 3 + 1] = 0;
				normals[vPtr * 3 + 2] = nz;

				TEXCOORD_0[vPtr * 2 + 0] = (s + col) / numStrips;
				TEXCOORD_0[vPtr * 2 + 1] = v;

				JOINTS_0[vPtr * 4 + 0] = 3; // Head
				JOINTS_0[vPtr * 4 + 1] = 2; // Neck
				JOINTS_0[vPtr * 4 + 2] = 0;
				JOINTS_0[vPtr * 4 + 3] = 0;

				WEIGHTS_0[vPtr * 4 + 0] = headWeight;
				WEIGHTS_0[vPtr * 4 + 1] = neckWeight;
				WEIGHTS_0[vPtr * 4 + 2] = 0;
				WEIGHTS_0[vPtr * 4 + 3] = 0;

				vPtr++;
			}
		}

		for (let seg = 0; seg < 2; seg++) {
			const r0 = baseVertex + seg * 2;
			const r1 = r0 + 2;
			// Triangle 1
			indices[iPtr++] = r0;
			indices[iPtr++] = r0 + 1;
			indices[iPtr++] = r1 + 1;
			// Triangle 2
			indices[iPtr++] = r0;
			indices[iPtr++] = r1 + 1;
			indices[iPtr++] = r1;
		}
	}

	return {
		slotTaxonomy: 'head.hair.cards_v1',
		vertexCount,
		triangleCount,
		positions,
		normals,
		TEXCOORD_0,
		JOINTS_0,
		WEIGHTS_0,
		indices
	};
}

// ============================================================================
// 4. N64 Simple Character FSM, Behavior Tree & AlphaGo-Style PUCT Scorer
// ============================================================================

export const CHARACTER_FSM_STATES_V1 = ['IDLE', 'WALK', 'INSPECT', 'REACH', 'DIALOGUE'] as const;
export type CharacterFsmStateV1 = (typeof CHARACTER_FSM_STATES_V1)[number];

export interface SourceClockFsmCueV1 {
	eventId: string;
	clockId: string;
	startMs: number;
	endMs: number;
	fsmState: CharacterFsmStateV1;
	clipDurationSeconds?: number;
	reviewStatus: 'HUMAN_ACCEPTED' | 'UNREVIEWED_HYPOTHESIS';
}

export interface EvaluatedFsmStateV1 {
	state: CharacterFsmStateV1;
	clipTimeSeconds: number;
	activeEventId: string | null;
	clockId: string;
	reviewStatus: 'HUMAN_ACCEPTED' | 'UNREVIEWED_HYPOTHESIS';
}

/**
 * Evaluates a character's FSM state deterministically at an exact source-clock millisecond timestamp
 * using half-open intervals [startMs, endMs). Never mixes distinct clock domains.
 */
export function evaluateCharacterFsmAtSourceTimeV1(
	clockId: string,
	sourceTimeMs: number,
	cues: readonly SourceClockFsmCueV1[]
): EvaluatedFsmStateV1 {
	for (const cue of cues) {
		if (cue.clockId === clockId && sourceTimeMs >= cue.startMs && sourceTimeMs < cue.endMs) {
			const elapsedSeconds = (sourceTimeMs - cue.startMs) / 1000;
			const duration = Math.max(0.1, cue.clipDurationSeconds ?? 1.0);
			return {
				state: cue.fsmState,
				clipTimeSeconds: elapsedSeconds % duration,
				activeEventId: cue.eventId,
				clockId: cue.clockId,
				reviewStatus: cue.reviewStatus
			};
		}
	}
	return {
		state: 'IDLE',
		clipTimeSeconds: 0,
		activeEventId: null,
		clockId,
		reviewStatus: 'UNREVIEWED_HYPOTHESIS'
	};
}

/**
 * AlphaGo-style PUCT bandit action selector:
 * argmax_a [ Q(s, a) + c_puct * P(s, a) * sqrt(sum_b N(s, b)) / (1 + N(s, a)) ]
 */
export function puctSelectActionV1(input: {
	priors: readonly number[];
	qValues: readonly number[];
	visits: readonly number[];
	cPuct?: number;
}): { actionIndex: number; actionState: CharacterFsmStateV1; puctScore: number } {
	const { priors, qValues, visits } = input;
	const cPuct = input.cPuct ?? 1.41421356;
	if (
		priors.length !== CHARACTER_FSM_STATES_V1.length ||
		qValues.length !== priors.length ||
		visits.length !== priors.length
	) {
		throw new RangeError(`expected ${CHARACTER_FSM_STATES_V1.length} action elements`);
	}

	let totalVisits = 0;
	for (const n of visits) {
		if (!Number.isFinite(n) || n < 0) throw new RangeError('visit count must be non-negative');
		totalVisits += n;
	}
	const sqrtTotal = Math.sqrt(Math.max(1, totalVisits));

	let bestIndex = 0;
	let bestScore = Number.NEGATIVE_INFINITY;

	for (let i = 0; i < priors.length; i++) {
		const u = cPuct * priors[i] * (sqrtTotal / (1 + visits[i]));
		const score = qValues[i] + u;
		if (score > bestScore) {
			bestScore = score;
			bestIndex = i;
		}
	}

	return {
		actionIndex: bestIndex,
		actionState: CHARACTER_FSM_STATES_V1[bestIndex],
		puctScore: bestScore
	};
}

// ============================================================================
// 5. Matrix-to-Hex Wire Codec & 8 MiB N64 Bounded Asset Dedupe Dequeue
// ============================================================================

export function matrix4x4ToHexV1(matrix: Float32Array | readonly number[]): string {
	if (matrix.length !== 16) throw new RangeError('matrix must have 16 floats');
	const f32 = new Float32Array(16);
	for (let i = 0; i < 16; i++) {
		if (!Number.isFinite(matrix[i])) throw new TypeError('nonfinite matrix element');
		f32[i] = matrix[i];
	}
	return Array.from(new Uint8Array(f32.buffer, f32.byteOffset, f32.byteLength), (value) =>
		value.toString(16).padStart(2, '0')
	).join('');
}

export function hexToMatrix4x4V1(hex: string): Float32Array {
	if (typeof hex !== 'string' || !/^[0-9a-f]{128}$/i.test(hex)) {
		throw new TypeError('matrix hex must be 128 hex characters (64 bytes)');
	}
	const bytes = new Uint8Array(64);
	for (let i = 0; i < bytes.length; i++) bytes[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
	const out = new Float32Array(16);
	const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
	for (let i = 0; i < 16; i++) {
		out[i] = view.getFloat32(i * 4, true);
	}
	return out;
}

export interface DedupeQueueRecordV1 {
	objectId: string;
	sha256: string;
	matrixHex: string;
	byteLength: number;
}

export class BoundedAssetDedupeQueueV1 {
	private readonly queue: DedupeQueueRecordV1[] = [];
	private readonly payloadsBySha = new Map<string, Uint8Array>();
	private readonly refCountBySha = new Map<string, number>();
	private residentBytes = 0;
	private dedupeHits = 0;

	constructor(
		public readonly maxBytes = 8 * 1024 * 1024,
		public readonly maxItems = 4096
	) {}

	async admit(objectId: string, payload: Uint8Array, matrix4x4: Float32Array | readonly number[]): Promise<DedupeQueueRecordV1> {
		if (payload.byteLength > this.maxBytes) {
			throw new RangeError('payload exceeds entire 8 MiB N64 budget');
		}
		const digest = await globalThis.crypto.subtle.digest('SHA-256', payload.slice().buffer);
		const sha256 = Array.from(new Uint8Array(digest), (value) => value.toString(16).padStart(2, '0')).join('');
		const matrixHex = matrix4x4ToHexV1(matrix4x4);

		if (this.payloadsBySha.has(sha256)) {
			this.dedupeHits++;
			this.refCountBySha.set(sha256, (this.refCountBySha.get(sha256) ?? 0) + 1);
		} else {
			while (
				(this.residentBytes + payload.byteLength > this.maxBytes || this.queue.length >= this.maxItems) &&
				this.queue.length > 0
			) {
				this.evictOldest();
			}
			this.payloadsBySha.set(sha256, new Uint8Array(payload));
			this.refCountBySha.set(sha256, 1);
			this.residentBytes += payload.byteLength;
		}

		if (this.queue.length >= this.maxItems) {
			this.evictOldest();
		}

		const record: DedupeQueueRecordV1 = {
			objectId,
			sha256,
			matrixHex,
			byteLength: payload.byteLength
		};
		this.queue.push(record);
		return record;
	}

	private evictOldest(): void {
		const evicted = this.queue.shift();
		if (!evicted) return;
		const refs = (this.refCountBySha.get(evicted.sha256) ?? 1) - 1;
		if (refs <= 0) {
			this.refCountBySha.delete(evicted.sha256);
			const bytes = this.payloadsBySha.get(evicted.sha256);
			if (bytes) {
				this.residentBytes -= bytes.byteLength;
				this.payloadsBySha.delete(evicted.sha256);
			}
		} else {
			this.refCountBySha.set(evicted.sha256, refs);
		}
	}

	stats() {
		return {
			queuedInstances: this.queue.length,
			uniqueAssets: this.payloadsBySha.size,
			residentBytes: this.residentBytes,
			dedupeHits: this.dedupeHits,
			maxBytes: this.maxBytes
		};
	}
}

// ============================================================================
// 6. Ontology-Linked Mesh & Actor THREE.AnimationClip Synthesizer
// ============================================================================

export type OntologyAnimationRigModeV1 = 'skinned-7bone' | 'procedural-nodes' | 'prop-mesh';

export interface SynthesizedOntologyClipV1 {
	clipName: string;
	ontologyConceptId: string;
	cueConceptId: string;
	rigMode: OntologyAnimationRigModeV1;
	durationSeconds: number;
	clip: THREE.AnimationClip;
}

function quatFromAxisAngle(ax: number, ay: number, az: number, angleRad: number): [number, number, number, number] {
	const half = angleRad * 0.5;
	const s = Math.sin(half);
	return [ax * s, ay * s, az * s, Math.cos(half)];
}

/**
 * Synthesizes Three.js `AnimationClip` tracks directly from 506-concept Scene Ontology
 * classifications for:
 * - `'skinned-7bone'`: 7-bone armature (`Spine`, `Neck`, `Head`, `ArmL`, `ArmR`, `LegL`, `LegR`)
 * - `'procedural-nodes'`: Node-hierarchy avatar (`Hip`, `Neck`, `ShoulderLeft`, `ShoulderRight`, `HipLeft`, `HipRight`)
 * - `'prop-mesh'`: Composite scene props (`pa:geometry.composite.door-frame`, `pa:geometry.composite.chair`, `pa:geometry.composite.vehicle-proxy`, `pa:actor.component.hair-card`)
 */
export function createOntologyMeshAnimationClipsV1(
	rigMode: OntologyAnimationRigModeV1 = 'skinned-7bone'
): SynthesizedOntologyClipV1[] {
	const times = [0.0, 0.3, 0.6, 0.9, 1.2];
	const duration = 1.2;

	const makeRotTrack = (nodeName: string, axis: [number, number, number], angles: number[]) => {
		const values: number[] = [];
		for (const a of angles) {
			values.push(...quatFromAxisAngle(axis[0], axis[1], axis[2], a));
		}
		return new THREE.QuaternionKeyframeTrack(`${nodeName}.quaternion`, times, values);
	};

	const makePosTrack = (nodeName: string, positions: [number, number, number][]) => {
		const values: number[] = [];
		for (const p of positions) {
			values.push(p[0], p[1], p[2]);
		}
		return new THREE.VectorKeyframeTrack(`${nodeName}.position`, times, values);
	};

	if (rigMode === 'prop-mesh') {
		return [
			{
				clipName: 'DoorSwing',
				ontologyConceptId: 'pa:geometry.composite.door-frame',
				cueConceptId: 'pa:event.cue.interact',
				rigMode,
				durationSeconds: duration,
				clip: new THREE.AnimationClip('DoorSwing', duration, [
					makeRotTrack('DoorHinge', [0, 1, 0], [0, 0.74, 1.48, 0.74, 0])
				])
			},
			{
				clipName: 'ChairPullOut',
				ontologyConceptId: 'pa:geometry.composite.chair',
				cueConceptId: 'pa:event.cue.move',
				rigMode,
				durationSeconds: duration,
				clip: new THREE.AnimationClip('ChairPullOut', duration, [
					makePosTrack('ChairRoot', [
						[0, 0, 0],
						[0, 0, -0.22],
						[0, 0, -0.45],
						[0, 0, -0.22],
						[0, 0, 0]
					])
				])
			},
			{
				clipName: 'VehicleApproach',
				ontologyConceptId: 'pa:geometry.composite.vehicle-proxy',
				cueConceptId: 'pa:event.cue.approach',
				rigMode,
				durationSeconds: duration,
				clip: new THREE.AnimationClip('VehicleApproach', duration, [
					makePosTrack('VehicleRoot', [
						[-6, 0, 0],
						[-4.5, 0, 0],
						[-3, 0, 0],
						[-1.5, 0, 0],
						[0, 0, 0]
					])
				])
			},
			{
				clipName: 'HairCardSway',
				ontologyConceptId: 'pa:actor.component.hair-card',
				cueConceptId: 'pa:event.motion.proposed-trajectory',
				rigMode,
				durationSeconds: duration,
				clip: new THREE.AnimationClip('HairCardSway', duration, [
					makeRotTrack('HairCap', [0, 0, 1], [0, 0.09, 0, -0.09, 0])
				])
			}
		];
	}

	const isSkinned = rigMode === 'skinned-7bone';
	const spineNode = isSkinned ? 'Spine' : 'Hip';
	const neckNode = 'Neck';
	const armLNode = isSkinned ? 'ArmL' : 'ShoulderLeft';
	const armRNode = isSkinned ? 'ArmR' : 'ShoulderRight';
	const legLNode = isSkinned ? 'LegL' : 'HipLeft';
	const legRNode = isSkinned ? 'LegR' : 'HipRight';
	const meshConcept = isSkinned
		? 'pa:geometry.representation.skinned-mesh'
		: 'pa:actor.representation.glb-actor';

	return [
		{
			clipName: 'IDLE',
			ontologyConceptId: meshConcept,
			cueConceptId: 'pa:event.cue.presence',
			rigMode,
			durationSeconds: duration,
			clip: new THREE.AnimationClip('IDLE', duration, [
				makeRotTrack(neckNode, [0, 1, 0], [0, 0.06, 0, -0.06, 0]),
				makeRotTrack(spineNode, [1, 0, 0], [0, 0.025, 0, -0.025, 0])
			])
		},
		{
			clipName: 'WALK',
			ontologyConceptId: meshConcept,
			cueConceptId: 'pa:event.cue.move',
			rigMode,
			durationSeconds: duration,
			clip: new THREE.AnimationClip('WALK', duration, [
				makeRotTrack(armLNode, [1, 0, 0], [0, 0.42, 0, -0.42, 0]),
				makeRotTrack(armRNode, [1, 0, 0], [0, -0.42, 0, 0.42, 0]),
				makeRotTrack(legLNode, [1, 0, 0], [0, -0.45, 0, 0.45, 0]),
				makeRotTrack(legRNode, [1, 0, 0], [0, 0.45, 0, -0.45, 0])
			])
		},
		{
			clipName: 'INSPECT',
			ontologyConceptId: meshConcept,
			cueConceptId: 'pa:event.cue.inspect',
			rigMode,
			durationSeconds: duration,
			clip: new THREE.AnimationClip('INSPECT', duration, [
				makeRotTrack(spineNode, [1, 0, 0], [0, 0.22, 0.35, 0.22, 0]),
				makeRotTrack(neckNode, [1, 0, 0], [0, 0.18, 0.28, 0.18, 0]),
				makeRotTrack(armRNode, [1, 0, 0], [0, -0.5, -0.85, -0.5, 0])
			])
		},
		{
			clipName: 'REACH',
			ontologyConceptId: meshConcept,
			cueConceptId: 'pa:event.cue.interact',
			rigMode,
			durationSeconds: duration,
			clip: new THREE.AnimationClip('REACH', duration, [
				makeRotTrack(armRNode, [1, 0, 0], [0, -0.65, -1.25, -0.65, 0]),
				makeRotTrack(spineNode, [1, 0, 0], [0, 0.1, 0.18, 0.1, 0])
			])
		},
		{
			clipName: 'DIALOGUE',
			ontologyConceptId: meshConcept,
			cueConceptId: 'pa:event.cue.dialogue',
			rigMode,
			durationSeconds: duration,
			clip: new THREE.AnimationClip('DIALOGUE', duration, [
				makeRotTrack(neckNode, [1, 0, 0], [0, 0.12, -0.05, 0.12, 0]),
				makeRotTrack(armLNode, [1, 0, 0], [0, -0.25, -0.4, -0.25, 0]),
				makeRotTrack(armRNode, [1, 0, 0], [0, -0.3, -0.15, -0.3, 0])
			])
		}
	];
}

/**
 * Binds an ontology-synthesized `THREE.AnimationClip` to a Three.js `Object3D` hierarchy
 * and seeks deterministically to `targetTimeSeconds` via `mixer.setTime(t)` without double-advancing.
 */
export function seekOntologyMeshAnimationV1(
	rootObject: THREE.Object3D,
	clip: THREE.AnimationClip,
	targetTimeSeconds: number
): THREE.AnimationMixer {
	const mixer = new THREE.AnimationMixer(rootObject);
	const action = mixer.clipAction(clip);
	action.play();
	const duration = Math.max(0.001, clip.duration);
	const clampedTime = ((targetTimeSeconds % duration) + duration) % duration;
	mixer.setTime(clampedTime);
	rootObject.updateMatrixWorld(true);
	return mixer;
}

