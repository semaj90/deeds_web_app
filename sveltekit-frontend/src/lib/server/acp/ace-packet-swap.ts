/**
 * ACE Packet Swap
 *
 * Proves binary serialization is safe before using it in the DAG-hit cache.
 * Encodes a canonical packet to msgpack → stores BYTEA → decodes → verifies
 * packet_key + title_id + feature_id + summary hash all survive the round-trip.
 *
 * Runtime swap flow:
 *   incoming packet (error_class set)
 *   → HMM classifies → selects recovery packet_key
 *   → load recovery from dag-hit cache (L1) or Postgres (L2)
 *   → verify round-trip integrity
 *   → return recovery packet to caller
 *
 * Hard rules:
 * - packet_key is immutable — swap selects a different packet, never mutates identity
 * - confidence gate: swap only fires if classification.confidence >= MIN_CONFIDENCE
 * - transport verification runs on every swap to catch codec regressions early
 */

import { createHash } from 'node:crypto';
import type { PacketTopologyEnvelope } from '$lib/server/hyperrag/packet-topology-envelope.js';
import { encodePacketToMsgpack, decodePacketFromMsgpack } from '$lib/server/serialization/packet-msgpack-codec.js';
import { persistDagHitEnvelope, retrieveDagHitEnvelope } from '$lib/server/serialization/dag-hit-envelope-persist.js';
import { classifyObservations, normalizeObservation, type ClassificationResult } from '$lib/server/analysis/hmm-error-classifier.js';
import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { getRedis } from '$lib/server/redis.js';

const MIN_CONFIDENCE = 0.60;
const REPAIR_CACHE_TTL = 300;

// ── Transport verification ────────────────────────────────────────────────────

export interface TransportVerification {
  ok: boolean;
  packet_key_match: boolean;
  title_id_match: boolean;
  feature_id_match: boolean;
  summary_hash_match: boolean;
  encoded_bytes: number;
  failures: string[];
}

function summaryHash(summary: string | undefined | null): string {
  return createHash('sha256').update(summary ?? '').digest('hex').slice(0, 16);
}

/**
 * Encode a packet to msgpack, decode it back, and verify identity fields survive.
 * This is the "ACE transport proof" — must pass before a swap is trusted.
 */
export function verifyPacketRoundTrip(packet: PacketTopologyEnvelope): TransportVerification {
  const failures: string[] = [];

  let encoded: Uint8Array;
  let decoded: Record<string, unknown>;

  try {
    encoded = encodePacketToMsgpack(packet);
  } catch (err) {
    return {
      ok: false,
      packet_key_match: false,
      title_id_match: false,
      feature_id_match: false,
      summary_hash_match: false,
      encoded_bytes: 0,
      failures: [`encode failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  try {
    decoded = decodePacketFromMsgpack(encoded);
  } catch (err) {
    return {
      ok: false,
      packet_key_match: false,
      title_id_match: false,
      feature_id_match: false,
      summary_hash_match: false,
      encoded_bytes: encoded.length,
      failures: [`decode failed: ${err instanceof Error ? err.message : String(err)}`],
    };
  }

  // Verify identity fields survive the codec round-trip
  // Decoded keys are numeric tags (0, 3, 4 …) — map back via PacketMsgpackTags
  const decodedKey     = decoded[0] as string | undefined;
  const decodedTitle   = decoded[3] as string | undefined;
  const decodedFeature = decoded[4] as string | undefined;
  const decodedSummary = decoded[17] as string | undefined;

  const packet_key_match   = decodedKey     === packet.packet_key;
  const title_id_match     = decodedTitle   === packet.title_id;
  const feature_id_match   = decodedFeature === packet.feature_id;
  const summary_hash_match = summaryHash(decodedSummary) === summaryHash(packet.summary);

  if (!packet_key_match)   failures.push(`packet_key mismatch: ${packet.packet_key} → ${decodedKey}`);
  if (!title_id_match)     failures.push(`title_id mismatch: ${packet.title_id} → ${decodedTitle}`);
  if (!feature_id_match)   failures.push(`feature_id mismatch: ${packet.feature_id} → ${decodedFeature}`);
  if (!summary_hash_match) failures.push(`summary hash mismatch after round-trip`);

  return {
    ok: failures.length === 0,
    packet_key_match,
    title_id_match,
    feature_id_match,
    summary_hash_match,
    encoded_bytes: encoded.length,
    failures,
  };
}

// ── Recovery packet loader ────────────────────────────────────────────────────

async function loadRecoveryPacket(
  recoveryPacketKey: string
): Promise<PacketTopologyEnvelope | null> {
  // L1: dag-hit binary blob store
  const fromCache = await retrieveDagHitEnvelope(recoveryPacketKey);
  if (fromCache) return fromCache;

  // L2: Postgres canonical truth
  const rows = await db.execute(sql`
    SELECT
      ap.packet_key,
      ap.source_ref,
      ap.feature_id,
      ap.title_id,
      COALESCE(NULLIF(ap.summary, ''), NULLIF(asl.summary_text, ''), NULLIF(asl.summary, '')) AS summary,
      ap.page_rank_score,
      ap.som_row,
      ap.som_col,
      ap.som_cluster,
      ap.community_id,
      ap.kmeans_cluster_id,
      ap.directory_path
    FROM atlas_packets ap
    LEFT JOIN LATERAL (
      SELECT summary_text, summary
      FROM atlas_summary_layers layer
      WHERE layer.packet_key = ap.packet_key
      ORDER BY layer.generated_at DESC NULLS LAST, layer.created_at DESC NULLS LAST
      LIMIT 1
    ) asl ON TRUE
    WHERE ap.packet_key = ${recoveryPacketKey}
    LIMIT 1
  `);

  const row = rows.rows?.[0] as Record<string, unknown> | undefined;
  if (!row) return null;

  return row as unknown as PacketTopologyEnvelope;
}

// ── Repair action emit ────────────────────────────────────────────────────────

async function emitRepairAction(opts: {
  task_id: string;
  original_packet_key: string;
  recovery_packet_key: string;
  confidence: number;
  error_class: string;
  verification: TransportVerification;
}): Promise<void> {
  try {
    const redis = getRedis();
    const cacheKey = `bitfrost:repair:${opts.error_class}:${opts.original_packet_key}`;
    await redis.setex(cacheKey, REPAIR_CACHE_TTL, JSON.stringify({
      ...opts,
      emitted_at: new Date().toISOString(),
    }));
  } catch {
    // best-effort — never block on repair cache write
  }
}

// ── Main swap entry point ─────────────────────────────────────────────────────

export interface SwapResult {
  swapped: boolean;
  packet: PacketTopologyEnvelope;
  classification?: ClassificationResult;
  verification?: TransportVerification;
  reason: string;
}

export async function swapPacketIfRecoveryAvailable(
  packet: PacketTopologyEnvelope & {
    error_class?: string;
    error_evidence?: Record<string, unknown>;
    task_id?: string;
    model_name?: string;
  }
): Promise<SwapResult> {
  const errorClass = packet.error_class;
  if (!errorClass || errorClass === 'ok') {
    return { swapped: false, packet, reason: 'no error_class on packet' };
  }

  // Normalize the error into an observation sequence and classify
  const obs = normalizeObservation(errorClass);
  const classification = classifyObservations(obs ? [obs] : []);

  if (classification.confidence < MIN_CONFIDENCE) {
    return {
      swapped: false,
      packet,
      classification,
      reason: `confidence ${classification.confidence.toFixed(2)} below threshold ${MIN_CONFIDENCE}`,
    };
  }

  // Use suggestedAction as recovery hint to find a candidate packet
  // In practice this would query error_cluster_groups for recovery_packet_key;
  // for now we load the canonical packet itself to prove transport integrity.
  const recoveryPacketKey = packet.packet_key; // self-test path when no cluster exists
  const recoveryPacket = await loadRecoveryPacket(recoveryPacketKey);

  if (!recoveryPacket) {
    return {
      swapped: false,
      packet,
      classification,
      reason: `recovery packet not found: ${recoveryPacketKey}`,
    };
  }

  // Prove binary transport is safe before accepting the swap
  const verification = verifyPacketRoundTrip(recoveryPacket);

  if (!verification.ok) {
    console.error(
      `[ACE Swap] Transport verification FAILED for ${recoveryPacketKey}:`,
      verification.failures
    );
    return {
      swapped: false,
      packet,
      classification,
      verification,
      reason: `transport verification failed: ${verification.failures.join('; ')}`,
    };
  }

  // Persist the verified packet to the dag-hit cache so future lookups hit L1
  await persistDagHitEnvelope(recoveryPacket, 'cache_swap').catch(() => {});

  console.log(
    `[ACE Swap] ${packet.packet_key} → ${recoveryPacket.packet_key}` +
    ` | state: ${classification.state}` +
    ` | confidence: ${classification.confidence.toFixed(2)}` +
    ` | bytes: ${verification.encoded_bytes}`
  );

  await emitRepairAction({
    task_id: packet.task_id ?? 'unknown',
    original_packet_key: packet.packet_key,
    recovery_packet_key: recoveryPacket.packet_key,
    confidence: classification.confidence,
    error_class: errorClass,
    verification,
  }).catch(() => {});

  return {
    swapped: true,
    packet: recoveryPacket,
    classification,
    verification,
    reason: `swapped via state=${classification.state}`,
  };
}
