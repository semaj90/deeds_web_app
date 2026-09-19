import { describe, expect, it } from 'vitest';
import { projectOakExecutionReceiptToAgenticHyperEdgeV1 } from './execution-receipt-hyperedge-v1.js';

const receipt = {
  schema: 'atlas.oak-execution-receipt.v1' as const,
  planId: 'plan:1',
  planChecksum: 'a'.repeat(64),
  actions: [{
    id: 'action:1', actionKind: 'AST_SCAN' as const, status: 'SUCCEEDED' as const,
    inputChecksum: 'b'.repeat(64), outputChecksum: 'c'.repeat(64), durationMs: 2,
    writesPerformed: false as const, canonicalAuthority: false as const,
  }],
  deterministicExecutionChecksum: 'd'.repeat(64),
  writesPerformed: false as const,
  canonicalAuthority: false as const,
};

describe('execution receipt to agentic hyperedge v1', () => {
  it('projects execution evidence without inventing canonical member IDs', () => {
    const edge = projectOakExecutionReceiptToAgenticHyperEdgeV1(receipt);
    expect(edge.members).toHaveLength(1);
    expect(edge.members[0].canonicalId).toBeNull();
    expect(edge.members[0].resolutionState).toBe('UNAVAILABLE');
    expect(edge.members[0].evidenceRefs).toContain('output:' + 'c'.repeat(64));
    expect(edge.canonicalAuthority).toBe(false);
    expect(edge.writesPerformed).toBe(false);
  });

  it('rejects an authoritative receipt at this projection boundary', () => {
    expect(() => projectOakExecutionReceiptToAgenticHyperEdgeV1({ ...receipt, canonicalAuthority: true })).toThrow('EXECUTION_RECEIPT_HYPEREDGE_REQUIRES_NONAUTHORITATIVE_RECEIPT');
  });
});
