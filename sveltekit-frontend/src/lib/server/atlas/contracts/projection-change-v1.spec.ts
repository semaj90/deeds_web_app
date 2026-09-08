import { describe, expect, it } from 'vitest';
import { createProjectionChangeV1, verifyProjectionChangeV1 } from './projection-change-v1.js';

const input = {
  eventId: '11111111-1111-4111-8111-111111111111',
  aggregateType: 'task_semantic_packet',
  aggregateId: '22222222-2222-4222-8222-222222222222',
  workspaceRevision: 'workspace:v1',
  sourceRevision: 'source:v1',
  graphRevision: 'graph:v1',
  representationRevision: 'semantic_768:v1',
  featureRevision: 'features:v1',
  stageReceiptChecksum: 'a'.repeat(64),
  changedPacketKeys: ['packet:1'],
  candidateOrdinals: [1, 2],
  projections: ['SEMANTIC', 'CACHE'],
};

describe('ProjectionChangeV1', () => {
  it('creates and verifies a revision-qualified event', () => {
    const event = createProjectionChangeV1(input);
    expect(event.canonicalAuthority).toBe(false);
    expect(verifyProjectionChangeV1(event)).toBe(true);
  });

  it('rejects tampered checksums', () => {
    const event = createProjectionChangeV1(input);
    expect(verifyProjectionChangeV1({ ...event, changedPacketKeys: ['packet:2'] })).toBe(false);
  });
});
