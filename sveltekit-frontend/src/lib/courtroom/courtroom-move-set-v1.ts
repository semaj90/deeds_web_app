/**
 * The courtroom's "move set", the way a game ships one: a small fixed list of states, each backed by either one clip file
 * or a procedural pose, instead of the whole 49-file motion library (627 MB, measured 2026-10-28) loading for every
 * character. Anything not listed here is never requested by the scene.
 *
 *   idle               procedural breathing (idle-pose-v1)           no file
 *   walk               walk_normal.glb, used to move to the bench    1 file
 *   speaking / gesture / point / objection                           1 file each
 *   nod, shake_head, react_sad, react_angry, react_surprised         procedural overlays on the idle (emotion-pose-v1)
 *
 * Emotion is chosen from the user's text (text-emotion-v1) or the story mood, then mapped through
 * `courtroomAnimForEmotion`; the clips above are all the character ever needs.
 */
import type { CourtroomAnimType } from './courtroom-types.js';

export interface MoveSetEntry {
	animType: CourtroomAnimType;
	/** Clip file under /models/courtroom/, or null for a procedural pose. */
	file: string | null;
	/** Plays until it ends and then returns to idle. */
	oneShot: boolean;
}

export const COURTROOM_MOVE_SET: readonly MoveSetEntry[] = [
	{ animType: 'idle', file: null, oneShot: false },
	{ animType: 'walk', file: 'walk_normal.glb', oneShot: false },
	{ animType: 'speaking', file: 'speaking_crossstage.glb', oneShot: false },
	{ animType: 'gesture', file: 'gesture_teaching.glb', oneShot: true },
	{ animType: 'point', file: 'point_audience.glb', oneShot: true },
	{ animType: 'objection', file: 'objection_dramatic.glb', oneShot: true },
	{ animType: 'nod', file: null, oneShot: true },
	{ animType: 'shake_head', file: null, oneShot: true },
	{ animType: 'react_sad', file: null, oneShot: true },
	{ animType: 'react_angry', file: null, oneShot: true },
	{ animType: 'react_surprised', file: null, oneShot: true },
];

const BY_TYPE = new Map(COURTROOM_MOVE_SET.map((e) => [e.animType as string, e]));
const FILES = new Set(COURTROOM_MOVE_SET.flatMap((e) => (e.file ? [e.file] : [])));

/** True when the scene should load this clip (matched by animation type and clip file name). */
export function isMoveSetClip(animType: string, url: string): boolean {
	const entry = BY_TYPE.get(animType);
	if (!entry?.file) return false;
	return url.split(/[\\/]/).pop() === entry.file;
}

/** Files a character needs (for preload lists and size budgets). */
export function moveSetFiles(): string[] {
	return [...FILES];
}

/** Keep only move-set clips from a clip list (the DB lists ~49 per model). */
export function filterToMoveSet<T extends { animType: string; animationUrl?: string; url?: string }>(clips: readonly T[]): T[] {
	const seen = new Set<string>();
	return clips.filter((c) => {
		const ok = isMoveSetClip(c.animType, c.animationUrl ?? c.url ?? '');
		if (!ok || seen.has(c.animType)) return false;
		seen.add(c.animType);
		return true;
	});
}

export function isOneShot(animType: string): boolean {
	return BY_TYPE.get(animType)?.oneShot ?? false;
}

/**
 * Idle, walk and speaking repeat until told otherwise; everything else plays once. `walk` used to be missing from the
 * scene's own loop list, so a character crossing the room froze on the last frame of the walk clip after ~2 seconds.
 */
export function isLoopingAnim(animType: string): boolean {
	const entry = BY_TYPE.get(animType);
	return entry ? !entry.oneShot : animType === 'idle' || animType === 'speaking' || animType === 'walk';
}
