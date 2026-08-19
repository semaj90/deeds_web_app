import { describe, expect, it } from 'vitest';
import { buildTokenAwareContextPlan } from './context-window-synthesis.js';

describe('context-window-synthesis', () => {
  const candidates = [
    { packetKey: 'p1', sourceRef: 'file:a.ts', sourceRevision: '1', ordinal: 0, tokenCount: 120, score: 0.95, exactEvidence: true, cacheHotness: 0.2, graphAuthority: 0.8, communityId: 'c1', contentRef: 'span:a:0' },
    { packetKey: 'p2', sourceRef: 'file:a.ts', sourceRevision: '1', ordinal: 1, tokenCount: 120, score: 0.85, exactEvidence: false, cacheHotness: 0.3, graphAuthority: 0.7, communityId: 'c1', contentRef: 'span:a:1' },
    { packetKey: 'p3', sourceRef: 'file:a.ts', sourceRevision: '1', ordinal: 2, tokenCount: 120, score: 0.7, exactEvidence: false, cacheHotness: 0.1, graphAuthority: 0.4, communityId: 'c2', contentRef: 'span:a:2' },
    { packetKey: 'p4', sourceRef: 'file:b.ts', sourceRevision: '1', ordinal: 0, tokenCount: 160, score: 0.9, exactEvidence: true, cacheHotness: 0.5, graphAuthority: 0.6, communityId: 'c3', contentRef: 'span:b:0' },
  ];

  const input = {
    schema: 'atlas.context-window-input.v1' as const,
    requestId: 'req-ctx',
    queryText: 'fix function callers',
    topoClass: 4,
    clusterId: 12,
    resolvedDir: 'src/lib',
    workspaceRevision: '742',
    candidates,
    budget: {
      totalTokens: 900,
      reservedPromptTokens: 100,
      reservedToolTokens: 100,
      reservedOutputTokens: 200,
      maxWindows: 3,
      maxWindowTokens: 250,
      overlapTokens: 80,
      minExactEvidenceTokens: 120,
    },
    producerRevision: 'test',
  };

  it('reserves exact evidence then fills remaining token capacity deterministically', () => {
    const first = buildTokenAwareContextPlan(input);
    const second = buildTokenAwareContextPlan(input);
    expect(first).toEqual(second);
    expect(first.availableTokens).toBe(500);
    expect(first.selectedTokens).toBeLessThanOrEqual(500);
    expect(first.exactEvidenceFloorSatisfied).toBe(true);
    expect(first.selectedPacketKeys).toContain('p1');
    expect(first.canonicalWritesAllowed).toBe(false);
  });

  it('preserves source-local ordinal ordering inside each sliding window', () => {
    const plan = buildTokenAwareContextPlan(input);
    for (const window of plan.windows) {
      const ordinals = window.members.map((member) => member.ordinal);
      expect(ordinals).toEqual([...ordinals].sort((a, b) => a - b));
    }
  });

  it('emits read/warm proposals but never authorizes cache side effects', () => {
    const plan = buildTokenAwareContextPlan(input);
    expect(plan.cacheProposals.some((row) => row.owner === 'ACE' && row.action === 'READ')).toBe(true);
    expect(plan.cacheProposals.some((row) => row.owner === 'BIFROST' && row.action === 'WARM')).toBe(true);
    expect(plan.cacheProposals.every((row) => row.sideEffectsAuthorized === false)).toBe(true);
    expect(plan.cacheProposals.filter((row) => row.owner === 'BIFROST').every((row) => row.key.startsWith('bifrost:'))).toBe(true);
  });
});
