import * as THREE from 'three';

import { HOUSE_ROOMS_V1 } from './scene-preview-draft-v1.js';

/** Roofless display layout in scene-local coordinates. All dimensions are authored. */
export function createFourBedroomHouseThreeV1(): THREE.Group {
	const house = new THREE.Group();
	house.name = 'four-bedroom-house-v1';
	const geometry = new THREE.BoxGeometry();
	const materials = new Map<number, THREE.MeshStandardMaterial>();
	function box(parent: THREE.Group, x: number, y: number, z: number, w: number, h: number, d: number, color: number) {
		let material = materials.get(color);
		if (!material) {
			material = new THREE.MeshStandardMaterial({ color, roughness: 0.85 });
			materials.set(color, material);
		}
		const mesh = new THREE.Mesh(geometry, material);
		mesh.position.set(x, y, z);
		mesh.scale.set(w, h, d);
		parent.add(mesh);
	}
	function item(parent: THREE.Group, id: string, label: string, room: string, x = 0, z = 0) {
		const group = new THREE.Group();
		group.name = id;
		group.userData.houseObject = { id, label, room };
		group.position.set(x, 0, z);
		parent.add(group);
		return group;
	}
	const floor = item(house, 'hallway', 'Hallway', 'Hallway');
	box(floor, 0, -0.11, 0, 2, 0.22, 16, 0xba9f79);
	const wallColor = 0xddd9ce;
	for (const [id, label, side, z, furnishing] of HOUSE_ROOMS_V1) {
		const room = item(house, id, label, label, side * 3.5, z);
		room.userData.connectsTo = ['hallway'];
		box(room, 0, -0.1, 0, 5, 0.2, 4, furnishing === 'bed' ? 0xa4b6b2 : 0xcbba9d);
		box(room, side * 2.5, 0.65, 0, 0.14, 1.3, 4, wallColor);
		box(room, 0, 0.65, -2, 5, 1.3, 0.14, wallColor);
		if (z === 6) box(room, 0, 0.65, 2, 5, 1.3, 0.14, wallColor);
		// The two shorter walls leave a 1.2 m opening directly onto the hall.
		for (const offset of [-1.3, 1.3]) box(room, -side * 2.5, 0.65, offset, 0.14, 1.3, 1.4, wallColor);
		box(room, -side * 2.5, 0.015, 0, 0.22, 0.03, 1.2, 0x80674c);

		const furniture = item(room, `${id}-${furnishing}`, ({
			bed: 'Bed', tub: 'Bathtub', counter: 'Kitchen counter', sofa: 'Sofa', table: 'Dining table'
		})[furnishing], label, side * 0.7, -0.55);
		switch (furnishing) {
			case 'bed':
				box(furniture, 0, 0.22, 0, 1.55, 0.44, 2.1, 0x755243);
				box(furniture, 0, 0.51, 0, 1.5, 0.18, 2, 0xd3e1e0);
				box(furniture, 0, 0.64, -0.65, 1.05, 0.1, 0.4, 0xf9f2e8);
				break;
			case 'tub':
				box(furniture, 0, 0.22, 0, 1.65, 0.44, 0.85, 0xe8eeee);
				box(furniture, 0, 0.45, 0, 1.35, 0.04, 0.6, 0xaebfc4);
				break;
			case 'counter':
				box(furniture, 0, 0.43, 0, 2.5, 0.86, 0.65, 0x718d87);
				box(furniture, 0, 0.89, 0, 2.55, 0.06, 0.7, 0xe6dccb);
				break;
			case 'sofa':
				box(furniture, 0, 0.28, 0, 2.4, 0.56, 0.9, 0xb97c58);
				box(furniture, 0, 0.71, -0.33, 2.4, 0.4, 0.23, 0xb97c58);
				break;
			case 'table':
				box(furniture, 0, 0.72, 0, 1.85, 0.12, 1.05, 0x946946);
				for (const x of [-0.75, 0.75]) for (const legZ of [-0.4, 0.4]) {
					box(furniture, x, 0.33, legZ, 0.11, 0.66, 0.11, 0x755243);
				}
				for (const chairZ of [-0.95, 0.95]) {
					const chair = item(room, `${id}-chair-${chairZ < 0 ? '1' : '2'}`, 'Dining chair', label, side * 0.7, chairZ - 0.55);
					box(chair, 0, 0.32, 0, 0.45, 0.12, 0.45, 0x755243);
					box(chair, 0, 0.55, Math.sign(chairZ) * 0.2, 0.45, 0.4, 0.1, 0x755243);
				}
				break;
		}
		if (id === 'bedroom-1') {
			const desk = item(room, 'bedroom-1-desk', 'Desk', label, -1.1, 1.25);
			box(desk, 0, 0.75, 0, 1.4, 0.1, 0.55, 0x946946);
			for (const x of [-0.62, 0.62]) box(desk, x, 0.35, 0, 0.09, 0.7, 0.5, 0x755243);
		}
	}
	box(floor, 0, 0.65, -8, 2, 1.3, 0.14, wallColor);
	return house;
}
