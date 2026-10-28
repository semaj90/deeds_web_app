/**
 * Bone-name table from the courtroom clip skeleton (motion-capture style names: Hips, Spine1..4,
 * LeftArm, LeftFinger2Medial, ...) to the `J_Bip_*` humanoid bones of `character_alice.glb` (VRM style).
 *
 * Measured 2026-10-28 from `run_injured.glb` and `character_alice.glb`: 62 of the 76 animated clip nodes
 * map. A rename alone is NOT enough: both skeletons rest in a T-pose in world space (arm and leg chain
 * directions differ by 0 to 8 degrees, Hips to Spine1 38.5), but the LOCAL rest rotations differ (median
 * 10 degrees, 31 of 62 bones over 10 degrees, several about 90 or 180), so clip rotations must be
 * re-expressed relative to each skeleton's rest pose before playback. Not yet done or visually checked.
 */
export const CLIP_TO_ALICE_BONE = {
	Head: 'J_Bip_C_Head',
	Hips: 'J_Bip_C_Hips',
	LeftArm: 'J_Bip_L_UpperArm',
	LeftFinger1Distal: 'J_Bip_L_Thumb2',
	LeftFinger1Proximal: 'J_Bip_L_Thumb1',
	LeftFinger1Tip: 'J_Bip_L_Thumb3',
	LeftFinger2Distal: 'J_Bip_L_Index3',
	LeftFinger2Medial: 'J_Bip_L_Index2',
	LeftFinger2Proximal: 'J_Bip_L_Index1',
	LeftFinger2Tip: 'J_Bip_L_Index3_end',
	LeftFinger3Distal: 'J_Bip_L_Middle3',
	LeftFinger3Medial: 'J_Bip_L_Middle2',
	LeftFinger3Proximal: 'J_Bip_L_Middle1',
	LeftFinger3Tip: 'J_Bip_L_Middle3_end',
	LeftFinger4Distal: 'J_Bip_L_Ring3',
	LeftFinger4Medial: 'J_Bip_L_Ring2',
	LeftFinger4Proximal: 'J_Bip_L_Ring1',
	LeftFinger4Tip: 'J_Bip_L_Ring3_end',
	LeftFinger5Distal: 'J_Bip_L_Little3',
	LeftFinger5Medial: 'J_Bip_L_Little2',
	LeftFinger5Proximal: 'J_Bip_L_Little1',
	LeftFinger5Tip: 'J_Bip_L_Little3_end',
	LeftFoot: 'J_Bip_L_Foot',
	LeftForeArm: 'J_Bip_L_LowerArm',
	LeftHand: 'J_Bip_L_Hand',
	LeftShin: 'J_Bip_L_LowerLeg',
	LeftShoulder: 'J_Bip_L_Shoulder',
	LeftThigh: 'J_Bip_L_UpperLeg',
	LeftToe: 'J_Bip_L_ToeBase',
	LeftToeTip: 'J_Bip_L_ToeBase_end',
	Neck: 'J_Bip_C_Neck',
	RightArm: 'J_Bip_R_UpperArm',
	RightFinger1Distal: 'J_Bip_R_Thumb2',
	RightFinger1Proximal: 'J_Bip_R_Thumb1',
	RightFinger1Tip: 'J_Bip_R_Thumb3',
	RightFinger2Distal: 'J_Bip_R_Index3',
	RightFinger2Medial: 'J_Bip_R_Index2',
	RightFinger2Proximal: 'J_Bip_R_Index1',
	RightFinger2Tip: 'J_Bip_R_Index3_end',
	RightFinger3Distal: 'J_Bip_R_Middle3',
	RightFinger3Medial: 'J_Bip_R_Middle2',
	RightFinger3Proximal: 'J_Bip_R_Middle1',
	RightFinger3Tip: 'J_Bip_R_Middle3_end',
	RightFinger4Distal: 'J_Bip_R_Ring3',
	RightFinger4Medial: 'J_Bip_R_Ring2',
	RightFinger4Proximal: 'J_Bip_R_Ring1',
	RightFinger4Tip: 'J_Bip_R_Ring3_end',
	RightFinger5Distal: 'J_Bip_R_Little3',
	RightFinger5Medial: 'J_Bip_R_Little2',
	RightFinger5Proximal: 'J_Bip_R_Little1',
	RightFinger5Tip: 'J_Bip_R_Little3_end',
	RightFoot: 'J_Bip_R_Foot',
	RightForeArm: 'J_Bip_R_LowerArm',
	RightHand: 'J_Bip_R_Hand',
	RightShin: 'J_Bip_R_LowerLeg',
	RightShoulder: 'J_Bip_R_Shoulder',
	RightThigh: 'J_Bip_R_UpperLeg',
	RightToe: 'J_Bip_R_ToeBase',
	RightToeTip: 'J_Bip_R_ToeBase_end',
	Spine1: 'J_Bip_C_Spine',
	Spine2: 'J_Bip_C_Chest',
	Spine3: 'J_Bip_C_UpperChest',
} as const satisfies Record<string, string>;

/** Clip nodes with no counterpart on the alice skeleton (their tracks are dropped, never guessed). */
export const UNMAPPED_CLIP_NODES = ["HeadTip", "LeftFinger1Metacarpal", "LeftFinger2Metacarpal", "LeftFinger3Metacarpal", "LeftFinger4Metacarpal", "LeftFinger5Metacarpal", "RightFinger1Metacarpal", "RightFinger2Metacarpal", "RightFinger3Metacarpal", "RightFinger4Metacarpal", "RightFinger5Metacarpal", "Root", "Sam", "Spine4"] as const;

export function aliceBoneForClipNode(name: string): string | null {
	return (CLIP_TO_ALICE_BONE as Record<string, string>)[name] ?? null;
}

/**
 * Mixamo-skeleton variant: clips exported from Mixamo (for example `objection_dramatic.glb`, `walk_normal.glb`)
 * name their bones `mixamorig:Hips`, `mixamorig:LeftUpLeg`, ... instead of the plain motion-capture names above.
 * Built from the standard Mixamo bone set; Mixamo thumb/finger tips (`...4`), `HeadTop_End` and `Toe_End` have no
 * VRM counterpart and stay unmapped. Name table only: rest-pose compatibility with the alice skeleton has not been
 * measured for this skeleton, and playback has not been verified.
 */
const MIXAMO_BASE: Record<string, string> = {
	Hips: 'J_Bip_C_Hips',
	Spine: 'J_Bip_C_Spine',
	Spine1: 'J_Bip_C_Chest',
	Spine2: 'J_Bip_C_UpperChest',
	Neck: 'J_Bip_C_Neck',
	Head: 'J_Bip_C_Head',
};
const MIXAMO_SIDE: Record<string, string> = {
	Shoulder: 'Shoulder',
	Arm: 'UpperArm',
	ForeArm: 'LowerArm',
	Hand: 'Hand',
	UpLeg: 'UpperLeg',
	Leg: 'LowerLeg',
	Foot: 'Foot',
	ToeBase: 'ToeBase',
};
const MIXAMO_FINGERS: Record<string, string> = { Thumb: 'Thumb', Index: 'Index', Middle: 'Middle', Ring: 'Ring', Pinky: 'Little' };

function buildMixamoTable(): Record<string, string> {
	const table: Record<string, string> = {};
	for (const [k, v] of Object.entries(MIXAMO_BASE)) table[`mixamorig:${k}`] = v;
	for (const [side, letter] of [['Left', 'L'], ['Right', 'R']] as const) {
		for (const [k, v] of Object.entries(MIXAMO_SIDE)) table[`mixamorig:${side}${k}`] = `J_Bip_${letter}_${v}`;
		for (const [finger, vrm] of Object.entries(MIXAMO_FINGERS)) {
			for (const joint of [1, 2, 3]) table[`mixamorig:${side}Hand${finger}${joint}`] = `J_Bip_${letter}_${vrm}${joint}`;
		}
	}
	return table;
}

export const MIXAMO_TO_ALICE_BONE: Readonly<Record<string, string>> = buildMixamoTable();

/** Alice bone for either skeleton family (plain motion-capture names or `mixamorig:` names); null when unmapped. */
export function aliceBoneForAnyClipNode(name: string): string | null {
	return aliceBoneForClipNode(name) ?? MIXAMO_TO_ALICE_BONE[name] ?? null;
}

