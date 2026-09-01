/**
 * ProjectionRegistryV1 -- the reusable contract this repo was missing before
 * today: canonical packet identity + representation identity resolves to a
 * PROJECTION coordinate (a physical Qdrant point), never the other way
 * around. A packet does not "own" one eternal qdrant_point_id -- it has zero
 * or more projections, one per representation, each independently
 * resolvable and independently re-projectable on the next representation
 * migration (_768_v3, a future executor, TurboVec, etc.) without touching
 * canonical packet identity.
 *
 * physicalPointId is a PROJECTION COORDINATE, not packet identity. This
 * module derives/validates it against the live Qdrant collection -- it
 * never blindly copies atlas_packets.qdrant_point_id (the exact anti-pattern
 * this whole investigation chain found broken: 7,773 atlas_packets rows
 * pointing at a stale generation, self-declared payload IDs that didn't even
 * match their own point's real ID).
 *
 * Scope today: semantic_768 / qdrant / codebase_chunks_768_v2 only, per the
 * frozen QDRANT_SEMANTIC_READER_OWNERSHIP boundary (see
 * docs/reports/writer-root-01-representation-owner-01-results.json). TurboVec
 * and any other executor/representation are explicitly out of scope --
 * adding one is a new RepresentationIdentity + a new resolver branch, never
 * a change to this file's existing semantic_768 behavior.
 *
 * Read-only: this module never writes to Postgres or Qdrant.
 */
import { QDRANT_SEMANTIC_COLLECTION } from './qdrant-semantic-projection.js';

export type RepresentationIdentityV1 = 'semantic_768';

export interface ProjectionRegistryKeyV1 {
  /** The canonical packet's Postgres identity (codebase_chunk_index.id). */
  canonicalPacketIdentity: string;
  representationIdentity: RepresentationIdentityV1;
}

export interface ProjectionRefV1 {
  executor: 'qdrant';
  collection: string;
  vectorName: string;
  physicalPointId: string;
  projectionRevision: string | null;
  modelRevision: string | null;
  inputPolicyRevision: string | null;
}

export type ProjectionResolutionFailureReason =
  | 'UNSUPPORTED_REPRESENTATION'
  | 'PROJECTION_NOT_FOUND'
  | 'CANONICAL_IDENTITY_MISMATCH';

export interface ProjectionResolutionFailureV1 {
  key: ProjectionRegistryKeyV1;
  reason: ProjectionResolutionFailureReason;
}

export type ProjectionResolutionV1 =
  | { ok: true; ref: ProjectionRefV1 }
  | { ok: false; failure: ProjectionResolutionFailureV1 };

const QDRANT_URL = (process.env.QDRANT_URL ?? 'http://127.0.0.1:6333').replace(/^0\.0\.0\.0/, '127.0.0.1');

interface QdrantPointLike {
  id: string | number;
  payload?: Record<string, unknown> | null;
}

async function fetchPointsById(ids: string[]): Promise<Map<string, QdrantPointLike>> {
  const map = new Map<string, QdrantPointLike>();
  if (ids.length === 0) return map;
  const res = await fetch(`${QDRANT_URL}/collections/${QDRANT_SEMANTIC_COLLECTION}/points`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ids, with_payload: true, with_vector: false }),
  });
  if (!res.ok) throw new Error(`ProjectionRegistryV1: Qdrant points retrieve failed HTTP ${res.status}`);
  const data = (await res.json()) as { result?: QdrantPointLike[] };
  for (const point of data.result ?? []) map.set(String(point.id), point);
  return map;
}

/**
 * Batch-resolves ProjectionRegistryKeyV1 -> ProjectionRefV1, one Qdrant call
 * for the whole batch. For semantic_768/qdrant, the proven identity mapping
 * (see docs/reports/qdrant-d-hydration-01-results.json, QDRANT-D-IDENTITY-01:
 * 7,773/7,773 exact live) is physicalPointId === canonicalPacketIdentity --
 * but this function VALIDATES that against the live point (payload.postgres_id
 * must agree) rather than returning it unchecked, which is the whole point
 * of this contract existing instead of a bare string copy.
 */
export async function resolveProjectionsBatch(
  keys: readonly ProjectionRegistryKeyV1[],
): Promise<ProjectionResolutionV1[]> {
  const supported = keys.filter((k) => k.representationIdentity === 'semantic_768');
  const unsupported = keys.filter((k) => k.representationIdentity !== 'semantic_768');

  const points = await fetchPointsById(supported.map((k) => k.canonicalPacketIdentity));

  const results: ProjectionResolutionV1[] = [];
  for (const key of unsupported) {
    results.push({ ok: false, failure: { key, reason: 'UNSUPPORTED_REPRESENTATION' } });
  }
  for (const key of supported) {
    const point = points.get(key.canonicalPacketIdentity);
    if (!point) {
      results.push({ ok: false, failure: { key, reason: 'PROJECTION_NOT_FOUND' } });
      continue;
    }
    const payloadPostgresId = point.payload?.postgres_id;
    if (typeof payloadPostgresId === 'string' && payloadPostgresId !== key.canonicalPacketIdentity) {
      // The point exists at the expected coordinate but disagrees about which
      // canonical packet it represents -- fail closed, do not resolve.
      results.push({ ok: false, failure: { key, reason: 'CANONICAL_IDENTITY_MISMATCH' } });
      continue;
    }
    results.push({
      ok: true,
      ref: {
        executor: 'qdrant',
        collection: QDRANT_SEMANTIC_COLLECTION,
        vectorName: 'content',
        physicalPointId: String(point.id),
        projectionRevision: typeof point.payload?.projection_revision === 'string' ? point.payload.projection_revision : null,
        modelRevision: typeof point.payload?.model_revision === 'string' ? point.payload.model_revision : null,
        inputPolicyRevision: null,
      },
    });
  }
  return results;
}

export async function resolveProjection(key: ProjectionRegistryKeyV1): Promise<ProjectionResolutionV1> {
  const [result] = await resolveProjectionsBatch([key]);
  return result;
}
