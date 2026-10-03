import {
  ObservationFeatureProjectionV1Schema,
  type ObservationFeatureProjectionV1,
} from '../contracts/observation-feature-projection-v1.js';
import {
  buildRetrievalRouterFeatureRowV1,
  type BuildRetrievalRouterFeatureRowInputV1,
  type RetrievalRouterFeatureRowV1,
} from '../contracts/retrieval-router-feature-row-v1.js';
import {
  assertCandidateOrdinalMapIntegrityV1,
  candidateOrdinalMapV1Schema,
  type CandidateOrdinalMapV1,
} from '../features/canonical-candidate-v1.js';

/**
 * ACE-FSO-03: exact-gate reader from persisted `atlas_observation_feature_rows` (ORF) rows to the existing
 * ObservationFeatureProjectionV1 / RetrievalRouterFeatureRowV1 owners. Pure: the caller supplies rows read in a READ ONLY
 * transaction. It never synthesizes, defaults or infers a row; anything that does not match a candidate exactly is
 * rejected with a reason. It adds no builder: row assembly stays in `buildRetrievalRouterFeatureRowV1`.
 */
export interface OrfDbRowV1 {
  packet_key: string;
  feature_revision: string;
  source_ref: string;
  source_version_receipt_id: string | null;
  workspace_revision: string | null;
  representation_id: string | null;
  representation_revision: string | null;
  tree_node_id: string | null;
  ontology_classes: string[] | null;
  ast_observation_kinds: string[] | null;
  langextract_classes: string[] | null;
  flattened_tags: string[] | null;
  ontology_mask: unknown;
  ast_pattern_mask: unknown;
  structural_flags: Record<string, unknown> | null;
  evidence_refs: string[] | null;
  producer_revision: string;
  input_digest: string;
}

export interface OrfCandidateV1 {
  candidateOrdinal: number;
  canonicalId: string;
  packetKey: string;
  sourceRef: string;
  workspaceRevision: string;
}

export type OrfRejectionReasonV1 =
  | 'NO_ORF_ROW'
  | 'MULTIPLE_ORF_ROWS'
  | 'FEATURE_REVISION_MISMATCH'
  | 'SOURCE_REF_MISMATCH'
  | 'ORF_WORKSPACE_REVISION_NULL'
  | 'ORF_WORKSPACE_REVISION_MISMATCH'
  | 'ORF_REPRESENTATION_REVISION_NULL'
  | 'ORF_REPRESENTATION_REVISION_MISMATCH'
  | 'PROJECTION_INVALID';

export interface OrfAcceptedV1 { candidateOrdinal: number; candidate: OrfCandidateV1; projection: ObservationFeatureProjectionV1 }
export interface OrfRejectedV1 { candidateOrdinal: number; packetKey: string; reason: OrfRejectionReasonV1 }
export interface OrfReadResultV1 {
  accepted: OrfAcceptedV1[];
  rejected: OrfRejectedV1[];
  rejectionCounts: Partial<Record<OrfRejectionReasonV1, number>>;
  synthesizedRows: 0;
  writesPerformed: false;
}

export interface OrfCandidateMapReadResultV1 extends OrfReadResultV1 {
  mapIdentity: {
    candidateSnapshotRevision: string;
    ordinalMapChecksum: string;
    workspaceRevision: string;
    rowCount: number;
  };
}

const flag = (flags: Record<string, unknown> | null, key: string): boolean => flags?.[key] === true;

/** `expectedFeatureRevision` is required: rows of any other producer revision are never accepted implicitly. */
export function readOrfRowsForCandidatesV1(input: {
  candidates: readonly OrfCandidateV1[];
  rows: readonly OrfDbRowV1[];
  expectedFeatureRevision: string;
  expectedRepresentationRevision: string;
}): OrfReadResultV1 {
  if (!input.expectedFeatureRevision.trim() || !input.expectedRepresentationRevision.trim()) {
    throw new Error('ORF_EXPECTED_REVISION_REQUIRED');
  }
  const byKey = new Map<string, OrfDbRowV1[]>();
  for (const row of input.rows) (byKey.get(row.packet_key) ?? byKey.set(row.packet_key, []).get(row.packet_key)!).push(row);

  const accepted: OrfAcceptedV1[] = []; const rejected: OrfRejectedV1[] = [];
  const counts: Partial<Record<OrfRejectionReasonV1, number>> = {};
  const reject = (c: OrfCandidateV1, reason: OrfRejectionReasonV1) => {
    rejected.push({ candidateOrdinal: c.candidateOrdinal, packetKey: c.packetKey, reason });
    counts[reason] = (counts[reason] ?? 0) + 1;
  };

  for (const c of input.candidates) {
    const hits = byKey.get(c.packetKey) ?? [];
    if (hits.length === 0) { reject(c, 'NO_ORF_ROW'); continue; }
    const ofRevision = hits.filter((r) => r.feature_revision === input.expectedFeatureRevision);
    if (ofRevision.length === 0) { reject(c, 'FEATURE_REVISION_MISMATCH'); continue; }
    if (ofRevision.length > 1) { reject(c, 'MULTIPLE_ORF_ROWS'); continue; }
    const r = ofRevision[0];
    if (r.source_ref !== c.sourceRef) { reject(c, 'SOURCE_REF_MISMATCH'); continue; }
    if (r.workspace_revision == null) { reject(c, 'ORF_WORKSPACE_REVISION_NULL'); continue; }
    if (r.workspace_revision !== c.workspaceRevision) { reject(c, 'ORF_WORKSPACE_REVISION_MISMATCH'); continue; }
    if (r.representation_revision == null) { reject(c, 'ORF_REPRESENTATION_REVISION_NULL'); continue; }
    if (r.representation_revision !== input.expectedRepresentationRevision) { reject(c, 'ORF_REPRESENTATION_REVISION_MISMATCH'); continue; }
    const parsed = ObservationFeatureProjectionV1Schema.safeParse({
      schema: 'atlas.observation-feature-projection.v1',
      packetKey: r.packet_key, sourceRef: r.source_ref, treeNodeId: r.tree_node_id,
      sourceVersionReceiptId: r.source_version_receipt_id,
      representationId: r.representation_id, representationRevision: r.representation_revision,
      ontologyClasses: r.ontology_classes ?? [], ontologyMask: r.ontology_mask,
      astObservationKinds: r.ast_observation_kinds ?? [], astPatternMask: r.ast_pattern_mask,
      langextractClasses: r.langextract_classes ?? [],
      hasFunction: flag(r.structural_flags, 'hasFunction'), hasCall: flag(r.structural_flags, 'hasCall'),
      hasDatabaseAccess: flag(r.structural_flags, 'hasDatabaseAccess'), hasNetworkCall: flag(r.structural_flags, 'hasNetworkCall'),
      hasTest: flag(r.structural_flags, 'hasTest'), hasErrorHandler: flag(r.structural_flags, 'hasErrorHandler'),
      flattenedTags: r.flattened_tags ?? [], evidenceRefs: r.evidence_refs ?? [],
      featureRevision: r.feature_revision, producerRevision: r.producer_revision, inputDigest: r.input_digest,
    });
    if (!parsed.success) { reject(c, 'PROJECTION_INVALID'); continue; }
    accepted.push({ candidateOrdinal: c.candidateOrdinal, candidate: c, projection: parsed.data });
  }
  // deterministic output regardless of input ordering
  accepted.sort((a, b) => a.candidateOrdinal - b.candidateOrdinal);
  rejected.sort((a, b) => a.candidateOrdinal - b.candidateOrdinal);
  return { accepted, rejected, rejectionCounts: counts, synthesizedRows: 0, writesPerformed: false };
}

/** Validate and pin the existing canonical coordinate owner before any ORF join. */
export function readOrfRowsForCandidateMapV1(input: {
  ordinalMap: unknown;
  expectedCandidateSnapshotRevision: string;
  expectedOrdinalMapChecksum: string;
  expectedWorkspaceRevision: string;
  rows: readonly OrfDbRowV1[];
  expectedFeatureRevision: string;
  expectedRepresentationRevision: string;
}): OrfCandidateMapReadResultV1 {
  const map: CandidateOrdinalMapV1 = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  assertCandidateOrdinalMapIntegrityV1(map);
  if (map.candidateSnapshotRevision !== input.expectedCandidateSnapshotRevision) {
    throw new Error('ORF_CANDIDATE_SNAPSHOT_PIN_MISMATCH');
  }
  if (map.ordinalMapChecksum !== input.expectedOrdinalMapChecksum) {
    throw new Error('ORF_ORDINAL_MAP_CHECKSUM_PIN_MISMATCH');
  }
  if (map.workspaceRevision !== input.expectedWorkspaceRevision) {
    throw new Error('ORF_WORKSPACE_REVISION_PIN_MISMATCH');
  }
  const seenPacketKeys = new Set<string>();
  const candidates = map.candidates.map((candidate) => {
    if (candidate.packetKey === null) throw new Error(`ORF_CANDIDATE_PACKET_KEY_REQUIRED:${candidate.candidateOrdinal}`);
    if (candidate.sourceRef === null) throw new Error(`ORF_CANDIDATE_SOURCE_REF_REQUIRED:${candidate.candidateOrdinal}`);
    if (seenPacketKeys.has(candidate.packetKey)) throw new Error(`ORF_CANDIDATE_PACKET_KEY_DUPLICATE:${candidate.packetKey}`);
    seenPacketKeys.add(candidate.packetKey);
    return {
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      sourceRef: candidate.sourceRef,
      workspaceRevision: candidate.workspaceRevision,
    };
  });
  const result = readOrfRowsForCandidatesV1({
    candidates,
    rows: input.rows,
    expectedFeatureRevision: input.expectedFeatureRevision,
    expectedRepresentationRevision: input.expectedRepresentationRevision,
  });
  return {
    ...result,
    mapIdentity: {
      candidateSnapshotRevision: map.candidateSnapshotRevision,
      ordinalMapChecksum: map.ordinalMapChecksum,
      workspaceRevision: map.workspaceRevision,
      rowCount: map.rowCount,
    },
  };
}

export type OrfQueryTimeInputV1 = Pick<BuildRetrievalRouterFeatureRowInputV1, 'semantic' | 'lexical' | 'graph' | 'cluster' | 'temporal' | 'evidence' | 'graphRevision' | 'latent'>;

/**
 * Assembles router rows for accepted candidates using the EXISTING builder. Query-time values (semantic cosine, bm25, ...)
 * must come from a readOnly SearchRuntime via `queryTime`; an ordinal with no query-time semantic input is reported as
 * missing, never given a default.
 */
export function buildRouterRowsForAcceptedV1(input: {
  accepted: readonly OrfAcceptedV1[];
  queryTime: (ordinal: number) => OrfQueryTimeInputV1 | null;
}): { rows: RetrievalRouterFeatureRowV1[]; missingQueryTimeOrdinals: number[] } {
  const rows: RetrievalRouterFeatureRowV1[] = []; const missing: number[] = [];
  for (const a of input.accepted) {
    const q = input.queryTime(a.candidateOrdinal);
    if (!q?.semantic) { missing.push(a.candidateOrdinal); continue; }
    rows.push(buildRetrievalRouterFeatureRowV1({
      candidateOrdinal: a.candidateOrdinal, canonicalId: a.candidate.canonicalId, packetKey: a.candidate.packetKey,
      sourceRef: a.candidate.sourceRef, workspaceRevision: a.candidate.workspaceRevision,
      featureRevision: a.projection.featureRevision, observation: a.projection, ...q,
    }));
  }
  return { rows, missingQueryTimeOrdinals: missing };
}
