import { describe, expect, it, vi } from 'vitest';
import type { ActorSpec } from './engine';
import {
	buildGroundedProposal,
	evaluateGrounding,
	evaluateGroundingAsync,
	createRuleBasedSupportChecker,
	createOrnithSupportChecker,
	type EvidenceSnapshot
} from './proposal-v1';
import { compileStory, fnv1a32, replayStory } from './replay-v1';

const actors: ActorSpec[] = [
	{ id: 'witness1', role: 'witness', name: 'Witness', asset: '/models/courtroom/character_alice_full.glb', clips: {}, personality: { patience: 5, honesty: 5 } }
];
const snap = (over: Partial<EvidenceSnapshot> = {}): EvidenceSnapshot => ({
	digest: 'sha256:aaa',
	caseScope: 'case-1',
	chunks: new Map([
		['c1', { revision: 'r1', text: 'The ledger was locked in the safe on Friday. Nobody else had the key.' }],
		['c2', { revision: 'r1', text: 'The back door was open at nine.' }]
	]),
	...over
});
const build = (s = snap(), chunkIds = ['c1', 'c2']) =>
	buildGroundedProposal({ proposalId: 'p1', storyId: 'story-1', title: 'T', actors, speakerActorId: 'witness1', snapshot: s, chunkIds });

describe('grounded story proposal', () => {
	it('builds one cited dialogue cue per chunk from its first sentence, deterministically', () => {
		const p = build();
		expect(p.groundingStatus).toBe('PROPOSED');
		const lines = p.story.cues.filter((c) => c.kind === 'dialogue');
		expect(lines.map((c) => [c.value, c.requiredEvidence])).toEqual([
			['The ledger was locked in the safe on Friday.', 'c1'],
			['The back door was open at nine.', 'c2']
		]);
		expect(JSON.stringify(build())).toBe(JSON.stringify(p));
	});

	it('skips a chunk the snapshot does not hold instead of inventing a line', () => {
		expect(build(snap(), ['c1', 'missing']).story.cues.filter((c) => c.kind === 'dialogue')).toHaveLength(1);
	});

	it('structural gate passes but stays PROPOSED with no semantic checker', () => {
		const r = evaluateGrounding(build(), snap());
		expect(r.gates.structural.ok).toBe(true);
		expect(r.gates.semantic.unknown).toHaveLength(2);
		expect(r.status).toBe('PROPOSED');
	});

	it('is VERIFIED only when a checker supports every line', () => {
		expect(evaluateGrounding(build(), snap(), () => 'SUPPORTED').status).toBe('VERIFIED');
		expect(evaluateGrounding(build(), snap(), (l) => (l.includes('door') ? 'UNSUPPORTED' : 'SUPPORTED')).status).toBe('REJECTED');
	});

	it('rejects a stale snapshot, another case, or a cue citing an unknown chunk', () => {
		expect(evaluateGrounding(build(), snap({ digest: 'sha256:bbb' })).gates.structural.reasons).toContain('SNAPSHOT_DIGEST_MISMATCH');
		expect(evaluateGrounding(build(), snap({ caseScope: 'case-2' })).gates.structural.reasons).toContain('CASE_SCOPE_MISMATCH');
		const emptied = snap({ chunks: new Map([['c1', { revision: 'r1', text: 'x.' }]]) });
		const r = evaluateGrounding(build(), emptied);
		expect(r.status).toBe('REJECTED');
		expect(r.gates.structural.reasons.some((x) => x.startsWith('UNKNOWN_CHUNK'))).toBe(true);
	});
});

describe('semantic support checkers (CSP-52)', () => {
	it('createRuleBasedSupportChecker detects exact matches and contradictions', () => {
		const check = createRuleBasedSupportChecker();

		// Exact match
		expect(check('The back door was open at nine.', 'The back door was open at nine.')).toBe('SUPPORTED');

		// High overlap
		expect(check('The safe was locked on Friday.', 'The ledger was locked in the safe on Friday.')).toBe('SUPPORTED');

		// Negation contradiction
		expect(check('The back door was not open at nine.', 'The back door was open at nine.')).toBe('UNSUPPORTED');

		// Number/amount contradiction
		expect(check('The total transferred was $500,000.', 'The total transferred was $5,000.')).toBe('UNSUPPORTED');

		// Unrelated
		expect(check('The sky was blue.', 'The ledger was locked in the safe.')).toBe('UNKNOWN');
	});

	it('createOrnithSupportChecker queries local endpoint and handles structured JSON', async () => {
		const mockFetch = vi.fn().mockResolvedValue({
			ok: true,
			json: async () => ({
				choices: [{ message: { content: '{"verdict": "SUPPORTED", "reason": "Direct statement"}' } }]
			})
		});

		const checker = createOrnithSupportChecker({ fetchFn: mockFetch as any });
		const verdict = await checker('The safe was locked.', 'The safe was locked on Friday.');

		expect(verdict).toBe('SUPPORTED');
		expect(mockFetch).toHaveBeenCalledWith(
			'http://127.0.0.1:8090/v1/chat/completions',
			expect.objectContaining({ method: 'POST' })
		);
	});

	it('createOrnithSupportChecker falls back to rule checker when endpoint is unreachable', async () => {
		const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));

		const checker = createOrnithSupportChecker({ fetchFn: mockFetch as any });
		// Exact substring in passage should still be verified by fallback rule checker
		const verdict = await checker('The back door was open at nine.', 'The back door was open at nine.');

		expect(verdict).toBe('SUPPORTED');
	});

	it('evaluateGroundingAsync verifies proposal with model checker', async () => {
		const mockChecker = vi.fn().mockResolvedValue('SUPPORTED');
		const result = await evaluateGroundingAsync(build(), snap(), mockChecker);

		expect(result.status).toBe('VERIFIED');
		expect(result.gates.structural.ok).toBe(true);
		expect(result.gates.semantic.ok).toBe(true);
		expect(result.gates.semantic.unsupported).toHaveLength(0);
	});
});

describe('story replay receipt', () => {
	it('sorts cues by tick then id', () => {
		const p = build();
		const shuffled = { ...p.story, cues: [...p.story.cues].reverse() };
		expect(compileStory(shuffled).cues.map((c) => c.id)).toEqual(compileStory(p.story).cues.map((c) => c.id));
	});

	it('replays identically and fires the cited lines only once the evidence is admitted', () => {
		const story = build().story;
		const a = replayStory(story, ['c1', 'c2'], 400);
		const b = replayStory(story, ['c1', 'c2'], 400);
		expect(a).toEqual(b);
		expect(a.transcriptLines).toBe(2);
		const without = replayStory(story, [], 400);
		expect(without.transcriptLines).toBe(0);
		expect(without.stateHash).not.toBe(a.stateHash);
	});

	it('hashes consistently', () => {
		expect(fnv1a32('abc')).toBe(fnv1a32('abc'));
		expect(fnv1a32('abc')).not.toBe(fnv1a32('abd'));
	});
});
