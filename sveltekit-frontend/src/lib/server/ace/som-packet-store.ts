/**
 * som-packet-store.ts
 *
 * CRUD for SOM (Self-Organizing Map) cluster packets in Redis/Valkey.
 *
 * Key schema:
 *   ace:cluster:<row>:<col>        — cluster packet JSON
 *   ace:cluster:rank               — ZSET: cluster_key → card_count (for hot-cluster reads)
 *   ace:cluster:index              — SET: all populated cluster_keys
 *
 * The 20×20 SOM grid uses row/col from som_bmu_row / som_bmu_col on each card.
 * cluster_id is the canonical string `${row}:${col}`.
 */

import { getValkeyClient } from '$lib/server/cache/valkey-client.js';
import crypto from 'crypto';

export interface SomClusterPacket {
  cluster_id: string;   // e.g. "5:3"
  som_row: number;
  som_col: number;
  card_count: number;
  candidate_count: number;
  avg_som_dist: number | null;
  top_keywords: string[];
  top_tags: string[];
  card_sample: string[];       // up to 5 card IDs for adjacency
  feature_ids: string[];       // parent atlas feature IDs present in this cluster
  source_refs: string[];       // representative source_refs
  adjacent_clusters: string[]; // SIMILAR_TOPOLOGY neighbors
  created_at: string;
  updated_at: string;
}

const TTL = 86_400; // 24h

function clusterKey(row: number, col: number): string {
  return `ace:cluster:${row}:${col}`;
}

function clusterIdToRowCol(clusterId: string): { row: number; col: number } | null {
  const m = clusterId.match(/^(\d+):(\d+)$/);
  if (!m) return null;
  return { row: parseInt(m[1], 10), col: parseInt(m[2], 10) };
}

// ── CRUD ────────────────────────────────────────────────────────────────────

export async function createSomPacket(packet: Omit<SomClusterPacket, 'created_at' | 'updated_at'>): Promise<SomClusterPacket> {
  const redis = getValkeyClient();
  const now = new Date().toISOString();
  const full: SomClusterPacket = { ...packet, created_at: now, updated_at: now };
  const key = clusterKey(packet.som_row, packet.som_col);

  await redis.set(key, JSON.stringify(full), 'EX', TTL);
  await redis.zadd('ace:cluster:rank', packet.card_count, packet.cluster_id);
  await redis.sadd('ace:cluster:index', packet.cluster_id);

  return full;
}

export async function readSomPacket(row: number, col: number): Promise<SomClusterPacket | null> {
  const redis = getValkeyClient();
  const raw = await redis.get(clusterKey(row, col));
  if (!raw) return null;
  try { return JSON.parse(raw) as SomClusterPacket; } catch { return null; }
}

export async function readSomPacketById(clusterId: string): Promise<SomClusterPacket | null> {
  const rc = clusterIdToRowCol(clusterId);
  if (!rc) return null;
  return readSomPacket(rc.row, rc.col);
}

export async function updateSomPacket(
  row: number,
  col: number,
  patch: Partial<Omit<SomClusterPacket, 'som_row' | 'som_col' | 'cluster_id' | 'created_at'>>
): Promise<SomClusterPacket | null> {
  const redis = getValkeyClient();
  const existing = await readSomPacket(row, col);
  if (!existing) return null;

  const updated: SomClusterPacket = { ...existing, ...patch, updated_at: new Date().toISOString() };
  const key = clusterKey(row, col);
  await redis.set(key, JSON.stringify(updated), 'EX', TTL);
  if (patch.card_count !== undefined) {
    await redis.zadd('ace:cluster:rank', patch.card_count, updated.cluster_id);
  }
  return updated;
}

export async function deleteSomPacket(row: number, col: number): Promise<boolean> {
  const redis = getValkeyClient();
  const clusterId = `${row}:${col}`;
  const deleted = await redis.del(clusterKey(row, col));
  await redis.zrem('ace:cluster:rank', clusterId);
  await redis.srem('ace:cluster:index', clusterId);
  return deleted > 0;
}

export async function listSomPacketsByCluster(limit = 50): Promise<SomClusterPacket[]> {
  const redis = getValkeyClient();
  // Return hottest clusters first (highest card_count)
  const ids = await redis.zrevrange('ace:cluster:rank', 0, limit - 1);
  const packets = await Promise.all(
    ids.map(async (id) => {
      const rc = clusterIdToRowCol(id);
      if (!rc) return null;
      return readSomPacket(rc.row, rc.col);
    })
  );
  return packets.filter((p): p is SomClusterPacket => p !== null);
}

export async function listAllClusterIds(): Promise<string[]> {
  const redis = getValkeyClient();
  return redis.smembers('ace:cluster:index');
}

/** Bulk-upsert from MapReduce output (e.g. after ndjson:mapreduce runs) */
export async function bulkUpsertSomPackets(packets: Omit<SomClusterPacket, 'created_at' | 'updated_at'>[]): Promise<number> {
  let written = 0;
  for (const p of packets) {
    await createSomPacket(p);
    written++;
  }
  return written;
}
