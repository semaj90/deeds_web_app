/**
 * Packet Key Builder — Deterministic Identity Construction
 *
 * Canonical builder for packet_key derivation from (source_ref + tree_node_id + title_id).
 * packet_key MUST remain identical across all storage layers (Postgres → Qdrant → Redis → RPC → Agent).
 *
 * **CRITICAL RULE**: packet_key is immutable canonical identity.
 * Use for: joining, deduplication, cross-layer matching.
 * DO NOT use for: retrieval lane selection (use som_cluster, kmeans_cluster instead).
 */

import { createHash } from 'crypto';

/**
 * Compute packet_key from canonical lineage chain.
 *
 * Derivation:
 *   source_ref (file path) + tree_node_id (structural AST identity) + title_id (semantic grouping)
 *   → SHA256 hash → packet_key
 *
 * **Deterministic**: identical input always produces identical packet_key.
 * **Immutable**: packet_key never changes across layers.
 */
export function computePacketKey(
  source_ref: string,
  tree_node_id: string | null | undefined,
  title_id: string | null | undefined
): string {
  if (!source_ref) {
    throw new Error('source_ref is required to compute packet_key');
  }

  // Normalize inputs: missing fields are treated as empty strings (deterministic)
  const normalized = [source_ref, tree_node_id ?? '', title_id ?? ''].join('|');

  // SHA256 hash of concatenated identity fields
  const hash = createHash('sha256').update(normalized).digest('hex');

  return hash;
}

/**
 * Verify packet_key immutability across two storage layers.
 *
 * **Hard Gate**: Any mismatch = reconciliation failure (no silent fallback).
 */
export function validatePacketKeyImmutability(
  stored_packet_key: string,
  retrieved_packet_key: string
): { is_valid: boolean; error?: string } {
  if (stored_packet_key !== retrieved_packet_key) {
    return {
      is_valid: false,
      error: `packet_key mismatch: stored=${stored_packet_key}, retrieved=${retrieved_packet_key}`,
    };
  }

  return { is_valid: true };
}

/**
 * Reconstruct packet_key from canonical fields.
 *
 * Use this when verifying identity lineage across layers:
 *   1. Fetch (source_ref, tree_node_id, title_id) from Postgres
 *   2. Recompute packet_key with this function
 *   3. Verify matches Qdrant payload.packet_key, Redis key, RPC response.packet_key
 */
export function reconstructPacketKey(
  packet: {
    source_ref: string;
    tree_node_id?: string | null;
    title_id?: string | null;
  }
): string {
  return computePacketKey(packet.source_ref, packet.tree_node_id, packet.title_id);
}

/**
 * Proof-matrix validation: single packet through all 5 storage layers.
 *
 * Returns false if packet_key mutates at any layer.
 */
export function validatePacketKeyLineageChain(
  postgres_packet_key: string,
  qdrant_payload_packet_key: string,
  redis_key_as_packet_key: string,
  hyperrag_rpc_packet_key: string,
  ace_context_packet_key: string
): { is_valid: boolean; layer_failures: Array<{ layer: string; stored: string; retrieved: string }> } {
  const layers = [
    { name: 'postgres_to_qdrant', stored: postgres_packet_key, retrieved: qdrant_payload_packet_key },
    { name: 'qdrant_to_redis', stored: qdrant_payload_packet_key, retrieved: redis_key_as_packet_key },
    { name: 'redis_to_rpc', stored: redis_key_as_packet_key, retrieved: hyperrag_rpc_packet_key },
    { name: 'rpc_to_ace', stored: hyperrag_rpc_packet_key, retrieved: ace_context_packet_key },
  ];

  const failures = layers.filter((l) => l.stored !== l.retrieved);

  return {
    is_valid: failures.length === 0,
    layer_failures: failures.map((f) => ({
      layer: f.name,
      stored: f.stored,
      retrieved: f.retrieved,
    })),
  };
}
