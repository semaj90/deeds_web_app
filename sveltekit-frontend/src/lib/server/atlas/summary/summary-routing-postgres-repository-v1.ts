import {
  compileSummaryRoutingPayloadV1,
  type SummaryRoutingPayloadV1,
} from './summary-routing-payload-v1.js';

/**
 * SUM-ROUTE-03: read-only, dependency-injected PostgreSQL repository for SummaryRoutingPayloadV1 inputs.
 * Reuses the canonical join owner (atlas_workspace_source_bindings -> atlas_packet_chunk_lineage[PROVEN] ->
 * codebase_chunk_index) and fails the WHOLE batch on any identity defect before a payload is compiled. atlas_summary_layers
 * is deliberately NOT joined (1:N, no revision): it is read separately as hint refs. No writes, no model, no queue.
 */
export interface SummaryRoutingQueryableV1 {
  query(sql: string, params: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface SummaryRoutingSourceRowV1 {
  chunk_row_id: string;
  canonical_chunk_id: string;
  chunk_id: string;
  packet_key: string;
  source_ref: string;
  source_revision: string;
  binding_source_revision: string;
  workspace_revision: string;
  binding_workspace_revision: string;
  binding_checksum: string;
  membership_status: string | null;
  revision_status: string;
  lineage_evidence_refs: unknown;
  summary_text: string | null;
  summary_provenance: unknown;
  legacy_summary: string | null;
  legacy_quarantined?: boolean;
  packet_summary: string | null;
  has_summary_embedding: boolean;
  has_summary_embedding_384: boolean;
  language: string | null;
  domain_class: string | null;
  community_id: number | null;
  cluster_id: number | null;
  som_cell_x: number | null;
  som_cell_y: number | null;
  pagerank: number | null;
  n_lineage: number;
}

export interface SummaryLayerHintV1 {
  layerRef: string;
  packetKey: string;
  digest: string | null;
  modelLabel: string | null;
  generatedAt: string | null;
  revisionQualified: false;
  authority: 'HINT';
}

export class SummaryRoutingRepositoryError extends Error {
  constructor(readonly code: string, detail?: string) { super(detail ? `${code}:${detail}` : code); }
}

export const SUMMARY_ROUTING_SOURCE_SQL = `
SELECT c.id::text AS chunk_row_id, l.canonical_chunk_id, c.chunk_id, l.packet_key, l.source_ref, l.source_revision,
  b.source_revision AS binding_source_revision, $2::text AS workspace_revision, b.workspace_revision AS binding_workspace_revision,
  b.binding_checksum, l.membership_status, l.revision_status, l.evidence_refs AS lineage_evidence_refs,
  c.summary_text, c.summary_provenance, nullif(btrim(c.summary), '') AS legacy_summary, (c.metadata ? 'phase8_5_quarantine') AS legacy_quarantined, nullif(btrim(ap.summary), '') AS packet_summary,
  (c.summary_embedding IS NOT NULL) AS has_summary_embedding, (c.summary_embedding_384 IS NOT NULL) AS has_summary_embedding_384,
  c.language, ap.domain_class, ap.community_id, coalesce(ap.cluster_id, ap.kmeans_cluster) AS cluster_id,
  ap.som_cell_x, ap.som_cell_y, coalesce(ap.pagerank_score, ap.pagerank) AS pagerank,
  count(*) OVER (PARTITION BY c.id)::int AS n_lineage
FROM public.atlas_workspace_source_bindings b
JOIN public.atlas_packet_chunk_lineage l ON l.source_ref = b.canonical_source_ref AND l.source_revision = b.source_revision AND l.revision_status = 'PROVEN'
JOIN public.codebase_chunk_index c ON c.id = l.chunk_row_id
LEFT JOIN public.atlas_packets ap ON ap.packet_key = l.packet_key
WHERE b.repo_id = $1 AND b.workspace_revision = $2 AND c.id = ANY($3::uuid[])
ORDER BY c.id, l.packet_key`;

export const SUMMARY_LAYER_HINTS_SQL = `
SELECT sl.packet_key, sl.ctid::text AS layer_ref, coalesce(nullif(sl.summary_text, ''), nullif(sl.summary, '')) AS text,
  sl.model_name, sl.generated_at::text AS generated_at
FROM public.atlas_summary_layers sl WHERE sl.packet_key = ANY($1::text[]) ORDER BY sl.packet_key, sl.generated_at NULLS LAST, sl.ctid`;

export interface SummaryRoutingRepositoryV1 {
  readByChunkRowIds(input: { repositoryId: string; workspaceRevision: string; chunkRowIds: string[] }): Promise<SummaryRoutingSourceRowV1[]>;
  readSummaryLayerHints(packetKeys: string[]): Promise<SummaryLayerHintV1[]>;
}

/** Fail-closed batch assertions; throws SummaryRoutingRepositoryError with the first defect code. */
export function assertSummaryRoutingRowsV1(requested: readonly string[], rows: readonly SummaryRoutingSourceRowV1[], workspaceRevision: string): void {
  const ids = rows.map((r) => r.chunk_row_id);
  if (new Set(ids).size !== ids.length) throw new SummaryRoutingRepositoryError('DUPLICATE_CHUNK_ROW');
  const have = new Set(ids);
  const missing = requested.filter((id) => !have.has(id));
  if (missing.length) throw new SummaryRoutingRepositoryError('REQUESTED_CHUNK_NOT_FOUND', missing.join(','));
  for (const r of rows) {
    if (r.workspace_revision !== workspaceRevision || r.binding_workspace_revision !== workspaceRevision) throw new SummaryRoutingRepositoryError('WORKSPACE_REVISION_MISMATCH', r.chunk_row_id);
    if (!r.binding_checksum) throw new SummaryRoutingRepositoryError('SOURCE_BINDING_MISSING', r.chunk_row_id);
    if (r.source_revision !== r.binding_source_revision) throw new SummaryRoutingRepositoryError('SOURCE_REVISION_MISMATCH', r.chunk_row_id);
    if (r.revision_status !== 'PROVEN') throw new SummaryRoutingRepositoryError('LINEAGE_NOT_PROVEN', r.chunk_row_id);
    if (r.chunk_id !== r.canonical_chunk_id) throw new SummaryRoutingRepositoryError('CANONICAL_CHUNK_ID_MISMATCH', r.chunk_row_id);
    if (r.n_lineage > 1) throw new SummaryRoutingRepositoryError('PACKET_KEY_AMBIGUOUS', r.chunk_row_id);
    const p = r.summary_provenance;
    if (p !== null && p !== undefined && (typeof p !== 'object' || Array.isArray(p))) throw new SummaryRoutingRepositoryError('SUMMARY_PROVENANCE_MALFORMED', r.chunk_row_id);
  }
}

export function createSummaryRoutingPostgresRepositoryV1(db: SummaryRoutingQueryableV1): SummaryRoutingRepositoryV1 {
  return {
    async readByChunkRowIds({ repositoryId, workspaceRevision, chunkRowIds }) {
      const res = await db.query(SUMMARY_ROUTING_SOURCE_SQL, [repositoryId, workspaceRevision, chunkRowIds]);
      const rows = res.rows as unknown as SummaryRoutingSourceRowV1[];
      assertSummaryRoutingRowsV1(chunkRowIds, rows, workspaceRevision);
      return rows;
    },
    async readSummaryLayerHints(packetKeys) {
      if (packetKeys.length === 0) return [];
      const res = await db.query(SUMMARY_LAYER_HINTS_SQL, [packetKeys]);
      const { createHash } = await import('node:crypto');
      return res.rows.map((r) => ({
        layerRef: String(r.layer_ref), packetKey: String(r.packet_key),
        digest: typeof r.text === 'string' && r.text.length ? `sha256:${createHash('sha256').update(r.text, 'utf8').digest('hex')}` : null,
        modelLabel: (r.model_name as string | null) ?? null, generatedAt: (r.generated_at as string | null) ?? null,
        revisionQualified: false as const, authority: 'HINT' as const,
      }));
    },
  };
}

const ext = (r: string) => (r.includes('.') ? r.split('.').pop()!.toLowerCase() : null);

/** Deterministic row -> payload compile. Summary trust class comes first (see compileSummaryRoutingPayloadV1). */
export type LegacyDetectorV1 = (text: string) => { clean: boolean };

/** `detect` = shared summary-quality detector (injected; it lives in scripts/). Without it legacy quality stays unknown. */
export function compileSummaryRoutingRowV1(row: SummaryRoutingSourceRowV1, detect?: LegacyDetectorV1): SummaryRoutingPayloadV1 {
  const refs = Array.isArray(row.lineage_evidence_refs) ? (row.lineage_evidence_refs as unknown[]).filter((x): x is string => typeof x === 'string') : [];
  return compileSummaryRoutingPayloadV1({
    identity: {
      chunkRowId: row.chunk_row_id, canonicalChunkId: row.canonical_chunk_id, packetKey: row.packet_key, sourceRef: row.source_ref,
      sourceRevision: row.source_revision, workspaceRevision: row.workspace_revision, bindingChecksum: row.binding_checksum, candidateOrdinal: null,
    },
    summaryText: row.summary_text, summaryProvenance: (row.summary_provenance as Record<string, unknown> | null) ?? null,
    legacyChunkSummary: row.legacy_summary, packetSummary: row.packet_summary, layerSummary: null,
    legacyQuality: row.legacy_summary && detect ? { clean: detect(row.legacy_summary).clean, quarantined: row.legacy_quarantined === true, detectorRevision: 'summary-quality-v1' } : null,
    summaryEmbeddingPresent: row.has_summary_embedding, summaryEmbeddingMeta: null, summaryEmbedding384Present: row.has_summary_embedding_384,
    routing: {
      domainClass: row.domain_class || null, communityId: row.community_id, clusterId: row.cluster_id,
      somCell: row.som_cell_x != null && row.som_cell_y != null ? [row.som_cell_x, row.som_cell_y] : null,
      pagerank: row.pagerank, language: row.language || null, fileKind: ext(row.source_ref), structuralEvidenceAvailable: false,
    },
    evidenceRefs: [`binding_checksum:${row.binding_checksum}`, `codebase_chunk_index:id=${row.chunk_row_id}`, ...refs],
  });
}
