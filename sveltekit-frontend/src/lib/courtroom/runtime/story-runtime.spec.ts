import { describe, it, expect } from 'vitest';
import { sampleStory, initialState, step, validateStory, type Story } from '../story/engine.js';
import { ActorRegistry, reconcileScene, type CharacterAdapter } from './actor-runtime.js';
import { makeDialogueRequest, validateDialogueProposal } from './ai-context.js';
import { selectLod, validatePack, type AssetPack } from './asset-manifest.js';
import { createSceneAdapter, CLIP_TO_ANIM, MOOD_TO_ANIM, SCENE_ROLES, STORY_PHASE_TO_TRIAL_PHASE, type SceneLike } from './scene-adapter.js';
import { PHASE_CAMERA_MAP, ANIMATION_TYPES } from '../courtroom-types.js';

function runTicks(story: Story, n: number, bridge: CharacterAdapter) {
	let current = initialState(story);
	for (let i = 0; i < n; i++) {
		const next = step(story, current, { type: 'TICK' });
		reconcileScene(current, next, bridge);
		current = next;
	}
	return current;
}
const noop: CharacterAdapter = { setAnimation() {}, setEmotion() {}, setDialogue() {}, setPhase() {} };

describe('story engine (from the Courtroom 64 integration kit)', () => {
	it('replays 180 ticks deterministically and reconciles each output once', () => {
		const events: unknown[][] = [];
		const bridge: CharacterAdapter = {
			setAnimation: (a, b) => events.push(['animation', a, b]),
			setEmotion: (a, b) => events.push(['mood', a, b]),
			setDialogue: (a, b) => events.push(['dialogue', a, b]),
			setPhase: (p) => events.push(['phase', p]),
		};
		const current = runTicks(sampleStory, 180, bridge);
		expect(current.tick).toBe(180);
		expect(current.phase).toBe('testimony');
		expect(current.evidence).toEqual(['ledger-photo']);
		expect(current.fired).toHaveLength(7);
		expect(events.filter((e) => e[0] === 'animation')).toHaveLength(1);
		expect(step(sampleStory, initialState(sampleStory), { type: 'TICK', steps: 180 })).toEqual(current);
	});

	it('gates a cue on required evidence: no ledger-photo, no verdict', () => {
		const noEvidence: Story = { ...sampleStory, cues: sampleStory.cues.filter((c) => c.kind !== 'evidence').map((cue) => cue.id === 'cross' ? { ...cue, waitForArrival: undefined } : cue) };
		expect(runTicks(noEvidence, 450, noop).phase).toBe('cross');
		const current = step(sampleStory, initialState(sampleStory), { type: 'TICK', steps: 239 });
		expect(current.phase).toBe('testimony');
		expect(current.tick).toBe(239);
		const arrived = step(sampleStory, current, { type: 'MOVE_SETTLED', actorId: 'jester', station: 'witness', outcome: 'finished' });
		expect(step(sampleStory, arrived, { type: 'TICK', steps: 211 }).phase).toBe('verdict');
	});

	it('releases the dependent phase on terminal movement outcomes without claiming arrival', () => {
		const waiting = step(sampleStory, initialState(sampleStory), { type: 'TICK', steps: 400 });
		expect(waiting.tick).toBe(239);
		for (const outcome of ['timeout', 'interrupted', 'unavailable'] as const) {
			const settled = step(sampleStory, waiting, { type: 'MOVE_SETTLED', actorId: 'jester', station: 'witness', outcome });
			expect(settled.moveOutcomes.jester).toEqual({ station: 'witness', outcome });
			expect(step(sampleStory, settled, { type: 'TICK' }).phase).toBe('cross');
		}
	});

	it('answers questions from the deterministic tree only', () => {
		const before = initialState(sampleStory);
		const asked = step(sampleStory, before, { type: 'QUESTION', actorId: 'jester', topic: 'ledger' });
		expect(asked.transcript[0].text).toContain('establish the facts first');
		expect(asked.evidence).toEqual([]);
		expect(asked.phase).toBe('lobby');
		expect(before.transcript).toHaveLength(0); // input state is not mutated
	});
});

describe('validateStory (imported JSON is untrusted)', () => {
	it('accepts the sample and rejects structural problems', () => {
		expect(validateStory(sampleStory)).toBe(true);
		const clone = (): Story => structuredClone(sampleStory);
		const dupActor = clone();
		dupActor.actors.push({ ...dupActor.actors[0] });
		const badRole = clone();
		(badRole.actors[0] as { role: string }).role = 'bailiff';
		const ghostCue = clone();
		ghostCue.cues[0].actorId = 'nobody';
		const dupCue = clone();
		dupCue.cues.push({ ...dupCue.cues[0] });
		const remoteAsset = clone();
		remoteAsset.actors[0].asset = 'https://evil.example/a.glb';
		const traversal = clone();
		traversal.actors[0].asset = '/models/../../etc/passwd';
		const badTick = clone();
		badTick.cues[0].tick = 1.5;
		for (const bad of [dupActor, badRole, ghostCue, dupCue, remoteAsset, traversal, badTick, null, 'x', { version: 2 }]) expect(validateStory(bad)).toBe(false);
	});
});

describe('bounded dialogue contract', () => {
	const registry = ActorRegistry.fromStory(sampleStory);
	const state = step(sampleStory, initialState(sampleStory), { type: 'TICK', steps: 180 });
	it('binds proposals to the exact fictional context and rejects authority drift', () => {
		const request = makeDialogueRequest(sampleStory, state, registry, 'alice', 'ledger');
		expect(request.evidenceIds).toEqual(['ledger-photo']);
		expect(request.phase).toBe('testimony');
		const proposal = {
			proposalOnly: true,
			caseId: request.caseId,
			actorId: 'alice',
			phase: request.phase,
			evidenceIds: request.evidenceIds,
			allowedIntents: ['answer', 'decline', 'ask_clarification'],
			modelRevision: 'test-model-revision',
			intent: 'answer',
			text: 'I saw the ledger.',
		};
		expect(validateDialogueProposal(request, proposal)?.text).toBe('I saw the ledger.');
		expect(validateDialogueProposal(request, { ...proposal, actorId: 'jester' })).toBeNull();
		expect(validateDialogueProposal(request, { ...proposal, intent: 'confess' })).toBeNull();
		expect(validateDialogueProposal(request, { ...proposal, text: 'x'.repeat(501) })).toBeNull();
		expect(validateDialogueProposal(request, { ...proposal, phase: 'verdict' })).toBeNull();
		expect(validateDialogueProposal(request, { ...proposal, evidenceIds: ['invented'] })).toBeNull();
		expect(validateDialogueProposal(request, { ...proposal, modelRevision: '' })).toBeNull();
		expect(() => makeDialogueRequest(sampleStory, state, registry, 'ghost', 'ledger')).toThrow();
	});

	it('records a proposal only after explicit acceptance against unchanged phase and evidence', () => {
		const previousTranscript = structuredClone(state.transcript);
		const accepted = step(sampleStory, state, {
			type: 'ACCEPT_DIALOGUE_PROPOSAL',
			actorId: 'alice',
			expectedPhase: state.phase,
			expectedEvidenceIds: [...state.evidence],
			text: 'I saw the ledger.',
			intent: 'answer',
		});
		expect(accepted.transcript.at(-1)).toEqual({ tick: state.tick, actorId: 'alice', text: 'I saw the ledger.', intent: 'answer' });
		expect(accepted.transcript).toHaveLength(previousTranscript.length + 1);
		expect(state.transcript).toEqual(previousTranscript);
	});

	it('rejects stale context, unknown actors, and unapproved proposal fields', () => {
		const base = {
			type: 'ACCEPT_DIALOGUE_PROPOSAL' as const,
			actorId: 'alice',
			expectedPhase: state.phase,
			expectedEvidenceIds: [...state.evidence],
			text: 'I saw the ledger.',
			intent: 'answer' as const,
		};
		const beforeCross = step(sampleStory, state, { type: 'TICK', steps: 60 });
		const moved = step(sampleStory, beforeCross, { type: 'MOVE_SETTLED', actorId: 'jester', station: 'witness', outcome: 'finished' });
		const changedPhase = step(sampleStory, moved, { type: 'TICK' });
		expect(step(sampleStory, changedPhase, base)).toEqual(changedPhase);
		expect(step(sampleStory, state, { ...base, expectedEvidenceIds: [] })).toEqual(state);
		expect(step(sampleStory, state, { ...base, actorId: 'unknown' })).toEqual(state);
		expect(step(sampleStory, state, { ...base, intent: 'mint_evidence' as never })).toEqual(state);
		expect(step(sampleStory, state, { ...base, text: ' ' })).toEqual(state);
	});
});

describe('asset manifest', () => {
	it('selects LOD by distance and rejects unsafe packs', () => {
		const lo = { level: 2 as const, url: '/lo', bytes: 2, sha256: 'b'.repeat(64), distance: 30 };
		const hi = { level: 0 as const, url: '/hi', bytes: 10, sha256: 'a'.repeat(64), distance: 0 };
		expect(selectLod([hi, lo], 40).level).toBe(2);
		expect(selectLod([hi, lo], 5).level).toBe(0);
		const pack = (url: string): AssetPack => ({ id: 'p', revision: 'r', models: [{ ...hi, url }], textures: [] });
		expect(() => validatePack(pack('/models/ok.glb'))).not.toThrow();
		for (const bad of ['https://x/y.glb', '//x/y.glb', '/a/../b.glb']) expect(() => validatePack(pack(bad))).toThrow();
	});
});

describe('scene adapter (real CourtroomScene method names)', () => {
	const story: Story = {
		...sampleStory,
		actors: [
			{ ...sampleStory.actors[0], id: 'alice', role: 'defense' },
			{ ...sampleStory.actors[1], id: 'jester', role: 'jester' },
		],
	};
	const make = () => {
		const calls: unknown[][] = [];
		const unmapped: unknown[] = [];
		const scene: SceneLike = {
			playAnimation: (r, a) => calls.push(['play', r, a]),
			showCharacter: (r) => calls.push(['show', r]),
			setPhase: (p) => calls.push(['phase', p]),
		};
		const adapter = createSceneAdapter(scene, ActorRegistry.fromStory(story), { onUnmapped: (u) => unmapped.push(u) });
		return { calls, unmapped, adapter };
	};

	it('maps actor ids to scene roles and clips, moods and phases to scene vocabulary', () => {
		const { calls, adapter } = make();
		adapter.setAnimation('alice', 'talk');
		adapter.setEmotion('alice', 'angry');
		adapter.setDialogue('alice', 'Order.');
		adapter.setPhase('opening');
		expect(calls).toEqual([['play', 'defense', 'speaking'], ['play', 'defense', 'react_angry'], ['show', 'defense'], ['phase', 'opening_statements']]);
	});

	it('maps the jester persona onto Alice while still rejecting unknown clips and actors', () => {
		const { calls, unmapped, adapter } = make();
		adapter.setAnimation('jester', 'idle');
		adapter.setAnimation('alice', 'moonwalk');
		adapter.setAnimation('ghost', 'idle');
		expect(calls).toEqual([['play', 'defense', 'idle']]);
		expect(unmapped).toEqual([
			{ actorId: 'alice', reason: 'unknown_clip', detail: 'moonwalk' },
			{ actorId: 'ghost', reason: 'unknown_actor' },
		]);
	});

	it('routes jester emotion to accessory mood and the existing defense animation owner', () => {
		const calls: unknown[][] = [];
		const scene: SceneLike = {
			playAnimation: (role, animation) => calls.push(['play', role, animation]),
			showCharacter: () => {},
			setPhase: () => {},
			setAccessoryMood: (role, mood) => calls.push(['accessoryMood', role, mood]),
		};
		const adapter = createSceneAdapter(scene, ActorRegistry.fromStory(sampleStory));
		adapter.setEmotion('jester', 'nervous');
		expect(calls).toEqual([
			['accessoryMood', 'defense', 'nervous'],
			['play', 'defense', 'react_surprised'],
		]);
	});

	it('only targets vocabulary the scene really has', () => {
		for (const v of [...Object.values(CLIP_TO_ANIM), ...Object.values(MOOD_TO_ANIM)]) expect(ANIMATION_TYPES as readonly string[]).toContain(v);
		for (const v of Object.values(STORY_PHASE_TO_TRIAL_PHASE)) expect(PHASE_CAMERA_MAP).toHaveProperty(v);
		expect(SCENE_ROLES).toEqual(['prosecutor', 'defense', 'judge', 'witness']);
	});
});
