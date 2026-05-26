// @vitest-environment node
import { afterAll, describe, expect, it } from 'vitest';
import { and, eq, or } from 'drizzle-orm';
import { db } from '$lib/server/db/client';
import { contextTimeline, engramCards, memoryRegistry } from '$lib/server/db/schema.js';
import { injectAcePacket, storeChatMemoryTurn } from '$lib/server/ai/engram-registry.js';

const RUN_DB_INTEGRATION = process.env.RUN_DB_INTEGRATION === '1';
const describeIf = RUN_DB_INTEGRATION ? describe : describe.skip;

function makeRedisMock() {
  return {
    set: async () => 'OK',
    exists: async () => 1,
    ttl: async () => 3600,
    strlen: async () => 123,
    zcard: async () => 1,
    multi: () => ({
      zadd: () => ({ zremrangebyrank: () => ({ expire: () => ({ exec: async () => [] }) }) }),
    }),
  } as any;
}

async function waitFor<T>(fn: () => Promise<T>, predicate: (value: T) => boolean, timeoutMs = 4000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const value = await fn();
    if (predicate(value)) return value;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return fn();
}

describeIf('engram-registry postgres integration', () => {
  const runId = `it-engram-run-${Date.now()}`;
  const userId = `it-engram-user-${Date.now()}`;
  const chatMemoryId = `chat:${userId}`;

  it('persists memory_registry and engram_cards rows for ace packet + chat memory', async () => {
    const redis = makeRedisMock();

    await injectAcePacket(redis, {
      run_id: runId,
      context_blob: 'integration test packet payload',
      ttl_seconds: 900,
    });

    await storeChatMemoryTurn(redis, {
      user_id: userId,
      turn: {
        role: 'user',
        content: 'Integration test content for engram durable write path',
      },
      max_turns: 10,
      ttl_seconds: 1200,
    });

    const packetRows = await waitFor(
      () => db.select().from(memoryRegistry).where(eq(memoryRegistry.packetId, runId)).limit(1),
      (rows) => rows.length === 1
    );
    expect(packetRows.length).toBe(1);
    expect(packetRows[0]?.featureFamily).toBe('ace_packet');

    const chatRegistryRows = await waitFor(
      () => db.select().from(memoryRegistry).where(eq(memoryRegistry.memoryId, chatMemoryId)).limit(1),
      (rows) => rows.length >= 1
    );
    expect(chatRegistryRows.length).toBeGreaterThan(0);
    expect(chatRegistryRows[0]?.featureFamily).toBe('chat_memory');

    const cardRows = await waitFor(
      () => db.select().from(engramCards).where(eq(engramCards.memoryId, chatMemoryId)).limit(1),
      (rows) => rows.length === 1
    );
    expect(cardRows.length).toBe(1);
    expect(cardRows[0]?.scope).toBe('user');
  });

  afterAll(async () => {
    await db
      .delete(memoryRegistry)
      .where(or(eq(memoryRegistry.packetId, runId), eq(memoryRegistry.memoryId, chatMemoryId)));

    await db.delete(engramCards).where(eq(engramCards.memoryId, chatMemoryId));

    await db
      .delete(contextTimeline)
      .where(
        and(
          eq(contextTimeline.pipeline, 'engram-memory'),
          or(eq(contextTimeline.sessionId, runId), eq(contextTimeline.sessionId, userId))
        )
      );
  });
});
