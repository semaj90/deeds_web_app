/**
 * HyperRAG Replay Trace Infrastructure
 *
 * Records request/response pairs for debugging and audit trails.
 * Enables deterministic replay of packet RPC calls without re-querying live systems.
 */

import type { HyperRagPacketRpcInput, HyperRagPacketRpcResult } from '../retrieval/hyperrag-packet-rpc.js';
import type Redis from 'ioredis';

export interface ReplayTraceEntry {
  id: string;
  query: string;
  timestamp: string;
  request: HyperRagPacketRpcInput;
  response: HyperRagPacketRpcResult;
  metadata: {
    client_id?: string;
    session_id?: string;
    user_id?: string;
    task_id?: string;
    worker_id?: string;
    replay_id?: string;
    cache_source?: string;
    cache_namespace?: string;
    graph_stage_status?: 'GRAPH_ENABLED' | 'GRAPH_DEGRADED' | 'GRAPH_DISABLED';
    graph_stage_reason?: string;
    duration_ms: number;
    cache_hit: boolean;
  };
}

export interface ReplayTraceIndex {
  id: string;
  query: string;
  timestamp: string;
  size_bytes: number;
  packet_count: number;
  cache_hit: boolean;
  duration_ms: number;
}

const TRACE_KEY_PREFIX = 'hyperrag:replay:trace:';
const TRACE_INDEX_KEY = 'hyperrag:replay:index';
const TRACE_MAX_ENTRIES = 1000;

export class HyperRagReplayTrace {
  private id: string;
  private query: string;
  private timestamp: string;
  private request: HyperRagPacketRpcInput | null = null;
  private response: HyperRagPacketRpcResult | null = null;
  private startTime: number = 0;
  private metadata: {
    client_id?: string;
    session_id?: string;
    user_id?: string;
    task_id?: string;
    worker_id?: string;
    replay_id?: string;
    cache_source?: string;
    cache_namespace?: string;
    graph_stage_status?: 'GRAPH_ENABLED' | 'GRAPH_DEGRADED' | 'GRAPH_DISABLED';
    graph_stage_reason?: string;
    duration_ms: number;
    cache_hit: boolean;
  } = { duration_ms: 0, cache_hit: false };

  constructor(query: string, clientId?: string) {
    this.query = query;
    this.id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    this.timestamp = new Date().toISOString();
    this.startTime = Date.now();
    if (clientId) this.metadata.client_id = clientId;
  }

  recordRequest(input: HyperRagPacketRpcInput): void {
    this.request = input;
  }

  recordResponse(result: HyperRagPacketRpcResult): void {
    this.response = result;
    this.metadata.duration_ms = Date.now() - this.startTime;
  }

  setSessionContext(sessionId: string, userId?: string): void {
    this.metadata.session_id = sessionId;
    if (userId) this.metadata.user_id = userId;
  }

  setCacheHit(hit: boolean): void {
    this.metadata.cache_hit = hit;
  }

  setReplayMetadata(context: {
    replay_id?: string;
    cache_source?: string;
    cache_namespace?: string;
    task_id?: string;
    worker_id?: string;
    graph_stage_status?: 'GRAPH_ENABLED' | 'GRAPH_DEGRADED' | 'GRAPH_DISABLED';
    graph_stage_reason?: string;
  }): void {
    if (context.replay_id) this.metadata.replay_id = context.replay_id;
    if (context.cache_source) this.metadata.cache_source = context.cache_source;
    if (context.cache_namespace) this.metadata.cache_namespace = context.cache_namespace;
    if (context.task_id) this.metadata.task_id = context.task_id;
    if (context.worker_id) this.metadata.worker_id = context.worker_id;
    if (context.graph_stage_status) this.metadata.graph_stage_status = context.graph_stage_status;
    if (context.graph_stage_reason) this.metadata.graph_stage_reason = context.graph_stage_reason;
  }

  setResponseContext(context: {
    replay_id?: string;
    cache_source?: string;
    cache_namespace?: string;
    task_id?: string;
    worker_id?: string;
    graph_stage_status?: 'GRAPH_ENABLED' | 'GRAPH_DEGRADED' | 'GRAPH_DISABLED';
    graph_stage_reason?: string;
  }): void {
    this.setReplayMetadata(context);
  }

  getId(): string {
    return this.id;
  }

  toEntry(): ReplayTraceEntry {
    if (!this.request || !this.response) {
      throw new Error('trace incomplete: missing request or response');
    }
    return {
      id: this.id,
      query: this.query,
      timestamp: this.timestamp,
      request: this.request,
      response: this.response,
      metadata: this.metadata,
    };
  }

  toIndex(): ReplayTraceIndex {
    if (!this.response) {
      throw new Error('trace incomplete: missing response');
    }
    return {
      id: this.id,
      query: this.query,
      timestamp: this.timestamp,
      size_bytes: JSON.stringify(this.response).length,
      packet_count: this.response.packets.length,
      cache_hit: this.metadata.cache_hit,
      duration_ms: this.metadata.duration_ms,
    };
  }

  async save(redis: Redis, ttlSeconds: number = 86400): Promise<void> {
    const entry = this.toEntry();
    const index = this.toIndex();

    try {
      const traceKey = `${TRACE_KEY_PREFIX}${this.id}`;
      await redis.setex(traceKey, ttlSeconds, JSON.stringify(entry));
      await redis.zadd(TRACE_INDEX_KEY, Date.now(), JSON.stringify(index));
      await redis.zremrangebyrank(TRACE_INDEX_KEY, 0, -TRACE_MAX_ENTRIES - 1);
    } catch (err) {
      console.warn('[HyperRAG Replay] Save failed:', err instanceof Error ? err.message : String(err));
    }
  }
}

export async function loadReplayTrace(redis: Redis, traceId: string): Promise<ReplayTraceEntry | null> {
  try {
    const key = `${TRACE_KEY_PREFIX}${traceId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) as ReplayTraceEntry : null;
  } catch {
    return null;
  }
}

export async function listReplayTraces(redis: Redis, limit: number = 50): Promise<ReplayTraceIndex[]> {
  try {
    const scores = await redis.zrevrange(TRACE_INDEX_KEY, 0, limit - 1, 'WITHSCORES');
    const results: ReplayTraceIndex[] = [];
    for (let i = 0; i < scores.length; i += 2) {
      const json = scores[i];
      if (json && typeof json === 'string') {
        results.push(JSON.parse(json) as ReplayTraceIndex);
      }
    }
    return results;
  } catch {
    return [];
  }
}

export async function replayTrace(redis: Redis, traceId: string): Promise<HyperRagPacketRpcResult | null> {
  const trace = await loadReplayTrace(redis, traceId);
  return trace ? trace.response : null;
}

export async function pruneReplayTraces(redis: Redis, maxAgeDays: number = 7): Promise<number> {
  try {
    const now = Date.now();
    const cutoff = now - maxAgeDays * 24 * 60 * 60 * 1000;
    const removed = await redis.zremrangebyscore(TRACE_INDEX_KEY, 0, cutoff);
    return removed;
  } catch (err) {
    console.warn('[HyperRAG Replay] Prune failed:', err instanceof Error ? err.message : String(err));
    return 0;
  }
}
