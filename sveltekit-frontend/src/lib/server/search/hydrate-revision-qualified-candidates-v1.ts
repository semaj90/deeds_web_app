import { sql } from 'drizzle-orm';
import { db, pgRows } from '$lib/server/db/client.js';
import type { StrictSemanticProjectionCandidateV1 } from './strict-semantic-projection-candidate-v1.js';

export const REVISION_QUALIFIED_SEMANTIC_CANDIDATE_V1 =
  'atlas.revision-qualified-semantic-candidate.v1' as const;

const SHA256_REVISION_RE = /^sha256:[a-f0-9]{64}$/;

export interface RevisionQualifiedSemanticCandidateV1 {
  schema: typeof REVISION_QUALIFIED_SEMANTIC_CANDIDATE_V1;
  physicalPointId: string;
  postgresId: string;
  canonicalChunkId: string;
  packetKey: string;
  sourceRef: string;
  workspaceRevision: string;
  sourceRevision: string;
  bindingChecksum: string;
  contentHash: string | null;
  content: string;
  semanticScore: number;
  representationName: 'semantic_768';
  representationRevision: string;
  projectionRevision: string;
  modelRevision: string;
  lineageProducerRevision: string;
  evidenceRefs: string[];
}

export type RevisionQualifiedHydrationFailureReasonV1 =
  | 'IDENTITY_MISSING'
  | 'CURRENT_LINEAGE_NOT_FOUND'
  | 'CURRENT_LINEAGE_AMBIGUOUS'
  | 'CHUNK_ID_MISMATCH'
  | 'SOURCE_REF_MISMATCH'
  | 'CONTENT_HASH_MISMATCH'
  | 'WORKSPACE_REVISION_MISMATCH'
  | 'SOURCE_REVISION_INVALID'
  | 'REPRESENTATION_NAME_MISMATCH'
  | 'REPRESENTATION_REVISION_MISSING'
  | 'PROJECTION_REVISION_MISSING'
  | 'MODEL_REVISION_MISSING';

export interface RevisionQualifiedHydrationFailureV1 {
  physicalPointId: string;
  postgresId: string | null;
  reason: RevisionQualifiedHydrationFailureReasonV1;
  detail?: string;
}

export interface RevisionQualifiedHydrationDbRowV1 {
  chunk_row_id: string;
  canonical_chunk_id: string;
  chunk_id: string | null;
  packet_key: string;
  source_ref: string;
  source_revision: string;
  workspace_revision: string;
  binding_checksum: string;
  content_hash: string | null;
  content: string | null;
  lineage_producer_revision: string;
  evidence_refs: string[] | null;
}

export interface HydrateRevisionQualifiedCandidatesResultV1 {
  hydrated: RevisionQualifiedSemanticCandidateV1[];
  failures: RevisionQualifiedHydrationFailureV1[];
  writesPerformed: false;
  canonicalAuthority: false;
}

function fail(
  candidate: StrictSemanticProjectionCandidateV1,
  reason: RevisionQualifiedHydrationFailureReasonV1,
  detail?: string,
): RevisionQualifiedHydrationFailureV1 {
  return {
    physicalPointId: candidate.physicalPointId,
    postgresId: candidate.postgresId,
    reason,
    ...(detail ? { detail } : {}),
  };
}

/**
 * Pure rank-preserving join used by tests and by the live PostgreSQL wrapper.
 * No identity is inferred from path similarity, vector similarity, or array order.
 */
export function joinRevisionQualifiedCandidatesV1(input: {
  candidates: readonly StrictSemanticProjectionCandidateV1[];
  rows: readonly RevisionQualifiedHydrationDbRowV1[];
  workspaceRevision: string;
}): HydrateRevisionQualifiedCandidatesResultV1 {
  if (!SHA256_REVISION_RE.test(input.workspaceRevision)) {
    throw new Error(`REVISION_QUALIFIED_WORKSPACE_REVISION_INVALID:${input.workspaceRevision}`);
  }

  const rowsByChunkRowId = new Map<string, RevisionQualifiedHydrationDbRowV1[]>();
  for (const row of input.rows) {
    const list = rowsByChunkRowId.get(row.chunk_row_id) ?? [];
    list.push(row);
    rowsByChunkRowId.set(row.chunk_row_id, list);
  }

  const hydrated: RevisionQualifiedSemanticCandidateV1[] = [];
  const failures: RevisionQualifiedHydrationFailureV1[] = [];

  for (const candidate of input.candidates) {
    if (candidate.identityMissing || !candidate.postgresId) {
      failures.push(fail(candidate, 'IDENTITY_MISSING'));
      continue;
    }

    const matches = rowsByChunkRowId.get(candidate.postgresId) ?? [];
    if (matches.length === 0) {
      failures.push(fail(candidate, 'CURRENT_LINEAGE_NOT_FOUND'));
      continue;
    }
    if (matches.length !== 1) {
      failures.push(fail(candidate, 'CURRENT_LINEAGE_AMBIGUOUS', `matches=${matches.length}`));
      continue;
    }

    const row = matches[0];
    if (row.workspace_revision !== input.workspaceRevision) {
      failures.push(fail(candidate, 'WORKSPACE_REVISION_MISMATCH', row.workspace_revision));
      continue;
    }
    if (!SHA256_REVISION_RE.test(row.source_revision)) {
      failures.push(fail(candidate, 'SOURCE_REVISION_INVALID', row.source_revision));
      continue;
    }
    if (candidate.chunkId && row.chunk_id && candidate.chunkId !== row.chunk_id) {
      failures.push(fail(candidate, 'CHUNK_ID_MISMATCH', `${candidate.chunkId}:${row.chunk_id}`));
      continue;
    }
    if (candidate.sourceRef && candidate.sourceRef !== row.source_ref) {
      failures.push(fail(candidate, 'SOURCE_REF_MISMATCH', `${candidate.sourceRef}:${row.source_ref}`));
      continue;
    }
    if (candidate.contentHash && row.content_hash && candidate.contentHash !== row.content_hash) {
      failures.push(fail(candidate, 'CONTENT_HASH_MISMATCH'));
      continue;
    }
    if (candidate.representationName !== 'semantic_768') {
      failures.push(fail(candidate, 'REPRESENTATION_NAME_MISMATCH', String(candidate.representationName)));
      continue;
    }
    if (!candidate.representationRevision) {
      failures.push(fail(candidate, 'REPRESENTATION_REVISION_MISSING'));
      continue;
    }
    if (!candidate.projectionRevision) {
      failures.push(fail(candidate, 'PROJECTION_REVISION_MISSING'));
      continue;
    }
    if (!candidate.modelRevision) {
      failures.push(fail(candidate, 'MODEL_REVISION_MISSING'));
      continue;
    }

    hydrated.push({
      schema: REVISION_QUALIFIED_SEMANTIC_CANDIDATE_V1,
      physicalPointId: candidate.physicalPointId,
      postgresId: candidate.postgresId,
      canonicalChunkId: row.canonical_chunk_id,
      packetKey: row.packet_key,
      sourceRef: row.source_ref,
      workspaceRevision: row.workspace_revision,
      sourceRevision: row.source_revision,
      bindingChecksum: row.binding_checksum,
      contentHash: row.content_hash,
      content: row.content ?? '',
      semanticScore: candidate.score,
      representationName: 'semantic_768',
      representationRevision: candidate.representationRevision,
      projectionRevision: candidate.projectionRevision,
      modelRevision: candidate.modelRevision,
      lineageProducerRevision: row.lineage_producer_revision,
      evidenceRefs: [...new Set(row.evidence_refs ?? [])].sort(),
    });
  }

  return { hydrated, failures, writesPerformed: false, canonicalAuthority: false };
}

/**
 * Current-source authority readback. Reuses the exact join semantics of
 * export-current-source-chunk-cohort-v1.mjs and performs one bounded read.
 */
export async function hydrateRevisionQualifiedCandidatesV1(input: {
  candidates: readonly StrictSemanticProjectionCandidateV1[];
  workspaceRevision: string;
}): Promise<HydrateRevisionQualifiedCandidatesResultV1> {
  if (!SHA256_REVISION_RE.test(input.workspaceRevision)) {
    throw new Error(`REVISION_QUALIFIED_WORKSPACE_REVISION_INVALID:${input.workspaceRevision}`);
  }

  const ids = [...new Set(input.candidates.flatMap((candidate) => candidate.postgresId ? [candidate.postgresId] : []))];
  if (ids.length === 0) {
    return joinRevisionQualifiedCandidatesV1({ candidates: input.candidates, rows: [], workspaceRevision: input.workspaceRevision });
  }

  const result = await db.execute(sql`
    WITH bound_sources AS (
      SELECT DISTINCT ON (b.canonical_source_ref, b.workspace_revision)
        b.workspace_revision::text AS workspace_revision,
        b.canonical_source_ref::text AS source_ref,
        b.source_revision::text AS source_revision,
        b.binding_checksum::text AS binding_checksum
      FROM atlas_workspace_source_bindings b
      WHERE b.workspace_revision::text = ${input.workspaceRevision}
        AND NULLIF(b.canonical_source_ref::text, '') IS NOT NULL
        AND NULLIF(b.source_revision::text, '') IS NOT NULL
      ORDER BY b.canonical_source_ref, b.workspace_revision, b.observed_at DESC NULLS LAST
    )
    SELECT
      c.id::text AS chunk_row_id,
      l.canonical_chunk_id::text AS canonical_chunk_id,
      c.chunk_id::text AS chunk_id,
      l.packet_key::text AS packet_key,
      l.source_ref::text AS source_ref,
      l.source_revision::text AS source_revision,
      b.workspace_revision::text AS workspace_revision,
      b.binding_checksum::text AS binding_checksum,
      c.content_hash::text AS content_hash,
      c.content::text AS content,
      l.lineage_producer_revision::text AS lineage_producer_revision,
      l.evidence_refs
    FROM codebase_chunk_index c
    JOIN atlas_packet_chunk_lineage l
      ON l.chunk_row_id = c.id
     AND l.revision_status = 'PROVEN'
    JOIN bound_sources b
      ON b.source_ref = l.source_ref
     AND b.source_revision = l.source_revision
    WHERE c.id::text IN (${sql.join(ids.map((id) => sql`${id}`), sql`, `)})
    ORDER BY c.id, l.packet_key, l.canonical_chunk_id
  `);

  const rows = pgRows<RevisionQualifiedHydrationDbRowV1>(result);
  return joinRevisionQualifiedCandidatesV1({
    candidates: input.candidates,
    rows,
    workspaceRevision: input.workspaceRevision,
  });
}
