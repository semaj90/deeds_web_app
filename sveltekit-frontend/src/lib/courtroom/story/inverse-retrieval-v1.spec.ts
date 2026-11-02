import { describe, it, expect } from 'vitest';
import {
	computeCosineSimilarity,
	compareRankedChunks,
	exactScanTopK,
	rankChunksByCosine,
	evaluateTopKRecall,
	groundCuesWithInverseRetrieval,
	type RankedChunk
} from './inverse-retrieval-v1.js';
import type { StoryChunk } from './store.js';
import type { Cue } from './engine.js';

describe('Courtroom Inverse Retrieval (inverse-retrieval-v1)', () => {
	it('computeCosineSimilarity calculates accurate normalized scores', () => {
		const vA = new Float32Array([1.0, 0.0, 0.0]);
		const vB = new Float32Array([1.0, 0.0, 0.0]);
		const vC = new Float32Array([0.0, 1.0, 0.0]);
		const vD = new Float32Array([-1.0, 0.0, 0.0]);

		expect(computeCosineSimilarity(vA, vB)).toBeCloseTo(1.0, 5);
		expect(computeCosineSimilarity(vA, vC)).toBeCloseTo(0.0, 5);
		expect(computeCosineSimilarity(vA, vD)).toBeCloseTo(-1.0, 5);
	});

	it('computeCosineSimilarity rejects dimension mismatch', () => {
		const v3 = new Float32Array([1, 2, 3]);
		const v2 = new Float32Array([1, 2]);
		expect(() => computeCosineSimilarity(v3, v2)).toThrow(/dimension mismatch/);
	});

	it('rankChunksByCosine ranks chunks by score descending and breaks ties lexicographically', () => {
		const query = new Float32Array([1.0, 0.0, 0.0]);

		const chunks: StoryChunk[] = [
			{
				id: 'chunk-z',
				storyId: 's1',
				text: 'Z-tie',
				vector: new Float32Array([0.8, 0.6, 0.0]) // cos = 0.8
			},
			{
				id: 'chunk-a',
				storyId: 's1',
				text: 'A-tie',
				vector: new Float32Array([0.8, 0.6, 0.0]) // cos = 0.8 (same score)
			},
			{
				id: 'chunk-top',
				storyId: 's1',
				text: 'Top hit',
				vector: new Float32Array([1.0, 0.0, 0.0]) // cos = 1.0
			},
			{
				id: 'chunk-low',
				storyId: 's1',
				text: 'Low hit',
				vector: new Float32Array([0.0, 1.0, 0.0]) // cos = 0.0
			}
		];

		const results = rankChunksByCosine(query, chunks, { k: 3 });

		expect(results).toHaveLength(3);
		expect(results[0].chunkId).toBe('chunk-top');
		expect(results[0].score).toBeCloseTo(1.0, 4);

		// Tied chunks: 'chunk-a' must precede 'chunk-z' deterministically
		expect(results[1].chunkId).toBe('chunk-a');
		expect(results[2].chunkId).toBe('chunk-z');
	});

	it('evaluateTopKRecall computes exact recall and precision', () => {
		const gt: RankedChunk[] = [
			{ chunkId: 'c1', score: 0.95, chunk: {} as any },
			{ chunkId: 'c2', score: 0.85, chunk: {} as any },
			{ chunkId: 'c3', score: 0.75, chunk: {} as any }
		];

		const candidate: RankedChunk[] = [
			{ chunkId: 'c1', score: 0.95, chunk: {} as any },
			{ chunkId: 'c2', score: 0.85, chunk: {} as any },
			{ chunkId: 'c4', score: 0.70, chunk: {} as any }
		];

		const evalResult = evaluateTopKRecall(candidate, gt, 3);
		expect(evalResult.recall).toBeCloseTo(2 / 3, 4);
		expect(evalResult.precision).toBeCloseTo(2 / 3, 4);
		expect(evalResult.matchCount).toBe(2);
		expect(evalResult.tiesEncountered).toBe(false);
	});

	it('evaluateTopKRecall recognizes boundary ties correctly', () => {
		// Ground truth has a tie at rank 2 and 3
		const gt: RankedChunk[] = [
			{ chunkId: 'c1', score: 0.95, chunk: {} as any },
			{ chunkId: 'c2', score: 0.80, chunk: {} as any },
			{ chunkId: 'c3', score: 0.80, chunk: {} as any }
		];

		// Candidate returned c1 and c3 for top-2
		const candidate: RankedChunk[] = [
			{ chunkId: 'c1', score: 0.95, chunk: {} as any },
			{ chunkId: 'c3', score: 0.80, chunk: {} as any }
		];

		const evalResult = evaluateTopKRecall(candidate, gt, 2);
		expect(evalResult.tiesEncountered).toBe(true);
		expect(evalResult.recall).toBe(1.0);
		expect(evalResult.matchCount).toBe(2);
	});

	it('groundCuesWithInverseRetrieval grounds dialogue cues that meet score threshold', () => {
		const cues: Cue[] = [
			{
				id: 'cue-1',
				tick: 1,
				actorId: 'witness-1',
				kind: 'dialogue',
				value: 'I saw the transaction on June 12.'
			},
			{
				id: 'cue-2',
				tick: 2,
				actorId: 'judge-1',
				kind: 'dialogue',
				value: 'Let the record reflect the witness statement.'
			},
			{
				id: 'cue-move',
				tick: 3,
				actorId: 'witness-1',
				kind: 'move',
				value: 'witness'
			}
		];

		const chunks: StoryChunk[] = [
			{
				id: 'chunk-contract-date',
				storyId: 's1',
				text: 'The deed was signed on June 12 by both parties.',
				vector: new Float32Array([1.0, 0.0, 0.0])
			},
			{
				id: 'chunk-unrelated',
				storyId: 's1',
				text: 'Weather was sunny.',
				vector: new Float32Array([0.0, 1.0, 0.0])
			}
		];

		const embeddings = new Map<string, Float32Array>();
		embeddings.set('cue-1', new Float32Array([0.95, 0.05, 0.0])); // high similarity to chunk-contract-date
		embeddings.set('cue-2', new Float32Array([0.1, 0.2, 0.3])); // low similarity

		const result = groundCuesWithInverseRetrieval(cues, chunks, embeddings, { minScore: 0.7 });

		expect(result.groundedCues).toHaveLength(3);
		expect(result.groundedCues[0].requiredEvidence).toBe('chunk-contract-date');
		expect(result.groundedCues[1].requiredEvidence).toBeUndefined(); // below threshold
		expect(result.groundedCues[2].requiredEvidence).toBeUndefined(); // non-dialogue untouched

		expect(result.matchSummary).toHaveLength(1);
		expect(result.matchSummary[0].cueId).toBe('cue-1');
		expect(result.matchSummary[0].chunkId).toBe('chunk-contract-date');
		expect(result.unmatchedDialogueCount).toBe(1);
	});
});
