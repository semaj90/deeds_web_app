import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { ScenePrimitiveManager } from './scene-primitive-sync.js';
import {
	decodeScenePrimitivePacketV1,
	encodeScenePrimitiveManagerPacketV1,
	encodeScenePrimitivePacketV1,
	mortonTileKeyV1,
	SCENE_PRIMITIVE_PACKET_MAX_BYTES_V1,
	SCENE_PRIMITIVE_PACKET_MAX_INSTANCES_V1,
	selectPrimitiveLodV1,
	tileForWorldPositionV1
} from './scene-primitive-packet-v1.js';

describe('scene primitive packet v1', () => {
	it('round trips bounded centimeter transforms and parent references', () => {
		const packet = encodeScenePrimitivePacketV1([
			{ objectId: 1, kindId: 2, materialId: 3, positionMeters: [1.234, 2, -3.456], dimensionsMeters: [1, 2, 3] },
			{ objectId: 2, kindId: 4, materialId: 0, positionMeters: [0, 0, 0], dimensionsMeters: [0.5, 1, 0.5], parentObjectId: 1 }
		]);
		expect(packet.byteLength).toBe(12 + 2 * 32);
		expect(decodeScenePrimitivePacketV1(packet)).toEqual([
			{ objectId: 1, kindId: 2, materialId: 3, positionMeters: [1.23, 2, -3.46], dimensionsMeters: [1, 2, 3], yawRadians: 0, flags: 0, parentObjectId: null },
			{ objectId: 2, kindId: 4, materialId: 0, positionMeters: [0, 0, 0], dimensionsMeters: [0.5, 1, 0.5], yawRadians: 0, flags: 0, parentObjectId: 1 }
		]);
	});

	it('enforces packet byte cap and rejects duplicate or missing IDs', () => {
		const record = { objectId: 1, kindId: 0, materialId: 0, positionMeters: [0, 0, 0] as const, dimensionsMeters: [1, 1, 1] as const };
		expect(12 + SCENE_PRIMITIVE_PACKET_MAX_INSTANCES_V1 * 32).toBeLessThanOrEqual(SCENE_PRIMITIVE_PACKET_MAX_BYTES_V1);
		expect(() => encodeScenePrimitivePacketV1(Array.from({ length: SCENE_PRIMITIVE_PACKET_MAX_INSTANCES_V1 + 1 }, (_, i) => ({ ...record, objectId: i + 1 })))).toThrow(/BYTE_LIMIT/);
		expect(() => encodeScenePrimitivePacketV1([record, record])).toThrow(/DUPLICATE/);
		const missingParent = encodeScenePrimitivePacketV1([{ ...record, parentObjectId: 9 }]);
		expect(() => decodeScenePrimitivePacketV1(missingParent)).toThrow(/PARENT_MISSING/);
	});

	it('maps manager snapshots into a packet and separate stable-ID sidecar', () => {
		const manager = new ScenePrimitiveManager(new Float32Array(256 * 16));
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3));
		mesh.position.set(16.126, 0, -2.345);
		manager.register({ id: 'wall-1', slotIndex: 0, type: 'EXHIBIT_OBB', mesh, metadata: { label: 'Illustrative wall' } });
		const result = encodeScenePrimitiveManagerPacketV1(manager, {
			tileOriginMeters: [16, 0, -16], objectIdByPrimitiveId: new Map([['wall-1', 41]]),
			kindIdByType: { EXHIBIT_OBB: 1, MARKER_TENT: 2, FOOTPRINT_CARD: 3, ACTOR_PAWN: 4, CAMERA: 5 }
		});
		expect(decodeScenePrimitivePacketV1(result.packet)[0]?.positionMeters).toEqual([0.13, 0, 13.66]);
		expect(result.idSidecar).toEqual([{ objectId: 41, primitiveId: 'wall-1', type: 'EXHIBIT_OBB', label: 'Illustrative wall', anchorStatus: 'DEMONSTRATIVE_UNCALIBRATED' }]);
	});

	it('provides deterministic Morton tiles and screen-size LOD choices', () => {
		expect(tileForWorldPositionV1(-0.1, 16)).toEqual([-1, 1]);
		expect(new Set([mortonTileKeyV1(-1, 1), mortonTileKeyV1(1, -1), mortonTileKeyV1(1, 1)]).size).toBe(3);
		expect(selectPrimitiveLodV1(2, 1, 100).lod).toBe('detailed');
		expect(selectPrimitiveLodV1(1, 100, 100).lod).toBe('retro');
	});
});
