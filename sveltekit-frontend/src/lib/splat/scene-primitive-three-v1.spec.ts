import { describe, expect, it } from 'vitest';
import { BoxGeometry, CircleGeometry, ConeGeometry, CylinderGeometry, ExtrudeGeometry, PlaneGeometry, SphereGeometry, TorusGeometry } from 'three';
import { createIllustrativeRoomBlockoutV1, createScenePrimitiveMeshV1 } from './scene-primitive-three-v1.js';

describe('scene primitive Three.js adapter', () => {
	it('renders registry primitives and marks them illustrative', () => {
		const box = createScenePrimitiveMeshV1('box');
		const sphere = createScenePrimitiveMeshV1('sphere');
		const circle = createScenePrimitiveMeshV1('circle');
		const rectangle = createScenePrimitiveMeshV1('rectangle');
		const cylinder = createScenePrimitiveMeshV1('cylinder');
		const cone = createScenePrimitiveMeshV1('cone');
		const torus = createScenePrimitiveMeshV1('torus');
		expect(box.geometry).toBeInstanceOf(BoxGeometry);
		expect(sphere.geometry).toBeInstanceOf(SphereGeometry);
		expect(circle.geometry).toBeInstanceOf(CircleGeometry);
		expect(rectangle.geometry).toBeInstanceOf(PlaneGeometry);
		expect(cylinder.geometry).toBeInstanceOf(CylinderGeometry);
		expect(cone.geometry).toBeInstanceOf(ConeGeometry);
		expect(torus.geometry).toBeInstanceOf(TorusGeometry);
		expect(box.userData).toMatchObject({ illustrative: true, calibrated: false });
	});

	it('creates a schematic room from the same registry primitives', () => {
		const room = createIllustrativeRoomBlockoutV1();
		expect(room.children).toHaveLength(4);
		expect(room.userData).toMatchObject({ illustrative: true, calibrated: false, sourceDerived: false });
	});

	it('validates polygon recipes before producing an extruded mesh', () => {
		const hexagon = createScenePrimitiveMeshV1('hexagon');
		expect(hexagon.geometry).toBeInstanceOf(ExtrudeGeometry);
		expect(hexagon.userData.primitiveKind).toBe('hexagon');
	});
});
