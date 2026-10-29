import { initialState, step, type State, type Story } from './engine';

/** 32-bit FNV-1a over a string. Not cryptographic: a change detector for replay equality, labelled as such in receipts. */
export function fnv1a32(text: string): string {
	let h = 0x811c9dc5;
	for (let i = 0; i < text.length; i++) {
		h ^= text.charCodeAt(i);
		h = Math.imul(h, 0x01000193) >>> 0;
	}
	return h.toString(16).padStart(8, '0');
}

/** Stable order: by tick, then cue id. The engine does not depend on array order, but replays and diffs do. */
export function compileStory(story: Story): Story {
	return { ...story, cues: [...story.cues].sort((a, b) => a.tick - b.tick || a.id.localeCompare(b.id)) };
}

export interface ReplayReceipt {
	algorithm: 'fnv1a32-of-final-state';
	storyId: string;
	toTick: number;
	admitted: string[];
	firedCueIds: string[];
	transcriptLines: number;
	phase: State['phase'];
	stateHash: string;
}

/**
 * Re-run the deterministic engine from nothing: admit the cited evidence, then tick to `toTick`. Same story and inputs
 * always give the same receipt, so a reviewed story can be proven to replay identically before it is played.
 */
export function replayStory(story: Story, admitted: string[], toTick: number): ReplayReceipt {
	const compiled = compileStory(story);
	let state = initialState(compiled);
	for (const id of admitted) state = step(compiled, state, { type: 'SUBMIT_EVIDENCE', id });
	state = step(compiled, state, { type: 'TICK', steps: toTick });
	return {
		algorithm: 'fnv1a32-of-final-state',
		storyId: compiled.id,
		toTick,
		admitted: [...admitted],
		firedCueIds: [...state.fired].sort(),
		transcriptLines: state.transcript.length,
		phase: state.phase,
		stateHash: fnv1a32(JSON.stringify(state))
	};
}
