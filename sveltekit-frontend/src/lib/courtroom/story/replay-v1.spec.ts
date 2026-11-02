import { describe, it, expect } from 'vitest';
import {
	compileStory,
	fnv1a32,
	replayStory,
	replayFromInputs,
	verifyStateEquality,
	replayRun
} from './replay-v1.js';
import { step, initialState, type Story, type Input } from './engine.js';
import type { StoryRun } from './store.js';

describe('Courtroom Story Replay (replay-v1)', () => {
	const sampleStory: Story = {
		version: 1,
		id: 'case-replay-test',
		title: 'Replay Determinism Test',
		actors: [
			{
				id: 'judge-1',
				role: 'judge',
				name: 'Judge Wright',
				asset: 'judge.glb',
				clips: {},
				personality: { patience: 50, honesty: 100 }
			},
			{
				id: 'witness-1',
				role: 'witness',
				name: 'Witness Miles',
				asset: 'witness.glb',
				clips: {},
				personality: { patience: 20, honesty: 85 }
			}
		],
		cues: [
			{ id: 'cue-opening', tick: 0, actorId: 'judge-1', kind: 'phase', value: 'opening' },
			{ id: 'cue-dialogue-1', tick: 1, actorId: 'judge-1', kind: 'dialogue', value: 'Court is now in session.' },
			{
				id: 'cue-dialogue-ev',
				tick: 3,
				actorId: 'witness-1',
				kind: 'dialogue',
				value: 'I recognise this deed signature.',
				requiredEvidence: 'ev-deed-original'
			},
			{ id: 'cue-phase-testimony', tick: 2, actorId: 'judge-1', kind: 'phase', value: 'testimony' }
		]
	};

	it('compileStory stably orders cues by tick then cue id', () => {
		const compiled = compileStory(sampleStory);
		const ids = compiled.cues.map((c) => c.id);
		expect(ids).toEqual(['cue-opening', 'cue-dialogue-1', 'cue-phase-testimony', 'cue-dialogue-ev']);
	});

	it('replayStory produces reproducible deterministic hash across multiple runs', () => {
		const receipt1 = replayStory(sampleStory, ['ev-deed-original'], 5);
		const receipt2 = replayStory(sampleStory, ['ev-deed-original'], 5);

		expect(receipt1.stateHash).toBe(receipt2.stateHash);
		expect(receipt1.firedCueIds).toEqual(['cue-dialogue-1', 'cue-dialogue-ev', 'cue-opening', 'cue-phase-testimony']);
		expect(receipt1.admitted).toEqual(['ev-deed-original']);
		expect(receipt1.phase).toBe('testimony');
	});

	it('replayFromInputs re-steps deterministic engine identically to live step execution', () => {
		const inputs: Input[] = [
			{ type: 'TICK', steps: 1 },
			{ type: 'SUBMIT_EVIDENCE', id: 'ev-deed-original' },
			{ type: 'TICK', steps: 3 },
			{ type: 'QUESTION', actorId: 'witness-1', topic: 'the boundary lines' }
		];

		// Live execution step by step
		let live = initialState(sampleStory);
		for (const input of inputs) {
			live = step(sampleStory, live, input);
		}

		// Replay from inputs
		const replay = replayFromInputs(sampleStory, inputs);

		const verification = verifyStateEquality(live, replay);
		expect(verification.equal).toBe(true);
		expect(verification.hashMatch).toBe(true);
		expect(verification.diffs).toHaveLength(0);
	});

	it('replayFromInputs respects toTick boundary', () => {
		const inputs: Input[] = [
			{ type: 'TICK', steps: 2 },
			{ type: 'TICK', steps: 5 }
		];

		const replayed = replayFromInputs(sampleStory, inputs, 4);
		expect(replayed.tick).toBe(4);
	});

	it('verifyStateEquality detects divergences accurately', () => {
		const live = initialState(sampleStory);
		const replay = initialState(sampleStory);

		// Perturb live state
		live.transcript.push({ tick: 1, actorId: 'judge-1', text: 'Spurious live line' });

		const verification = verifyStateEquality(live, replay);
		expect(verification.equal).toBe(false);
		expect(verification.hashMatch).toBe(false);
		expect(verification.diffs.some((d) => d.includes('transcript mismatch'))).toBe(true);
	});

	it('replayRun processes StoryRun record and yields a valid ReplayReceipt', () => {
		const run: StoryRun = {
			id: 'run-determinism-1',
			storyId: sampleStory.id,
			currentTick: 3,
			status: 'completed',
			inputs: [
				{ type: 'SUBMIT_EVIDENCE', id: 'ev-deed-original' },
				{ type: 'TICK', steps: 3 }
			],
			startedAt: '2026-10-31T12:00:00.000Z'
		};

		const { receipt, state } = replayRun(sampleStory, run);
		expect(receipt.storyId).toBe(sampleStory.id);
		expect(receipt.toTick).toBe(3);
		expect(state.tick).toBe(3);
		expect(state.evidence).toContain('ev-deed-original');
		expect(receipt.stateHash).toBe(fnv1a32(JSON.stringify(state)));
	});
});
