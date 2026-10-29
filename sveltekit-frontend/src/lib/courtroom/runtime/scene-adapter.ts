/**
 * Binds the story runtime's `CharacterAdapter` to the REAL `CourtroomScene` methods (`playAnimation`, `showCharacter`,
 * `setPhase`). The scene keys characters by role (prosecutor, defense, judge, witness), not by story actor id, so each
 * call goes through the actor registry. The scene never owns story truth; this adapter only applies reconciled outputs.
 *
 * The story's `jester` persona is rendered on Alice's defense character; it does not create a second skeletal actor.
 * The scene owns optional accessory mood controls while story identity and dialogue remain keyed by actor id.
 */
import type { Mood } from '../story/engine.js';
import type { ActorRegistry, CharacterAdapter } from './actor-runtime.js';
import type { CueOutcome } from '../cue-tracker-v1.js';
import { findPath, stationById } from '../courtroom-floorplan-v1.js';
import { EntityLocks, type ConflictReceipt } from '../courtroom-actor-binding-v1.js';
import { isLoopingAnim } from '../courtroom-move-set-v1.js';
import { ANIMATION_TYPES, type CourtroomAnimType } from '../courtroom-types.js';

/** The subset of `CourtroomScene` this adapter calls. Matches its real signatures (courtroom-scene.svelte.ts). */
export interface SceneLike {
	playAnimation(role: string, animType: string): void;
	showCharacter(role: string): void;
	setPhase(phase: string): void;
	setAccessoryMood?(role: string, mood: Mood): void;
	/** Optional: resolves when a clip ends. When absent the adapter falls back to fire-and-forget `playAnimation`. */
	playAnimationAsync?(role: string, animType: string, timeoutMs?: number): Promise<CueOutcome>;
	/** Optional: walk a character along waypoints; resolves when it arrives (CourtroomScene.moveTo). */
	moveTo?(role: string, waypoints: Array<{ x: number; y: number; z: number }>, speed?: number): Promise<CueOutcome>;
	/** Optional: where a character currently stands on the floor plan (x, z), or null when it is not loaded. */
	getPosition?(role: string): { x: number; z: number } | null;
}

/** Roles the scene actually has stations for (STATIONS in courtroom-scene.svelte.ts). */
export const SCENE_ROLES = ['prosecutor', 'defense', 'judge', 'witness'] as const;

const STATION_DESTINATION_SLOTS: Record<string, readonly { x: number; z: number }[]> = {
	witness: [{ x: 0, z: 0 }, { x: -0.8, z: 0 }, { x: 0.8, z: 0 }],
};

/** Story clip names (ActorSpec.clips keys) to scene animation types. */
export const CLIP_TO_ANIM: Record<string, CourtroomAnimType> = {
	idle: 'idle',
	talk: 'speaking',
	speaking: 'speaking',
	gesture: 'gesture',
	point: 'point',
	walk: 'walk',
	objection: 'objection',
};

/** Story moods to scene animations (the scene has no expression API; these are the closest existing clips). */
export const MOOD_TO_ANIM: Record<Mood, CourtroomAnimType> = {
	neutral: 'idle',
	confident: 'nod',
	nervous: 'react_surprised',
	angry: 'react_angry',
	relieved: 'nod',
};

/** Story phases to the trial-phase names `PHASE_CAMERA_MAP` knows (unknown names fall back to the wide shot). */
export const STORY_PHASE_TO_TRIAL_PHASE: Record<string, string> = {
	lobby: 'pretrial',
	opening: 'opening_statements',
	testimony: 'prosecution_case',
	cross: 'defense_case',
	verdict: 'verdict',
	closed: 'judgment',
};

export interface SceneAdapterHooks {
	onDialogue?(actorId: string, text: string): void;
	onPhase?(phase: string): void;
	/**
	 * Called when a movement or awaited clip settles. Movement outcomes are replayable story inputs and may release a gated cue.
	 */
	onCueSettled?(what: { actorId: string; clip: string; outcome: CueOutcome }): void;
	/**
	 * Called when a story actor asks to steer a scene character another actor is already steering (for example the jester
	 * mid-walk on the mesh `alice` also drives). The command is not applied; the receipt says who holds the entity.
	 */
	onConflict?(receipt: ConflictReceipt): void;
	/** Called when an actor, role or clip cannot be mapped onto the scene. */
	onUnmapped?(what: { actorId: string; reason: 'unknown_actor' | 'no_scene_role' | 'unknown_clip' | 'unknown_station' | 'no_path' | 'no_movement' | 'occupied_station'; detail?: string }): void;
}

export function createSceneAdapter(scene: SceneLike, registry: ActorRegistry, hooks: SceneAdapterHooks = {}): CharacterAdapter {
	const locks = new EntityLocks();
	const refused = (role: string, actorId: string, action: 'move' | 'animation'): boolean => {
		const check = locks.check(role, actorId, action);
		// `'receipt' in` narrows the union even with strictNullChecks off (a boolean discriminant would not).
		if (!('receipt' in check)) return false;
		hooks.onConflict?.(check.receipt);
		return true;
	};
	const sceneRole = (actorId: string): string | null => {
		const actor = registry.find(actorId);
		if (!actor) { hooks.onUnmapped?.({ actorId, reason: 'unknown_actor' }); return null; }
		const role = actor.role === 'jester' ? 'defense' : actor.role;
		if (!(SCENE_ROLES as readonly string[]).includes(role)) { hooks.onUnmapped?.({ actorId, reason: 'no_scene_role', detail: actor.role }); return null; }
		return role;
	};
	return {
		setAnimation(actorId, clip) {
			const role = sceneRole(actorId);
			if (!role) return;
			const anim = CLIP_TO_ANIM[clip] ?? ((ANIMATION_TYPES as readonly string[]).includes(clip) ? (clip as CourtroomAnimType) : null);
			if (!anim) { hooks.onUnmapped?.({ actorId, reason: 'unknown_clip', detail: clip }); return; }
			if (refused(role, actorId, 'animation')) return;
			const looping = isLoopingAnim(anim);
			// Looping clips never end, so there is nothing to await; one-shot clips report completion.
			if (looping || !scene.playAnimationAsync) { scene.playAnimation(role, anim); return; }
			void scene.playAnimationAsync(role, anim).then((outcome) => {
				hooks.onCueSettled?.({ actorId, clip, outcome });
				// A one-shot clip that ran to its end hands the actor back to idle (event-driven, no fixed timer).
				if (outcome === 'finished') scene.playAnimation(role, 'idle');
			});
		},
		moveActor(actorId, station) {
			const role = sceneRole(actorId);
			const settleUnavailable = () => hooks.onCueSettled?.({ actorId, clip: `move:${station}`, outcome: 'unavailable' });
			if (!role) { settleUnavailable(); return; }
			const target = stationById(station);
			if (!target) { hooks.onUnmapped?.({ actorId, reason: 'unknown_station', detail: station }); settleUnavailable(); return; }
			if (!scene.moveTo) { hooks.onUnmapped?.({ actorId, reason: 'no_movement', detail: station }); settleUnavailable(); return; }
			// Start from where the character really is, else from its own default station.
			const home = stationById(role);
			const from = scene.getPosition?.(role) ?? (home ? { x: home.x, z: home.z } : null);
			const slots = STATION_DESTINATION_SLOTS[station] ?? [{ x: 0, z: 0 }];
			const occupants = SCENE_ROLES.flatMap((candidateRole) => {
				if (candidateRole === role) return [];
				const position = scene.getPosition?.(candidateRole);
				return position ? [position] : [];
			});
			const slotResults = slots.map((offset, index) => {
					const destination = { x: target.x + offset.x, z: target.z + offset.z };
					const occupied = occupants.some((position) => Math.hypot(position.x - destination.x, position.z - destination.z) < 0.75);
					const path = !occupied && from ? findPath(from, destination) : null;
					const distance = path?.slice(1).reduce((total, point, pointIndex) => {
						const previous = path[pointIndex];
						return total + Math.hypot(point.x - previous.x, point.z - previous.z);
					}, 0);
					return { index, path, distance, occupied };
				});
			const candidates = slotResults
				.filter((candidate) => candidate.path !== null && candidate.distance !== undefined)
				.sort((left, right) => left.distance - right.distance || left.index - right.index);
			const path = candidates[0]?.path ?? null;
			if (!path) {
				const allSlotsOccupied = slotResults.every((candidate) => candidate.occupied);
				hooks.onUnmapped?.({ actorId, reason: allSlotsOccupied ? 'occupied_station' : 'no_path', detail: station });
				settleUnavailable();
				return;
			}
			if (path.length < 2) { hooks.onCueSettled?.({ actorId, clip: `move:${station}`, outcome: 'finished' }); return; }
			const taken = locks.acquire(role, actorId, 'move');
			if ('receipt' in taken) { hooks.onConflict?.(taken.receipt); settleUnavailable(); return; }
			void scene
				.moveTo(role, path)
				.then((outcome) => hooks.onCueSettled?.({ actorId, clip: `move:${station}`, outcome }))
				.finally(() => locks.release(role, actorId));
		},
		setEmotion(actorId, mood) {
			const role = sceneRole(actorId);
			if (role && !refused(role, actorId, 'animation')) {
				if (actorId === 'jester') scene.setAccessoryMood?.(role, mood);
				scene.playAnimation(role, MOOD_TO_ANIM[mood]);
			}
		},
		setDialogue(actorId, text) {
			const role = sceneRole(actorId);
			if (role) scene.showCharacter(role);
			hooks.onDialogue?.(actorId, text);
		},
		setPhase(phase) {
			scene.setPhase(STORY_PHASE_TO_TRIAL_PHASE[phase] ?? phase);
			hooks.onPhase?.(phase);
		},
	};
}
