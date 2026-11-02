import { initialState, step, type State, type Story, type Input } from './engine.js';
import type { StoryRun } from './store.js';

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

export interface StateEqualityVerification {
	equal: boolean;
	hashMatch: boolean;
	liveHash: string;
	replayHash: string;
	diffs: string[];
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

/**
 * Re-step the deterministic engine sequentially through recorded `inputs[]`.
 * If `toTick` is specified, execution ceases once the engine reaches or exceeds `toTick`.
 */
export function replayFromInputs(story: Story, inputs: readonly Input[], toTick?: number): State {
	const compiled = compileStory(story);
	let state = initialState(compiled);

	for (const input of inputs) {
		if (toTick !== undefined && state.tick >= toTick) {
			break;
		}

		if (input.type === 'TICK' && toTick !== undefined) {
			const requestedSteps = Math.min(300, Math.max(1, input.steps ?? 1));
			const allowedSteps = Math.max(0, toTick - state.tick);
			if (allowedSteps <= 0) break;
			const steps = Math.min(requestedSteps, allowedSteps);
			state = step(compiled, state, { type: 'TICK', steps });
		} else {
			state = step(compiled, state, input);
		}
	}

	return state;
}

/**
 * Compare live and replayed states for exact equality, returning detailed diffs.
 */
export function verifyStateEquality(liveState: State, replayState: State): StateEqualityVerification {
	const liveHash = fnv1a32(JSON.stringify(liveState));
	const replayHash = fnv1a32(JSON.stringify(replayState));
	const diffs: string[] = [];

	if (liveState.tick !== replayState.tick) {
		diffs.push(`tick mismatch: live=${liveState.tick}, replay=${replayState.tick}`);
	}
	if (liveState.phase !== replayState.phase) {
		diffs.push(`phase mismatch: live=${liveState.phase}, replay=${replayState.phase}`);
	}
	if (liveState.music !== replayState.music) {
		diffs.push(`music mismatch: live=${liveState.music}, replay=${replayState.music}`);
	}
	if (JSON.stringify(liveState.evidence.slice().sort()) !== JSON.stringify(replayState.evidence.slice().sort())) {
		diffs.push(`evidence mismatch: live=${JSON.stringify(liveState.evidence)}, replay=${JSON.stringify(replayState.evidence)}`);
	}
	if (JSON.stringify(liveState.fired.slice().sort()) !== JSON.stringify(replayState.fired.slice().sort())) {
		diffs.push(`fired cues mismatch: live=${JSON.stringify(liveState.fired)}, replay=${JSON.stringify(replayState.fired)}`);
	}
	if (JSON.stringify(liveState.mood) !== JSON.stringify(replayState.mood)) {
		diffs.push(`mood mismatch: live=${JSON.stringify(liveState.mood)}, replay=${JSON.stringify(replayState.mood)}`);
	}
	if (JSON.stringify(liveState.transcript) !== JSON.stringify(replayState.transcript)) {
		diffs.push(`transcript mismatch: live=${liveState.transcript.length} lines, replay=${replayState.transcript.length} lines`);
	}
	if (JSON.stringify(liveState.animations) !== JSON.stringify(replayState.animations)) {
		diffs.push(`animations mismatch: live=${JSON.stringify(liveState.animations)}, replay=${JSON.stringify(replayState.animations)}`);
	}
	if (JSON.stringify(liveState.positions) !== JSON.stringify(replayState.positions)) {
		diffs.push(`positions mismatch: live=${JSON.stringify(liveState.positions)}, replay=${JSON.stringify(replayState.positions)}`);
	}

	const hashMatch = liveHash === replayHash;
	const equal = diffs.length === 0 && hashMatch;

	return {
		equal,
		hashMatch,
		liveHash,
		replayHash,
		diffs
	};
}

/**
 * Replays an entire persisted StoryRun record up to `toTick` (or the run's currentTick).
 */
export function replayRun(
	story: Story,
	run: StoryRun,
	toTick?: number
): { receipt: ReplayReceipt; state: State } {
	const targetTick = toTick ?? run.currentTick;
	const typedInputs = (Array.isArray(run.inputs) ? run.inputs : []) as Input[];
	const state = replayFromInputs(story, typedInputs, targetTick);

	const receipt: ReplayReceipt = {
		algorithm: 'fnv1a32-of-final-state',
		storyId: story.id,
		toTick: targetTick,
		admitted: [...state.evidence].sort(),
		firedCueIds: [...state.fired].sort(),
		transcriptLines: state.transcript.length,
		phase: state.phase,
		stateHash: fnv1a32(JSON.stringify(state))
	};

	return { receipt, state };
}
