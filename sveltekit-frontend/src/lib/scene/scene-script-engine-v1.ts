/**
 * Parent Atlas Ground-Plane Snap (`ENG-07`) & Safe Scene Scripting DSL (`ENG-08`)
 *
 * Invariants:
 * - Zero `eval()`, `Function()`, or arbitrary JS execution.
 * - Every choreography action is strictly Zod-validated against `sceneScriptCommandV1Schema`.
 * - `highlight_observation` requires a valid SHA-256 citation; it never promotes an observation to fact.
 * - Ground-plane snap projects markers/proxies cleanly onto terrain surfaces with normal alignment.
 */

import * as THREE from 'three';
import { z } from 'zod';

// ============================================================================
// 1. Ground-Plane Snap & Surface Normal Alignment (`ENG-07`)
// ============================================================================

export interface GroundSnapResultV1 {
	snapped: boolean;
	position: [number, number, number];
	surfaceNormal: [number, number, number];
	quaternionXyzw: [number, number, number, number];
	distanceMeters: number;
}

/**
 * Casts a downward vertical ray from `(x, startY, z)` against `surfaces` and snaps
 * the object to the hit point + `yOffset`, aligning its local `+Y` up-vector with
 * the intersected triangle's world-space surface normal.
 */
export function snapToGroundPlaneV1(input: {
	x: number;
	z: number;
	startY?: number;
	yOffset?: number;
	surfaces: readonly THREE.Object3D[];
}): GroundSnapResultV1 {
	const startY = input.startY ?? 100;
	const yOffset = input.yOffset ?? 0;

	if (input.surfaces.length === 0) {
		return {
			snapped: false,
			position: [input.x, yOffset, input.z],
			surfaceNormal: [0, 1, 0],
			quaternionXyzw: [0, 0, 0, 1],
			distanceMeters: 0
		};
	}

	const raycaster = new THREE.Raycaster(
		new THREE.Vector3(input.x, startY, input.z),
		new THREE.Vector3(0, -1, 0)
	);
	const hits = raycaster.intersectObjects([...input.surfaces], true);
	if (hits.length === 0) {
		return {
			snapped: false,
			position: [input.x, yOffset, input.z],
			surfaceNormal: [0, 1, 0],
			quaternionXyzw: [0, 0, 0, 1],
			distanceMeters: 0
		};
	}

	const hit = hits[0];
	const worldNormal = new THREE.Vector3(0, 1, 0);
	if (hit.face) {
		worldNormal.copy(hit.face.normal);
		const normalMatrix = new THREE.Matrix3().getNormalMatrix(hit.object.matrixWorld);
		worldNormal.applyMatrix3(normalMatrix).normalize();
	}

	const up = new THREE.Vector3(0, 1, 0);
	const quat = new THREE.Quaternion().setFromUnitVectors(up, worldNormal);

	return {
		snapped: true,
		position: [hit.point.x, hit.point.y + yOffset, hit.point.z],
		surfaceNormal: [worldNormal.x, worldNormal.y, worldNormal.z],
		quaternionXyzw: [quat.x, quat.y, quat.z, quat.w],
		distanceMeters: hit.distance
	};
}

// ============================================================================
// 2. Safe Scene Scripting DSL (Zod-Validated AST, Zero `eval`) (`ENG-08`)
// ============================================================================

const sha256Hex = z.string().regex(/^[a-f0-9]{64}$/i, 'Expected SHA-256 hex');
const vec3Schema = z.custom<[number, number, number]>(
	(val) => Array.isArray(val) && val.length === 3 && val.every((n) => typeof n === 'number' && Number.isFinite(n)),
	'Expected finite [x, y, z] tuple'
);

export const sceneScriptActionV1Schema = z.discriminatedUnion('action', [
	z.object({
		action: z.literal('cue_camera'),
		position: vec3Schema,
		lookAt: vec3Schema,
		durationMs: z.number().int().min(0).max(30_000).default(500)
	}).strict(),
	z.object({
		action: z.literal('play_animation'),
		targetId: z.string().min(1).max(128),
		clipName: z.enum(['Stand By', 'Walk', 'Inspect', 'Reach', 'Dialogue', 'Idle']),
		timeSeconds: z.number().finite().min(0).max(86_400).default(0)
	}).strict(),
	z.object({
		action: z.literal('set_visibility'),
		targetId: z.string().min(1).max(128),
		visible: z.boolean()
	}).strict(),
	z.object({
		action: z.literal('highlight_observation'),
		observationId: z.string().min(1).max(128),
		observationSha256: sha256Hex,
		targetId: z.string().min(1).max(128),
		highlightColorHex: z.string().regex(/^#[0-9a-f]{6}$/i).default('#E5A93C')
	}).strict(),
	z.object({
		action: z.literal('place_proxy'),
		proxyId: z.string().min(1).max(128),
		recipeId: z.string().min(1).max(128),
		position: vec3Schema,
		snapToGround: z.boolean().default(true)
	}).strict()
]);

export const sceneScriptProgramV1Schema = z.object({
	schema: z.literal('atlas.scene-script.v1'),
	programId: z.string().min(1).max(128),
	steps: z.array(sceneScriptActionV1Schema).min(1).max(256)
}).strict();

export type SceneScriptActionV1 = z.infer<typeof sceneScriptActionV1Schema>;
export type SceneScriptProgramV1 = z.infer<typeof sceneScriptProgramV1Schema>;

export interface SceneScriptRuntimeAdapterV1 {
	cueCamera(position: [number, number, number], lookAt: [number, number, number], durationMs: number): void;
	playAnimation(targetId: string, clipName: string, timeSeconds: number): void;
	setVisibility(targetId: string, visible: boolean): void;
	highlightObservation(observationId: string, observationSha256: string, targetId: string, colorHex: string): void;
	placeProxy(proxyId: string, recipeId: string, position: [number, number, number], snapToGround: boolean): void;
}

export class SceneScriptEngineV1 {
	execute(rawProgram: unknown, adapter: SceneScriptRuntimeAdapterV1): { stepsExecuted: number; programId: string } {
		const program = sceneScriptProgramV1Schema.parse(rawProgram);
		for (const step of program.steps) {
			switch (step.action) {
				case 'cue_camera':
					adapter.cueCamera(step.position, step.lookAt, step.durationMs);
					break;
				case 'play_animation':
					adapter.playAnimation(step.targetId, step.clipName, step.timeSeconds);
					break;
				case 'set_visibility':
					adapter.setVisibility(step.targetId, step.visible);
					break;
				case 'highlight_observation':
					adapter.highlightObservation(
						step.observationId,
						step.observationSha256,
						step.targetId,
						step.highlightColorHex
					);
					break;
				case 'place_proxy':
					adapter.placeProxy(step.proxyId, step.recipeId, step.position, step.snapToGround);
					break;
			}
		}
		return { stepsExecuted: program.steps.length, programId: program.programId };
	}
}
