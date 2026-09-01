/**
 * HYDRATION-ADAPTER-01 -- batched Postgres content hydration for
 * ProjectionCandidateV1 results from codebase_chunks_768_v2.
 *
 * Separates "which points did ANN return" (Qdrant, cheap, lean payload)
 * from "what canonical content do they carry" (Postgres, authoritative,
 * one relational read for the whole batch -- never N queries for N hits).
 * See docs/reports/qdrant-d-hydration-01-results.json for the proof this
 * join is exact for the sampled population (7,773/7,773, zero content_hash
 * mismatches, zero missing rows).
 *
 * Uses the app's normal Drizzle path (not the raw pg.Pool convention used
 * by the standalone scripts/atlas/*.mjs audit scripts) -- this is
 * production application code, not a read-only forensic script.
 *
 * Fails closed: a candidate whose content_hash disagrees with Postgres's
 * current content_hash for the same postgres_id is NOT silently accepted
 * as "close enough" -- it is dropped with a typed reason, matching
 * QDRANT-D-HYDRATION-01's fail-closed policy on mismatched content_hash.
 */
import { inArray } from 'drizzle-orm';
import { db } from '$lib/server/db/client.js';
import { codebaseChunkIndex } from '$lib/server/db/schema-postgres.js';
import type { ProjectionCandidateV1 } from './projection-candidate-v1.js';

export interface HydratedCandidateV1 {
  projectionCandidate: ProjectionCandidateV1;
  content: string;
  packetKey: null;
  canonicalId: string;
  chunkId: string | null;
  sourceRef: string;
  contentHash: string | null;
}

export type HydrationFailureReason =
  | 'IDENTITY_MISSING'
  | 'CANONICAL_ROW_NOT_FOUND'
  | 'CONTENT_HASH_MISMATCH';

export interface HydrationFailureV1 {
  physicalPointId: string;
  postgresId: string | null;
  reason: HydrationFailureReason;
}

export interface HydrateCanonicalCandidatesResultV1 {
  hydrated: HydratedCandidateV1[];
  failures: HydrationFailureV1[];
}

/**
 * Batch-hydrates canonical content for a set of ProjectionCandidateV1
 * results, preserving the original Qdrant rank order in the output.
 *
 * Exactly ONE Drizzle query for the whole batch (WHERE id IN (...)),
 * regardless of candidate count -- never N queries for N ANN hits.
 */
export async function hydrateCanonicalCandidates(
  candidates: readonly ProjectionCandidateV1[],
): Promise<HydrateCanonicalCandidatesResultV1> {
  const failures: HydrationFailureV1[] = [];
  const hydratable = candidates.filter((c) => {
    if (c.identityMissing || !c.postgresId) {
      failures.push({ physicalPointId: c.physicalPointId, postgresId: c.postgresId, reason: 'IDENTITY_MISSING' });
      return false;
    }
    return true;
  });

  if (hydratable.length === 0) {
    return { hydrated: [], failures };
  }

  interface HydrationRow {
    id: string;
    chunkId: string | null;
    relativePath: string;
    content: string | null;
    contentHash: string | null;
  }

  const ids = hydratable.map((c) => c.postgresId as string);
  const rows = (await db
    .select({
      id: codebaseChunkIndex.id,
      chunkId: codebaseChunkIndex.chunkId,
      relativePath: codebaseChunkIndex.relativePath,
      content: codebaseChunkIndex.content,
      contentHash: codebaseChunkIndex.contentHash,
    })
    .from(codebaseChunkIndex)
    .where(inArray(codebaseChunkIndex.id, ids))) as HydrationRow[];

  const rowsById = new Map(rows.map((row) => [row.id, row]));

  const hydrated: HydratedCandidateV1[] = [];
  for (const candidate of hydratable) {
    const row = rowsById.get(candidate.postgresId as string);
    if (!row) {
      failures.push({ physicalPointId: candidate.physicalPointId, postgresId: candidate.postgresId, reason: 'CANONICAL_ROW_NOT_FOUND' });
      continue;
    }
    // Fail closed: if BOTH sides carry a content_hash and they disagree,
    // do not silently hydrate -- the projection is stale relative to the
    // current canonical row.
    if (candidate.contentHash && row.contentHash && candidate.contentHash !== row.contentHash) {
      failures.push({ physicalPointId: candidate.physicalPointId, postgresId: candidate.postgresId, reason: 'CONTENT_HASH_MISMATCH' });
      continue;
    }

    hydrated.push({
      projectionCandidate: candidate,
      content: row.content ?? '',
      packetKey: null,
      canonicalId: row.id,
      chunkId: row.chunkId,
      sourceRef: row.relativePath,
      contentHash: row.contentHash,
    });
  }

  // Preserve original Qdrant rank order (Map lookup above doesn't guarantee it).
  const orderIndex = new Map(candidates.map((c, i) => [c.physicalPointId, i]));
  hydrated.sort((a, b) => (orderIndex.get(a.projectionCandidate.physicalPointId) ?? 0) - (orderIndex.get(b.projectionCandidate.physicalPointId) ?? 0));

  return { hydrated, failures };
}
