import { describe, it, expect, beforeEach } from 'vitest';
import * as THREE from 'three';
import { ScenePrimitiveManager, type ScenePrimitiveConfig } from './scene-primitive-sync.js';
import { sceneFsmCache, TRANSFORM_CAPACITY } from './scene-fsm-cache.js';

describe('ScenePrimitiveManager (N64 16 KB Memory Arena Sync)', () => {
	let manager: ScenePrimitiveManager;

	beforeEach(() => {
		manager = new ScenePrimitiveManager();
		manager.clear();
	});

	it('registers primitives and writes 64-byte aligned LOCAL transforms to arena by default', () => {
		const mesh = new THREE.Mesh(
			new THREE.BoxGeometry(0.42, 0.28, 0.02),
			new THREE.MeshBasicMaterial()
		);
		mesh.position.set(4.213, 0.0, -2.197);

		const config: ScenePrimitiveConfig = {
			id: 'EXHIBIT_E002',
			slotIndex: 0,
			type: 'EXHIBIT_OBB',
			mesh,
			metadata: {
				label: 'Bloodstain Decal',
				dimensions: [0.42, 0.28, 0.02],
				sha256: '9cf64920ea705f6f96aec83305e0224d0a94ab9ddb39d63b2472dda6ed37fd5b'
			}
		};

		manager.register(config);

		expect(manager.get('EXHIBIT_E002')).toBeDefined();

		// Verify local matrix elements written to arena offset 0..15
		const storedX = sceneFsmCache.transformArena[12]; // Matrix4 translation X
		const storedY = sceneFsmCache.transformArena[13]; // Matrix4 translation Y
		const storedZ = sceneFsmCache.transformArena[14]; // Matrix4 translation Z

		expect(storedX).toBeCloseTo(4.213, 2);
		expect(storedY).toBeCloseTo(0.0, 2);
		expect(storedZ).toBeCloseTo(-2.197, 2);
	});

	it('throws RangeError when slotIndex exceeds 256-exhibit arena capacity', () => {
		const mesh = new THREE.Object3D();
		expect(() => {
			manager.register({
				id: 'OUT_OF_BOUNDS',
				slotIndex: TRANSFORM_CAPACITY,
				type: 'MARKER_TENT',
				mesh
			});
		}).toThrow(RangeError);
	});

	it('retains child local transform across arena round-trip under translated and rotated parent', () => {
		const parent = new THREE.Group();
		parent.position.set(2, 5, -3);
		parent.rotation.y = Math.PI / 2; // 90 deg rotation around Y
		parent.updateMatrixWorld(true);

		const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
		child.position.set(1, 0, 0); // Local X + 1
		parent.add(child);
		child.updateMatrixWorld(true);

		// With parent at (2, 5, -3) and rotY = 90 deg, local X (+1) rotates to world Z (-1) -> world pos is (2, 5, -4)
		const initialWorldPos = new THREE.Vector3();
		child.getWorldPosition(initialWorldPos);
		expect(initialWorldPos.x).toBeCloseTo(2, 2);
		expect(initialWorldPos.y).toBeCloseTo(5, 2);
		expect(initialWorldPos.z).toBeCloseTo(-4, 2);

		const childConfig: ScenePrimitiveConfig = {
			id: 'CHILD_MARKER',
			slotIndex: 5,
			type: 'MARKER_TENT',
			mesh: child,
			transformSpace: 'local'
		};

		manager.register(childConfig);

		// Arena stores local transform (X=1, Y=0, Z=0)
		const offset = 5 * 16;
		expect(sceneFsmCache.transformArena[offset + 12]).toBeCloseTo(1, 2);
		expect(sceneFsmCache.transformArena[offset + 13]).toBeCloseTo(0, 2);
		expect(sceneFsmCache.transformArena[offset + 14]).toBeCloseTo(0, 2);

		// Mutate child position
		child.position.set(99, 99, 99);
		child.updateMatrix();

		// Restore via syncLocalFromArena (no parent inversion applied!)
		manager.syncLocalFromArena(childConfig);

		// Local position is perfectly restored
		expect(child.position.x).toBeCloseTo(1, 2);
		expect(child.position.y).toBeCloseTo(0, 2);
		expect(child.position.z).toBeCloseTo(0, 2);

		// World position updates correctly under parent
		const restoredWorldPos = new THREE.Vector3();
		child.getWorldPosition(restoredWorldPos);
		expect(restoredWorldPos.x).toBeCloseTo(2, 2);
		expect(restoredWorldPos.y).toBeCloseTo(5, 2);
		expect(restoredWorldPos.z).toBeCloseTo(-4, 2);

		// When parent moves, child world transform updates naturally while local stays identical
		parent.position.set(10, 5, -3);
		parent.updateMatrixWorld(true);
		child.getWorldPosition(restoredWorldPos);
		expect(restoredWorldPos.x).toBeCloseTo(10, 2);
		expect(restoredWorldPos.z).toBeCloseTo(-4, 2);
		expect(child.position.x).toBeCloseTo(1, 2);
	});

	it('respects matrixAutoUpdate flag (true vs false) when writing local matrix to arena', () => {
		const mesh = new THREE.Object3D();
		mesh.matrixAutoUpdate = false;
		mesh.position.set(10, 20, 30);
		// With matrixAutoUpdate=false, mesh.matrix is still identity until manually updated
		manager.writeLocalMatrixToArena(12, mesh);
		expect(sceneFsmCache.transformArena[12 * 16 + 12]).toBeCloseTo(0);

		// Explicit update
		mesh.updateMatrix();
		manager.writeLocalMatrixToArena(12, mesh);
		expect(sceneFsmCache.transformArena[12 * 16 + 12]).toBeCloseTo(10);

		// With matrixAutoUpdate=true, changing position automatically syncs in writeLocalMatrixToArena
		mesh.matrixAutoUpdate = true;
		mesh.position.set(45, 0, 0);
		manager.writeLocalMatrixToArena(12, mesh);
		expect(sceneFsmCache.transformArena[12 * 16 + 12]).toBeCloseTo(45);
	});

	it('supports explicit world transform space with parent inversion via syncWorldFromArena', () => {
		const parent = new THREE.Group();
		parent.position.set(10, 0, 0);
		parent.updateMatrixWorld(true);

		const child = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
		parent.add(child);

		const config: ScenePrimitiveConfig = {
			id: 'WORLD_TEST',
			slotIndex: 14,
			type: 'MARKER_TENT',
			mesh: child,
			transformSpace: 'world'
		};

		// Set world position directly in arena to X=15
		const worldMatrix = new THREE.Matrix4().makeTranslation(15, 0, 0);
		manager.writeMatrixToArena(14, worldMatrix);

		// Sync world matrix back (converts world X=15 under parent X=10 to local X=5)
		manager.syncWorldFromArena(config);

		expect(child.position.x).toBeCloseTo(5, 2);
		const worldPos = new THREE.Vector3();
		child.getWorldPosition(worldPos);
		expect(worldPos.x).toBeCloseTo(15, 2);
	});

	it('returns actual world bounds and transform as an explicitly uncalibrated snapshot', () => {
		const parent = new THREE.Group();
		parent.position.set(2, 0, -1);
		parent.scale.setScalar(2);
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 2, 3), new THREE.MeshBasicMaterial());
		mesh.position.set(1, 0, 0);
		parent.add(mesh);
		manager.register({ id: 'SNAPSHOT_BOX', slotIndex: 8, type: 'FOOTPRINT_CARD', mesh, metadata: { label: 'Fixture box' } });

		const snapshot = manager.getSnapshot('SNAPSHOT_BOX');
		expect(snapshot).toMatchObject({
			id: 'SNAPSHOT_BOX',
			label: 'Fixture box',
			positionMeters: [4, 0, -1],
			dimensionsMeters: [2, 4, 6],
			anchorStatus: 'DEMONSTRATIVE_UNCALIBRATED'
		});
	});

	it('rejects two primitives claiming the same transform slot', () => {
		manager.register({ id: 'FIRST', slotIndex: 9, type: 'MARKER_TENT', mesh: new THREE.Object3D() });
		expect(() => manager.register({ id: 'SECOND', slotIndex: 9, type: 'MARKER_TENT', mesh: new THREE.Object3D() })).toThrow(/already assigned/);
	});

	it('isolates viewer registries and transform arenas during independent teardown', () => {
		const arenaA = new Float32Array(TRANSFORM_CAPACITY * 16);
		const arenaB = new Float32Array(TRANSFORM_CAPACITY * 16);
		const viewerA = new ScenePrimitiveManager(arenaA);
		const viewerB = new ScenePrimitiveManager(arenaB);
		const meshA = new THREE.Object3D();
		const meshB = new THREE.Object3D();
		meshA.position.x = 2;
		meshB.position.x = 9;
		viewerA.register({ id: 'SHARED_SLOT', slotIndex: 3, type: 'MARKER_TENT', mesh: meshA });
		viewerB.register({ id: 'SHARED_SLOT', slotIndex: 3, type: 'MARKER_TENT', mesh: meshB });
		viewerA.focusExhibit('SHARED_SLOT');

		viewerB.clear(false);

		expect(arenaA[3 * 16 + 12]).toBeCloseTo(2);
		expect(arenaB[3 * 16 + 12]).toBeCloseTo(9);
		expect(viewerA.get('SHARED_SLOT')).toBeDefined();
		expect(viewerB.get('SHARED_SLOT')).toBeUndefined();
		expect(sceneFsmCache.activeExhibitId).toBe('SHARED_SLOT');
	});

	it('focusExhibit transitions FSM to INSPECT_EXHIBIT with exhibitId payload', () => {
		const mesh = new THREE.Object3D();
		manager.register({
			id: 'EXHIBIT_E002',
			slotIndex: 0,
			type: 'EXHIBIT_OBB',
			mesh
		});

		manager.focusExhibit('EXHIBIT_E002');

		expect(sceneFsmCache.currentState).toBe('INSPECT_EXHIBIT');
		expect(sceneFsmCache.activeExhibitId).toBe('EXHIBIT_E002');
	});
});
