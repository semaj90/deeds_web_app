import { z } from 'zod/v3';

export const SCENE_RECIPE_MAX_NODES = 100;
export const SCENE_PRIMITIVES_V1 = Object.freeze({
	1: 'cube',
	2: 'uv_sphere',
	3: 'cylinder',
	4: 'cone',
	5: 'torus',
	6: 'billboard',
	7: 'sam_billboard',
});

const finite3 = z.tuple([
	z.number().finite().min(-100000).max(100000),
	z.number().finite().min(-100000).max(100000),
	z.number().finite().min(-100000).max(100000),
]);
const quatXyzw = z.tuple([
	z.number().finite(), z.number().finite(), z.number().finite(), z.number().finite(),
]).refine((q) => Math.abs(Math.hypot(...q) - 1) <= 1e-3, 'Quaternion must be normalized within 1e-3');
const rgba = z.tuple([
	z.number().finite().min(0).max(1), z.number().finite().min(0).max(1),
	z.number().finite().min(0).max(1), z.number().finite().min(0).max(1),
]);
const recipeMetadataValue = z.union([
	z.string().max(256),
	z.number().finite().min(-1e12).max(1e12),
	z.boolean(),
]);
const checkerTexture = z.object({
	kind: z.literal('CHECKER'),
	colorA: rgba,
	colorB: rgba,
	cells: z.number().int().min(2).max(16).default(8),
	resolution: z.number().int().min(32).max(128).default(64),
}).strict();
const transformKeyframe = z.object({
	frame: z.number().int().min(0).max(100_000),
	location: finite3.optional(),
	rotationQuaternion: quatXyzw.optional(),
	scale: z.tuple([
		z.number().finite().positive().max(1000),
		z.number().finite().positive().max(1000),
		z.number().finite().positive().max(1000),
	]).optional(),
}).strict().refine((keyframe) => keyframe.location || keyframe.rotationQuaternion || keyframe.scale, 'Each keyframe must animate at least one transform channel');
const animationTrack = z.object({
	nodeId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
	keyframes: z.array(transformKeyframe).min(2).max(120),
}).strict().refine((track) => new Set(track.keyframes.map((keyframe) => keyframe.frame)).size === track.keyframes.length, 'Keyframe frames must be unique per track');
const boneRecipe = z.object({
	boneId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
	parentBoneId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/).nullable(),
	head: finite3,
	tail: finite3,
}).strict().refine((bone) => Math.hypot(...bone.tail.map((value, index) => value - bone.head[index])) > 1e-6, 'Bone head and tail must differ');
const boneAnimationTrack = z.object({
	boneId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
	keyframes: z.array(transformKeyframe).min(2).max(120),
}).strict().refine((track) => new Set(track.keyframes.map((keyframe) => keyframe.frame)).size === track.keyframes.length, 'Bone keyframe frames must be unique per track');

export const SceneRecipeNodeV1Schema = z.object({
	nodeId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
	primitiveOpCode: z.number().int().min(1).max(7),
	parentIds: z.array(z.string().min(1).max(64)).max(SCENE_RECIPE_MAX_NODES),
	localOffset: finite3,
	scale: z.tuple([
		z.number().finite().positive().max(1000),
		z.number().finite().positive().max(1000),
		z.number().finite().positive().max(1000),
	]),
	/** Spatial object quaternion (x,y,z,w); unrelated to vector-quantization rotations. */
	rotationQuaternion: quatXyzw,
	color: rgba.optional(),
	boneId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/).optional(),
	rigMode: z.enum(['rigid', 'gradient_2bone']).optional(),
	/** Small typed custom properties exported as GLB extras; never evidence authority. */
	metadata: z.record(z.string().min(1).max(32).regex(/^[a-zA-Z][a-zA-Z0-9._-]*$/), recipeMetadataValue)
		.refine((metadata) => Object.keys(metadata).length <= 16, 'Primitive metadata allows at most 16 properties').optional(),
	/** Generated low-resolution texture; never a substitute for source-image evidence. */
	texture: checkerTexture.optional(),
}).strict();

export const SceneRecipeDAGV1Schema = z.object({
	schema: z.literal('parent-atlas.scene-recipe-dag.v1'),
	nodes: z.array(SceneRecipeNodeV1Schema).min(1).max(SCENE_RECIPE_MAX_NODES),
	skeleton: z.object({ bones: z.array(boneRecipe).min(1).max(64) }).strict().optional(),
	/** Bounded object and optional bone transform animation; not Mixamo retargeting or evidence chronology. */
	animation: z.object({
		name: z.string().min(1).max(64).regex(/^[\w .-]+$/),
		fps: z.number().int().min(1).max(120).default(24),
		tracks: z.array(animationTrack).max(SCENE_RECIPE_MAX_NODES).default([]),
		boneTracks: z.array(boneAnimationTrack).max(64).optional(),
	}).strict().optional().refine((animation) => !animation || animation.tracks.length + (animation.boneTracks?.length ?? 0) > 0, 'Animation needs at least one object or bone track'),
}).strict();

function orderSkeletonBones(bones) {
	const byId = new Map();
	for (const bone of bones) {
		if (byId.has(bone.boneId)) throw new Error(`SCENE_RIG_DUPLICATE_BONE:${bone.boneId}`);
		byId.set(bone.boneId, bone);
	}
	const remaining = new Map(bones.map((bone) => [bone.boneId, bone.parentBoneId ? 1 : 0]));
	const children = new Map(bones.map((bone) => [bone.boneId, []]));
	for (const bone of bones) {
		if (bone.parentBoneId === bone.boneId) throw new Error(`SCENE_RIG_SELF_PARENT:${bone.boneId}`);
		if (bone.parentBoneId) {
			if (!byId.has(bone.parentBoneId)) throw new Error(`SCENE_RIG_MISSING_PARENT:${bone.boneId}:${bone.parentBoneId}`);
			children.get(bone.parentBoneId).push(bone.boneId);
		}
	}
	const ready = bones.filter((bone) => remaining.get(bone.boneId) === 0).map((bone) => bone.boneId);
	const ordered = [];
	for (let cursor = 0; cursor < ready.length; cursor++) {
		const id = ready[cursor];
		ordered.push(byId.get(id));
		for (const childId of children.get(id)) {
			remaining.set(childId, remaining.get(childId) - 1);
			if (remaining.get(childId) === 0) ready.push(childId);
		}
	}
	if (ordered.length !== bones.length) throw new Error(`SCENE_RIG_CYCLE:${ordered.length}/${bones.length}`);
	return ordered;
}

/** Validate the bounded DAG and return a stable parent-before-child ordering. */
export function orderSceneRecipeDAGV1(input) {
	const parsed = SceneRecipeDAGV1Schema.parse(input);
	const byId = new Map();
	for (const node of parsed.nodes) {
		if (byId.has(node.nodeId)) throw new Error(`SCENE_RECIPE_DUPLICATE_NODE:${node.nodeId}`);
		byId.set(node.nodeId, node);
	}

	const inDegree = new Map(parsed.nodes.map((node) => [node.nodeId, 0]));
	const children = new Map(parsed.nodes.map((node) => [node.nodeId, []]));
	for (const node of parsed.nodes) {
		const uniqueParents = new Set(node.parentIds);
		if (uniqueParents.size !== node.parentIds.length) throw new Error(`SCENE_RECIPE_DUPLICATE_DEPENDENCY:${node.nodeId}`);
		for (const parentId of uniqueParents) {
			if (!byId.has(parentId)) throw new Error(`SCENE_RECIPE_MISSING_DEPENDENCY:${node.nodeId}:${parentId}`);
			if (parentId === node.nodeId) throw new Error(`SCENE_RECIPE_SELF_DEPENDENCY:${node.nodeId}`);
			inDegree.set(node.nodeId, inDegree.get(node.nodeId) + 1);
			children.get(parentId).push(node.nodeId);
		}
	}

	const ready = parsed.nodes.filter((node) => inDegree.get(node.nodeId) === 0).map((node) => node.nodeId);
	const ordered = [];
	for (let cursor = 0; cursor < ready.length; cursor++) {
		const id = ready[cursor];
		ordered.push(byId.get(id));
		for (const childId of children.get(id)) {
			const remaining = inDegree.get(childId) - 1;
			inDegree.set(childId, remaining);
			if (remaining === 0) ready.push(childId);
		}
	}
	if (ordered.length !== parsed.nodes.length) throw new Error(`SCENE_RECIPE_CYCLE:${ordered.length}/${parsed.nodes.length}`);
	return ordered;
}

/** Convert validated recipes to the existing allow-listed Blender primitive input. */
export function sceneRecipeToBlenderObjectsV1(input) {
	const parsed = SceneRecipeDAGV1Schema.parse(input);
	const ordered = orderSceneRecipeDAGV1(parsed);
	const nodeIds = new Set(ordered.map((node) => node.nodeId));
	const boneIds = new Set((parsed.skeleton?.bones ?? []).map((bone) => bone.boneId));
	orderSkeletonBones(parsed.skeleton?.bones ?? []);
	for (const node of ordered) {
		if (node.boneId && !boneIds.has(node.boneId)) throw new Error(`SCENE_RIG_UNKNOWN_NODE_BONE:${node.nodeId}:${node.boneId}`);
		if (node.boneId && !parsed.skeleton) throw new Error(`SCENE_RIG_SKELETON_REQUIRED:${node.nodeId}`);
	}
	if (parsed.animation) {
		const trackIds = new Set();
		for (const track of parsed.animation.tracks) {
			if (!nodeIds.has(track.nodeId)) throw new Error(`SCENE_ANIMATION_UNKNOWN_NODE:${track.nodeId}`);
			if (trackIds.has(track.nodeId)) throw new Error(`SCENE_ANIMATION_DUPLICATE_TRACK:${track.nodeId}`);
			trackIds.add(track.nodeId);
		}
		const animatedBones = new Set();
		for (const track of parsed.animation.boneTracks ?? []) {
			if (!boneIds.has(track.boneId)) throw new Error(`SCENE_ANIMATION_UNKNOWN_BONE:${track.boneId}`);
			if (animatedBones.has(track.boneId)) throw new Error(`SCENE_ANIMATION_DUPLICATE_BONE_TRACK:${track.boneId}`);
			animatedBones.add(track.boneId);
		}
	}
	const objects = ordered.map((node) => ({
		name: node.nodeId,
		primitive: SCENE_PRIMITIVES_V1[node.primitiveOpCode],
		location: node.localOffset,
		scale: node.scale,
		rotationQuaternion: node.rotationQuaternion,
		color: node.color ?? [0.72, 0.55, 0.2, 1],
		dagParentIds: node.parentIds,
		boneId: node.boneId ?? null,
		rigMode: node.rigMode ?? 'rigid',
		metadata: node.metadata ?? {},
		texture: node.texture ?? null,
	}));
	return objects;
}

export function sceneRecipeSkeletonToBlenderV1(input) {
	const parsed = SceneRecipeDAGV1Schema.parse(input);
	return parsed.skeleton ? { bones: orderSkeletonBones(parsed.skeleton.bones) } : null;
}

export function sceneRecipeAnimationToBlenderV1(input) {
	const parsed = SceneRecipeDAGV1Schema.parse(input);
	if (!parsed.animation) return null;
	const nodeIds = new Set(parsed.nodes.map((node) => node.nodeId));
	for (const track of parsed.animation.tracks) {
		if (!nodeIds.has(track.nodeId)) throw new Error(`SCENE_ANIMATION_UNKNOWN_NODE:${track.nodeId}`);
	}
	return parsed.animation;
}
