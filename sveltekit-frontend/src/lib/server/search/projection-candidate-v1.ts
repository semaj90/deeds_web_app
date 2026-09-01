/**
 * ProjectionCandidateV1 -- the lean, Qdrant-native half of the retrieval
 * contract split proposed in QDRANT-D-HYDRATION-01.
 *
 * A Qdrant point in codebase_chunks_768_v2 (the code-declared canonical
 * semantic_768 projection) is deliberately a LEAN semantic projection: it
 * carries exact identity + representation lineage, never authoritative
 * source content. Qdrant's own storage model treats payload as arbitrary
 * attached JSON with no requirement to duplicate the full source document --
 * see docs/reports/qdrant-d-hydration-01-results.json for the read-only
 * proof that every sampled point's postgres_id joins EXACTLY and
 * unambiguously back to its canonical Postgres row (7,773/7,773,
 * status: HYDRATION_EXACT).
 *
 * mapQdrantProjectionCandidate() therefore does NOT fabricate content for a
 * lean projection. A candidate missing a resolvable canonical identity fails
 * closed to `identityMissing: true` rather than emitting a
 * content-less-but-shaped-like-a-result object -- this is the fix for the
 * regression QDRANT-READER-FIX-01's first attempt would have shipped
 * (mapQdrantPoint() silently returning content: '' for every _768_v2 hit).
 */

export interface ProjectionCandidateV1 {
  physicalPointId: string;
  postgresId: string | null;
  chunkId: string | null;
  sourceRef: string | null;
  contentHash: string | null;
  score: number;
  representationName: string | null;
  projectionRevision: string | null;
  /** true iff postgresId is absent or not a well-formed UUID -- hydration must not be attempted. */
  identityMissing: boolean;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Pure mapping from a raw Qdrant _768_v2 point into ProjectionCandidateV1.
 * No I/O, no Postgres access -- this is the "candidate retrieval" half of
 * the split; hydrateCanonicalCandidates() in hydrate-canonical-candidates.ts
 * is the separate "content hydration" half.
 */
export function mapQdrantProjectionCandidate(point: {
  id: string | number;
  score?: number | null;
  payload?: Record<string, unknown> | null;
}): ProjectionCandidateV1 {
  const p = point.payload ?? {};
  const postgresIdRaw = p.postgres_id;
  const postgresId = typeof postgresIdRaw === 'string' && UUID_RE.test(postgresIdRaw) ? postgresIdRaw : null;

  return {
    physicalPointId: String(point.id),
    postgresId,
    chunkId: typeof p.chunk_id === 'string' ? p.chunk_id : null,
    sourceRef: typeof p.source_ref === 'string' ? p.source_ref : null,
    contentHash: typeof p.content_hash === 'string' ? p.content_hash : null,
    score: Number(point.score ?? 0),
    representationName: typeof p.representation_name === 'string' ? p.representation_name : null,
    projectionRevision: typeof p.projection_revision === 'string' ? p.projection_revision : null,
    identityMissing: postgresId === null,
  };
}
