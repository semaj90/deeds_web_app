import { describe, expect, it, vi } from 'vitest';

import { parseEventFabricMessage } from './event-fabric.js';
import { dispatchEventFabricEvent, type EventFabricProjectionHandlers } from '../workers/code-evidence-projection-worker.js';

function makeHandlers(): EventFabricProjectionHandlers {
  return {
    'code.evidence.persisted': vi.fn(async () => {}),
    'failure.observed': vi.fn(async () => {}),
    'analytics.observed': vi.fn(async () => {}),
    'recommendation.signal': vi.fn(async () => {}),
    'policy.decision.receipt': vi.fn(async () => {}),
    'checkpoint.commit': vi.fn(async () => {}),
    'artifact.materialized': vi.fn(async () => {}),
    'artifact.failed': vi.fn(async () => {}),
  };
}

describe('event fabric dispatch', () => {
  it('routes code evidence events to the code evidence handler', async () => {
    const handlers = makeHandlers();
    const event = parseEventFabricMessage({
      eventId: '11111111-1111-4111-8111-111111111111',
      eventType: 'code.evidence.persisted',
      occurredAt: '2026-08-12T00:00:00.000Z',
      sourceRef: 'src/foo.ts',
      payload: {
        evidenceId: 'evidence-1',
        passKey: 'pass-1',
        sourceRef: 'src/foo.ts',
        sourceRevision: 'source-v1',
        parseNodeId: 'node-1',
        packetKey: 'packet-1',
        logicalEvidenceHash: 'hash-1',
        synthesisReceiptHash: 'hash-2',
        posConceptPacketHash: 'hash-3',
        producerId: 'producer-1',
        producerRevision: 'producer-rev-1',
        schemaRevision: 'schema-v1',
      },
    });

    await dispatchEventFabricEvent(event, handlers);

    expect(handlers['code.evidence.persisted']).toHaveBeenCalledTimes(1);
    expect(handlers['failure.observed']).not.toHaveBeenCalled();
  });

  it('routes recommendation signals to the recommendation handler', async () => {
    const handlers = makeHandlers();
    const event = parseEventFabricMessage({
      eventId: '22222222-2222-4222-8222-222222222222',
      eventType: 'recommendation.signal',
      occurredAt: '2026-08-12T00:00:00.000Z',
      sourceRef: 'src/foo.ts',
      payload: {
        candidateId: 'candidate-1',
        targetType: 'packet',
        targetId: 'packet-1',
        action: 'BOOST',
        sourceEvidenceRefs: ['src/foo.ts'],
      },
    });

    await dispatchEventFabricEvent(event, handlers);

    expect(handlers['recommendation.signal']).toHaveBeenCalledTimes(1);
    expect(handlers['code.evidence.persisted']).not.toHaveBeenCalled();
  });

  it('routes artifact materialization events to verification handling', async () => {
    const handlers = makeHandlers();
    const event = parseEventFabricMessage({
      eventId: '33333333-3333-4333-8333-333333333333',
      eventType: 'artifact.materialized',
      occurredAt: '2026-08-21T18:00:00.000Z',
      payload: {
        actionKey: 'action-key-00000001',
        artifactId: 'artifact-1',
        artifactHash: 'artifact-hash-0001',
        checksum: 'checksum-value-0001',
        revisionSetHash: 'revision-set-0001',
        storage: 'ARROW_IPC',
        locatorPath: '.tmp/artifact.arrow',
        byteLength: 128,
        producer: 'artifact-materializer',
        producerRevision: 'producer-v1',
      },
    });

    await dispatchEventFabricEvent(event, handlers);

    expect(handlers['artifact.materialized']).toHaveBeenCalledTimes(1);
    expect(handlers['artifact.failed']).not.toHaveBeenCalled();
  });

  it('routes artifact failures to failure-decision handling', async () => {
    const handlers = makeHandlers();
    const event = parseEventFabricMessage({
      eventId: '44444444-4444-4444-8444-444444444444',
      eventType: 'artifact.failed',
      occurredAt: '2026-08-21T18:00:00.000Z',
      payload: {
        actionKey: 'action-key-00000001',
        operation: 'materialize-feature-matrix',
        failureClass: 'TIMEOUT',
        retryable: true,
        retryCount: 1,
        retryBudget: 3,
        errorHash: 'error-hash-1',
        inputArtifactRefs: [],
      },
    });

    await dispatchEventFabricEvent(event, handlers);

    expect(handlers['artifact.failed']).toHaveBeenCalledTimes(1);
    expect(handlers['artifact.materialized']).not.toHaveBeenCalled();
  });
});
