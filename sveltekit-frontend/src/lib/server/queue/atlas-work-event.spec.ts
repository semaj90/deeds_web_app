import { describe, it, expect, vi } from 'vitest';
import { createAtlasWorkEventV1, AtlasWorkEventV1Schema } from './atlas-work-event.js';
import { AtlasWorkEventInbox } from './atlas-work-event-inbox.js';

describe('AtlasWorkEventV1 & in-memory inbox prototype (KAFKA-09..14)', () => {
  it('creates valid revision-bound event envelopes', () => {
    const event = createAtlasWorkEventV1({
      eventId: 'evt_001',
      eventType: 'TASK_TRANSITION',
      canonicalSourceId: 'task-001',
      producer: 'openspec.controller',
      workspaceRevision: 'sha256:ws_rev_01',
      sourceRevision: 'sha256:src_rev_01',
      payload: {
        status: 'COMPLETED',
        gateId: 'KAFKA-08',
      },
    });

    expect(event.schemaVersion).toBe('atlas.work-event.v1');
    expect(event.payloadChecksum).toMatch(/^sha256:/);
    expect(AtlasWorkEventV1Schema.safeParse(event).success).toBe(true);
  });

  it('rejects payloads containing hidden thoughts or tensors', () => {
    expect(() =>
      createAtlasWorkEventV1({
        eventId: 'evt_bad_01',
        eventType: 'TASK_TRANSITION',
        canonicalSourceId: 'task-bad',
        producer: 'agent',
        payload: {
          status: 'RUNNING',
          hiddenThoughts: 'Planning step 1...',
        },
      })
    ).toThrow(/FORBIDDEN_EVENT_PAYLOAD_FIELD/);
    expect(() =>
      createAtlasWorkEventV1({
        eventId: 'evt_bad_nested',
        eventType: 'TASK_TRANSITION',
        canonicalSourceId: 'task-bad',
        producer: 'agent',
        payload: { context: [{ tensor: 'not allowed' }] },
      })
    ).toThrow(/FORBIDDEN_EVENT_PAYLOAD_FIELD/);
  });

  it('canonicalizes nested object keys and rejects payload checksum tampering', () => {
    const first = createAtlasWorkEventV1({
      eventId: 'evt_nested', eventType: 'TASK_TRANSITION', canonicalSourceId: 'task', producer: 'test',
      payload: { nested: { b: 2, a: 1 } },
    });
    const reordered = createAtlasWorkEventV1({
      eventId: 'evt_nested', eventType: 'TASK_TRANSITION', canonicalSourceId: 'task', producer: 'test',
      payload: { nested: { a: 1, b: 2 } },
    });
    expect(first.payloadChecksum).toBe(reordered.payloadChecksum);
    expect(AtlasWorkEventV1Schema.safeParse({ ...first, payloadChecksum: `sha256:${'0'.repeat(64)}` }).success).toBe(false);
  });

  it('processes new event and triggers reconciliation handler once', async () => {
    const reconciler = vi.fn().mockResolvedValue(undefined);
    const inbox = new AtlasWorkEventInbox(reconciler);

    const event = createAtlasWorkEventV1({
      eventId: 'evt_002',
      eventType: 'SOURCE_REVISION_UPDATED',
      canonicalSourceId: 'src/lib/server/db/client.ts',
      producer: 'git.hook',
      payload: {
        newSha: 'abc1234',
        linesChanged: 15,
      },
    });

    const res = await inbox.processEvent(event);
    expect(res.status).toBe('PROCESSED');
    expect(res.reconciliationTriggered).toBe(true);
    expect(reconciler).toHaveBeenCalledTimes(1);

    const record = inbox.getRecord('evt_002');
    expect(record?.status).toBe('PROCESSED');
    expect(record?.attempts).toBe(1);
  });

  it('detects duplicate replay and skips duplicate reconciliation', async () => {
    const reconciler = vi.fn().mockResolvedValue(undefined);
    const inbox = new AtlasWorkEventInbox(reconciler);

    const event = createAtlasWorkEventV1({
      eventId: 'evt_003',
      eventType: 'TASK_TRANSITION',
      canonicalSourceId: 'task-003',
      producer: 'controller',
      payload: {
        status: 'VERIFIED',
      },
    });

    // First delivery
    const res1 = await inbox.processEvent(event);
    expect(res1.status).toBe('PROCESSED');

    // Duplicate redelivery (same eventId, same payload)
    const res2 = await inbox.processEvent(event);
    expect(res2.status).toBe('REPLAY');
    expect(res2.reconciliationTriggered).toBe(false);
    expect(reconciler).toHaveBeenCalledTimes(1); // Not called again

    const record = inbox.getRecord('evt_003');
    expect(record?.attempts).toBe(2);
  });

  it('rejects conflict when eventId matches but payload is modified', async () => {
    const reconciler = vi.fn();
    const inbox = new AtlasWorkEventInbox(reconciler);

    const eventOrig = createAtlasWorkEventV1({
      eventId: 'evt_004',
      eventType: 'TASK_TRANSITION',
      canonicalSourceId: 'task-004',
      producer: 'controller',
      payload: {
        status: 'IN_PROGRESS',
      },
    });

    const eventMutated = createAtlasWorkEventV1({
      eventId: 'evt_004', // Same ID!
      eventType: 'TASK_TRANSITION',
      canonicalSourceId: 'task-004',
      producer: 'rogue_worker',
      payload: {
        status: 'FORCED_PROMOTION', // Mutated payload!
      },
    });

    await inbox.processEvent(eventOrig);
    const conflictRes = await inbox.processEvent(eventMutated);

    expect(conflictRes.status).toBe('CONFLICT');
    expect(conflictRes.error).toContain('PAYLOAD_CHECKSUM_CONFLICT');

    const record = inbox.getRecord('evt_004');
    expect(record?.status).toBe('CONFLICT');
  });

  it('rejects a mutated event envelope before reconciliation', async () => {
    const reconciler = vi.fn();
    const inbox = new AtlasWorkEventInbox(reconciler);
    const event = createAtlasWorkEventV1({
      eventId: 'evt_tampered', eventType: 'TASK_TRANSITION', canonicalSourceId: 'task', producer: 'test',
      payload: { state: 'OPEN' },
    });
    const result = await inbox.processEvent({ ...event, payload: { state: 'DONE' } });
    expect(result.status).toBe('CONFLICT');
    expect(result.error).toBe('INVALID_EVENT_ENVELOPE_OR_PAYLOAD_CHECKSUM');
    expect(reconciler).not.toHaveBeenCalled();
  });

  it('routes to DEAD_LETTER when reconciliation handler fails', async () => {
    const failingReconciler = vi.fn().mockRejectedValue(new Error('DATABASE_CONNECTION_LOST'));
    const inbox = new AtlasWorkEventInbox(failingReconciler);

    const event = createAtlasWorkEventV1({
      eventId: 'evt_005',
      eventType: 'TASK_TRANSITION',
      canonicalSourceId: 'task-005',
      producer: 'controller',
      payload: { status: 'FAILED' },
    });

    const res = await inbox.processEvent(event);
    expect(res.status).toBe('DEAD_LETTER');
    expect(res.error).toBe('DATABASE_CONNECTION_LOST');

    const record = inbox.getRecord('evt_005');
    expect(record?.status).toBe('DEAD_LETTER');
  });
});
