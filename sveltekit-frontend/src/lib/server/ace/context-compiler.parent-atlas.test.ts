import { describe, expect, it } from 'vitest';

import {
  compareBitfrostCohorts,
  compileContext,
  scoreContextCandidate,
  summarizeBitfrostEffectiveness,
  type ContextCandidate,
  type ContextSelectionPolicy,
} from './context-compiler.parent-atlas';

const policy: ContextSelectionPolicy = {
  version: 'atlas.context.v1',
  token_budget: 100,
  reserved_tokens: 20,
  min_score: 0.25,
  max_packets: 4,
};

function candidate(
  overrides: Partial<ContextCandidate> & Pick<ContextCandidate, 'packet_key'>
): ContextCandidate {
  return {
    packet_key: overrides.packet_key,
    content: overrides.content ?? 'x'.repeat(80), // ~20 tokens
    lanes: overrides.lanes ?? ['dense'],
    relevance: overrides.relevance ?? 0.7,
    authority: overrides.authority ?? 0.5,
    freshness: overrides.freshness ?? 0.5,
    ...overrides,
  };
}

describe('context-compiler.parent-atlas', () => {
  it('warming does not change semantic score', () => {
    const cold = candidate({ packet_key: 'p1', warmed: false, cache_hit: false });
    const warm = candidate({ packet_key: 'p1', warmed: true, cache_hit: true });
    expect(scoreContextCandidate(cold, policy)).toBe(scoreContextCandidate(warm, policy));
  });

  it('warm low-quality candidates do not blindly expand prompt', () => {
    const compiled = compileContext({
      request_id: 'req-1',
      policy,
      now: new Date('2026-08-07T18:00:00Z'),
      candidates: [
        candidate({ packet_key: 'good', relevance: 0.95, token_count: 30 }),
        candidate({
          packet_key: 'warm-bad',
          relevance: 0.0,
          authority: 0.0,
          freshness: 0.0,
          warmed: true,
          cache_hit: true,
          token_count: 40,
        }),
      ],
    });

    expect(compiled.manifest.selected_packet_keys).toEqual(['good']);
    expect(compiled.manifest.warming.warmed_rejected).toBe(1);
    expect(compiled.manifest.warming.avoided_prompt_tokens).toBe(40);
    expect(compiled.manifest.selected_tokens).toBeLessThanOrEqual(
      compiled.manifest.usable_token_budget
    );
  });

  it('same inputs produce same manifest identity and ordering', () => {
    const input = {
      request_id: 'req-deterministic',
      feature_id: 'feature:todo:abc',
      source_refs: ['todo:x#line:1'],
      policy,
      candidates: [
        candidate({ packet_key: 'b', relevance: 0.8, token_count: 20 }),
        candidate({ packet_key: 'a', relevance: 0.8, token_count: 20 }),
      ],
    };
    const a = compileContext({ ...input, now: new Date('2026-08-07T18:00:00Z') });
    const b = compileContext({ ...input, now: new Date('2026-08-08T18:00:00Z') });
    expect(a.manifest.manifest_id).toBe(b.manifest.manifest_id);
    expect(a.manifest.selected_packet_keys).toEqual(b.manifest.selected_packet_keys);
  });

  it('deduplicates a packet found by dense and graph lanes', () => {
    const compiled = compileContext({
      request_id: 'req-dedupe',
      policy,
      candidates: [
        candidate({ packet_key: 'same', lanes: ['dense'], relevance: 0.8 }),
        candidate({ packet_key: 'same', lanes: ['graph'], relevance: 0.7, graph_distance: 1, warmed: true }),
      ],
    });
    expect(compiled.manifest.retrieved_candidates).toBe(1);
    expect(compiled.manifest.lanes.dense).toBe(1);
    expect(compiled.manifest.lanes.graph).toBe(1);
    expect(compiled.manifest.warmed_candidates).toBe(1);
  });

  it('required exact evidence is prioritized but still obeys hard token budget', () => {
    const compiled = compileContext({
      request_id: 'req-required',
      policy: { ...policy, token_budget: 60, reserved_tokens: 20 },
      candidates: [
        candidate({
          packet_key: 'required',
          required: true,
          lanes: ['exact'],
          relevance: 0.1,
          token_count: 35,
        }),
        candidate({ packet_key: 'ranked', relevance: 1, token_count: 20 }),
      ],
    });
    expect(compiled.manifest.selected_packet_keys).toEqual(['required']);
    expect(compiled.manifest.selected_tokens).toBe(35);
  });

  it('Bitfrost effectiveness joins manifests to validated repair outcomes', () => {
    const compiled = compileContext({
      request_id: 'req-metrics',
      policy,
      candidates: [
        candidate({ packet_key: 'warm-good', relevance: 0.95, warmed: true, cache_hit: true, token_count: 20 }),
        candidate({ packet_key: 'warm-bad', relevance: 0, authority: 0, freshness: 0, warmed: true, token_count: 20 }),
      ],
    });

    const metrics = summarizeBitfrostEffectiveness([
      {
        manifest: compiled.manifest,
        outcome: {
          request_id: 'req-metrics',
          manifest_id: compiled.manifest.manifest_id,
          success: true,
          attempts: 1,
          validation_passed: true,
          retrieval_latency_ms: 25,
          total_runtime_ms: 800,
        },
      },
    ]);

    expect(metrics.runs).toBe(1);
    expect(metrics.success_rate).toBe(1);
    expect(metrics.average_retrieval_latency_ms).toBe(25);
    expect(metrics.average_avoided_prompt_tokens).toBeGreaterThan(0);
  });

  it('warm-vs-cold cohort comparison exposes repair/latency/token deltas', () => {
    const cold = compileContext({
      request_id: 'cold',
      policy,
      candidates: [candidate({ packet_key: 'cold-p', relevance: 0.9, token_count: 30 })],
    });
    const warm = compileContext({
      request_id: 'warm',
      policy,
      candidates: [
        candidate({ packet_key: 'warm-p', relevance: 0.9, warmed: true, cache_hit: true, token_count: 20 }),
      ],
    });

    const comparison = compareBitfrostCohorts([
      {
        manifest: cold.manifest,
        outcome: {
          request_id: 'cold',
          manifest_id: cold.manifest.manifest_id,
          success: false,
          attempts: 2,
          validation_passed: false,
          retrieval_latency_ms: 100,
          total_runtime_ms: 1000,
        },
      },
      {
        manifest: warm.manifest,
        outcome: {
          request_id: 'warm',
          manifest_id: warm.manifest.manifest_id,
          success: true,
          attempts: 1,
          validation_passed: true,
          retrieval_latency_ms: 40,
          total_runtime_ms: 700,
        },
      },
    ]);

    expect(comparison.cold.runs).toBe(1);
    expect(comparison.warm.runs).toBe(1);
    expect(comparison.delta.success_rate).toBe(1);
    expect(comparison.delta.average_retrieval_latency_ms).toBe(-60);
    expect(comparison.delta.average_total_runtime_ms).toBe(-300);
    expect(comparison.delta.average_selected_tokens).toBe(-10);
  });
});
