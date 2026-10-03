import { describe, expect, it } from 'vitest';
import type Redis from 'ioredis';
import {
  authorityAuditCompletedEventSchema,
  parseEventFabricMessage,
  type AuthorityAuditCompletedEventV1,
} from './event-fabric.js';
import { publishEventIdempotent } from './valkey-event-stream.js';

function makeAuthorityEvent(eventId = '11111111-1111-4111-8111-111111111111'): AuthorityAuditCompletedEventV1 {
  return authorityAuditCompletedEventSchema.parse({
    eventId,
    eventType: 'authority.audit.completed',
    occurredAt: '2026-09-12T22:00:00.000Z',
    producerId: 'current-graphify-run-owner-auditor',
    repositoryId: 'deeds-web-app',
    workspaceId: 'deeds-web-app-local',
    workspaceRevision: 'sha256:322e',
    evidenceRefs: ['docs/reports/current-graphify-run-owner-v1.json'],
    payload: {
      gate: 'CURRENT-SOURCE-TERMINAL-EXECUTION-01',
      status: 'BLOCKED',
      blocker: 'SNAPSHOT_BOUND_GRAPHIFY_CANARY_NOT_AUTHORIZED',
      canonicalAuthority: false,
      mutationAuthorized: false,
      subjectType: 'graphify_run',
      subjectId: 'current',
      nextGate: 'SNAPSHOT-BOUND-GRAPHIFY-CANARY-01',
      counts: {
        terminalRunOwners: 0,
        completedCoordinatorStages: 3,
      },
      sourceEvidenceRefs: ['docs/reports/current-graphify-run-owner-v1.json'],
    },
  });
}

class FakeValkey {
  status = 'ready';
  private dedupe = new Map<string, string>();
  private nextId = 1;
  appendCount = 0;

  async eval(
    _script: string,
    _numKeys: number,
    _stream: string,
    dedupeKey: string,
  ): Promise<string> {
    const existing = this.dedupe.get(dedupeKey);
    if (existing) return existing;
    const id = `${this.nextId++}-0`;
    this.dedupe.set(dedupeKey, id);
    this.appendCount += 1;
    return id;
  }
}

describe('Parent Atlas authority event fabric', () => {
  it('fails closed when an authority event has no workspace revision', () => {
    const candidate = makeAuthorityEvent();
    const { workspaceRevision: _omitted, ...withoutRevision } = candidate;
    expect(() => parseEventFabricMessage(withoutRevision)).toThrow();
  });

  it('accepts the read-only terminal-owner blocker envelope', () => {
    const event = parseEventFabricMessage(makeAuthorityEvent());
    expect(event.eventType).toBe('authority.audit.completed');
    if (event.eventType !== 'authority.audit.completed') throw new Error('unexpected event type');
    expect(event.payload.canonicalAuthority).toBe(false);
    expect(event.payload.mutationAuthorized).toBe(false);
    expect(event.payload.gate).toBe('CURRENT-SOURCE-TERMINAL-EXECUTION-01');
  });

  it('deduplicates retries by producerId + eventId at the Valkey transport boundary', async () => {
    const client = new FakeValkey();
    const event = makeAuthorityEvent();

    const first = await publishEventIdempotent(event, { client: client as unknown as Redis });
    const retry = await publishEventIdempotent(event, { client: client as unknown as Redis });

    expect(first.streamId).toBe(retry.streamId);
    expect(client.appendCount).toBe(1);
  });

  it('does not collapse distinct event IDs from the same producer', async () => {
    const client = new FakeValkey();
    const firstEvent = makeAuthorityEvent('11111111-1111-4111-8111-111111111111');
    const secondEvent = makeAuthorityEvent('22222222-2222-4222-8222-222222222222');

    const first = await publishEventIdempotent(firstEvent, { client: client as unknown as Redis });
    const second = await publishEventIdempotent(secondEvent, { client: client as unknown as Redis });

    expect(first.streamId).not.toBe(second.streamId);
    expect(client.appendCount).toBe(2);
  });
});
