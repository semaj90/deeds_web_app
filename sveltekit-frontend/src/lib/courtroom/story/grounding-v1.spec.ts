import { describe, expect, it } from 'vitest';
import type { Story } from './engine';
import { validateGrounding } from './grounding-v1';

const story = (cues: Story['cues']): Story => ({ version: 1, id: 's', title: 't', actors: [], cues });

describe('story grounding', () => {
	it('accepts dialogue that cites an existing chunk', () => {
		const s = story([{ id: 'a', tick: 1, actorId: 'x', kind: 'dialogue', value: 'hi', requiredEvidence: 'c1' }]);
		expect(validateGrounding(s, ['c1'])).toEqual({ ok: true, missing: [], unknownChunk: [] });
	});

	it('rejects dialogue with no citation or an unknown chunk', () => {
		const s = story([
			{ id: 'a', tick: 1, actorId: 'x', kind: 'dialogue', value: 'no source' },
			{ id: 'b', tick: 2, actorId: 'x', kind: 'dialogue', value: 'bad', requiredEvidence: 'zzz' }
		]);
		expect(validateGrounding(s, ['c1'])).toEqual({ ok: false, missing: ['a'], unknownChunk: ['b'] });
	});

	it('ignores non-dialogue cues', () => {
		const s = story([{ id: 'm', tick: 1, actorId: 'x', kind: 'move', value: 'witness' }]);
		expect(validateGrounding(s, []).ok).toBe(true);
	});
});
