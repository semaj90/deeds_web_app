/** Browser-side renderer adapter for the versioned scene primitive registry. */
import * as THREE from 'three';
import {
	resolveScenePrimitiveV1, resolveSceneMaterialV1,
	type PrimitiveDetailLevelV1, type SceneMaterialKeyV1, type ScenePrimitiveGeometryV1, type ScenePrimitiveKindV1
} from './scene-primitive-registry-v1.js';
import { triangulateSimplePolygonV1 } from './polygon-prism-validation-v1.js';

function geometryFromRecipe(recipe: ScenePrimitiveGeometryV1): THREE.BufferGeometry {
	switch (recipe.kind) {
		case 'box': return new THREE.BoxGeometry(recipe.width, recipe.height, recipe.depth, recipe.widthSegments, recipe.heightSegments, recipe.depthSegments);
		case 'sphere': return new THREE.SphereGeometry(recipe.radius, recipe.widthSegments, recipe.heightSegments);
		case 'cylinder': return new THREE.CylinderGeometry(recipe.radiusTop, recipe.radiusBottom, recipe.height, recipe.radialSegments, recipe.heightSegments);
		case 'cone': return new THREE.ConeGeometry(recipe.radius, recipe.height, recipe.radialSegments, recipe.heightSegments);
		case 'torus': return new THREE.TorusGeometry(recipe.radius, recipe.tube, recipe.radialSegments, recipe.tubularSegments);
		case 'circle': return new THREE.CircleGeometry(recipe.radius, recipe.segments);
		case 'rectangle': return new THREE.PlaneGeometry(recipe.width, recipe.height);
		case 'polygon-prism': {
			if (!Number.isFinite(recipe.depth) || recipe.depth <= 0) throw new RangeError('polygon prism depth must be positive and finite');
			triangulateSimplePolygonV1(recipe.points);
			// ExtrudeGeometry uses the same bounded source points and supplies closed side walls.
			return new THREE.ExtrudeGeometry(new THREE.Shape(recipe.points.map(([x, y]) => new THREE.Vector2(x, y))), { depth: recipe.depth, bevelEnabled: false, curveSegments: 1 });
		}
	}
}

export function createScenePrimitiveMeshV1(
	kind: ScenePrimitiveKindV1,
	options: { detail?: PrimitiveDetailLevelV1; material?: SceneMaterialKeyV1; name?: string } = {}
): THREE.Mesh {
	const spec = resolveScenePrimitiveV1(kind, options.detail ?? 'retro');
	const palette = resolveSceneMaterialV1(options.material ?? 'ivory');
	const mesh = new THREE.Mesh(geometryFromRecipe(spec.geometry), new THREE.MeshStandardMaterial({ color: palette.color, metalness: palette.metalness, roughness: palette.roughness }));
	mesh.name = options.name ?? `primitive:${kind}`;
	mesh.castShadow = true;
	mesh.receiveShadow = true;
	mesh.userData = { registryRevision: spec.registryRevision, primitiveKind: kind, illustrative: true, calibrated: false };
	return mesh;
}

/** A reusable, deliberately uncalibrated room shell for scene blockouts. */
export function createIllustrativeRoomBlockoutV1(): THREE.Group {
	const room = new THREE.Group();
	room.name = 'illustrative-room-blockout-v1';
	room.userData = { illustrative: true, calibrated: false, sourceDerived: false };
	const floor = createScenePrimitiveMeshV1('box', { material: 'dark-leather', name: 'blockout-floor' });
	floor.scale.set(12, 0.12, 12); floor.position.set(0, -0.08, -3);
	room.add(floor);
	const back = createScenePrimitiveMeshV1('box', { material: 'ivory', name: 'blockout-back-wall' });
	back.scale.set(12, 3.2, 0.12); back.position.set(0, 1.52, -8.8); room.add(back);
	for (const side of [-1, 1]) {
		const wall = createScenePrimitiveMeshV1('box', { material: 'ivory', name: `blockout-side-wall-${side}` });
		wall.scale.set(0.12, 3.2, 11.6); wall.position.set(side * 6, 1.52, -3); room.add(wall);
	}
	return room;
}
