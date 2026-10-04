// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  brokerIdentityKeyV1, createRetryTrackerV1, executionIdV1, logicalInputKeyV1, processDeliveryV1,
  type DeadLetterHeadersV1, type DeliveryContextV1,
} from './embedding-consumer-retry-policy-v1.js';

type Msg = { content: string; properties: { messageId: string | null }; fields: { deliveryTag: number; redelivered: boolean } };
const msg = (messageId: string | null, tag = 1, redelivered = false, content = '{"packet_key":"p1","summary":"s"}'): Msg =>
  ({ content, properties: { messageId }, fields: { deliveryTag: tag, redelivered } });

function harness() {
  const log: string[] = [];
  const dlq: { content: unknown; headers: DeadLetterHeadersV1 }[] = [];
  let dlqFails = false;
  const channel = {
    ack: () => { log.push('ack'); },
    nack: (_m: Msg, _a: boolean, requeue: boolean) => { log.push(requeue ? 'nack-requeue' : 'nack-drop'); },
    publishDeadLetter: async (content: unknown, headers: DeadLetterHeadersV1) => {
      if (dlqFails) throw new Error('dlq down');
      dlq.push({ content, headers });
    },
  };
  return { log, dlq, channel, setDlqFails: (v: boolean) => { dlqFails = v; } };
}

describe('processDeliveryV1', () => {
  it('acks on first-delivery success and clears the counter', async () => {
    const h = harness();
    const tracker = createRetryTrackerV1(3);
    const attempts: number[] = [];
    const out = await processDeliveryV1({
      msg: msg('m1'), channel: h.channel, tracker, consumerRunId: 'run', logicalInputKey: 'L',
      work: async (c: DeliveryContextV1) => { attempts.push(c.attempt); return true; },
    });
    expect(out).toBe('ACKED');
    expect(h.log).toEqual(['ack']);
    expect(attempts).toEqual([1]);
    expect(tracker.size()).toBe(0);
  });

  it('fails once then succeeds: requeue, then ack on attempt 2 with a distinct execution id', async () => {
    const h = harness();
    const tracker = createRetryTrackerV1(3);
    const execIds: string[] = [];
    let calls = 0;
    const run = () => processDeliveryV1({
      msg: msg('m1', 7), channel: h.channel, tracker, consumerRunId: 'run', logicalInputKey: 'L',
      work: async (c: DeliveryContextV1) => { execIds.push(c.executionId); calls += 1; return calls > 1; },
    });
    expect(await run()).toBe('REQUEUED');
    expect(await run()).toBe('ACKED');
    expect(h.log).toEqual(['nack-requeue', 'ack']);
    expect(new Set(execIds).size).toBe(2);
    expect(tracker.size()).toBe(0);
  });

  it('fails until the cap: dead-letters with headers, acks the original, never requeues again, never re-enters the success path', async () => {
    const h = harness();
    const tracker = createRetryTrackerV1(3);
    let workCalls = 0;
    const run = () => processDeliveryV1({
      msg: msg('m1', 9, true), channel: h.channel, tracker, consumerRunId: 'run', logicalInputKey: 'L',
      work: async () => { workCalls += 1; throw new Error('db down'); },
    });
    expect(await run()).toBe('REQUEUED');
    expect(await run()).toBe('REQUEUED');
    expect(await run()).toBe('DEAD_LETTERED');
    expect(h.log).toEqual(['nack-requeue', 'nack-requeue', 'ack']);
    expect(workCalls).toBe(3); // one per attempt; the dead-letter path never re-enters the work/ledger code
    expect(h.dlq).toHaveLength(1);
    expect(h.dlq[0].headers['x-atlas-terminal-status']).toBe('DEAD_LETTERED_RETRY_CAP');
    expect(h.dlq[0].headers['x-atlas-attempts']).toBe(3);
    expect(h.dlq[0].headers['x-atlas-broker-message-id']).toBe('m1');
    expect(h.dlq[0].headers['x-atlas-logical-input-key']).toBe('L');
    expect(String(h.dlq[0].headers['x-atlas-failure-reason'])).toContain('db down');
    expect(tracker.size()).toBe(0);
  });

  it('keeps the message when the DLQ publish fails (never drops it)', async () => {
    const h = harness();
    h.setDlqFails(true);
    const tracker = createRetryTrackerV1(1);
    const out = await processDeliveryV1({
      msg: msg('m1'), channel: h.channel, tracker, consumerRunId: 'run', logicalInputKey: null,
      work: async () => false,
    });
    expect(out).toBe('DLQ_PUBLISH_FAILED_REQUEUED');
    expect(h.log).toEqual(['nack-requeue']);
  });
});

describe('identities', () => {
  it('a redelivered message keeps the same broker identity but gets a new execution id per attempt', () => {
    const first = msg('m1', 3, false);
    const again = msg('m1', 8, true);
    expect(brokerIdentityKeyV1(first)).toBe(brokerIdentityKeyV1(again));
    expect(executionIdV1({ consumerRunId: 'r', deliveryTag: 3, attempt: 1 }))
      .not.toBe(executionIdV1({ consumerRunId: 'r', deliveryTag: 8, attempt: 2 }));
  });

  it('different broker messages for the same logical pass stay distinguishable but share the logical key', () => {
    expect(brokerIdentityKeyV1(msg('m1'))).not.toBe(brokerIdentityKeyV1(msg('m2')));
    const l = (packetKey: string, inputHash: string) => logicalInputKeyV1({ packetKey, inputHash, representationId: 'semantic_768' });
    expect(l('p1', 'sha256:aa')).toBe(l('p1', 'sha256:aa'));
    expect(l('p1', 'sha256:aa')).not.toBe(l('p1', 'sha256:bb'));
    expect(l('p1', 'sha256:aa')).not.toBe(l('p2', 'sha256:aa'));
  });

  it('falls back to a content digest (never a timestamp) when the broker issued no messageId', () => {
    const k1 = brokerIdentityKeyV1(msg(null, 1));
    const k2 = brokerIdentityKeyV1(msg(null, 2));
    expect(k1.startsWith('content:sha256:')).toBe(true);
    expect(k1).toBe(k2);
  });

  it('rejects an invalid cap', () => {
    expect(() => createRetryTrackerV1(0)).toThrow('MAX_DELIVERY_ATTEMPTS_INVALID');
  });
});
