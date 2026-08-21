import { describe, expect, it } from 'vitest';

import { artifactFailedEventSchema } from './event-fabric.js';
import { classifyArtifactFailureDisposition } from './artifact-event-processing.js';

function event(input: {
  failureClass?: 'TRANSIENT_DEPENDENCY' | 'SCHEMA_REJECTED' | 'REVISION_MISMATCH';
  retryable?: boolean;
  retryCount?: number;
  retryBudget?: number;
}) {
  return artifactFailedEventSchema.parse({
    eventId: '11111111-1111-4111-8111-111111111111',
    eventType: 'artifact.failed',
    occurredAt: '2026-08-21T18:00:00.000Z',
    payload: {
      actionKey: 'action:0123456789abcdef',
      expectedOutputSchema: 'atlas.test.v1',
      producerRevision: 'producer:v1',
      failureClass: input.failureClass ?? 'TRANSIENT_DEPENDENCY',
      retryable: input.retryable ?? true,
      errorHash: 'error:0123456789abcdef',
      inputArtifactRefs: [],
      metadata: {
        retryCount: input.retryCount ?? 0,
        retryBudget: input.retryBudget ?? 2,
      },
    },
  });
}

describe('classifyArtifactFailureDisposition', () => {
  it('retries a transient failure while budget remains', () => {
    expect(classifyArtifactFailureDisposition(event({ retryCount: 1, retryBudget: 2 }))).toBe('RETRY');
  });

  it('selects an alternative when retry budget is exhausted', () => {
    expect(classifyArtifactFailureDisposition(event({ retryCount: 2, retryBudget: 2 }))).toBe('SELECT_ALTERNATIVE');
  });

  it('selects an alternative for non-retryable revision drift', () => {
    expect(classifyArtifactFailureDisposition(event({
      failureClass: 'REVISION_MISMATCH',
      retryable: false,
    }))).toBe('SELECT_ALTERNATIVE');
  });

  it('stops on schema rejection rather than looping', () => {
    expect(classifyArtifactFailureDisposition(event({
      failureClass: 'SCHEMA_REJECTED',
      retryable: false,
    }))).toBe('STOP');
  });
});
