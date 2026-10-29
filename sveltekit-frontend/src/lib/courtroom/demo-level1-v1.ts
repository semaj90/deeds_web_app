import { stationById, type SeatRole } from './courtroom-floorplan-v1.js';
import type { CourtroomView } from './courtroom-types.js';

/**
 * Level 1, "Courtroom Orientation": look around with the camera presets and walk one character to one station.
 * Runs only on the fictional local-preview story; nothing here touches a case, a session or the network.
 * Completion is derived from observed facts, never from elapsed time.
 */
export const LEVEL1_ID = 'L1-orientation' as const;
export const LEVEL1_CAMERAS: readonly CourtroomView[] = ['wide', 'witness', 'judge'];
/** A character counts as arrived when it stands this close to the station point (m). Slot stations offset the target. */
export const ARRIVAL_RADIUS = 1.6;

export type MoveOutcome = 'finished' | 'interrupted' | 'timeout' | 'unavailable';

export interface MoveFact {
	actorId: string;
	station: string;
	outcome: MoveOutcome;
	/** Where the scene says the character is after the move, or null when it could not say. */
	position: { x: number; z: number } | null;
}

export interface Level1Facts {
	sceneReady: boolean;
	storyTick: number | null;
	cameraPreset: CourtroomView;
	/** Every preset the camera has actually reported being in, in order. */
	camerasSeen: readonly CourtroomView[];
	activeActor: string | null;
	move: MoveFact | null;
}

export type ReceiptId = 'SCENE_READY' | 'CAMERA_WIDE' | 'CAMERA_WITNESS' | 'CAMERA_JUDGE' | 'MOVE_VERIFIED';

export interface Level1View {
	levelId: typeof LEVEL1_ID;
	storyTick: number | null;
	cameraPreset: CourtroomView;
	activeActor: string | null;
	moveOutcome: MoveFact | null;
	sceneReady: boolean;
	receipts: ReceiptId[];
	complete: boolean;
}

/** A move is verified only when the outcome is `finished` AND the scene-reported position is at the station. */
export function moveVerified(move: MoveFact | null): boolean {
	if (!move || move.outcome !== 'finished' || !move.position) return false;
	const target = stationById(move.station as SeatRole);
	if (!target) return false;
	return Math.hypot(move.position.x - target.x, move.position.z - target.z) <= ARRIVAL_RADIUS;
}

export function deriveLevel1(facts: Level1Facts): Level1View {
	const receipts: ReceiptId[] = [];
	if (facts.sceneReady) receipts.push('SCENE_READY');
	for (const view of LEVEL1_CAMERAS) if (facts.camerasSeen.includes(view)) receipts.push(`CAMERA_${view.toUpperCase()}` as ReceiptId);
	if (moveVerified(facts.move)) receipts.push('MOVE_VERIFIED');
	return {
		levelId: LEVEL1_ID,
		storyTick: facts.storyTick,
		cameraPreset: facts.cameraPreset,
		activeActor: facts.activeActor,
		moveOutcome: facts.move,
		sceneReady: facts.sceneReady,
		receipts,
		complete: receipts.length === 1 + LEVEL1_CAMERAS.length + 1 // scene + every camera + the move
	};
}
