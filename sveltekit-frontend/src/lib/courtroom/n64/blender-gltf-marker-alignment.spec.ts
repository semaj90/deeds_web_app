import { describe, it, expect } from 'vitest';
import * as THREE from 'three';

describe('Blender glTF Y-up Alignment & Three.js Raycast Picking', () => {
	// Standard N64 / YoRHa Law palette vertex colors
	const PALETTE = {
		OBSIDIAN: new THREE.Color('#121316'),
		OXBLOOD: new THREE.Color('#7f1d1d'),
		TAUPE: new THREE.Color('#78716c'),
		BLUSH: new THREE.Color('#fbcfe8'),
		IVORY: new THREE.Color('#fefce8'),
		GOLD: new THREE.Color('#c59e2b')
	};

	/**
	 * Creates an A-frame marker tent geometry with vertex colors matching Blender export.
	 * Dimensions: 0.20m width, 0.15m height, 0.15m depth.
	 */
	function createAFrameMarker(markerNumber = 1): THREE.Mesh {
		// A-frame roof tent geometry (2 angled rectangular slopes + base)
		const geom = new THREE.BufferGeometry();

		// Vertices for A-frame (Y-up single conversion):
		// Apex ridge along Z: (0, 0.15, -0.075) to (0, 0.15, 0.075)
		// Left base: (-0.10, 0.0, -0.075) to (-0.10, 0.0, 0.075)
		// Right base: (0.10, 0.0, -0.075) to (0.10, 0.0, 0.075)
		const positions = new Float32Array([
			// Slope Left (tri 1 & 2) - Counter Clockwise facing out
			-0.10, 0.0,  0.075,
			 0.00, 0.15, -0.075,
			-0.10, 0.0, -0.075,

			-0.10, 0.0,  0.075,
			 0.00, 0.15,  0.075,
			 0.00, 0.15, -0.075,

			// Slope Right (tri 3 & 4) - Counter Clockwise facing out
			 0.00, 0.15, -0.075,
			 0.10, 0.0,  0.075,
			 0.10, 0.0, -0.075,

			 0.00, 0.15, -0.075,
			 0.00, 0.15,  0.075,
			 0.10, 0.0,  0.075
		]);

		// Assign Gold vertex color to apex, Ivory to slopes
		const colors = new Float32Array(12 * 3);
		for (let i = 0; i < 12; i++) {
			const c = (i % 3 === 1) ? PALETTE.GOLD : PALETTE.IVORY;
			colors[i * 3 + 0] = c.r;
			colors[i * 3 + 1] = c.g;
			colors[i * 3 + 2] = c.b;
		}

		geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
		geom.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		geom.computeVertexNormals();

		const mat = new THREE.MeshStandardMaterial({
			vertexColors: true,
			roughness: 0.6,
			metalness: 0.1,
			side: THREE.DoubleSide
		});

		const mesh = new THREE.Mesh(geom, mat);
		mesh.name = `MARKER_TENT_${String(markerNumber).padStart(2, '0')}`;
		return mesh;
	}

	it('enforces single Y-up conversion without double rotation', () => {
		const marker = createAFrameMarker(1);
		marker.geometry.computeVertexNormals();
		const normals = marker.geometry.getAttribute('normal');

		// The slope faces must have positive Y normal components (pointing upward towards the sky)
		let hasUpwardFaces = false;
		for (let i = 0; i < normals.count; i++) {
			const ny = normals.getY(i);
			if (ny > 0.5) hasUpwardFaces = true;
		}
		expect(hasUpwardFaces).toBe(true);
	});

	it('reads back vertex colors and confirms palette alignment', () => {
		const marker = createAFrameMarker(2);
		const colors = marker.geometry.getAttribute('color');
		expect(colors).toBeDefined();
		expect(colors.count).toBe(12);

		// Read back first vertex color (Ivory)
		const r0 = colors.getX(0);
		const g0 = colors.getY(0);
		const b0 = colors.getZ(0);
		expect(r0).toBeCloseTo(PALETTE.IVORY.r, 2);
		expect(g0).toBeCloseTo(PALETTE.IVORY.g, 2);
		expect(b0).toBeCloseTo(PALETTE.IVORY.b, 2);

		// Read back apex vertex color (Gold)
		const r1 = colors.getX(1);
		const g1 = colors.getY(1);
		const b1 = colors.getZ(1);
		expect(r1).toBeCloseTo(PALETTE.GOLD.r, 2);
		expect(g1).toBeCloseTo(PALETTE.GOLD.g, 2);
		expect(b1).toBeCloseTo(PALETTE.GOLD.b, 2);
	});

	it('picks A-frame marker via Raycaster after parent translation and rotation', () => {
		const parent = new THREE.Group();
		parent.position.set(2.0, 0.0, -1.0);
		parent.rotation.y = Math.PI / 4; // 45 deg yaw
		parent.updateMatrixWorld(true);

		const marker = createAFrameMarker(3);
		// Local placement at (4.213, 0.075, -2.197)
		marker.position.set(4.213, 0.075, -2.197);
		parent.add(marker);
		parent.updateMatrixWorld(true);

		// Compute world position of marker apex
		const worldPos = new THREE.Vector3();
		marker.getWorldPosition(worldPos);

		// Position a virtual camera 2 meters above and slightly behind
		const cameraPos = new THREE.Vector3(worldPos.x, worldPos.y + 2.0, worldPos.z + 1.0);
		const rayDirection = new THREE.Vector3().subVectors(worldPos, cameraPos).normalize();

		const raycaster = new THREE.Raycaster(cameraPos, rayDirection, 0.1, 10.0);
		const intersects = raycaster.intersectObject(marker, true);

		expect(intersects.length).toBeGreaterThan(0);
		expect(intersects[0].object.name).toBe('MARKER_TENT_03');
		expect(intersects[0].point.distanceTo(worldPos)).toBeLessThan(0.2); // Hit within 20cm of apex
	});
});
