import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import Redis from 'ioredis';
import { z } from 'zod';
import {
  engramAcePacketInjectSchema,
  engramChatMemoryStoreSchema,
  injectAcePacket,
  storeChatMemoryTurn,
} from '../lib/server/ai/engram-registry.js';
import type { DispatcherMiddleware } from './dispatcher-middleware.js';
import { generateSessionId, createToolWithDispatcher } from './dispatcher-tool-integration.js';

let redisClient: Redis | null = null;
let connecting: Promise<Redis> | null = null;

const ActiveContextPacketSchema = z.object({
  schemaVersion: z.string(),
  packetKind: z.string().optional(),
  acePacketId: z.string().optional(),
  runId: z.string().optional(),
  workspaceId: z.string().optional(),
  workspaceRevision: z.string().min(1),
  objective: z.string().min(1),
  createdAt: z.string().min(1),
  expiresInSeconds: z.number().int().positive(),
  sourceRefs: z.array(z.string()).default([]),
  selectedEntities: z.array(z.object({
    lane: z.string(),
    status: z.string(),
    summary: z.string(),
    sourceRefs: z.array(z.string()).default([]),
  })).default([]),
  laneStates: z.array(z.object({
    lane: z.string(),
    status: z.string(),
    reason: z.string(),
    evidenceRefs: z.array(z.string()).default([]),
  })).default([]),
  violations: z.array(z.object({
    code: z.string(),
    lane: z.string(),
    severity: z.enum(['INFO', 'WARN', 'BLOCK']),
    detail: z.string(),
  })).default([]),
  nextSteps: z.array(z.object({
    taskId: z.string(),
    title: z.string(),
    priority: z.enum(['CRITICAL', 'HIGH', 'MEDIUM', 'LOW']),
    sourceRefs: z.array(z.string()).default([]),
    validationCommands: z.array(z.string()).default([]),
    blockedBy: z.array(z.string()).default([]),
  })).default([]),
  tokenBudget: z.number().int().positive(),
  safeguards: z.object({
    authoritative: z.literal(false),
    mayPromoteAuditStatus: z.literal(false),
    requiresLiveValidation: z.literal(true),
  }),
});

async function getRedis(redisUrl: string): Promise<Redis> {
  if (redisClient) return redisClient;
  if (connecting) return connecting;

  connecting = (async () => {
    const client = new Redis(redisUrl, {
      password: process.env.REDIS_PASSWORD,
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

async function scanMatchingKeys(redis: Redis, pattern: string): Promise<string[]> {
  const keys: string[] = [];
  let cursor = '0';

  do {
    const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 50);
    cursor = nextCursor;
    keys.push(...batch);
  } while (cursor !== '0');

  return keys;
}

async function readLatestActiveContextPacket(redis: Redis) {
  const pointerKeys = [
    'ace:packet:latest:reconciliation',
    'bifrost:packet:latest:reconciliation',
  ];

  for (const pointerKey of pointerKeys) {
    const pointedKey = await redis.get(pointerKey);
    if (!pointedKey) continue;
    const pointedValue = await redis.get(pointedKey);
    if (pointedValue) {
      return { packetKey: pointedKey, raw: pointedValue };
    }
  }

  const candidatePatterns = [
    'ace:packet:reconciliation:*',
    'bifrost:packet:reconciliation:*',
  ];

  const candidates: Array<{ packetKey: string; raw: string; createdAt: number }> = [];

  for (const pattern of candidatePatterns) {
    const keys = await scanMatchingKeys(redis, pattern);
    for (const packetKey of keys) {
      const raw = await redis.get(packetKey);
      if (!raw) continue;

      try {
        const parsed = JSON.parse(raw) as { createdAt?: string };
        const createdAt = parsed.createdAt ? Date.parse(parsed.createdAt) : 0;
        candidates.push({ packetKey, raw, createdAt: Number.isFinite(createdAt) ? createdAt : 0 });
      } catch {
        continue;
      }
    }
  }

  candidates.sort((a, b) => b.createdAt - a.createdAt || a.packetKey.localeCompare(b.packetKey));
  return candidates[0] ?? null;
}

function deriveSignalSummary(packet: Record<string, unknown>) {
  const explicit = (packet.signalSummary ?? packet.signal_summary ?? null) as Record<string, unknown> | null;
  const lexicalCandidates = [
    packet.lexical,
    packet.lexicalHints,
    packet.lexicalSignals,
    explicit?.lexical,
  ];
  const pagerankCandidates = [
    packet.pagerank,
    packet.pageRank,
    packet.pagerankScore,
    explicit?.pagerank,
  ];
  const centroidCandidates = [
    packet.centroid,
    packet.centroidId,
    packet.centroidIds,
    packet.redisCentroid,
    explicit?.centroid,
  ];
  const rerankerCandidates = [
    packet.reranker,
    packet.rerankerModel,
    packet.rerankModel,
    explicit?.reranker,
  ];

  const firstString = (...values: unknown[]): string | null => {
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) return value.trim();
      if (Array.isArray(value) && value.length > 0 && typeof value[0] === 'string' && value[0].trim()) {
        return value[0].trim();
      }
    }
    return null;
  };

  const toStringList = (...values: unknown[]): string[] => {
    const list: string[] = [];
    for (const value of values) {
      if (typeof value === 'string' && value.trim()) {
        list.push(value.trim());
        continue;
      }
      if (Array.isArray(value)) {
        for (const entry of value) {
          if (typeof entry === 'string' && entry.trim()) list.push(entry.trim());
        }
      }
    }
    return [...new Set(list)].slice(0, 12);
  };

  const pagerank = typeof pagerankCandidates.find((value) => typeof value === 'number') === 'number'
    ? pagerankCandidates.find((value) => typeof value === 'number')
    : null;

  return {
    pagerank,
    summary: firstString(
      explicit?.summary,
      packet.summary,
      packet.packetSummary,
      packet.retrievalSummary,
      packet.nextStepSummary,
    ),
    lexical: toStringList(...lexicalCandidates),
    centroid: firstString(...centroidCandidates) ?? centroidCandidates.find((value) => Array.isArray(value)) ?? null,
    reranker: firstString(...rerankerCandidates),
    langextract: firstString(packet.langextract, packet.langextractModel, explicit?.langextract),
    graph: {
      communityId: packet.communityId ?? packet.community_id ?? explicit?.communityId ?? null,
      topology: packet.topology ?? explicit?.topology ?? null,
    },
  };
}

export function registerEngramTools(server: McpServer, redisUrl: string, dispatcherMiddleware: DispatcherMiddleware): void {
  const sessionId_ace_inject = generateSessionId();
  server.registerTool(
    'engram.ace_packet_inject',
    {
      description: 'Write ACE context packet to Redis with 1h TTL: ace:packet:{runId}.',
      inputSchema: engramAcePacketInjectSchema,
    },
    createToolWithDispatcher(
      dispatcherMiddleware,
      'engram.ace_packet_inject',
      sessionId_ace_inject,
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
      }
    )
  );

  const sessionId_get_context = generateSessionId();
  server.registerTool(
    'atlas_get_active_context',
    {
      description: 'Read the newest bounded ACE reconciliation packet from Redis Valkey, validate it, and return compact resume context.',
      inputSchema: z.object({}),
    },
    createToolWithDispatcher(
      dispatcherMiddleware,
      'atlas_get_active_context',
      sessionId_get_context,
      async () => {
        try {
          const redis = await getRedis(redisUrl);
          const latest = await readLatestActiveContextPacket(redis);

          if (!latest) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    ok: false,
                    status: 'missing',
                    error: 'No active reconciliation ACE packet found in Redis Valkey.',
                  }),
                },
              ],
              isError: true,
            };
          }

          const parsed = ActiveContextPacketSchema.safeParse(JSON.parse(latest.raw));
          if (!parsed.success) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    ok: false,
                    status: 'invalid',
                    error: 'Stored ACE packet failed schema validation.',
                    issues: parsed.error.issues,
                  }),
                },
              ],
              isError: true,
            };
          }

          const packet = parsed.data;
          const signalSummary = deriveSignalSummary(packet as Record<string, unknown>);
          const currentRevision = process.env.WORKSPACE_REVISION;
          if (currentRevision && packet.workspaceRevision !== currentRevision) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    ok: false,
                    status: 'stale',
                    error: 'Stored ACE packet workspace revision does not match the current workspace revision.',
                    packetKey: latest.packetKey,
                  }),
                },
              ],
              isError: true,
            };
          }

          const ttl = await redis.ttl(latest.packetKey);
          if (ttl <= 0) {
            return {
              content: [
                {
                  type: 'text' as const,
                  text: JSON.stringify({
                    ok: false,
                    status: 'expired',
                    error: 'Stored ACE packet is missing TTL or has expired.',
                    packetKey: latest.packetKey,
                  }),
                },
              ],
              isError: true,
            };
          }

          return {
            content: [
              {
                type: 'text' as const,
                text: JSON.stringify({
                  ok: true,
                  objective: packet.objective,
                  selectedEntities: packet.selectedEntities,
                  violations: packet.violations,
                  nextSteps: packet.nextSteps,
                  sourceRefs: packet.sourceRefs,
                  tokenBudget: packet.tokenBudget,
                  signalSummary,
                  memorySwap: {
                    cacheKey: latest.packetKey,
                    packetId: packet.acePacketId ?? packet.runId ?? null,
                    workspaceRevision: packet.workspaceRevision,
                    expiresInSeconds: packet.expiresInSeconds,
                    sourceRefs: packet.sourceRefs,
                  },
                }),
              },
            ],
          };
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
      }
    )
  );

  const sessionId_chat_memory = generateSessionId();
  server.registerTool(
    'engram.chat_memory_store',
    {
      description: 'Append a chat turn to user memory store (Redis sorted set + bounded trim).',
      inputSchema: engramChatMemoryStoreSchema,
    },
    createToolWithDispatcher(
      dispatcherMiddleware,
      'engram.chat_memory_store',
      sessionId_chat_memory,
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
      }
    )
  );

  const sessionId_redis_health = generateSessionId();
  server.registerTool(
    'engram.redis_health',
    {
      description: 'Check Redis availability used by engram memory tools.',
      inputSchema: z.object({}),
    },
    createToolWithDispatcher(
      dispatcherMiddleware,
      'engram.redis_health',
      sessionId_redis_health,
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
      }
    )
  );
}
