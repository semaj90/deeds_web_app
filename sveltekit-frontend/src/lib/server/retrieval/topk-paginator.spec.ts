import { describe, it, expect } from 'vitest';
import {
  BoundedMinHeap,
  extractTopKPaginated,
  canonicalTopKPaginate,
  type ScoredCandidate,
  type RankedCandidateV1,
} from './topk-paginator.js';

describe('BoundedMinHeap', () => {
  it('retains only the top-K elements', () => {
    const heap = new BoundedMinHeap<string>(3);
    const items: ScoredCandidate<string>[] = [
      { id: 'a', score: 0.1 },
      { id: 'b', score: 0.9 },
      { id: 'c', score: 0.5 },
      { id: 'd', score: 0.8 },
      { id: 'e', score: 0.2 },
    ];

    for (const item of items) {
      heap.push(item);
    }

    const sorted = heap.extractSorted();
    expect(sorted).toHaveLength(3);
    expect(sorted.map(s => s.id)).toEqual(['b', 'd', 'c']);
    expect(sorted.map(s => s.score)).toEqual([0.9, 0.8, 0.5]);
  });

  it('breaks ties deterministically by candidateOrdinal then id (SCORE_DESC_ORDINAL_ASC_ID_ASC)', () => {
    const heap = new BoundedMinHeap<null>(3);
    heap.push({ id: 'item_2', score: 0.5, candidateOrdinal: 2 });
    heap.push({ id: 'item_1', score: 0.5, candidateOrdinal: 1 });
    heap.push({ id: 'item_3', score: 0.5, candidateOrdinal: 3 });

    const sorted = heap.extractSorted();
    expect(sorted.map(s => s.id)).toEqual(['item_1', 'item_2', 'item_3']);
  });

  it('evicts worse candidates on score ties (higher ordinal evicted first)', () => {
    // Capacity 2: should keep ordinal 1 and 2, evicting ordinal 10
    const heap = new BoundedMinHeap<null>(2);
    heap.push({ id: 'item_10', score: 0.5, candidateOrdinal: 10 });
    heap.push({ id: 'item_2', score: 0.5, candidateOrdinal: 2 });
    heap.push({ id: 'item_1', score: 0.5, candidateOrdinal: 1 });

    const sorted = heap.extractSorted();
    expect(sorted).toHaveLength(2);
    expect(sorted.map(s => s.id)).toEqual(['item_1', 'item_2']);
  });

  it('evicts worse candidates on ordinal ties (lexicographically greater id evicted first)', () => {
    // Capacity 2: should keep 'apple' and 'banana', evicting 'zebra'
    const heap = new BoundedMinHeap<null>(2);
    heap.push({ id: 'zebra', score: 0.5, candidateOrdinal: 1 });
    heap.push({ id: 'banana', score: 0.5, candidateOrdinal: 1 });
    heap.push({ id: 'apple', score: 0.5, candidateOrdinal: 1 });

    const sorted = heap.extractSorted();
    expect(sorted).toHaveLength(2);
    expect(sorted.map(s => s.id)).toEqual(['apple', 'banana']);
  });

  it('rejects non-finite scores with explicit error', () => {
    const heap = new BoundedMinHeap<null>(2);
    expect(() => heap.push({ id: 'nan', score: NaN })).toThrow(/Non-finite candidate score/);
    expect(() => heap.push({ id: 'inf', score: Infinity })).toThrow(/Non-finite candidate score/);
    expect(() => heap.push({ id: 'neginf', score: -Infinity })).toThrow(/Non-finite candidate score/);
  });
});

describe('extractTopKPaginated', () => {
  it('extracts paginated slices accurately', () => {
    const candidates: ScoredCandidate<number>[] = Array.from({ length: 100 }, (_, i) => ({
      id: `node_${i}`,
      score: i,
      candidateOrdinal: i,
    }));

    const page1 = extractTopKPaginated(candidates, { k: 5, offset: 0 });
    expect(page1.items).toHaveLength(5);
    expect(page1.items.map(s => s.score)).toEqual([99, 98, 97, 96, 95]);
    expect(page1.totalCandidates).toBe(100);
    expect(page1.hasMore).toBe(true);

    const page2 = extractTopKPaginated(candidates, { k: 5, offset: 5 });
    expect(page2.items).toHaveLength(5);
    expect(page2.items.map(s => s.score)).toEqual([94, 93, 92, 91, 90]);
  });

  it('handles empty or small inputs gracefully', () => {
    const result = extractTopKPaginated([], { k: 10, offset: 0 });
    expect(result.items).toHaveLength(0);
    expect(result.totalCandidates).toBe(0);
    expect(result.hasMore).toBe(false);
  });
});

describe('canonicalTopKPaginate', () => {
  it('emits CanonicalTopKResultV1 schema with exact ordering', () => {
    const candidates: RankedCandidateV1[] = [
      { canonicalId: 'card:b', candidateOrdinal: 2, score: 0.75, sourceRevision: 'rev1', evidenceRefs: ['ev1'] },
      { canonicalId: 'card:a', candidateOrdinal: 1, score: 0.75, sourceRevision: 'rev1', evidenceRefs: ['ev2'] },
      { canonicalId: 'card:c', candidateOrdinal: 3, score: 0.90, sourceRevision: 'rev1', evidenceRefs: ['ev3'] },
      { canonicalId: 'card:d', candidateOrdinal: 1, score: 0.50, sourceRevision: 'rev1', evidenceRefs: ['ev4'] },
    ];

    const result = canonicalTopKPaginate(candidates, { k: 3, offset: 0 });
    expect(result.schema).toBe('atlas.topk.v1');
    expect(result.order).toBe('SCORE_DESC_ORDINAL_ASC_ID_ASC');
    expect(result.totalCandidates).toBe(4);
    expect(result.hasMore).toBe(true);
    expect(result.candidates.map(c => c.canonicalId)).toEqual(['card:c', 'card:a', 'card:b']);
  });

  it('returns identical canonical results regardless of candidate input order', () => {
    const candidates: RankedCandidateV1[] = [
      { canonicalId: 'card:z', candidateOrdinal: 7, score: 0.8, sourceRevision: 'rev1', evidenceRefs: ['ev-z'] },
      { canonicalId: 'card:b', candidateOrdinal: 2, score: 0.8, sourceRevision: 'rev1', evidenceRefs: ['ev-b'] },
      { canonicalId: 'card:a', candidateOrdinal: 2, score: 0.8, sourceRevision: 'rev1', evidenceRefs: ['ev-a'] },
      { canonicalId: 'card:c', candidateOrdinal: 1, score: 0.9, sourceRevision: 'rev1', evidenceRefs: ['ev-c'] },
      { canonicalId: 'card:d', candidateOrdinal: 4, score: 0.5, sourceRevision: 'rev1', evidenceRefs: ['ev-d'] },
    ];

    const forward = canonicalTopKPaginate(candidates, { k: 4, offset: 0 });
    const reverse = canonicalTopKPaginate([...candidates].reverse(), { k: 4, offset: 0 });

    expect(reverse).toEqual(forward);
    expect(forward.candidates.map(candidate => candidate.canonicalId)).toEqual([
      'card:c',
      'card:a',
      'card:b',
      'card:z',
    ]);
  });

  it('correctly paginates with offset', () => {
    const candidates: RankedCandidateV1[] = [
      { canonicalId: 'card:c', candidateOrdinal: 3, score: 0.90, sourceRevision: 'rev1', evidenceRefs: ['ev3'] },
      { canonicalId: 'card:a', candidateOrdinal: 1, score: 0.75, sourceRevision: 'rev1', evidenceRefs: ['ev2'] },
      { canonicalId: 'card:b', candidateOrdinal: 2, score: 0.75, sourceRevision: 'rev1', evidenceRefs: ['ev1'] },
      { canonicalId: 'card:d', candidateOrdinal: 1, score: 0.50, sourceRevision: 'rev1', evidenceRefs: ['ev4'] },
    ];

    const page2 = canonicalTopKPaginate(candidates, { k: 2, offset: 2 });
    expect(page2.candidates.map(c => c.canonicalId)).toEqual(['card:b', 'card:d']);
    expect(page2.hasMore).toBe(false);
  });
});
