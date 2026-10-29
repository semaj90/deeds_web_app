// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { animForUserText, readTextEmotion, TEXT_EMOTION_CONFIDENCE_FLOOR } from './text-emotion-v1.js';
import { COURTROOM_MOVE_SET, filterToMoveSet, isMoveSetClip, moveSetFiles } from './courtroom-move-set-v1.js';
import { ANIMATION_TYPES } from './courtroom-types.js';

describe('readTextEmotion', () => {
	it.each([
		['Thank you, that is great news and I am glad.', 'happy'],
		['I am so sorry, unfortunately we lost everything.', 'sad'],
		['That is an outrageous lie and you know it!', 'angry'],
		['I am scared and worried about the threat.', 'fear'],
		['Wow, that is shocking and unbelievable?!', 'surprise'],
		['What a disgusting and vile thing to do.', 'disgust'],
	])('reads %s as %s', (text, emotion) => {
		const r = readTextEmotion(text);
		expect(r.emotion).toBe(emotion);
		expect(r.confidence).toBeGreaterThanOrEqual(TEXT_EMOTION_CONFIDENCE_FLOOR);
		expect(r.evidence.length).toBeGreaterThan(0);
	});

	it('stays neutral for plain procedural text, empty input and non-strings', () => {
		for (const t of ['Please state your name for the record.', 'Where were you on the night of the fifteenth?', '', '   ']) {
			expect(readTextEmotion(t)).toMatchObject({ emotion: 'neutral', evidence: [] });
		}
		expect(readTextEmotion(undefined as unknown as string).emotion).toBe('neutral');
		expect(readTextEmotion(42 as unknown as string).emotion).toBe('neutral');
	});

	it('handles negation: "not happy" is not happy', () => {
		expect(readTextEmotion('I am not happy about this at all.').emotion).not.toBe('happy');
		expect(readTextEmotion("I'm not angry, just tired.").emotion).not.toBe('angry');
	});

	it('does not read a single weak word as a reaction, and reads shouting as anger', () => {
		expect(readTextEmotion('Yes.').emotion).toBe('neutral');
		expect(readTextEmotion('STOP RIGHT NOW').emotion).toBe('angry');
		expect(readTextEmotion('Objection!').emotion).toBe('angry'); // courtroom shorthand carries a reaction alone
	});

	it('bounds work on huge input', () => {
		const t0 = performance.now();
		readTextEmotion('great '.repeat(200_000));
		expect(performance.now() - t0).toBeLessThan(200);
	});
});

describe('animForUserText', () => {
	it('maps to animation types the courtroom knows, defaulting to idle', () => {
		expect(animForUserText('That is an outrageous lie!')).toBe('react_angry');
		expect(animForUserText('I am so sorry for your loss, unfortunately.')).toBe('react_sad');
		expect(animForUserText('Please state your name.')).toBe('idle');
		for (const t of ['thank you great', 'wow shocking?!', 'disgusting vile', 'scared afraid']) {
			expect(ANIMATION_TYPES as readonly string[]).toContain(animForUserText(t));
		}
	});
});

describe('courtroom move set', () => {
	it('is small, needs only a handful of files, and covers every reaction animForUserText can return', () => {
		expect(moveSetFiles().length).toBeLessThanOrEqual(6);
		const types = new Set(COURTROOM_MOVE_SET.map((e) => e.animType));
		for (const t of ['idle', 'walk', 'speaking', 'nod', 'shake_head', 'react_sad', 'react_angry', 'react_surprised']) expect(types.has(t as never), t).toBe(true);
	});

	it('keeps only move-set clips from a long list, one per type', () => {
		const clips = [
			{ animType: 'walk', animationUrl: '/models/courtroom/walk_normal.glb' },
			{ animType: 'walk', animationUrl: '/models/courtroom/walk_drunk_1.glb' },
			{ animType: 'walk', animationUrl: '/models/courtroom/walk_normal.glb' },
			{ animType: 'run', animationUrl: '/models/courtroom/run_exit.glb' },
			{ animType: 'speaking', animationUrl: '/models/courtroom/speaking_crossstage.glb' },
			{ animType: 'idle', animationUrl: '/models/courtroom/idle.glb' },
		];
		expect(filterToMoveSet(clips).map((c) => c.animationUrl)).toEqual(['/models/courtroom/walk_normal.glb', '/models/courtroom/speaking_crossstage.glb']);
		expect(isMoveSetClip('walk', '/models/courtroom/walk_drunk_1.glb')).toBe(false);
	});
});
