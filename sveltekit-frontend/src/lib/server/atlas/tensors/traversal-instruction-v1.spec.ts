import { describe, expect, it } from 'vitest';
import { compileTraversalInstructionV1, DECISION_FLAGS, validateTraversalInstructionV1 } from './traversal-instruction-v1.js';

const checksum = 'a'.repeat(64);

function instruction(overrides: Record<string, unknown> = {}) {
  return {
    schema: 'atlas.traversal-instruction.v1',
    instructionId: 'instruction:1',
    snapshotRevision: 'snapshot:1',
    ordinalMapChecksum: checksum,
    actionKind: 'EXPAND_GRAPH',
    flags: DECISION_FLAGS.CONTINUE | DECISION_FLAGS.EXPAND_GRAPH,
    headMask: 1 | 4,
    primaryOrdinal: 83,
    candidateStart: 0,
    candidateCount: 6,
    topK: 6,
    graphDepth: 2,
    communityDepth: 1,
    confidence: 0.9,
    utility: 0.8,
    risk: 0.1,
    parameterOffset: 0,
    evidenceOffset: 0,
    producerRevision: 'instruction-producer:1',
    ...overrides,
  };
}

describe('TraversalInstructionV1', () => {
  it('uses compact control flags and revisioned ordinal identity', () => {
    expect(validateTraversalInstructionV1(instruction()).headMask).toBe(5);
  });

  it('rejects STOP with action flags', () => {
    expect(() => validateTraversalInstructionV1(instruction({ actionKind: 'STOP', flags: DECISION_FLAGS.CONTINUE, primaryOrdinal: null })))
      .toThrow('TRAVERSAL_STOP_MUST_HAVE_ZERO_FLAGS');
  });

  it('rejects graph expansion without depth', () => {
    expect(() => validateTraversalInstructionV1(instruction({ graphDepth: 0 })))
      .toThrow('TRAVERSAL_GRAPH_ACTION_REQUIRES_DEPTH');
  });

  it('compiles the same ordinal decision deterministically', () => {
    const input = {
      snapshotRevision: 'snapshot:1',
      ordinalMapChecksum: checksum,
      actionKind: 'EXPAND_GRAPH' as const,
      candidateOrdinals: [83, 991, 4217],
      primaryOrdinal: 83,
      headMask: 5,
      graphDepth: 2,
      communityDepth: 1,
      confidence: 0.9,
      utility: 0.8,
      risk: 0.1,
      producerRevision: 'instruction-producer:1',
    };
    const first = compileTraversalInstructionV1(input);
    const second = compileTraversalInstructionV1(input);
    expect(first).toEqual(second);
    expect(first.instructionId).toMatch(/^instruction:[a-f0-9]{64}$/);
    expect(first.candidateCount).toBe(3);
  });

  it('rejects a primary ordinal that is outside the admitted candidate set', () => {
    expect(() => compileTraversalInstructionV1({
      snapshotRevision: 'snapshot:1',
      ordinalMapChecksum: checksum,
      actionKind: 'FETCH_SOURCE',
      candidateOrdinals: [1, 2],
      primaryOrdinal: 3,
      confidence: 0.9,
      utility: 0.8,
      risk: 0.1,
      producerRevision: 'instruction-producer:1',
    })).toThrow('TRAVERSAL_PRIMARY_ORDINAL_NOT_IN_CANDIDATES');
  });
});
