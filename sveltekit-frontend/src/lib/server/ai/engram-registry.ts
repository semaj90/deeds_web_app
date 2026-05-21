import { z } from 'zod';
import type Redis from 'ioredis';

export const engramAcePacketInjectSchema = z.object({
  run_id: z.string().min(1).max(200),
  context_blob: z.string().min(1).max(2_000_000),
  ttl_seconds: z.number().int().min(60).max(86_400).default(3600),
});

export const engramChatTurnSchema = z.object({
  role: z.enum(['user', 'assistant', 'system']),
  content: z.string().min(1).max(20_000),
  metadata: z.record(z.any()).optional(),
});

export const engramChatMemoryStoreSchema = z.object({
  user_id: z.string().min(1).max(200),
  turn: engramChatTurnSchema,
  max_turns: z.number().int().min(1).max(500).default(50),
  ttl_seconds: z.number().int().min(300).max(2_592_000).default(604_800),
});

export type EngramAcePacketInjectInput = z.infer<typeof engramAcePacketInjectSchema>;
export type EngramChatMemoryStoreInput = z.infer<typeof engramChatMemoryStoreSchema>;

export function buildAcePacketKey(runId: string): string {
  return `ace:packet:${runId}`;
}

export function buildChatMemoryKey(userId: string): string {
  return `user:memory:${userId}`;
}

export async function injectAcePacket(
  redis: Redis,
  input: EngramAcePacketInjectInput,
): Promise<{
  ok: boolean;
  key: string;
  ttl: number;
  stored_ttl: number;
  size_bytes: number;
  stored_size_bytes: number;
  status: 'written';
}> {
  const key = buildAcePacketKey(input.run_id);
  const ttl = input.ttl_seconds ?? 3600;
  const sizeBytes = Buffer.byteLength(input.context_blob, 'utf8');

  await redis.set(key, input.context_blob, 'EX', ttl);

  const [exists, storedTtl, storedSize] = await Promise.all([
    redis.exists(key),
    redis.ttl(key),
    redis.strlen(key),
  ]);

  return {
    ok: exists === 1,
    key,
    ttl,
    stored_ttl: storedTtl,
    size_bytes: sizeBytes,
    stored_size_bytes: storedSize,
    status: 'written',
  };
}

export async function storeChatMemoryTurn(
  redis: Redis,
  input: EngramChatMemoryStoreInput,
): Promise<{
  ok: true;
  redis_key: string;
  score: number;
  member_size: number;
  max_turns: number;
  count: number;
  ttl: number;
  status: 'written';
}> {
  const key = buildChatMemoryKey(input.user_id);
  const score = Date.now();
  const maxTurns = input.max_turns ?? 50;
  const ttl = input.ttl_seconds ?? 604_800;
  const member = JSON.stringify({ ...input.turn, ts: score });

  await redis
    .multi()
    .zadd(key, score, member)
    .zremrangebyrank(key, 0, -(maxTurns + 1))
    .expire(key, ttl)
    .exec();

  const count = await redis.zcard(key);

  return {
    ok: true,
    redis_key: key,
    score,
    member_size: member.length,
    max_turns: maxTurns,
    count,
    ttl,
    status: 'written',
  };
}
