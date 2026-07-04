/**
 * ACE Packet Swap
 *
 * Runtime packet replacement in the worker loop.
 * When a packet has an error_class, the HMM classifier picks a recovery packet_key.
 * The current packet is swapped for the recovery packet before processing continues.
 *
 * Hard rules:
 * - packet_key is immutable — we select a different packet, never mutate identity
 * - analytics/logs are evidence streams only — they do not mutate packet identity
 * - swap only fires if recovery confidence >= MIN_CONFIDENCE threshold
 */

import type { PacketTopologyEnvelope } from '$lib/server/hyperrag/packet-topology-envelope.js';
import { classifyAndPickRecovery } from '$lib/server/analysis/hmm-error-classifier.js';
import { retrieveDagHitEnvelope } from '$lib/server/serialization/dag-hit-envelope-persist.js';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';

const MIN_CONFIDENCE = 0.60;
const REPAIR_CACHE_TTL = 300; // seconds — matches bifrost:repair:* TTL

interface RepairAction {
  task_id: string;
  original_packet_key: string;
  recovery_packet_key: string;
  action: 'repair';
  confidence: number;
  emitted_at: string;
}

/**
 * Emit a repair action to the BitFrost repair cache and RabbitMQ queue.
 * Non-blocking — callers do not await side effects.
 */
async function emitRepairAction(action: RepairAction): Promise<void> {
  try {
    const redis = getRedis();
    const cacheKey = `bitfrost:repair:${action.task_id}:${action.original_packet_key}`;
    await redis.setex(cacheKey, REPAIR_CACHE_TTL, JSON.stringify(action));
  } catch {
    // Repair cache write is best-effort — never block on it
  }
}

/**
 * Load a recovery packet from the binary dag-hit cache, then fall back to Postgres.
 */
async function loadRecoveryPacket(
  recoveryPacketKey: string
): Promise<PacketTopologyEnvelope | null> {
  // L1: dag-hit binary blob store (fast, temporary)
  const fromCache = await retrieveDagHitEnvelope(recoveryPacketKey);
  if (fromCache) return fromCache;

  // L2: Postgres canonical truth
  const rows = await db.execute(sql`
    SELECT packet_key, source_ref, feature_id, title_id, summary, page_rank_score,
           som_row, som_col, som_cluster, community_id, kmeans_cluster_id
    FROM atlas_packets
    WHERE packet_key = ${recoveryPacketKey}
    LIMIT 1
  `);

  const row = rows.rows?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  return row as unknown as PacketTopologyEnvelope;
}

/**
 * Attempt an ACE packet swap if the incoming packet has an error_class.
 * Returns the recovery packet on success, or the original packet unchanged.
 */
export async function swapPacketIfRecoveryAvailable(
  packet: PacketTopologyEnvelope & { error_class?: string; error_evidence?: Record<string, unknown> }
): Promise<PacketTopologyEnvelope> {
  const errorClass = packet.error_class;
  if (!errorClass || errorClass === 'ok') return packet;

  const modelName = (packet as Record<string, unknown>).model_name as string | undefined
    ?? 'unknown';

  const recovery = await classifyAndPickRecovery(
    errorClass,
    modelName,
    packet.error_evidence ?? {}
  );

  if (!recovery || recovery.confidence < MIN_CONFIDENCE) return packet;

  const recoveryPacket = await loadRecoveryPacket(recovery.recoveryPacketKey);
  if (!recoveryPacket) return packet;

  console.log(
    `[ACE Swap] ${packet.packet_key} → ${recoveryPacket.packet_key}` +
    ` (error: ${errorClass}, confidence: ${recovery.confidence.toFixed(2)})`
  );

  // Fire-and-forget repair action
  emitRepairAction({
    task_id: (packet as Record<string, unknown>).task_id as string ?? 'unknown',
    original_packet_key: packet.packet_key,
    recovery_packet_key: recoveryPacket.packet_key,
    action: 'repair',
    confidence: recovery.confidence,
    emitted_at: new Date().toISOString(),
  }).catch(() => {});

  return recoveryPacket;
}
