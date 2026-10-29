/**
 * Explicit part-to-bone table for `half_angel_half_demon_jester.obj` (81 `o` objects, in file order) so each
 * part can be rigidly attached to a `J_Bip_*` bone of `character_alice.glb`.
 *
 * Basis (2026-10-28, measured from the OBJ's per-part bounding boxes, not rendered): every part lies inside the
 * figure's own bounds (nothing is a ground prop; the summoning circle lives in the separate
 * `pentagram_summoned_jester_scene*.obj` files). The figure faces -z (chest diamonds protrude toward -z), so its
 * left side is -x; rotate 180 degrees about Y to face Alice (+z) and that side lands on `J_Bip_L_*`.
 * Anatomy is read from position and shape: 5-20 alternate 27-vertex cones and 79-vertex balls in a ring at the
 * top of the torso (collar ruffle); 25-31 and 32-38 are seven-link chains ending in a 167-vertex sphere (arms);
 * 45-54 and 55-64 are feather and bat-wing strips; 73-80 are seven 52-vertex links plus a 19-vertex tip (tail).
 *
 * Render-verified 2026-10-28 (Blender workbench, parts coloured by index): 21/22 are the red/blue head halves, 23/24
 * the eyes, 25-38 the jester cap's two floppy horns (six links plus a bell each), 39-43 small cones on the cap, 55-56 a
 * staff, 65-68 the arms, 45-54 and 57-64 the two wings. The earlier arm/wing/pouch guesses for 25-43, 55-56 and 65-68
 * were wrong. Still unverified: the left/right side of each pair, which was kept from the x-position reading. Rigid attach (`setParent`) only,
 * no skin weights, so segmented chains move as one piece per bone.
 */
export const JESTER_PART_COUNT = 81;

export const JESTER_PART_BONE_GROUPS: ReadonlyArray<{ parts: readonly number[]; bone: string; why: string }> = [
	{ parts: [0, 1], bone: 'J_Bip_C_Spine', why: 'torso halves (angel, demon), cy 0.38' },
	{ parts: [2, 3, 4], bone: 'J_Bip_C_Chest', why: 'chest diamonds on the front of the torso' },
	{ parts: [5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20], bone: 'J_Bip_C_UpperChest', why: 'collar ruffle ring' },
	{ parts: [21, 22, 23, 24], bone: 'J_Bip_C_Head', why: 'head halves (287 verts each) and the two 119-vertex spheres' },
	{ parts: [44], bone: 'J_Bip_C_Head', why: 'Angelic_Halo' },
	{ parts: [25, 26, 27, 28, 29, 30, 31], bone: 'J_Bip_C_Head', why: 'jester cap horn A: six links and a bell (render-verified 2026-10-28)' },
	{ parts: [32, 33, 34, 35, 36, 37, 38], bone: 'J_Bip_C_Head', why: 'jester cap horn B: six links and a bell (render-verified)' },
	{ parts: [39, 40, 41, 42, 43], bone: 'J_Bip_C_Head', why: 'five small cones on the base of one cap horn (render-verified)' },
	{ parts: [45, 46, 47, 48, 49, 50, 51, 52, 53, 54], bone: 'J_Bip_C_UpperChest', why: 'angel wing: base plus nine feathers' },
	{ parts: [55, 56], bone: 'J_Bip_R_Hand', why: 'long staff with a spear tip (render-verified; was mislabelled demon wing base and claw)' },
	{ parts: [57, 58, 59, 60, 61, 62, 63, 64], bone: 'J_Bip_C_UpperChest', why: 'demon wing strips' },
	{ parts: [65, 66], bone: 'J_Bip_L_UpperArm', why: 'left arm and hand sphere (render-verified; was labelled a pouch)' },
	{ parts: [67, 68], bone: 'J_Bip_R_UpperArm', why: 'right arm and hand sphere (render-verified; was labelled a pouch)' },
	{ parts: [69], bone: 'J_Bip_L_UpperLeg', why: 'left leg (0.74 tall, cy 0.16)' },
	{ parts: [70], bone: 'J_Bip_L_Foot', why: 'left foot (cy 0.04)' },
	{ parts: [71], bone: 'J_Bip_R_UpperLeg', why: 'right leg' },
	{ parts: [72], bone: 'J_Bip_R_Foot', why: 'right foot' },
	{ parts: [73, 74, 75, 76, 77, 78, 79, 80], bone: 'J_Bip_C_Hips', why: 'tail: seven links and tip, rear of the hips' },
];

/** Part index (OBJ `o` order) to bone name. Throws if the table does not cover each part exactly once. */
export function buildJesterPartBoneMap(): Map<number, string> {
	const map = new Map<number, string>();
	for (const g of JESTER_PART_BONE_GROUPS) {
		for (const p of g.parts) {
			if (map.has(p)) throw new Error(`jester part ${p} assigned twice`);
			map.set(p, g.bone);
		}
	}
	for (let p = 0; p < JESTER_PART_COUNT; p++) if (!map.has(p)) throw new Error(`jester part ${p} has no bone`);
	if (map.size !== JESTER_PART_COUNT) throw new Error('jester part table has out-of-range parts');
	return map;
}
