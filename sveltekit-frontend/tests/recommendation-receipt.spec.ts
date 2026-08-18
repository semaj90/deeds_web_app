import { describe, expect, it } from 'vitest';
import { buildRecommendationPlanReceipt, summarizeToolArgs } from '../src/lib/server/ai/recommendation-receipt.js';

describe('recommendation plan receipts', () => {
  it('records tool argument keys/checksum without exposing raw values', () => {
    const summary = summarizeToolArgs({ token: 'super-secret', path: 'src/a.ts' });
    expect(summary.keys).toEqual(['path', 'token']);
    expect(summary.checksum).toHaveLength(64);
    expect(JSON.stringify(summary)).not.toContain('super-secret');
  });

  it('preserves non-admissible required-lane state in the receipt', () => {
    const receipt = buildRecommendationPlanReceipt({
      receiptId: 'receipt:1',
      requestId: 'request:1',
      policyRevision: 'policy:v1',
      plan: {
        admissible: false,
        selected: ['semantic'],
        rejected: [{ lane: 'exact_promotion', reason: 'required_tool_call_budget_exceeded' }],
        blockingReasons: ['exact_promotion:tool_call_budget_exceeded'],
        totals: { utility: .95, latencyMs: 12, gpuBytes: 0, toolCalls: 0, contextTokens: 0, graphHops: 0, candidateCount: 20 },
      },
      budget: { maxCandidates: 20, maxGraphHops: 1, maxToolCalls: 0, maxContextTokens: 1024, maxGpuBytes: 0, maxLatencyMs: 100 },
      toolArgs: { operation: 'patch', token: 'super-secret' },
      producerRevision: 'test',
    });
    expect(receipt.admissible).toBe(false);
    expect(receipt.toolArgKeys).toContain('operation');
    expect(JSON.stringify(receipt)).not.toContain('super-secret');
  });
});
