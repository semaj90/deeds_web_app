import type Redis from 'ioredis';
import { getValkeyPublisher, getValkeySubscriber } from '$lib/server/cache/valkey-client.js';
import {
  parseEventFabricMessage,
  type EventFabricEventV1,
} from './event-fabric.js';

export const ATLAS_EVENT_STREAM = 'atlas:events:v1';
export const ATLAS_EVENT_DEDUPE_TTL_MS = 24 * 60 * 60 * 1000;

const IDEMPOTENT_XADD_LUA = `
local existing = redis.call('GET', KEYS[2])
if existing then
  return existing
end
local streamId = redis.call('XADD', KEYS[1], '*',
  'eventId', ARGV[1],
  'producerId', ARGV[2],
  'eventType', ARGV[3],
  'event', ARGV[4])
redis.call('SET', KEYS[2], streamId, 'PX', ARGV[5])
return streamId
`;

function dedupeKey(stream: string, producerId: string, eventId: string): string {
  return `atlas:event-dedupe:${stream}:${producerId}:${eventId}`;
}

async function ensureConnected(client: Redis): Promise<void> {
  if (client.status === 'wait') await client.connect();
}

/**
 * Valkey-compatible equivalent of the behavior Parent Atlas needs from
 * Redis 8.6 XADD IDMP: retries with the same producerId/eventId return the
 * original stream ID instead of appending a duplicate entry.
 *
 * The Lua script makes the dedupe lookup, XADD, and dedupe receipt atomic.
 * Postgres/outbox remains canonical; this is transport-level protection only.
 */
export async function publishEventIdempotent(
  event: EventFabricEventV1,
  opts: {
    client?: Redis;
    stream?: string;
    producerId?: string;
    dedupeTtlMs?: number;
  } = {},
): Promise<{ streamId: string; stream: string; producerId: string }> {
  const stream = opts.stream ?? ATLAS_EVENT_STREAM;
  const producerId = opts.producerId ?? event.producerId;
  if (!producerId) {
    throw new Error(`event ${event.eventId} is missing producerId required for idempotent stream publication`);
  }

  const validated = parseEventFabricMessage(event);
  const client = opts.client ?? getValkeyPublisher();
  await ensureConnected(client);

  const streamId = await client.eval(
    IDEMPOTENT_XADD_LUA,
    2,
    stream,
    dedupeKey(stream, producerId, validated.eventId),
    validated.eventId,
    producerId,
    validated.eventType,
    JSON.stringify(validated),
    String(opts.dedupeTtlMs ?? ATLAS_EVENT_DEDUPE_TTL_MS),
  );

  if (typeof streamId !== 'string' || streamId.length === 0) {
    throw new Error(`Valkey idempotent XADD returned invalid stream id for ${validated.eventId}`);
  }

  return { streamId, stream, producerId };
}

export async function ensureEventConsumerGroup(opts: {
  group: string;
  stream?: string;
  client?: Redis;
}): Promise<void> {
  const stream = opts.stream ?? ATLAS_EVENT_STREAM;
  const client = opts.client ?? getValkeySubscriber();
  await ensureConnected(client);
  try {
    await client.xgroup('CREATE', stream, opts.group, '0', 'MKSTREAM');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes('BUSYGROUP')) throw error;
  }
}

export type ValkeyEventDelivery = {
  streamId: string;
  event: EventFabricEventV1;
};

/**
 * Read a bounded batch from one consumer group. The caller owns side effects
 * and must ACK only after its projection/receipt is safely complete.
 */
export async function readEventBatch(opts: {
  group: string;
  consumer: string;
  count?: number;
  blockMs?: number;
  stream?: string;
  client?: Redis;
}): Promise<ValkeyEventDelivery[]> {
  const stream = opts.stream ?? ATLAS_EVENT_STREAM;
  const client = opts.client ?? getValkeySubscriber();
  await ensureConnected(client);

  const raw = await client.xreadgroup(
    'GROUP', opts.group, opts.consumer,
    'COUNT', opts.count ?? 10,
    'BLOCK', opts.blockMs ?? 1000,
    'STREAMS', stream, '>',
  );

  if (!raw) return [];

  const deliveries: ValkeyEventDelivery[] = [];
  for (const [, entries] of raw) {
    for (const [streamId, fields] of entries) {
      const map = new Map<string, string>();
      for (let i = 0; i < fields.length; i += 2) {
        map.set(String(fields[i]), String(fields[i + 1]));
      }
      const serialized = map.get('event');
      if (!serialized) throw new Error(`stream entry ${streamId} is missing event payload`);
      deliveries.push({
        streamId,
        event: parseEventFabricMessage(JSON.parse(serialized)),
      });
    }
  }
  return deliveries;
}

export async function acknowledgeEvent(opts: {
  group: string;
  streamId: string;
  stream?: string;
  client?: Redis;
}): Promise<number> {
  const client = opts.client ?? getValkeySubscriber();
  await ensureConnected(client);
  return await client.xack(opts.stream ?? ATLAS_EVENT_STREAM, opts.group, opts.streamId);
}
