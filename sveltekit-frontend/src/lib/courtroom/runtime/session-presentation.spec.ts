import { describe, expect, it } from 'vitest';
import { initialState, step, validateStory } from '../story/engine.js';
import { ActorRegistry } from './actor-runtime.js';
import { reconcileScene } from './actor-runtime.js';
import { createSceneAdapter, type SceneLike } from './scene-adapter.js';
import { createSessionPresentationStory, sessionActorIdForRole } from './session-presentation.js';

describe('server-session presentation projection', () => {
	const story = createSessionPresentationStory();

	it('uses stable scene-role actors without copying canonical session state', () => {
		expect(validateStory(story)).toBe(true);
		expect(story.cues).toEqual([]);
		expect(sessionActorIdForRole('defense')).toBe('session-defense');
		expect(sessionActorIdForRole('unknown')).toBeNull();
	});

	it('accepts animation events only for registered projection actors', () => {
		const before = initialState(story);
		const next = step(story, before, { type: 'SCENE_ANIMATION', actorId: 'session-witness', animation: 'speaking' });
		expect(next.animations['session-witness']).toBe('speaking');
		expect(step(story, next, { type: 'SCENE_ANIMATION', actorId: 'ghost', animation: 'objection' })).toEqual(next);
		expect(step(story, next, { type: 'SCENE_ANIMATION', actorId: 'session-witness', animation: 'x'.repeat(65) })).toEqual(next);
		expect(before.animations).toEqual({});
	});

	it('routes a session keyframe animation through the existing scene adapter', () => {
		const played: Array<[string, string]> = [];
		const scene: SceneLike = {
			playAnimation: (role, animation) => played.push([role, animation]),
			showCharacter() {},
			setPhase() {},
		};
		const adapter = createSceneAdapter(scene, ActorRegistry.fromStory(story));
		const previous = initialState(story);
		const next = step(story, previous, { type: 'SCENE_ANIMATION', actorId: sessionActorIdForRole('witness')!, animation: 'speaking' });
		reconcileScene(previous, next, adapter);
		expect(played).toEqual([['witness', 'speaking']]);
	});
});
