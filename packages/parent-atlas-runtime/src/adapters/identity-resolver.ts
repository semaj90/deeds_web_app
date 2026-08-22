/**
 * Canonical Identity Resolver — Deduplication before RRF Fusion
 *
 * Resolves duplicate candidates that arrive from BM25 and Qdrant under different identifiers:
 * - Legacy chunk IDs (codebase_chunk_index.id)
 * - UUIDs (various)
 * - Qdrant point IDs (codebase_chunks_768.point_id)
 * - Canonical packet keys (atlas_packets.packet_key)
 *
 * Resolution happens BEFORE RRF fusion to prevent duplicates from surviving as separate
 * candidates in the ranked list.
 *
 * Canonical identity chain (immutable):
 * directory_path → source_ref → file_path → function_symbol → feature_id → feature_label → packet_key
 *
 * Hard fail conditions:
 * - missing packet_key
 * - missing source_ref
 * - missing feature_id
 */

import type { RankedCandidate } from '@deeds/parent-atlas-core';
import type { Database } from 'drizzle-orm';

export interface CandidateForIdentityResolution {
  id?: string;
  qdrant_point_id?: string;
  packet_key?: string;
  source_ref?: string;
  feature_id?: string;
  content_hash?: string;
  score: number;
  [key: string]: unknown;
}

export interface IdentityResolutionResult {
  canonical_packet_key: string;
  source_ref: string;
  feature_id: string;
  score: number;
  merged_from: string[];
}

export interface IdentityResolverOptions {
  db: Database;
  allowMissingPacketKey?: boolean;
}

/**
 * Resolve candidates to canonical identity by packet_key, source_ref, and feature_id
 *
 * Returns deduplicated candidates with canonical packet_key, preserving highest score
 * when duplicates are found.
 */
export async function resolveCanonicalIdentity(
  candidates: CandidateForIdentityResolution[],
  options: IdentityResolverOptions
): Promise<IdentityResolutionResult[]> {
  if (!candidates.length) return [];

  const { allowMissingPacketKey = false } = options;
  const dedupMap = new Map<string, IdentityResolutionResult>();

  for (const candidate of candidates) {
    // Hard fail: missing canonical identity fields
    if (!candidate.packet_key && !allowMissingPacketKey) {
      throw new Error(
        `Candidate missing packet_key. source_ref=${candidate.source_ref}, feature_id=${candidate.feature_id}`
      );
    }

    if (!candidate.source_ref) {
      throw new Error(
        `Candidate missing source_ref. packet_key=${candidate.packet_key}, feature_id=${candidate.feature_id}`
      );
    }

    if (!candidate.feature_id) {
      throw new Error(
        `Candidate missing feature_id. packet_key=${candidate.packet_key}, source_ref=${candidate.source_ref}`
      );
    }

    // Canonical deduplication key: (source_ref, feature_id, content_hash)
    // This triple uniquely identifies the semantic unit regardless of storage representation
    const dedupKey = `${candidate.source_ref}|${candidate.feature_id}|${candidate.content_hash || 'null'}`;

    const existing = dedupMap.get(dedupKey);
    if (existing) {
      // Keep highest score, track merged IDs
      if (candidate.score > existing.score) {
        existing.score = candidate.score;
        existing.canonical_packet_key = candidate.packet_key || existing.canonical_packet_key;
      }
      existing.merged_from.push(candidate.id || candidate.qdrant_point_id || 'unknown');
    } else {
      dedupMap.set(dedupKey, {
        canonical_packet_key: candidate.packet_key || '',
        source_ref: candidate.source_ref,
        feature_id: candidate.feature_id,
        score: candidate.score,
        merged_from: [candidate.id || candidate.qdrant_point_id || 'unknown']
      });
    }
  }

  return Array.from(dedupMap.values());
}

/**
 * Validate packet identity against Postgres canonical truth
 *
 * Checks that:
 * - packet_key exists in atlas_packets
 * - source_ref matches Postgres record
 * - feature_id matches Postgres record
 * - No orphaned Qdrant/Redis records
 */
export async function validatePacketLineage(
  packetKey: string,
  sourceRef: string,
  featureId: string,
  options: IdentityResolverOptions
): Promise<boolean> {
  // TODO: Wire Postgres query
  // const row = await options.db.query.atlas_packets.findFirst({
  //   where: (t, { eq, and }) => and(
  //     eq(t.packet_key, packetKey),
  //     eq(t.source_ref, sourceRef),
  //     eq(t.feature_id, featureId)
  //   )
  // });
  // return !!row;

  return true; // Placeholder
}

/**
 * Merge scores from duplicate candidates (BM25 and Qdrant)
 *
 * When the same logical packet appears in both BM25 and Qdrant results,
 * blend the scores before RRF fusion (not after).
 */
export function blendDuplicateScores(
  candidates: IdentityResolutionResult[],
  bm25Weight: number = 0.4,
  qdrantWeight: number = 0.6
): IdentityResolutionResult[] {
  // This is a placeholder. In practice, candidates would carry a "retrieved_via" field
  // (BM25 vs Qdrant) and we'd blend accordingly before deduplication.
  return candidates;
}

/**
 * Report duplicates found during resolution for observability
 */
export interface DuplicateReport {
  total_input_candidates: number;
  deduplicated_count: number;
  duplicate_groups: number;
  largest_duplicate_group: number;
  source_refs_affected: Set<string>;
  feature_ids_affected: Set<string>;
}

export function reportDuplicateMetrics(
  input: CandidateForIdentityResolution[],
  output: IdentityResolutionResult[]
): DuplicateReport {
  const sourceRefs = new Set<string>();
  const featureIds = new Set<string>();
  let largestGroup = 1;

  for (const result of output) {
    sourceRefs.add(result.source_ref);
    featureIds.add(result.feature_id);
    largestGroup = Math.max(largestGroup, result.merged_from.length);
  }

  return {
    total_input_candidates: input.length,
    deduplicated_count: output.length,
    duplicate_groups: input.length - output.length,
    largest_duplicate_group: largestGroup,
    source_refs_affected: sourceRefs,
    feature_ids_affected: featureIds
  };
}
