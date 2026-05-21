import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Redis from 'ioredis';
import { z } from 'zod';
import {
  engramAcePacketInjectSchema,
  engramChatMemoryStoreSchema,
  injectAcePacket,
  storeChatMemoryTurn,
} from '../lib/server/ai/engram-registry.js';

let redisClient: Redis | null = null;
let connecting: Promise<Redis> | null = null;

async function getRedis(redisUrl: string): Promise<Redis> {
  if (redisClient) return redisClient;
  if (connecting) return connecting;

  connecting = (async () => {
    const client = new Redis(redisUrl, {
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      connectTimeout: 2000,
      commandTimeout: 3000,
      retryStrategy: () => null,
    });
    client.on('error', () => {});
    await client.connect();
    redisClient = client;
    return client;
  })().finally(() => {
    connecting = null;
  });

  return connecting;
}

export function registerEngramTools(server: McpServer, redisUrl: string): void {
  server.registerTool(
    'engram.ace_packet_inject',
    {
      description: 'Write ACE context packet to Redis with 1h TTL: ace:packet:{runId}.',
      inputSchema: engramAcePacketInjectSchema,
    },
    async (args) => {
      const parsed = engramAcePacketInjectSchema.safeParse(args);
      if (!parsed.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ok: false, status: 'invalid-input', issues: parsed.error.issues }),
            },
          ],
          isError: true,
        };
      }

      try {
        const redis = await getRedis(redisUrl);
        const result = await injectAcePacket(redis, parsed.data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ok: false,
                status: 'degraded',
                error: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'engram.chat_memory_store',
    {
      description: 'Append a chat turn to user memory store (Redis sorted set + bounded trim).',
      inputSchema: engramChatMemoryStoreSchema,
    },
    async (args) => {
      const parsed = engramChatMemoryStoreSchema.safeParse(args);
      if (!parsed.success) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ok: false, status: 'invalid-input', issues: parsed.error.issues }),
            },
          ],
          isError: true,
        };
      }

      try {
        const redis = await getRedis(redisUrl);
        const result = await storeChatMemoryTurn(redis, parsed.data);
        return { content: [{ type: 'text' as const, text: JSON.stringify(result) }] };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({
                ok: false,
                status: 'degraded',
                error: err instanceof Error ? err.message : String(err),
              }),
            },
          ],
          isError: true,
        };
      }
    },
  );

  server.registerTool(
    'engram.redis_health',
    {
      description: 'Check Redis availability used by engram memory tools.',
      inputSchema: z.object({}),
    },
    async () => {
      try {
        const redis = await getRedis(redisUrl);
        const pong = await redis.ping();
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ok: pong === 'PONG', pong }),
            },
          ],
        };
      } catch (err) {
        return {
          content: [
            {
              type: 'text' as const,
              text: JSON.stringify({ ok: false, error: err instanceof Error ? err.message : String(err) }),
            },
          ],
          isError: true,
        };
      }
    },
  );
}
