import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { describe, expect, it } from 'vitest';
import { SpatialBvhManagerV1 } from './spatial-bvh-manager-v1.js';

describe('SpatialBvhManagerV1', () => {
	it('builds an object-level tree from disjoint pick targets', () => {
		const nearParent = new THREE.Group();
		const near = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
		nearParent.add(near);
		const farParent = new THREE.Group();
		farParent.position.z = -2;
		const far = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
		farParent.add(far);
		const manager = new SpatialBvhManagerV1();
		const inventory = manager.build([near, far]);
		const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -1));

		expect(inventory).toMatchObject({ tlasBuilt: true, staticMeshCount: 2, indexedTriangleCount: 24 });
		const hits = manager.raycast(raycaster);
		expect(hits[0]?.object).toBe(near);
		expect(hits.some((hit) => hit.object === far)).toBe(true);

		manager.dispose();
		near.geometry.dispose();
		far.geometry.dispose();
		(near.material as THREE.Material).dispose();
		(far.material as THREE.Material).dispose();
	});

	it('uses the object-level tree and preserves original triangle indices', () => {
		const root = new THREE.Group();
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
		mesh.name = 'evidence-proxy';
		root.add(mesh);
		const manager = new SpatialBvhManagerV1();
		const raycaster = new THREE.Raycaster(new THREE.Vector3(0, 0, 3), new THREE.Vector3(0, 0, -1));
		const directHits: THREE.Intersection[] = [];
		mesh.raycast(raycaster, directHits);
		const expectedSourceTriangle = directHits[0]?.faceIndex;
		const inventory = manager.build(root);

		expect(inventory).toMatchObject({ tlasBuilt: true, staticMeshCount: 1, skinnedMeshCount: 0, indexedTriangleCount: 12 });
		const firstHit = manager.raycast(raycaster)[0];
		expect(firstHit?.object).toBe(mesh);
		expect(firstHit?.faceIndex).toBe(expectedSourceTriangle);

		mesh.position.x = 3;
		manager.refit();
		expect(manager.raycast(raycaster)).toHaveLength(0);
		manager.dispose();
		expect(manager.inventory).toMatchObject({ tlasBuilt: false, staticMeshCount: 0 });
		expect(mesh.geometry.boundsTree).toBeUndefined();
		mesh.geometry.dispose();
		mesh.material.dispose();
	});

	it('restores pre-existing raycast handlers and geometry trees on disposal', () => {
		const root = new THREE.Group();
		const mesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshBasicMaterial());
		const originalRaycast = mesh.raycast;
		root.add(mesh);
		const existingTree = new MeshBVH(mesh.geometry);
		mesh.geometry.boundsTree = existingTree;
		const manager = new SpatialBvhManagerV1();
		manager.build(root);
		manager.dispose();
		expect(mesh.raycast).toBe(originalRaycast);
		expect(mesh.geometry.boundsTree).toBe(existingTree);
		mesh.geometry.dispose();
		mesh.material.dispose();
	});

	it('rolls back earlier mesh indexes when a later skinned mesh cannot be indexed', () => {
		const root = new THREE.Group();
		const staticGeometry = new THREE.BoxGeometry(1, 1, 1);
		const staticMesh = new THREE.Mesh(staticGeometry, new THREE.MeshBasicMaterial());
		const originalRaycast = staticMesh.raycast;
		root.add(staticMesh);

		const invalidSkinnedGeometry = new THREE.BufferGeometry();
		invalidSkinnedGeometry.setAttribute('position', new THREE.Float32BufferAttribute([0, 0, 0], 3));
		const invalidSkinnedMesh = new THREE.SkinnedMesh(invalidSkinnedGeometry, new THREE.MeshBasicMaterial());
		root.add(invalidSkinnedMesh);

		const manager = new SpatialBvhManagerV1();
		expect(() => manager.build(root)).toThrow();
		expect(staticMesh.raycast).toBe(originalRaycast);
		expect(staticGeometry.boundsTree).toBeUndefined();
		expect(manager.inventory).toMatchObject({ tlasBuilt: false, staticMeshCount: 0, skinnedMeshCount: 0 });

		staticGeometry.dispose();
		(staticMesh.material as THREE.Material).dispose();
		invalidSkinnedGeometry.dispose();
		(invalidSkinnedMesh.material as THREE.Material).dispose();
	});

	it('refits posed skinned bounds so TLAS picking follows the animated bone', () => {
		const root = new THREE.Group();
		const geometry = new THREE.BufferGeometry();
		geometry.setAttribute('position', new THREE.Float32BufferAttribute([
			-0.5, -0.5, 0,
			0.5, -0.5, 0,
			0, 0.5, 0
		], 3));
		geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute([
			0, 0, 0, 0,
			0, 0, 0, 0,
			0, 0, 0, 0
		], 4));
		geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute([
			1, 0, 0, 0,
			1, 0, 0, 0,
			1, 0, 0, 0
		], 4));
		geometry.setIndex([0, 1, 2]);
		const bone = new THREE.Bone();
		bone.name = 'root';
		const mesh = new THREE.SkinnedMesh(geometry, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
		mesh.add(bone);
		mesh.bind(new THREE.Skeleton([bone]));
		root.add(mesh);
		bone.position.x = 1.5;
		root.updateMatrixWorld(true);

		const manager = new SpatialBvhManagerV1();
		manager.build(root);
		const originalRay = new THREE.Raycaster(new THREE.Vector3(0, 0, 2), new THREE.Vector3(0, 0, -1));
		const initialPoseRay = new THREE.Raycaster(new THREE.Vector3(1.5, 0, 2), new THREE.Vector3(0, 0, -1));
		const movedRay = new THREE.Raycaster(new THREE.Vector3(2, 0, 2), new THREE.Vector3(0, 0, -1));
		expect(manager.raycast(originalRay)).toHaveLength(0);
		expect(manager.raycast(initialPoseRay)[0]?.object).toBe(mesh);

		bone.position.x = 2;
		manager.refit();
		expect(mesh.boundingBox?.max.x).toBeGreaterThan(1.5);
		expect(manager.raycast(originalRay)).toHaveLength(0);
		expect(manager.raycast(movedRay)[0]?.object).toBe(mesh);

		manager.dispose();
		geometry.dispose();
		(mesh.material as THREE.Material).dispose();
	});
});
