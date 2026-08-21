import { beforeEach, describe, expect, it } from 'vitest';

import {
  ARTIFACT_REFERENCE_TASK_ENVELOPE_LIMIT_BYTES,
  ArtifactEnvelopeTooLargeError,
  assertArtifactReferenceEnvelopeSize,
  getArtifactEnvelopeSizeStats,
  resetArtifactEnvelopeSizeStatsForTest,
} from './message-size-policy-v1.js';

describe('artifact reference envelope size policy', () => {
  beforeEach(() => resetArtifactEnvelopeSizeStatsForTest());

  it('accepts compact reference envelopes and records telemetry', () => {
    const bytes = assertArtifactReferenceEnvelopeSize({
      schema: 'atlas.action-work-item.v1',
      inputArtifactRefs: [{ artifactId: 'artifact-1' }],
    });

    expect(bytes).toBeGreaterThan(0);
    expect(getArtifactEnvelopeSizeStats()).toMatchObject({
      checked: 1,
      accepted: 1,
      rejected: 0,
      largestBytes: bytes,
      lastRejectedBytes: null,
    });
  });

  it('rejects an accidentally inlined tensor/vector payload', () => {
    const oversized = {
      schema: 'atlas.action-work-item.v1',
      vector: Array.from({ length: ARTIFACT_REFERENCE_TASK_ENVELOPE_LIMIT_BYTES }, () => 0.123456),
    };

    expect(() => assertArtifactReferenceEnvelopeSize(oversized)).toThrow(
      ArtifactEnvelopeTooLargeError,
    );

    const stats = getArtifactEnvelopeSizeStats();
    expect(stats.checked).toBe(1);
    expect(stats.accepted).toBe(0);
    expect(stats.rejected).toBe(1);
    expect(stats.lastRejectedBytes).toBeGreaterThan(ARTIFACT_REFERENCE_TASK_ENVELOPE_LIMIT_BYTES);
  });
});
