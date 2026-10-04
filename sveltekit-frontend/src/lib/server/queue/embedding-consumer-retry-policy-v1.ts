/**
 * PF4B-QUEUE-05: bounded redelivery / dead-letter policy for the embedding queue consumers.
 *
 * Pure and broker-free. Separates three identities that must not be conflated:
 *   - broker identity   = the broker-issued `messageId` when present, otherwise a content digest (never a timestamp);
 *   - logical pass key  = packet_key + input_hash + representation (what is being computed; stable across redeliveries
 *                         AND across different broker messages for the same input);
 *   - execution id      = consumer run + delivery tag + attempt number (distinct for every attempt).
 * The attempt counter is in-process (classic queues carry no delivery count), so a consumer restart resets it; that
 * limitation is recorded, not hidden. After the cap the message is dead-lettered, never requeued again.
 */
import { createHash } from 'node:crypto';

export const EMBEDDING_DLQ_NAME_V1 = 'atlas.enrichment.embedding.dlq' as const;
export const DEFAULT_MAX_DELIVERY_ATTEMPTS_V1 = 3;

export type BrokerMessageLikeV1 = {
  content: Uint8Array | string;
  properties?: { messageId?: string | null } | null;
  fields?: { deliveryTag?: number | null; redelivered?: boolean | null } | null;
};

const sha256 = (data: Uint8Array | string) => createHash('sha256').update(data).digest('hex');

/** Broker identity: broker `messageId` if issued, else a digest of the message body. Never time-derived. */
export function brokerIdentityKeyV1(msg: BrokerMessageLikeV1): string {
  const id = msg.properties?.messageId;
  if (typeof id === 'string' && id.trim()) return `broker:${id.trim()}`;
  return `content:sha256:${sha256(msg.content)}`;
}

/** What is being computed, independent of which broker message or attempt carried it. */
export function logicalInputKeyV1(input: { packetKey: string; inputHash: string; representationId: string }): string {
  return `sha256:${sha256(JSON.stringify([input.packetKey, input.inputHash, input.representationId]))}`;
}

export function executionIdV1(input: { consumerRunId: string; deliveryTag: number | null | undefined; attempt: number }): string {
  return `${input.consumerRunId}:${input.deliveryTag ?? 'none'}:${input.attempt}`;
}

export type FailureDecisionV1 =
  | { decision: 'REQUEUE'; attempt: number; maxAttempts: number }
  | { decision: 'DEAD_LETTER'; attempt: number; maxAttempts: number };

export interface RetryTrackerV1 {
  /** Attempt number the NEXT processing of this message will be (1 on first delivery). */
  nextAttempt(key: string): number;
  recordFailure(key: string): FailureDecisionV1;
  recordSuccess(key: string): void;
  size(): number;
}

export function createRetryTrackerV1(maxAttempts: number = DEFAULT_MAX_DELIVERY_ATTEMPTS_V1): RetryTrackerV1 {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) throw new Error('MAX_DELIVERY_ATTEMPTS_INVALID');
  const failures = new Map<string, number>();
  return {
    nextAttempt: (key) => (failures.get(key) ?? 0) + 1,
    recordFailure(key) {
      const attempt = (failures.get(key) ?? 0) + 1;
      if (attempt >= maxAttempts) {
        failures.delete(key); // terminal: the message leaves the queue, so the counter must not leak
        return { decision: 'DEAD_LETTER', attempt, maxAttempts };
      }
      failures.set(key, attempt);
      return { decision: 'REQUEUE', attempt, maxAttempts };
    },
    recordSuccess(key) {
      failures.delete(key);
    },
    size: () => failures.size,
  };
}

export type DeadLetterHeadersV1 = Record<string, string | number | boolean | null>;

/** Headers for the DLQ copy; the original body is republished verbatim. Writes no pass result. */
export function buildDeadLetterHeadersV1(input: {
  msg: BrokerMessageLikeV1;
  attempt: number;
  maxAttempts: number;
  reason: string;
  consumerRunId: string;
  logicalInputKey: string | null;
}): DeadLetterHeadersV1 {
  return {
    'x-atlas-dlq-version': 'embedding-dlq.v1',
    'x-atlas-broker-identity': brokerIdentityKeyV1(input.msg),
    'x-atlas-broker-message-id': input.msg.properties?.messageId ?? null,
    'x-atlas-delivery-tag': input.msg.fields?.deliveryTag ?? null,
    'x-atlas-redelivered': input.msg.fields?.redelivered ?? null,
    'x-atlas-attempts': input.attempt,
    'x-atlas-max-attempts': input.maxAttempts,
    'x-atlas-failure-reason': input.reason.slice(0, 500),
    'x-atlas-consumer-run-id': input.consumerRunId,
    'x-atlas-execution-id': executionIdV1({ consumerRunId: input.consumerRunId, deliveryTag: input.msg.fields?.deliveryTag, attempt: input.attempt }),
    'x-atlas-logical-input-key': input.logicalInputKey,
    'x-atlas-terminal-status': 'DEAD_LETTERED_RETRY_CAP',
  };
}

export type DeliveryOutcomeV1 = 'ACKED' | 'REQUEUED' | 'DEAD_LETTERED' | 'DLQ_PUBLISH_FAILED_REQUEUED';

export interface DeliveryChannelV1<M> {
  ack(msg: M): void;
  nack(msg: M, allUpTo: boolean, requeue: boolean): void;
  /** Publish the original body plus headers to the DLQ; must resolve only once the broker accepted it. */
  publishDeadLetter(content: Uint8Array | string, headers: DeadLetterHeadersV1): Promise<void>;
}

export interface DeliveryContextV1 {
  attempt: number;
  executionId: string;
  brokerIdentity: string;
}

/**
 * One delivery, end to end. `work` performs ALL side effects (embedding, ledger row, summary update) and returns true
 * only when every one of them succeeded; a thrown error or `false` counts as one failed attempt. On success the message
 * is acked. On failure it is requeued until the cap, then published to the DLQ and acked (a classic queue has no DLX
 * configured, so a plain nack(false) would silently discard it). If the DLQ publish itself fails the message is
 * requeued and the attempt is not terminal. No success path code runs for a dead-lettered message.
 */
export async function processDeliveryV1<M extends BrokerMessageLikeV1>(args: {
  msg: M;
  channel: DeliveryChannelV1<M>;
  tracker: RetryTrackerV1;
  maxAttempts?: number;
  consumerRunId: string;
  logicalInputKey: string | null;
  work: (ctx: DeliveryContextV1) => Promise<boolean>;
}): Promise<DeliveryOutcomeV1> {
  const key = brokerIdentityKeyV1(args.msg);
  const attempt = args.tracker.nextAttempt(key);
  const ctx: DeliveryContextV1 = {
    attempt,
    brokerIdentity: key,
    executionId: executionIdV1({ consumerRunId: args.consumerRunId, deliveryTag: args.msg.fields?.deliveryTag, attempt }),
  };
  let reason = 'WORK_RETURNED_FALSE';
  try {
    if (await args.work(ctx)) {
      args.tracker.recordSuccess(key);
      args.channel.ack(args.msg);
      return 'ACKED';
    }
  } catch (err) {
    reason = `WORK_THREW:${err instanceof Error ? err.message : String(err)}`;
  }
  const verdict = args.tracker.recordFailure(key);
  if (verdict.decision === 'REQUEUE') {
    args.channel.nack(args.msg, false, true);
    return 'REQUEUED';
  }
  try {
    await args.channel.publishDeadLetter(
      args.msg.content,
      buildDeadLetterHeadersV1({
        msg: args.msg, attempt: verdict.attempt, maxAttempts: verdict.maxAttempts, reason,
        consumerRunId: args.consumerRunId, logicalInputKey: args.logicalInputKey,
      }),
    );
  } catch {
    args.channel.nack(args.msg, false, true); // DLQ not durable yet: keep the message, never drop it
    return 'DLQ_PUBLISH_FAILED_REQUEUED';
  }
  args.channel.ack(args.msg);
  return 'DEAD_LETTERED';
}
