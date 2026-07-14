import { buildPacketLodManifest } from './packet-lod-manifest.js';
import { determinePromotionDestination, validatePromotionCandidate } from './retrieval-promotion-policy.js';
import type { PacketLodManifest } from '$lib/runtime-cache/contracts.js';

/**
 * LOD Emission Integration
 *
 * Called after ranking, before cache write.
 * Emits LOD manifests for each winner candidate.
 * Respects token budget and progressive content loading.
 */

export interface RankedPacket {
  packet_key: string;
  source_ref: string;
  feature_id?: string;
  tree_node_id?: string;
  summary?: string;
  content?: string;
  som_row?: number;
  som_col?: number;
  community_id?: number;
  rank: number;
  score: number;
}

export interface LodEmissionResult {
  packet_key: string;
  lod_manifest: PacketLodManifest | null;
  destination: string;
  promotion_state: 'winner' | 'near-winner' | 'loser';
}

/**
 * Emit LOD manifests for ranked packets
 * Returns manifests ready for cache write
 */
export async function emitLodManifests(
  candidates: RankedPacket[],
  options?: { max_tokens_per_packet?: number }
): Promise<LodEmissionResult[]> {
  const maxTokens = options?.max_tokens_per_packet ?? 1024;
  const results: LodEmissionResult[] = [];

  for (const packet of candidates) {
    try {
      // Determine destination based on rank + score
      const validation = validatePromotionCandidate(packet);
      const destination = determinePromotionDestination({
        packet,
        rank: packet.rank,
        score: packet.score,
        validationPassed: validation.passed
      });

      // Build LOD manifest appropriate for destination
      const manifest = await buildPacketLodManifest(packet, {
        destination: destination as any,
        rank: packet.rank,
        score: packet.score
      });

      // Classify outcome
      const promotionState =
        destination === 'browser-l1' || destination === 'valkey-hot' || destination === 'valkey-warm'
          ? 'winner'
          : destination === 'analytics-only'
            ? 'near-winner'
            : 'loser';

      results.push({
        packet_key: packet.packet_key,
        lod_manifest: manifest,
        destination,
        promotionState
      });

      // Log emission with telemetry
      console.log(`[LOD_EMISSION] ${packet.packet_key} → ${destination} (lod=${manifest?.lod || 'null'}, tokens=${manifest?.tokenCount || 0})`);
    } catch (err) {
      console.error(`Failed to emit LOD manifest for ${packet.packet_key}:`, err);
      results.push({
        packet_key: packet.packet_key,
        lod_manifest: null,
        destination: 'analytics-only',
        promotion_state: 'near-winner'
      });
    }
  }

  return results;
}

/**
 * Filter LOD manifests by budget
 * Ensures no manifest exceeds token budget
 */
export function filterManifestsByBudget(
  emissions: LodEmissionResult[],
  budgetTokens: number = 1024
): LodEmissionResult[] {
  return emissions.filter((e) => {
    if (!e.lod_manifest) return true; // Null manifests always pass
    const tokens = e.lod_manifest.tokenCount ?? 0;
    if (tokens <= budgetTokens) return true;

    console.warn(
      `[LOD_BUDGET_VIOLATION] ${e.packet_key} exceeds budget: ${tokens} > ${budgetTokens} tokens`
    );
    return false;
  });
}

/**
 * Emit only identity-level (LOD0) manifests for fast-path retrieval
 * Used when populating result list without content materialization
 */
export function emitLod0FastPath(packets: RankedPacket[]): LodEmissionResult[] {
  return packets.map((packet) => {
    // LOD0: identity only (no content, 0 bytes)
    return {
      packet_key: packet.packet_key,
      lod_manifest: {
        packetKey: packet.packet_key,
        sourceRef: packet.source_ref,
        lod: '0',
        cacheClass: 'warm',
        contentHash: '',
        byteLength: 0,
        generatedAt: new Date().toISOString(),
        promotionState: 'winner'
      },
      destination: 'valkey-warm',
      promotion_state: 'winner'
    };
  });
}
