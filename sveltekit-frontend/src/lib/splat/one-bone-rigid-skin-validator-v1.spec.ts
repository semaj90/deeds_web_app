import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateOneBoneRigidSkinV1 } from './one-bone-rigid-skin-validator-v1.js';

/** Reads the first skinned primitive's POSITION, JOINTS_0 and WEIGHTS_0 from a GLB (binary chunk only). */
function readGlbSkin(path: string) {
	const b = readFileSync(path);
	const jsonLen = b.readUInt32LE(12);
	const gltf = JSON.parse(b.subarray(20, 20 + jsonLen).toString('utf8'));
	const bin = b.subarray(20 + jsonLen + 8);
	const prim = gltf.meshes.flatMap((m: any) => m.primitives).find((p: any) => p.attributes.JOINTS_0 !== undefined);
	const read = (accIndex: number) => {
		const a = gltf.accessors[accIndex];
		const bv = gltf.bufferViews[a.bufferView];
		const comps = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4 }[a.type as 'SCALAR'];
		const start = (bv.byteOffset ?? 0) + (a.byteOffset ?? 0);
		const n = a.count * comps;
		if (a.componentType === 5126) return Float32Array.from({ length: n }, (_, i) => bin.readFloatLE(start + i * 4));
		if (a.componentType === 5123) return Uint16Array.from({ length: n }, (_, i) => bin.readUInt16LE(start + i * 2));
		if (a.componentType === 5121) return Uint8Array.from({ length: n }, (_, i) => bin[start + i]);
		throw new Error(`unsupported componentType ${a.componentType}`);
	};
	return {
		positions: read(prim.attributes.POSITION),
		skinIndex: read(prim.attributes.JOINTS_0),
		skinWeight: read(prim.attributes.WEIGHTS_0),
		boneCount: gltf.skins[0].joints.length,
	};
}

const positions = [-0.5, -0.5, 0, 0.5, -0.5, 0, 0, 0.5, 0];
const rigidIndex = [2, 0, 0, 0, 2, 0, 0, 0, 2, 0, 0, 0];
const rigidWeight = [1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0];

describe('one-bone rigid skin validator v1 (15.D1)', () => {
	it('accepts a rigid single-bone mesh and reports its bone and bounds', () => {
		const r = validateOneBoneRigidSkinV1({ positions, skinIndex: rigidIndex, skinWeight: rigidWeight, boneCount: 3 });
		expect(r.ok).toBe(true);
		expect(r.boneIndex).toBe(2);
		expect(r.vertexCount).toBe(3);
		expect(r.bounds).toEqual({ min: [-0.5, -0.5, 0], max: [0.5, 0.5, 0] });
	});

	it('rejects a vertex whose primary weight is not one', () => {
		const w = [...rigidWeight]; w[0] = 0.5;
		const r = validateOneBoneRigidSkinV1({ positions, skinIndex: rigidIndex, skinWeight: w, boneCount: 3 });
		expect(r.ok).toBe(false);
		expect(r.reasons).toContain('WEIGHT_NOT_ONE');
		expect(r.boneIndex).toBeNull();
	});

	it('rejects a secondary influence on any vertex', () => {
		const w = [...rigidWeight]; w[1] = 0.2;
		const r = validateOneBoneRigidSkinV1({ positions, skinIndex: rigidIndex, skinWeight: w, boneCount: 3 });
		expect(r.reasons).toContain('SECONDARY_INFLUENCE_PRESENT');
	});

	it('accepts per-part rigid meshes where each vertex has one bone and different vertices use different bones', () => {
		const idx = [...rigidIndex]; idx[4] = 1;
		const r = validateOneBoneRigidSkinV1({ positions, skinIndex: idx, skinWeight: rigidWeight, boneCount: 3 });
		expect(r.ok).toBe(true);
		expect(r.boneIndex).toBeNull();
		expect(r.distinctBoneCount).toBe(2);
	});

	it('rejects a bone index outside the skeleton', () => {
		const idx = [...rigidIndex]; idx[0] = 3;
		const r = validateOneBoneRigidSkinV1({ positions, skinIndex: idx, skinWeight: rigidWeight, boneCount: 3 });
		expect(r.reasons).toContain('BONE_INDEX_OUT_OF_RANGE');
	});

	it('rejects non-finite positions and skin weights', () => {
		const p = [...positions]; p[2] = Number.NaN;
		expect(validateOneBoneRigidSkinV1({ positions: p, skinIndex: rigidIndex, skinWeight: rigidWeight, boneCount: 3 }).reasons).toContain('NON_FINITE_VALUE');
		const w = [...rigidWeight]; w[0] = Number.POSITIVE_INFINITY;
		expect(validateOneBoneRigidSkinV1({ positions, skinIndex: rigidIndex, skinWeight: w, boneCount: 3 }).reasons).toContain('NON_FINITE_VALUE');
	});

	it('rejects mismatched skin attribute lengths', () => {
		const r = validateOneBoneRigidSkinV1({ positions, skinIndex: rigidIndex.slice(0, 8), skinWeight: rigidWeight, boneCount: 3 });
		expect(r.reasons).toContain('SKIN_ATTRIBUTE_LENGTH_MISMATCH');
	});

	it('checks bone inverse matrices when supplied', () => {
		const inv = new Array(3 * 16).fill(0);
		expect(validateOneBoneRigidSkinV1({ positions, skinIndex: rigidIndex, skinWeight: rigidWeight, boneCount: 3, boneInverses: inv }).ok).toBe(true);
		expect(validateOneBoneRigidSkinV1({ positions, skinIndex: rigidIndex, skinWeight: rigidWeight, boneCount: 3, boneInverses: inv.slice(0, 16) }).reasons)
			.toContain('BONE_INVERSE_LENGTH_MISMATCH');
	});

	it('fails closed on an empty mesh', () => {
		const r = validateOneBoneRigidSkinV1({ positions: [], skinIndex: [], skinWeight: [], boneCount: 1 });
		expect(r.ok).toBe(false);
		expect(r.reasons).toContain('VERTEX_COUNT_INVALID');
	});

	it('validates the real rubber-hose actor GLB: rigid per vertex, 19 bones used, no blending', () => {
		const path = join(process.cwd(), 'static', 'models', 'rubber-hose-actor-v1.glb');
		const skin = readGlbSkin(path);
		const r = validateOneBoneRigidSkinV1(skin);
		expect(r.reasons).toEqual([]);
		expect(r.ok).toBe(true);
		expect(r.vertexCount).toBe(3576);
		expect(r.distinctBoneCount).toBe(19);
	});
});
