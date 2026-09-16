/**
 * packet-bitmap-prefilter.ts — Stage 1 of atlas.packet_dense_search
 * (openspec/changes/parent-atlas-packet-dense-bitmap-search/).
 *
 * Narrows atlas_packets to a bounded candidate packet_key set using the table's existing
 * GIN/btree indexes (feature_id, source_ref, tags, concept_ids, domain_class,
 * workspace_revision) so Postgres plans a BitmapAnd/BitmapOr scan instead of a seq scan. This
 * module only builds/executes the prefilter query — it does not touch Qdrant.
 *
 * Requires at least one selective filter (feature_id / source_ref / concept_id / tags).
 * domain_class or workspace_revision alone is rejected — those columns are not selective enough
 * on their own and would defeat the point of a bounded prefilter.
 */

export interface PacketBitmapPrefilterFilters {
  featureId?: string;
  sourceRef?: string;
  conceptId?: string;
  tags?: string[];
  domainClass?: string;
  workspaceRevision?: string;
}

export interface PacketBitmapPrefilterQuery {
  sql: string;
  params: unknown[];
}

export class PacketBitmapPrefilterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PacketBitmapPrefilterValidationError';
  }
}

const DEFAULT_CANDIDATE_CAP = 500;

function hasSelectiveFilter(filters: PacketBitmapPrefilterFilters): boolean {
  return Boolean(
    filters.featureId || filters.sourceRef || filters.conceptId || (filters.tags && filters.tags.length > 0)
  );
}

/**
 * Builds the parametrized Stage 1 SQL + params. Pure function — no DB access — so it can be
 * unit-tested without a live Postgres connection. Requests one extra row beyond the cap
 * (`cap + 1`) so the caller can detect truncation without a separate COUNT(*) query.
 */
export function buildPacketBitmapPrefilterQuery(
  filters: PacketBitmapPrefilterFilters,
  cap: number = DEFAULT_CANDIDATE_CAP
): PacketBitmapPrefilterQuery {
  if (!hasSelectiveFilter(filters)) {
    throw new PacketBitmapPrefilterValidationError(
      'atlas.packet_dense_search requires at least one of feature_id, source_ref, concept_id, or tags. ' +
        'domain_class/workspace_revision alone are not selective enough for a bounded prefilter.'
    );
  }
  if (!Number.isInteger(cap) || cap < 1) {
    throw new PacketBitmapPrefilterValidationError('candidateCap must be a positive integer.');
  }

  const conditions: string[] = [];
  const params: unknown[] = [];
  let p = 1;

  if (filters.featureId) {
    conditions.push(`feature_id = $${p}`);
    params.push(filters.featureId);
    p++;
  }
  if (filters.sourceRef) {
    conditions.push(`source_ref = $${p}`);
    params.push(filters.sourceRef);
    p++;
  }
  if (filters.conceptId) {
    conditions.push(`$${p} = ANY(concept_ids)`);
    params.push(filters.conceptId);
    p++;
  }
  if (filters.tags && filters.tags.length > 0) {
    conditions.push(`tags && $${p}::text[]`);
    params.push(filters.tags);
    p++;
  }
  if (filters.domainClass) {
    conditions.push(`domain_class = $${p}`);
    params.push(filters.domainClass);
    p++;
  }
  if (filters.workspaceRevision) {
    conditions.push(`workspace_revision = $${p}`);
    params.push(filters.workspaceRevision);
    p++;
  }

  const where = conditions.join(' AND ');
  // source_ref is selected alongside packet_key because Stage 2 (Qdrant) filters on source_ref,
  // not packet_key — source_ref is indexed and 100%-populated on both codebase_chunks_768 and
  // _768_v2; packet_key is unindexed on _768 (though present) and only ~12% populated on _768_v2
  // (see packet-dense-rerank.ts's header comment for the full live-verified finding, corrected
  // twice 2026-09-16). packet_key remains the
  // Stage 3 join-back key (never source_ref alone, since one source_ref can back multiple
  // packets — different symbols in the same file).
  const sql = `
    SELECT packet_key, source_ref, source_revision, workspace_revision,
           representation_revision, source_representation_id AS representation_id,
           title_id, feature_id, content_hash
    FROM atlas_packets
    WHERE ${where} AND packet_key IS NOT NULL AND source_ref IS NOT NULL
    LIMIT $${p}
  `;
  params.push(cap + 1);

  return { sql, params };
}

export interface PacketBitmapPrefilterCandidate {
  packetKey: string;
  sourceRef: string;
  sourceRevision?: string | null;
  workspaceRevision?: string | number | null;
  representationRevision?: string | number | null;
  representationId?: string | null;
  contentHash?: string | null;
}

export interface PacketBitmapPrefilterResult {
  candidates: PacketBitmapPrefilterCandidate[];
  candidateSetTruncated: boolean;
}

/** Minimal shape this module needs from a pg client/pool — kept narrow for testability. */
export interface PgQueryable {
  query<T = { packet_key: string; source_ref: string }>(
    sql: string,
    params: unknown[]
  ): Promise<{ rows: T[] }>;
}

export async function runPacketBitmapPrefilter(
  db: PgQueryable,
  filters: PacketBitmapPrefilterFilters,
  cap: number = DEFAULT_CANDIDATE_CAP
): Promise<PacketBitmapPrefilterResult> {
  const { sql, params } = buildPacketBitmapPrefilterQuery(filters, cap);
  const result = await db.query<{
    packet_key: string; source_ref: string; source_revision?: string | null;
    workspace_revision?: string | number | null; representation_revision?: string | number | null;
    representation_id?: string | null; content_hash?: string | null;
  }>(sql, params);
  const candidateSetTruncated = result.rows.length > cap;
  const rows = candidateSetTruncated ? result.rows.slice(0, cap) : result.rows;
  return {
    candidates: rows.map((r) => ({
      packetKey: r.packet_key,
      sourceRef: r.source_ref,
      sourceRevision: r.source_revision ?? null,
      workspaceRevision: r.workspace_revision ?? null,
      representationRevision: r.representation_revision ?? null,
      representationId: r.representation_id ?? null,
      contentHash: r.content_hash ?? null,
    })),
    candidateSetTruncated,
  };
}

export { DEFAULT_CANDIDATE_CAP };
