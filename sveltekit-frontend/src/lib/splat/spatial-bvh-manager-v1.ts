import * as THREE from 'three';
import {
	MeshBVH,
	ObjectBVH,
	SkinnedMeshBVH,
	acceleratedRaycast
} from 'three-mesh-bvh';

export interface SpatialBvhInventoryV1 {
	tlasBuilt: boolean;
	staticMeshCount: number;
	skinnedMeshCount: number;
	indexedTriangleCount: number;
}

type OriginalRaycast = THREE.Mesh['raycast'];

/** CPU-side scene picking acceleration. It never owns GPU resources or asset data. */
export class SpatialBvhManagerV1 {
	private roots: THREE.Object3D[] = [];
	private tlas: ObjectBVH | null = null;
	private readonly staticMeshes: THREE.Mesh[] = [];
	private readonly skinnedMeshes: THREE.SkinnedMesh[] = [];
	private readonly skinnedTrees = new Map<THREE.SkinnedMesh, SkinnedMeshBVH>();
	private readonly originalRaycasts = new Map<THREE.Mesh, OriginalRaycast>();
	private readonly ownedGeometryTrees = new Map<THREE.BufferGeometry, MeshBVH>();

	build(root: THREE.Object3D | readonly THREE.Object3D[]): SpatialBvhInventoryV1 {
		this.dispose();
		this.roots = Array.isArray(root) ? [...root] : [root as THREE.Object3D];
		try {
			for (const sceneRoot of this.roots) sceneRoot.updateWorldMatrix(true, true);
			for (const sceneRoot of this.roots) sceneRoot.traverse((object) => {
				if ((object as THREE.SkinnedMesh).isSkinnedMesh) {
					const mesh = object as THREE.SkinnedMesh;
					if (!mesh.geometry || !mesh.geometry.getAttribute('position')) return;
					mesh.skeleton.update();
					mesh.computeBoundingBox();
					this.originalRaycasts.set(mesh, mesh.raycast);
					const tree = new SkinnedMeshBVH(mesh, { indirect: true, verbose: false });
					this.skinnedTrees.set(mesh, tree);
					mesh.raycast = (raycaster, intersections) => tree.raycastObject3D(mesh, raycaster, intersections);
					this.skinnedMeshes.push(mesh);
					return;
				}

				if (!(object as THREE.Mesh).isMesh) return;
				const mesh = object as THREE.Mesh;
				if (!mesh.geometry?.getAttribute('position')) return;
				if (!mesh.geometry.boundsTree) {
					const tree = new MeshBVH(mesh.geometry, { indirect: true, verbose: false });
					mesh.geometry.boundsTree = tree;
					this.ownedGeometryTrees.set(mesh.geometry, tree);
				}
				this.originalRaycasts.set(mesh, mesh.raycast);
				mesh.raycast = acceleratedRaycast;
				this.staticMeshes.push(mesh);
			});

			this.tlas = new ObjectBVH(this.roots);
			return this.inventory;
		} catch (error) {
			// A partially indexed GLB must not leave accelerated raycasts or bounds
			// trees attached when scene admission falls back to the unindexed path.
			this.dispose();
			throw error;
		}
	}

	get inventory(): SpatialBvhInventoryV1 {
		let indexedTriangleCount = 0;
		for (const mesh of [...this.staticMeshes, ...this.skinnedMeshes]) {
			const indexCount = mesh.geometry.index?.count;
			const vertexCount = mesh.geometry.getAttribute('position')?.count ?? 0;
			indexedTriangleCount += Math.floor((indexCount ?? vertexCount) / 3);
		}
		return {
			tlasBuilt: this.tlas !== null,
			staticMeshCount: this.staticMeshes.length,
			skinnedMeshCount: this.skinnedMeshes.length,
			indexedTriangleCount
		};
	}

	raycast(raycaster: THREE.Raycaster): THREE.Intersection[] {
		if (!this.tlas) return [];
		for (const root of this.roots) root.updateWorldMatrix(true, true);
		return this.tlas.raycast(raycaster, []).sort((a, b) => a.distance - b.distance);
	}

	/** Refit deformed skinned geometry and object bounds after animation advances. */
	refit(): void {
		if (!this.tlas) return;
		for (const root of this.roots) root.updateWorldMatrix(true, true);
		for (const [mesh, tree] of this.skinnedTrees) {
			mesh.skeleton.update();
			// ObjectBVH uses the SkinnedMesh's cached object-level box for its
			// broad phase. Refresh it from the current pose before refitting TLAS.
			mesh.computeBoundingBox();
			tree.refit();
		}
		this.tlas.refit();
	}

	dispose(): void {
		for (const [mesh, raycast] of this.originalRaycasts) mesh.raycast = raycast;
		for (const [geometry, tree] of this.ownedGeometryTrees) {
			if (geometry.boundsTree === tree) delete geometry.boundsTree;
		}
		this.tlas = null;
		this.roots = [];
		this.staticMeshes.length = 0;
		this.skinnedMeshes.length = 0;
		this.skinnedTrees.clear();
		this.originalRaycasts.clear();
		this.ownedGeometryTrees.clear();
	}
}
