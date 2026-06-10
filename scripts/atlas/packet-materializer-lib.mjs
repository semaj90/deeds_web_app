#!/usr/bin/env node
/**
 * packet-materializer-lib.mjs
 *
 * Shared utilities for NES/CHR packet materialization.
 * Ensures consistent packet_key generation across all Atlas scripts.
 *
 * Deterministic packet identity:
 *   packet_key = nes:<slug(feature_id OR source_ref)>:<sha8(source_ref)>
 *
 * This key is:
 * - Deterministic (same inputs → same key)
 * - Globally unique (via sha8 hash of source_ref)
 * - Human-readable (slug prefix for debugging)
 *
 * Used by:
 *   - materialize-nes-packets.mjs (creates initial packets)
 *   - gemma4-batch-summarize-qdrant.mjs (enriches with summaries)
 *   - sync-atlas-feature-map-from-qdrant.mjs (links via packet_id)
 */

import crypto from 'node:crypto';

export function sha8(s) {
  return crypto.createHash('sha256').update(String(s)).digest('hex').slice(0, 8);
}

export function slug(s) {
  return String(s ?? '')
    .toLowerCase()
    .replace(/\\/g, '/')
    .replace(/[^a-z0-9:/_-]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^[_/]+|[_/]+$/g, '')
    .slice(0, 80) || 'unknown';
}

/**
 * Deterministic packet key generation.
 * @param {string} sourceRef - File path or code reference
 * @param {string} featureId - Feature identifier (optional)
 * @returns {string} packet_key ready for nes_chrom_packets table
 */
export function buildPacketKey(sourceRef, featureId) {
  return `nes:${slug(featureId ?? sourceRef)}:${sha8(sourceRef)}`;
}

/**
 * Build packet payload for Qdrant + Postgres storage.
 * Compact representation that fits Gemma4 context budget.
 * @param {object} row - atlas_feature_map row
 * @returns {object} JSONB payload for nes_chrom_packets
 */
export function buildPacketPayload(row) {
  return {
    source_ref:      row.source_ref,
    feature_id:      row.feature_id,
    cluster_id:      row.cluster_id,
    centroid_id:     row.centroid_id,
    som_cluster:     row.som_cluster,
    lane_ids:        row.lane_ids ?? [],
    qdrant_point_id: row.qdrant_point_id,
    tags:            row.tags ?? [],
    kind:            row.kind ?? 'code_chunk',
    indexed_at:      row.indexed_at,
    packet_key:      buildPacketKey(row.source_ref, row.feature_id),
  };
}

/**
 * Verify packet identity chain consistency.
 * Called after materializer, before summarizer.
 * @param {object} packet - From nes_chrom_packets
 * @throws {Error} if packet_key was mis-generated
 */
export function validatePacketKey(packet) {
  const expected = buildPacketKey(packet.source_ref, packet.feature_id);
  if (packet.packet_key !== expected) {
    throw new Error(
      `Packet key mismatch: expected ${expected}, got ${packet.packet_key} ` +
      `(source_ref=${packet.source_ref}, feature_id=${packet.feature_id})`
    );
  }
}

/**
 * Verify atlas_feature_map ↔ nes_chrom_packets identity chain.
 * Called after all scripts to audit alignment.
 * @param {object} atlasRow - From atlas_feature_map
 * @param {object} packet - From nes_chrom_packets
 * @throws {Error} if identity chain is broken
 */
export function validateIdentityChain(atlasRow, packet) {
  if (atlasRow.source_ref !== packet.source_ref) {
    throw new Error(
      `source_ref mismatch: atlas=${atlasRow.source_ref} vs packet=${packet.source_ref}`
    );
  }
  if (atlasRow.feature_id !== packet.feature_id) {
    throw new Error(
      `feature_id mismatch: atlas=${atlasRow.feature_id} vs packet=${packet.feature_id}`
    );
  }
  if (atlasRow.packet_id !== packet.packet_key) {
    throw new Error(
      `packet_id/packet_key mismatch: atlas=${atlasRow.packet_id} vs packet=${packet.packet_key}`
    );
  }
  validatePacketKey(packet);
}
