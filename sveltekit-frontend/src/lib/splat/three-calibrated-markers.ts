/**
 * Three.js adapter for calibrated splat scenes.
 *
 * The splat frame group carries the calibration transform (scale, yaw, translation).
 * Markers are NOT children of that group. They live in the scene in meters, with scale 1,
 * so a marker's geometry is its real-world size with no transform compensation.
 * No camera-dependent scaling: marker size is the physical object's diameter.
 */
import * as THREE from 'three';
import type { SimilarityTransform } from './calibration.js';
import { markerDiameterM } from './calibration.js';

/** Create a group that carries the splat's calibrated similarity transform. */
export function createCalibratedGroup(t: SimilarityTransform): THREE.Group {
	const group = new THREE.Group();
	group.name = 'splat-calibrated-frame';
	group.scale.setScalar(t.scale);
	group.rotation.set(0, t.yawRad, 0);
	group.position.set(...t.translation);
	return group;
}

export interface EvidenceMarkerSpec {
	id: string;
	/** Real-world size of the object being marked, meters. */
	realSizeM: number;
	/** Position in scene meters (the calibrated world frame). */
	positionM: [number, number, number];
	color?: number;
}

/** Add a marker to a scene in meters. Scale is 1; geometry radius is half the real diameter. */
export function addEvidenceMarker(scene: THREE.Object3D, spec: EvidenceMarkerSpec): THREE.Mesh {
	const diameter = markerDiameterM(spec.realSizeM);
	const geometry = new THREE.SphereGeometry(diameter / 2, 16, 12);
	const material = new THREE.MeshStandardMaterial({ color: spec.color ?? 0xe11d48 });
	const mesh = new THREE.Mesh(geometry, material);
	mesh.name = `marker:${spec.id}`;
	mesh.userData = { evidenceMarkerId: spec.id, realSizeM: spec.realSizeM };
	mesh.position.set(...spec.positionM);
	scene.add(mesh);
	return mesh;
}

/**
 * Measure a marker's diameter in world meters, after all parent transforms.
 * Calibration check: this should equal realSizeM for every marker.
 */
export function measureMarkerWorldDiameterM(mesh: THREE.Mesh): number {
	mesh.geometry.computeBoundingBox();
	const box = mesh.geometry.boundingBox;
	if (!box) return Number.NaN;
	const size = new THREE.Vector3();
	box.getSize(size);
	const worldScale = new THREE.Vector3();
	mesh.getWorldScale(worldScale);
	return size.x * worldScale.x;
}
