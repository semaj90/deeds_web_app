import * as THREE from 'three';
import { applySceneEventVisibilityV1, type SceneTimedEventV1 } from './scene-event-visibility-v1.js';

export type SceneEnvironmentStyleV1 = 'urban' | 'beach';
export interface TimedSceneNodeV1 { node: THREE.Object3D; event: SceneTimedEventV1 }

function seedFor(x: number, z: number): number {
	let value = (x * 374761393 + z * 668265263) | 0;
	value = Math.imul(value ^ (value >>> 13), 1274126177);
	return (value ^ (value >>> 16)) >>> 0;
}

function random(seed: number): () => number {
	let state = seed >>> 0;
	return () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 0x1_0000_0000; };
}

function putInstance(mesh: THREE.InstancedMesh, index: number, x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw = 0): void {
	const transform = new THREE.Object3D();
	transform.position.set(x, y, z);
	transform.rotation.y = yaw;
	transform.scale.set(sx, sy, sz);
	transform.updateMatrix();
	mesh.setMatrixAt(index, transform.matrix);
}

function ground(size: number, color: number, y = -0.05): THREE.Mesh {
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshStandardMaterial({ color, roughness: 1 }));
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.y = y;
	mesh.receiveShadow = true;
	return mesh;
}

function water(size: number): THREE.Mesh {
	const mesh = new THREE.Mesh(new THREE.PlaneGeometry(size, size * 0.3), new THREE.MeshStandardMaterial({ color: 0x477f91, roughness: 0.55, metalness: 0.05 }));
	mesh.rotation.x = -Math.PI / 2;
	mesh.position.set(0, -0.035, -size * 0.35);
	mesh.name = 'illustrative-water-plane';
	return mesh;
}

/**
 * Build one deterministic, instanced, illustrative environment tile. Static
 * repeated objects are batched here; editable actors stay in ScenePrimitiveManager.
 */
export function createSceneEnvironmentCellThreeV1(
	style: SceneEnvironmentStyleV1,
	tileX: number,
	tileZ: number,
	cellSizeMeters = 32,
	options: { timedEventOverrides?: Readonly<Record<string, SceneTimedEventV1>>; includeDemoBonfire?: boolean } = {}
): { group: THREE.Group; timedNodes: TimedSceneNodeV1[]; instanceCount: number } {
	if (!Number.isInteger(tileX) || !Number.isInteger(tileZ) || !Number.isFinite(cellSizeMeters) || cellSizeMeters < 8 || cellSizeMeters > 512) {
		throw new RangeError('SCENE_ENVIRONMENT_CELL_INPUT_INVALID');
	}
	const group = new THREE.Group();
	group.name = `environment:${style}:${tileX}:${tileZ}`;
	group.position.set(tileX * cellSizeMeters, 0, tileZ * cellSizeMeters);
	group.userData = { illustrative: true, calibrated: false, sourceDerived: false, cellX: tileX, cellZ: tileZ, style };
	group.add(ground(cellSizeMeters, style === 'urban' ? 0x56605b : 0xc9b477));
	const rng = random(seedFor(tileX, tileZ));
	const timedNodes: TimedSceneNodeV1[] = [];
	let instanceCount = 0;

	if (style === 'urban') {
		const count = 18;
		const buildings = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x9b8e77, roughness: 0.92 }), count);
		buildings.name = 'static-building-instances';
		for (let i = 0; i < count; i++) {
			const width = 3 + rng() * 4;
			const depth = 3 + rng() * 4;
			const height = 5 + rng() * 28;
			const x = (rng() - 0.5) * cellSizeMeters * 0.78;
			const z = (rng() - 0.5) * cellSizeMeters * 0.78;
			putInstance(buildings, i, x, height / 2, z, width, height, depth, Math.round(rng() * 3) * Math.PI / 2);
		}
		buildings.instanceMatrix.needsUpdate = true;
		buildings.castShadow = true;
		buildings.receiveShadow = true;
		group.add(buildings);
		const cars = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x596974, roughness: 0.72 }), 8);
		cars.name = 'static-vehicle-instances';
		for (let i = 0; i < 8; i++) putInstance(cars, i, (rng() - 0.5) * cellSizeMeters * 0.9, 0.45, (rng() - 0.5) * cellSizeMeters * 0.9, 1.9, 0.8, 4, Math.round(rng() * 1) * Math.PI / 2);
		cars.instanceMatrix.needsUpdate = true;
		const people = new THREE.InstancedMesh(new THREE.SphereGeometry(0.22, 6, 4), new THREE.MeshStandardMaterial({ color: 0x3d5162, roughness: 0.95 }), 24);
		people.name = 'illustrative-pedestrian-instances';
		const heads = new THREE.InstancedMesh(new THREE.SphereGeometry(0.12, 6, 4), new THREE.MeshStandardMaterial({ color: 0xc49b74, roughness: 0.95 }), 24);
		heads.name = 'illustrative-pedestrian-head-instances';
		for (let i = 0; i < 24; i++) {
			const x = (rng() - 0.5) * cellSizeMeters * 0.72;
			const z = (rng() - 0.5) * cellSizeMeters * 0.72;
			putInstance(people, i, x, 0.82, z, 0.65, 1.6, 0.55, rng() * Math.PI * 2);
			putInstance(heads, i, x, 1.75, z, 0.8, 0.8, 0.8);
		}
		people.instanceMatrix.needsUpdate = true;
		heads.instanceMatrix.needsUpdate = true;
		group.add(cars, people, heads);
		instanceCount += count + 8 + 48;
	} else {
		group.add(water(cellSizeMeters));
		const palms = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.12, 0.22, 1, 6), new THREE.MeshStandardMaterial({ color: 0x725235, roughness: 0.95 }), 10);
		const crowns = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 5), new THREE.MeshStandardMaterial({ color: 0x54734a, roughness: 0.9 }), 10);
		for (let i = 0; i < 10; i++) {
			const x = (rng() - 0.5) * cellSizeMeters * 0.82;
			const z = (rng() - 0.5) * cellSizeMeters * 0.55;
			const height = 3 + rng() * 3;
			putInstance(palms, i, x, height / 2, z, 1, height, 1, rng() * 0.2);
			putInstance(crowns, i, x, height + 0.8, z, 1.7, 0.65, 1.7, rng() * Math.PI);
		}
		palms.instanceMatrix.needsUpdate = true;
		crowns.instanceMatrix.needsUpdate = true;
		group.add(palms, crowns);
		const beachVisitors = new THREE.InstancedMesh(new THREE.SphereGeometry(0.2, 6, 4), new THREE.MeshStandardMaterial({ color: 0x5b5d68, roughness: 0.95 }), 16);
		beachVisitors.name = 'illustrative-beach-visitor-instances';
		for (let i = 0; i < 16; i++) putInstance(beachVisitors, i, (rng() - 0.5) * cellSizeMeters * 0.75, 0.72, (rng() - 0.5) * cellSizeMeters * 0.55, 0.75, 1.45, 0.65, rng() * Math.PI * 2);
		beachVisitors.instanceMatrix.needsUpdate = true;
		group.add(beachVisitors);
		instanceCount += 36;
		if (tileX === 0 && tileZ === 0 && options.includeDemoBonfire !== false) {
			const fire = new THREE.Group();
			fire.name = 'timed-bonfire-illustration';
			const wood = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 1.25, 5), new THREE.MeshStandardMaterial({ color: 0x4d3325, roughness: 1 }));
			wood.rotation.z = Math.PI / 2; wood.rotation.y = 0.35; wood.position.y = 0.08; fire.add(wood);
			const flame = new THREE.Mesh(new THREE.ConeGeometry(0.32, 0.95, 6), new THREE.MeshStandardMaterial({ color: 0xff8b31, emissive: 0xd34b08, emissiveIntensity: 0.8, roughness: 0.8 }));
			flame.position.y = 0.64; fire.add(flame);
			fire.position.set(0, 0, 0);
			const event = options.timedEventOverrides?.['DEMO-BONFIRE-01'] ?? { eventId: 'DEMO-BONFIRE-01', clockId: 'BEACH-CAM-A', startMs: 18_000, endMs: 42_000, status: 'provisional' as const, targetRefs: [{ kind: 'primitive' as const, targetId: 'PROP-BONFIRE-01' }] };
			fire.userData = { illustrative: true, sourceDerived: false, sceneTargetId: 'PROP-BONFIRE-01', temporalStatus: event.status, eventId: event.eventId, clockId: event.clockId, targetRefs: event.targetRefs ?? [] };
			group.add(fire);
			timedNodes.push({ node: fire, event });
		}
	}
	return { group, timedNodes, instanceCount };
}

export function setSceneCellTimeV1(cell: ReturnType<typeof createSceneEnvironmentCellThreeV1>, clockId: string, sourceTimeMs: number): void {
	for (const timed of cell.timedNodes) {
		const targetId = (timed.node.userData.sceneTargetId as string | undefined) ?? '';
		const isBound = timed.event.targetRefs?.some((target) => target.kind !== 'actor' && target.targetId === targetId) ?? false;
		if (!isBound) { timed.node.visible = false; continue; }
		applySceneEventVisibilityV1(timed.node, timed.event, clockId, sourceTimeMs);
	}
}

export function disposeSceneEnvironmentCellThreeV1(group: THREE.Group): void {
	const geometries = new Set<THREE.BufferGeometry>();
	const materials = new Set<THREE.Material>();
	group.traverse((object) => {
		if (object instanceof THREE.Mesh) {
			geometries.add(object.geometry);
			for (const material of Array.isArray(object.material) ? object.material : [object.material]) materials.add(material);
		}
	});
	for (const geometry of geometries) geometry.dispose();
	for (const material of materials) material.dispose();
}
