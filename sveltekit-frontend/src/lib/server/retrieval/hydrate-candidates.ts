/**
 * Stage 3: Candidate Hydration into Feature Envelopes
 *
 * Converts fused candidates into complete FeatureEnvelope objects.
 * Happens exactly once per candidate (not repeated).
 *
 * Joins codebase_chunk_index (real chunks with embeddings) with atlas_packets (canonical identity)
 * to construct complete packet structures for downstream reranking and synthesis.
 */

import { db } from '$lib/server/db/client.js';
import { sql } from 'drizzle-orm';
import { z } from 'zod';
import { FeatureEnvelopeSchema, type FeatureEnvelope } from './feature-envelope.js';
import type { FusedCandidate } from './fuse-candidates.js';
import { generateTitleIdentity } from '../ace/title-id-generator.js';

function asFiniteNumber(value: unknown, fallback = 0): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

interface RowLike {
  id: string;
  page_rank_score: number | null;
  metadata: Record<string, unknown> | null;
  output_meta: Record<string, unknown> | null;
}

function pickString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function pickNumber(...values: unknown[]): number | null {
  for (const value of values) {
    const parsed = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function extractRowIdentity(row: RowLike): {
  workspaceId: string | null;
  workspaceRevision: string | null;
  sourceRevision: string | null;
  representationId: string | null;
  representationRevision: number | null;
  symbolVersionId: string | null;
  stableSymbolId: string | null;
  treeNodeId: string | null;
  pageRankScore: number | null;
} {
  const metadata = row.metadata ?? {};
  const outputMeta = row.output_meta ?? {};
  return {
    workspaceId: pickString(metadata.workspace_id, metadata.workspaceId, outputMeta.workspace_id, outputMeta.workspaceId),
    workspaceRevision: pickString(
      metadata.workspace_revision,
      metadata.workspaceRevision,
      outputMeta.workspace_revision,
      outputMeta.workspaceRevision,
    ),
    sourceRevision: pickString(
      metadata.source_revision,
      metadata.sourceRevision,
      metadata.source_revision_id,
      metadata.sourceRevisionId,
      outputMeta.source_revision,
      outputMeta.sourceRevision,
      outputMeta.source_revision_id,
      outputMeta.sourceRevisionId,
    ),
    representationId: pickString(
      metadata.representation_id,
      metadata.representationId,
      outputMeta.representation_id,
      outputMeta.representationId,
    ),
    representationRevision: pickNumber(
      metadata.representation_revision,
      metadata.representationRevision,
      outputMeta.representation_revision,
      outputMeta.representationRevision,
    ),
    symbolVersionId: pickString(
      metadata.symbol_version_id,
      metadata.symbolVersionId,
      metadata.packet_key,
      outputMeta.symbol_version_id,
      outputMeta.symbolVersionId,
      outputMeta.packet_key,
      row.id,
    ),
    stableSymbolId: pickString(
      metadata.stable_symbol_id,
      metadata.stableSymbolId,
      outputMeta.stable_symbol_id,
      outputMeta.stableSymbolId,
    ),
    treeNodeId: pickString(
      metadata.tree_node_id,
      metadata.treeNodeId,
      outputMeta.tree_node_id,
      outputMeta.treeNodeId,
    ),
    pageRankScore: pickNumber(
      row.page_rank_score,
      metadata.page_rank_score,
      metadata.pageRankScore,
      outputMeta.page_rank_score,
      outputMeta.pageRankScore,
    ),
  };
}

export interface HydrationProofContext {
  workspaceId?: string | null;
  workspaceRevision?: string | null;
  sourceRevision?: string | null;
  representationId?: string | null;
  representationRevision?: number | null;
}

export interface HydrationProofSummary {
  canonicalJoinedCount: number;
  canonicalJoinMissingCount: number;
  workspaceRejectedCount: number;
  workspaceRevisionRejectedCount: number;
  sourceRevisionRejectedCount: number;
  representationRejectedCount: number;
  representationRevisionRejectedCount: number;
  graphScoreAttachedCount: number;
  graphScoreMissingCount: number;
  summaryResolvedCount: number;
  summaryStaleRejectedCount: number;
  validationReasons: Record<string, number>;
}

export interface HydratedCandidatesWithProof {
  envelopes: FeatureEnvelope[];
  proof: HydrationProofSummary;
}

function buildDenseSignal(candidate: FusedCandidate, qdrantPointId: string | null) {
  if (candidate.embeddingLane !== 'dense_768') {
    return undefined;
  }

  const score = asFiniteNumber(candidate.score);

  return {
    name: 'dense' as const,
    score,
    qdrant_point_id: qdrantPointId ?? candidate.packetKey,
    embedding_lane: candidate.embeddingLane,
    embedding_status: 'ACTIVE' as const,
    embedding_native_dimension: 768,
    projection_source_dimension: undefined,
    projection_method: 'none' as const,
    projection_version: 'embeddinggemma-768-native-v1',
    metric: 'cosine' as const,
    confidence: score,
  };
}

/**
 * Hydrate fused candidates into complete feature envelopes
 * Fetches all required fields from Postgres in bulk
 * Joins codebase_chunk_index with atlas_packets for complete packet identity
 */
export async function hydrateCandidates(
  candidates: FusedCandidate[],
): Promise<FeatureEnvelope[]> {
  const result = await hydrateCandidatesWithProof(candidates);
  return result.envelopes;
}

export async function hydrateCandidatesWithProof(
  candidates: FusedCandidate[],
  expected?: HydrationProofContext,
): Promise<HydratedCandidatesWithProof> {
  if (candidates.length === 0) {
    return {
      envelopes: [],
      proof: {
        canonicalJoinedCount: 0,
        canonicalJoinMissingCount: 0,
        workspaceRejectedCount: 0,
        workspaceRevisionRejectedCount: 0,
        sourceRevisionRejectedCount: 0,
        representationRejectedCount: 0,
        representationRevisionRejectedCount: 0,
        graphScoreAttachedCount: 0,
        graphScoreMissingCount: 0,
        summaryResolvedCount: 0,
        summaryStaleRejectedCount: 0,
        validationReasons: {},
      },
    };
  }

  try {
    // Extract unique lookups from candidates
    const sourceRefs = [...new Set(candidates.map(c => c.sourceRef).filter(Boolean))];
    const packetKeys = [...new Set(candidates.map(c => c.packetKey).filter(Boolean))];
    const candidateIds = [...new Set([
      ...packetKeys,
      ...candidates.map(c => c.symbolVersionId).filter((v): v is string => Boolean(v)),
    ])];

    const CHUNK_COLUMNS = sql`
        chunk.id,
        chunk.qdrant_id,
        chunk.relative_path,
        chunk.source_ref,
        chunk.symbol,
        chunk.summary,
        chunk.content,
        chunk.semantic_tags,
        chunk.metadata,
        chunk.domain,
        chunk.som_cluster,
        chunk.page_rank_score,
        chunk.community_id,
        chunk.content_hash,
        chunk.updated_at,
        chunk.language,
        chunk.kind,
        chunk.output_meta
    `;

    // Query 1 — exact identity match (id or metadata packet_key). Bounded by
    // the count of distinct requested identities; each id is a primary key,
    // so this cannot be starved by duplicate rows the way a source_ref match can.
    const candidateIdList = sql.join(candidateIds.map((value) => sql`${value}`), sql`, `);
    const exactResult = candidateIds.length > 0
      ? await db.execute(sql`
          SELECT ${CHUNK_COLUMNS}
          FROM codebase_chunk_index chunk
          WHERE chunk.id::text IN (${candidateIdList})
             OR (chunk.metadata->>'packet_key') IN (${candidateIdList})
             OR (chunk.output_meta->>'packet_key') IN (${candidateIdList})
          LIMIT ${candidateIds.length + 10}
        `)
      : { rows: [] as unknown[] };

    // Query 2 — source_ref fallback for candidates the exact query didn't
    // resolve. `codebase_chunk_index` can carry hundreds of duplicate rows
    // per source_ref (repeated re-indexing without cleanup — e.g.
    // schema-postgres.ts has 369). Without DISTINCT ON + ORDER BY, an
    // unbounded LIMIT can silently drop the row a candidate actually needs
    // whenever duplicates from OTHER candidates in the same batch consume
    // the limit budget first. DISTINCT ON deterministically picks the most
    // recently updated row per source_ref and returns exactly one row per
    // distinct source_ref — never starved by duplicates.
    const sourceRefList = sql.join(sourceRefs.map((value) => sql`${value}`), sql`, `);
    const fallbackResult = sourceRefs.length > 0
      ? await db.execute(sql`
          SELECT DISTINCT ON (chunk.source_ref) ${CHUNK_COLUMNS}
          FROM codebase_chunk_index chunk
          WHERE chunk.source_ref IN (${sourceRefList})
          ORDER BY chunk.source_ref, chunk.updated_at DESC
        `)
      : { rows: [] as unknown[] };

    const seenRowIds = new Set<string>();
    const mergedRows: unknown[] = [];
    for (const row of [...exactResult.rows, ...fallbackResult.rows]) {
      const id = (row as { id: string }).id;
      if (seenRowIds.has(id)) continue;
      seenRowIds.add(id);
      mergedRows.push(row);
    }
    const result = { rows: mergedRows };

    type ChunkRow = {
      id: string;
      qdrant_id: string | null;
      relative_path: string;
      source_ref: string | null;
      symbol: string | null;
      summary: string | null;
      content: string | null;
      semantic_tags: string[] | null;
      metadata: Record<string, unknown> | null;
      domain: string | null;
      som_cluster: number | null;
      page_rank_score: number | null;
      community_id: number | null;
      content_hash: string | null;
      updated_at: Date;
      language: string | null;
      kind: string | null;
      output_meta: Record<string, unknown> | null;
    };

    const rows = result.rows as ChunkRow[];
    const rowsByKey = new Map<string, ChunkRow>();
    for (const row of rows) {
      const keys = [
        row.source_ref || row.relative_path || row.id,
        (row.metadata?.packet_key as string | undefined) || row.id,
        (row.output_meta?.packet_key as string | undefined) || null,
        row.qdrant_id || null,
      ].filter((value): value is string => Boolean(value));

      for (const key of keys) {
        if (!rowsByKey.has(key)) {
          rowsByKey.set(key, row);
        }
      }
    }

    const proof: HydrationProofSummary = {
      canonicalJoinedCount: 0,
      canonicalJoinMissingCount: 0,
      workspaceRejectedCount: 0,
      workspaceRevisionRejectedCount: 0,
      sourceRevisionRejectedCount: 0,
      representationRejectedCount: 0,
      representationRevisionRejectedCount: 0,
      graphScoreAttachedCount: 0,
      graphScoreMissingCount: 0,
      summaryResolvedCount: 0,
      summaryStaleRejectedCount: 0,
      validationReasons: {},
    };

    const bumpReason = (reason: string) => {
      proof.validationReasons[reason] = (proof.validationReasons[reason] ?? 0) + 1;
    };

    // Map candidates to envelopes, preserving order
    const envelopes: FeatureEnvelope[] = [];
    for (const candidate of candidates) {
      const candidateKey = candidate.symbolVersionId || candidate.packetKey;
      const row = rowsByKey.get(candidate.sourceRef) || rowsByKey.get(candidateKey) || rowsByKey.get(candidate.packetKey);
      if (!row) {
        proof.canonicalJoinMissingCount += 1;
        bumpReason('canonical_join_missing');
        // DIAGNOSTIC (session 188D): record exactly which candidate/predicate failed
        console.warn('[hydrate:canonical_join_missing]', {
          sourceRef: candidate.sourceRef,
          packetKey: candidate.packetKey,
          symbolVersionId: candidate.symbolVersionId,
          candidateKey,
          scoreSource: candidate.scoreSource,
          rowsByKeyHasSourceRef: rowsByKey.has(candidate.sourceRef),
          rowsByKeyHasCandidateKey: rowsByKey.has(candidateKey),
          rowsByKeyHasPacketKey: rowsByKey.has(candidate.packetKey),
          totalRowsFetched: rows.length,
        });
        continue;
      }

      const rowIdentity = extractRowIdentity(row);

      if (expected?.workspaceId && rowIdentity.workspaceId && rowIdentity.workspaceId !== expected.workspaceId) {
        proof.workspaceRejectedCount += 1;
        bumpReason('workspace_mismatch');
        continue;
      }
      if (expected?.workspaceRevision && rowIdentity.workspaceRevision && rowIdentity.workspaceRevision !== expected.workspaceRevision) {
        proof.workspaceRevisionRejectedCount += 1;
        bumpReason('workspace_revision_stale');
        continue;
      }
      if (expected?.sourceRevision && rowIdentity.sourceRevision && rowIdentity.sourceRevision !== expected.sourceRevision) {
        proof.sourceRevisionRejectedCount += 1;
        bumpReason('source_revision_stale');
        continue;
      }
      if (expected?.representationId && rowIdentity.representationId && rowIdentity.representationId !== expected.representationId) {
        proof.representationRejectedCount += 1;
        bumpReason('representation_mismatch');
        continue;
      }
      if (expected?.representationRevision !== undefined && expected.representationRevision !== null) {
        if (rowIdentity.representationRevision !== null && rowIdentity.representationRevision !== expected.representationRevision) {
          proof.representationRevisionRejectedCount += 1;
          bumpReason('representation_revision_stale');
          continue;
        }
      }

      try {
        const envelope = buildFeatureEnvelope({
          candidate,
          row,
          rowIdentity,
        });

        // Validate envelope shape
        FeatureEnvelopeSchema.parse(envelope);
        envelopes.push(envelope);
        proof.canonicalJoinedCount += 1;
        if (rowIdentity.pageRankScore !== null) {
          proof.graphScoreAttachedCount += 1;
        } else {
          proof.graphScoreMissingCount += 1;
        }
        if (row.summary && row.summary.trim()) {
          proof.summaryResolvedCount += 1;
        } else if (candidate.scoreSource === 'rg_keyword' || candidate.scoreSource === 'postgres_trigram') {
          proof.summaryStaleRejectedCount += 1;
        }
      } catch (buildError) {
        console.warn(`Failed to build envelope for candidate ${candidate.packetKey}:`, buildError);
        bumpReason('envelope_build_failed');
        continue;
      }
    }

    return { envelopes, proof };
  } catch (error) {
    console.error('Hydration failed:', error);
    throw error;
  }
}

/**
 * Build a single FeatureEnvelope from candidate + database row
 */
function buildFeatureEnvelope(input: {
  candidate: FusedCandidate;
  row: {
    id: string;
    qdrant_id: string | null;
    relative_path: string;
    source_ref: string | null;
    symbol: string | null;
    summary: string | null;
    content: string | null;
    semantic_tags: string[] | null;
    metadata: Record<string, unknown> | null;
    domain: string | null;
    som_cluster: number | null;
    page_rank_score: number | null;
    community_id: number | null;
    content_hash: string | null;
    updated_at: Date;
    language: string | null;
    kind: string | null;
  };
  rowIdentity: {
    workspaceId: string | null;
    workspaceRevision: string | null;
    sourceRevision: string | null;
    representationId: string | null;
    representationRevision: number | null;
    symbolVersionId: string | null;
    stableSymbolId: string | null;
    treeNodeId: string | null;
    pageRankScore: number | null;
  };
}): FeatureEnvelope {
  const { candidate, row, rowIdentity } = input;
  const dense = buildDenseSignal(candidate, row.qdrant_id);
  const normalizedDomainClass = normalizeDomainClass(row.domain);
  const retrievalScore = asFiniteNumber(candidate.score);
  const fusionScore = asFiniteNumber(candidate.fusionScore);
  const fusionRank = asFiniteNumber(candidate.rankBefore, 1);

  return {
    // Canonical identity (source_ref is the primary key from retrieval)
    chunk_id: row.id,
    packet_key: (row.metadata?.packet_key as string) || candidate.packetKey || row.id,
    symbol_version_id: rowIdentity.symbolVersionId || candidate.symbolVersionId || candidate.packetKey || row.id,
    source_ref: row.source_ref || row.relative_path,
    content_hash: row.content_hash || '',
    workspace_revision: rowIdentity.workspaceRevision || candidate.workspaceRevision || null,
    source_revision: rowIdentity.sourceRevision || candidate.sourceRevision || null,
    representation_id: rowIdentity.representationId || candidate.representationId || null,
    representation_revision: rowIdentity.representationRevision ?? candidate.representationRevision ?? null,
    stable_symbol_id: rowIdentity.stableSymbolId || candidate.stableSymbolId || null,
    title_id: generateTitleIdentity((row.metadata?.packet_key as string) || candidate.packetKey || row.id, {
      featureLabel: String((row.metadata?.feature_label ?? row.metadata?.feature_id ?? row.symbol ?? row.kind ?? 'packet')),
      symbolName: row.symbol || undefined,
      symbolKind: row.kind || undefined,
      domain: row.domain || undefined,
      summary: row.summary || undefined,
      sourceFilename: row.relative_path || row.source_ref || undefined,
    }).titleId,

    // Retrieved content
    summary: row.summary || '',
    keywords: row.semantic_tags || [],

    // AST/structural (semantic_tags are the structural identifiers in this schema)
    tree_node_ids: row.semantic_tags || [],

    // Vector identity (qdrant_id is the embedding reference)
    qdrant_point_id: row.qdrant_id || null,
    dense,

    // Domain classification
    domain: row.domain || null,

    // Topology
    som_cluster: row.som_cluster || null,
    page_rank_score: rowIdentity.pageRankScore ?? row.page_rank_score ?? null,
    community_id: row.community_id ? String(row.community_id) : null,

    // Retrieval metadata
    retrieval_score: retrievalScore,
    retrieval_source: candidate.scoreSource,
    fusion_score: fusionScore,
    fusion_rank: fusionRank,

    // Validation
    gan_validated: false,

    // Timing
    created_at: new Date(row.updated_at as unknown as string | number | Date),
    updated_at: new Date(row.updated_at as unknown as string | number | Date).toISOString(),

    // Code structure
    symbol: row.symbol || undefined,
    language: row.language || undefined,
    kind: row.kind || undefined,

    // Forward all JSONB fields if present
    ...(row.metadata || {}),

    // Re-assert canonical normalized domain after metadata spread
    domain_class: normalizedDomainClass,
  };
}

function normalizeDomainClass(domain: string | null): FeatureEnvelope['domain_class'] {
  const value = (domain || '').trim().toLowerCase();
  if (!value) return 'general';
  if (value.includes('auth')) return 'auth';
  if (value.includes('ui') || value.includes('frontend') || value.includes('svelte')) return 'ui';
  if (value.includes('retriev')) return 'retrieval';
  if (value.includes('network') || value.includes('grpc') || value.includes('mcp')) return 'network';
  if (value.includes('db') || value.includes('sql') || value.includes('postgres') || value.includes('atlas_packets')) return 'database';
  if (value.includes('cache') || value.includes('redis') || value.includes('valkey')) return 'cache';
  if (value.includes('agent') || value.includes('acp') || value.includes('gsd')) return 'agent';
  if (value.includes('graph') || value.includes('neo4j') || value.includes('pagerank')) return 'graph';
  if (value.includes('ml') || value.includes('embed') || value.includes('rerank') || value.includes('qdrant')) return 'ml';
  return 'general';
}

/**
 * Hydrate a single candidate for testing or cache operations
 */
export async function hydrateSingleCandidate(
  candidate: FusedCandidate,
): Promise<FeatureEnvelope | null> {
  const envelopes = await hydrateCandidates([candidate]);
  return envelopes[0] ?? null;
}
