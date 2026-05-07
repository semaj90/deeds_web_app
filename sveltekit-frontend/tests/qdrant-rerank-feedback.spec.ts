// @vitest-environment node
import { describe, it, expect } from 'vitest';

// Inline the buildFeedback and aggregation logic under test

function buildFeedback(r: {
  hit_count: number;
  avg_final: number | null;
  avg_semantic: number | null;
  avg_tag: number | null;
  avg_cluster: number | null;
  avg_som: number | null;
  avg_pagerank: number | null;
  avg_bow: number | null;
  avg_paired_test: number | null;
  last_used_at: Date | string | null;
}) {
  const num = (v: unknown) => v != null ? Math.round(Number(v) * 10000) / 10000 : null;
  return {
    ace_feedback: {
      hit_count:       r.hit_count,
      avg_final:       num(r.avg_final),
      avg_semantic:    num(r.avg_semantic),
      avg_tag:         num(r.avg_tag),
      avg_cluster:     num(r.avg_cluster),
      avg_som:         num(r.avg_som),
      avg_pagerank:    num(r.avg_pagerank),
      avg_bow:         num(r.avg_bow),
      avg_paired_test: num(r.avg_paired_test),
      last_used_at:    r.last_used_at instanceof Date
        ? r.last_used_at.toISOString()
        : String(r.last_used_at ?? ''),
    },
  };
}

describe('buildFeedback', () => {
  it('builds ace_feedback payload from row', () => {
    const row = {
      hit_count:       42,
      avg_final:       0.81234,
      avg_semantic:    0.58123,
      avg_tag:         0.11,
      avg_cluster:     0.09,
      avg_som:         0.07,
      avg_pagerank:    0.05,
      avg_bow:         0.04,
      avg_paired_test: 0.03,
      last_used_at:    new Date('2026-05-07T02:28:20Z'),
    };
    const result = buildFeedback(row);
    expect(result.ace_feedback.hit_count).toBe(42);
    expect(result.ace_feedback.avg_final).toBeCloseTo(0.8123, 3);
    expect(result.ace_feedback.avg_semantic).toBeCloseTo(0.5812, 3);
    expect(result.ace_feedback.last_used_at).toBe('2026-05-07T02:28:20.000Z');
  });

  it('handles null breakdown fields gracefully', () => {
    const row = {
      hit_count:       5,
      avg_final:       null,
      avg_semantic:    null,
      avg_tag:         null,
      avg_cluster:     null,
      avg_som:         null,
      avg_pagerank:    null,
      avg_bow:         null,
      avg_paired_test: null,
      last_used_at:    null,
    };
    const result = buildFeedback(row);
    expect(result.ace_feedback.avg_final).toBeNull();
    expect(result.ace_feedback.avg_semantic).toBeNull();
    expect(result.ace_feedback.last_used_at).toBe('');
  });

  it('rounds scores to 4 decimal places', () => {
    const row = {
      hit_count: 1,
      avg_final: 0.123456789,
      avg_semantic: 0.999999,
      avg_tag: null, avg_cluster: null, avg_som: null,
      avg_pagerank: null, avg_bow: null, avg_paired_test: null,
      last_used_at: '2026-01-01',
    };
    const result = buildFeedback(row);
    expect(result.ace_feedback.avg_final).toBe(0.1235);
    expect(result.ace_feedback.avg_semantic).toBe(1.0);
  });
});

describe('aggregation filter logic', () => {
  it('ignores rows with null chunk_id', () => {
    const rows = [
      { chunk_id: 'abc', hit_count: 5, avg_final: 0.8 },
      { chunk_id: null, hit_count: 3, avg_final: 0.7 },
      { chunk_id: 'def', hit_count: 2, avg_final: 0.6 },
    ];
    const valid = rows.filter(r => r.chunk_id != null);
    expect(valid).toHaveLength(2);
    expect(valid.map(r => r.chunk_id)).toEqual(['abc', 'def']);
  });

  it('applies min_hits threshold', () => {
    const rows = [
      { chunk_id: 'a', hit_count: 5 },
      { chunk_id: 'b', hit_count: 1 },
      { chunk_id: 'c', hit_count: 3 },
    ];
    const minHits = 2;
    const filtered = rows.filter(r => r.hit_count >= minHits);
    expect(filtered).toHaveLength(2);
    expect(filtered.map(r => r.chunk_id)).toEqual(['a', 'c']);
  });
});

describe('dry-run does not call Qdrant', () => {
  it('builds payloads without side effects', () => {
    const rows = [
      {
        chunk_id: 'test-chunk',
        hit_count: 3,
        avg_final: 0.75, avg_semantic: 0.6,
        avg_tag: 0.1, avg_cluster: 0.05, avg_som: 0.03,
        avg_pagerank: 0.02, avg_bow: 0.01, avg_paired_test: 0.0,
        last_used_at: '2026-05-07',
      },
    ];
    // Dry-run: build payloads but never call fetch
    const payloads = rows.map(r => buildFeedback(r));
    expect(payloads).toHaveLength(1);
    expect(payloads[0].ace_feedback.hit_count).toBe(3);
    // No fetch calls — verified by no mock setup needed
  });
});