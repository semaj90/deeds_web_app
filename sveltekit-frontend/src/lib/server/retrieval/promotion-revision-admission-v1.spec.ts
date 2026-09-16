import { describe, expect, it } from 'vitest';
import { admitPromotionRevisionBatchV1, admitPromotionRevisionV1 } from './promotion-revision-admission-v1.js';

const expected = {
  workspaceRevision: 'sha256:workspace',
  sourceRevision: 'sha256:source',
  representationRevision: 'semantic_768:r1',
};

const input = {
  packetKey: 'packet:a',
  sourceRef: 'src/a.ts',
  contentHash: 'sha256:content',
  ...expected,
};

describe('promotion revision admission v1', () => {
  it('admits a complete matching identity bundle without writes', () => {
    expect(admitPromotionRevisionV1(input, expected)).toEqual({
      status: 'ADMITTED',
      input,
      writesPerformed: false,
    });
  });

  it('rejects missing identity or revision fields', () => {
    expect(admitPromotionRevisionV1({ ...input, sourceRevision: null }, expected)).toMatchObject({
      status: 'REJECTED',
      reason: 'PROMOTION_IDENTITY_OR_REVISION_MISSING',
      writesPerformed: false,
    });
  });

  it('rejects an absent admitted bundle', () => {
    expect(admitPromotionRevisionV1(input, null)).toMatchObject({
      status: 'REJECTED',
      reason: 'ADMITTED_REVISION_BUNDLE_MISSING',
      writesPerformed: false,
    });
  });

  it('rejects workspace, source, and representation mismatches', () => {
    expect(admitPromotionRevisionV1({ ...input, workspaceRevision: 'sha256:other' }, expected)).toMatchObject({ reason: 'WORKSPACE_REVISION_MISMATCH' });
    expect(admitPromotionRevisionV1({ ...input, sourceRevision: 'sha256:other' }, expected)).toMatchObject({ reason: 'SOURCE_REVISION_MISMATCH' });
    expect(admitPromotionRevisionV1({ ...input, representationRevision: 'semantic_768:r2' }, expected)).toMatchObject({ reason: 'REPRESENTATION_REVISION_MISMATCH' });
  });

  it('rejects a batch at the first invalid packet before delegation', () => {
    expect(admitPromotionRevisionBatchV1([input, { ...input, packetKey: '' }], expected)).toEqual({
      status: 'REJECTED',
      index: 1,
      reason: 'PROMOTION_IDENTITY_OR_REVISION_MISSING',
      writesPerformed: false,
    });
  });
});
