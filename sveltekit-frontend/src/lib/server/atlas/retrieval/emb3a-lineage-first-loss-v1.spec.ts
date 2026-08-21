import { describe, expect, it } from 'vitest';

import {
  classifyEmb3aLineageAuditV1,
  classifyEmb3aLineageFieldV1,
  type Emb3aLineageFieldAuditV1,
} from './emb3a-lineage-first-loss-v1.js';

function row(
  field: Emb3aLineageFieldAuditV1['field'],
  overrides: Partial<Emb3aLineageFieldAuditV1> = {},
): Emb3aLineageFieldAuditV1 {
  return {
    field,
    canonicalSource: 'PRESENT',
    snapshotPresent: 'PRESENT',
    outboxPresent: 'PRESENT',
    builderPresent: 'PRESENT',
    qdrantPayloadPresent: 'PRESENT',
    payloadIndexPresent: 'PRESENT',
    filterRequiresIndex: false,
    ...overrides,
  };
}

describe('EMB3-F1A first-loss lineage classifier', () => {
  it('classifies missing canonical source authority before downstream projection gaps', () => {
    const result = classifyEmb3aLineageFieldV1(row('source_revision', {
      canonicalSource: 'MISSING',
      snapshotPresent: 'MISSING',
      outboxPresent: 'MISSING',
      builderPresent: 'MISSING',
      qdrantPayloadPresent: 'MISSING',
    }));

    expect(result.firstLoss).toBe('CANONICAL_SOURCE_GAP');
    expect(result.projectionReady).toBe(false);
  });

  it('does not authorize a writer patch while revision ownership is upstream-missing', () => {
    const result = classifyEmb3aLineageAuditV1([
      row('packet_key'),
      row('source_ref'),
      row('workspace_revision', { canonicalSource: 'MISSING' }),
      row('source_revision', { canonicalSource: 'MISSING' }),
      row('representation_id'),
      row('representation_revision'),
    ]);

    expect(result.status).toBe('EMB3A_BLOCKED_BY_UPSTREAM_LINEAGE');
    expect(result.writerPatchAllowed).toBe(false);
    expect(result.qdrantMutationAllowed).toBe(false);
    expect(result.canonicalMutationAllowed).toBe(false);
  });

  it('authorizes only a bounded builder patch when the first loss is the payload builder', () => {
    const result = classifyEmb3aLineageAuditV1([
      row('workspace_revision'),
      row('source_revision'),
      row('representation_id', { builderPresent: 'MISSING', qdrantPayloadPresent: 'MISSING' }),
    ]);

    expect(result.status).toBe('EMB3A_BLOCKED_BY_BUILDER');
    expect(result.writerPatchAllowed).toBe(true);
    expect(result.qdrantMutationAllowed).toBe(false);
  });

  it('keeps payload indexing separate from field population', () => {
    const result = classifyEmb3aLineageAuditV1([
      row('workspace_revision', {
        filterRequiresIndex: true,
        payloadIndexPresent: 'MISSING',
      }),
    ]);

    expect(result.status).toBe('EMB3A_BLOCKED_BY_PAYLOAD_INDEX');
    expect(result.fields[0]?.projectionReady).toBe(true);
    expect(result.fields[0]?.filterIndexReady).toBe(false);
    expect(result.writerPatchAllowed).toBe(false);
  });

  it('keeps unknown ownership as NOT_PROVEN instead of guessing from downstream fields', () => {
    const result = classifyEmb3aLineageAuditV1([
      row('workspace_revision', { canonicalSource: 'NOT_PROVEN' }),
    ]);

    expect(result.status).toBe('EMB3A_LINEAGE_NOT_PROVEN');
    expect(result.fields[0]?.firstLoss).toBe('NOT_PROVEN');
  });
});
