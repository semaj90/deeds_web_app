import test from 'node:test';
import assert from 'node:assert/strict';
import { orderSceneRecipeDAGV1, sceneRecipeAnimationToBlenderV1, sceneRecipeSkeletonToBlenderV1, sceneRecipeToBlenderObjectsV1 } from './scene-recipe-dag-v1.mjs';

const node = (nodeId, parentIds = [], primitiveOpCode = 1) => ({
	nodeId,
	primitiveOpCode,
	parentIds,
	localOffset: [0, 0, 0],
	scale: [1, 1, 1],
	rotationQuaternion: [0, 0, 0, 1],
});
const dag = (nodes) => ({ schema: 'parent-atlas.scene-recipe-dag.v1', nodes });

test('orders recipes parent-first and maps validated primitive codes to Blender inputs', () => {
	const ordered = orderSceneRecipeDAGV1(dag([
		node('marker', ['surface'], 3),
		node('surface', ['ground'], 1),
		node('ground', [], 4),
	]));
	assert.deepEqual(ordered.map(({ nodeId }) => nodeId), ['ground', 'surface', 'marker']);
	const objects = sceneRecipeToBlenderObjectsV1(dag([
		node('marker', ['surface'], 3), node('surface', [], 1),
	]));
	assert.deepEqual(objects.map(({ name, primitive, dagParentIds }) => ({ name, primitive, dagParentIds })), [
		{ name: 'surface', primitive: 'cube', dagParentIds: [] },
		{ name: 'marker', primitive: 'cylinder', dagParentIds: ['surface'] },
	]);
});

test('rejects missing, duplicate, and self dependencies before Blender is invoked', () => {
	assert.throws(() => orderSceneRecipeDAGV1(dag([node('child', ['missing'])])), /SCENE_RECIPE_MISSING_DEPENDENCY/);
	assert.throws(() => orderSceneRecipeDAGV1(dag([node('same'), node('same')])), /SCENE_RECIPE_DUPLICATE_NODE/);
	assert.throws(() => orderSceneRecipeDAGV1(dag([node('self', ['self'])])), /SCENE_RECIPE_SELF_DEPENDENCY/);
});

test('rejects cycles, unnormalized quaternions, and recipes over the node bound', () => {
	assert.throws(() => orderSceneRecipeDAGV1(dag([node('a', ['b']), node('b', ['a'])])), /SCENE_RECIPE_CYCLE/);
	const malformed = node('bad');
	malformed.rotationQuaternion = [0, 0, 0, 2];
	assert.throws(() => orderSceneRecipeDAGV1(dag([malformed])), /Quaternion must be normalized/);
	assert.throws(() => orderSceneRecipeDAGV1(dag(Array.from({ length: 101 }, (_, i) => node(`n${i}`)))), /at most 100/);
});

test('maps bounded transform keyframes for known recipe nodes to the Blender bridge', () => {
	const recipe = dag([node('evidence-marker')]);
	recipe.animation = {
		name: 'marker-pulse',
		fps: 24,
		tracks: [{ nodeId: 'evidence-marker', keyframes: [
			{ frame: 0, scale: [1, 1, 1] },
			{ frame: 12, scale: [1.1, 1.1, 1.1], location: [0, 0.1, 0] },
		] }],
	};
	assert.deepEqual(sceneRecipeAnimationToBlenderV1(recipe), recipe.animation);
	assert.equal(sceneRecipeToBlenderObjectsV1(recipe).length, 1);
});

test('rejects unknown, duplicate, empty, and over-bound animation tracks before Blender starts', () => {
	const unknown = dag([node('known')]);
	unknown.animation = { name: 'clip', tracks: [{ nodeId: 'missing', keyframes: [{ frame: 0, location: [0, 0, 0] }, { frame: 1, location: [1, 0, 0] }] }] };
	assert.throws(() => sceneRecipeToBlenderObjectsV1(unknown), /SCENE_ANIMATION_UNKNOWN_NODE/);
	const duplicate = dag([node('known')]);
	duplicate.animation = { name: 'clip', tracks: [
		{ nodeId: 'known', keyframes: [{ frame: 0, location: [0, 0, 0] }, { frame: 1, location: [1, 0, 0] }] },
		{ nodeId: 'known', keyframes: [{ frame: 0, scale: [1, 1, 1] }, { frame: 2, scale: [2, 2, 2] }] },
	] };
	assert.throws(() => sceneRecipeToBlenderObjectsV1(duplicate), /SCENE_ANIMATION_DUPLICATE_TRACK/);
	const empty = dag([node('known')]);
	empty.animation = { name: 'clip', tracks: [{ nodeId: 'known', keyframes: [] }] };
	assert.throws(() => sceneRecipeToBlenderObjectsV1(empty));
	const tooMany = dag([node('known')]);
	tooMany.animation = { name: 'clip', tracks: [{ nodeId: 'known', keyframes: Array.from({ length: 121 }, (_, frame) => ({ frame, location: [frame, 0, 0] })) }] };
	assert.throws(() => sceneRecipeToBlenderObjectsV1(tooMany));
});

test('builds a parent-first generic skeleton and assigns primitive nodes to named bones', () => {
	const recipe = dag([
		{ ...node('hand'), boneId: 'hand' },
		{ ...node('body'), boneId: 'root' },
	]);
	recipe.skeleton = { bones: [
		{ boneId: 'hand', parentBoneId: 'root', head: [0, 1, 0], tail: [0.25, 1, 0] },
		{ boneId: 'root', parentBoneId: null, head: [0, 0, 0], tail: [0, 1, 0] },
	] };
	recipe.animation = {
		name: 'raise-hand', fps: 24, tracks: [],
		boneTracks: [{ boneId: 'hand', keyframes: [
			{ frame: 0, rotationQuaternion: [0, 0, 0, 1] },
			{ frame: 24, rotationQuaternion: [0, 0, 0.3826834, 0.9238795] },
		] }],
	};
	assert.deepEqual(sceneRecipeSkeletonToBlenderV1(recipe).bones.map((bone) => bone.boneId), ['root', 'hand']);
	assert.deepEqual(sceneRecipeToBlenderObjectsV1(recipe).map(({ name, boneId }) => ({ name, boneId })), [
		{ name: 'hand', boneId: 'hand' }, { name: 'body', boneId: 'root' },
	]);
	assert.equal(sceneRecipeAnimationToBlenderV1(recipe).boneTracks[0].boneId, 'hand');
});

test('rejects rig cycles, missing parents, unknown node bones, and unknown animation bones', () => {
	const withSkeleton = (bones, nodes = [node('body')]) => ({ ...dag(nodes), skeleton: { bones } });
	const bone = (boneId, parentBoneId = null) => ({ boneId, parentBoneId, head: [0, 0, 0], tail: [0, 1, 0] });
	assert.throws(() => sceneRecipeSkeletonToBlenderV1(withSkeleton([bone('a', 'b'), bone('b', 'a')])), /SCENE_RIG_CYCLE/);
	assert.throws(() => sceneRecipeSkeletonToBlenderV1(withSkeleton([bone('a', 'missing')])), /SCENE_RIG_MISSING_PARENT/);
	assert.throws(() => sceneRecipeToBlenderObjectsV1(withSkeleton([bone('root')], [{ ...node('body'), boneId: 'missing' }])), /SCENE_RIG_UNKNOWN_NODE_BONE/);
	const badTrack = withSkeleton([bone('root')]);
	badTrack.animation = { name: 'bad', tracks: [], boneTracks: [{ boneId: 'missing', keyframes: [{ frame: 0, rotationQuaternion: [0, 0, 0, 1] }, { frame: 1, rotationQuaternion: [0, 0, 0, 1] }] }] };
	assert.throws(() => sceneRecipeToBlenderObjectsV1(badTrack), /SCENE_ANIMATION_UNKNOWN_BONE/);
});
