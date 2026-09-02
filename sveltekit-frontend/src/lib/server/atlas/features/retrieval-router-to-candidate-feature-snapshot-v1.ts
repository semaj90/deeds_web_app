import { z } from 'zod';

import {
  candidateOrdinalMapV1Schema,
  materializeCandidateOrdinalMap,
  type CandidateOrdinalMapV1,
} from './canonical-candidate-v1.js';
import {
  materializeCandidateFeatureSnapshot,
  type CandidateFeatureSnapshotV1,
} from './candidate-feature-snapshot-v1.js';
import {
  RetrievalRouterFeatureRowV1Schema,
  type RetrievalRouterFeatureRowV1,
} from '../contracts/retrieval-router-feature-row-v1.js';
import {
  QueryAdaptiveFeatureRowV1Schema,
  type QueryAdaptiveFeatureRowV1,
} from '../retrieval/query-adaptive-feature-compiler.js';

const lane = z.enum([
  'semantic', 'lexical', 'ast', 'graph', 'manifold4', 'cross_encoder', 'domain', 'execution', 'memory',
]);
export type CandidateFeatureLaneV1 = z.infer<typeof lane>;

/**
 * Converts the existing retrieval-router rows into the ACE snapshot contract.
 * Identity and revisions come from the already validated ordinal map; feature
 * values come only from the corresponding router row. No lineage is inferred.
 */
export function materializeCandidateFeatureSnapshotFromRetrievalRowsV1(input: {
  ordinalMap: z.input<typeof candidateOrdinalMapV1Schema>;
  rows: readonly z.input<typeof RetrievalRouterFeatureRowV1Schema>[];
  laneMaskByOrdinal: Readonly<Record<string, readonly CandidateFeatureLaneV1[]>>;
  producerRevision: string;
}): CandidateFeatureSnapshotV1 {
  const ordinalMap = candidateOrdinalMapV1Schema.parse(input.ordinalMap);
  const rows = input.rows.map((row) => RetrievalRouterFeatureRowV1Schema.parse(row));
  if (rows.length !== ordinalMap.rowCount) {
    throw new Error(`ACE_FEATURE_SNAPSHOT_ROW_COUNT_MISMATCH:${rows.length}:${ordinalMap.rowCount}`);
  }

  const seen = new Set<number>();
  const featureRows = rows.map((row): Record<string, unknown> => {
    if (seen.has(row.candidateOrdinal)) throw new Error(`ACE_FEATURE_ROW_DUPLICATE_ORDINAL:${row.candidateOrdinal}`);
    seen.add(row.candidateOrdinal);
    const candidate = ordinalMap.candidates[row.candidateOrdinal];
    if (!candidate) throw new Error(`ACE_FEATURE_ROW_ORDINAL_NOT_IN_MAP:${row.candidateOrdinal}`);
    if (row.canonicalId !== candidate.canonicalId || row.packetKey !== candidate.packetKey) {
      throw new Error(`ACE_FEATURE_ROW_IDENTITY_MISMATCH:${row.candidateOrdinal}`);
    }
    if (row.treeNodeId !== null && row.treeNodeId !== candidate.treeNodeId) {
      throw new Error(`ACE_FEATURE_ROW_TREE_IDENTITY_MISMATCH:${row.candidateOrdinal}`);
    }
    if (row.workspaceRevision === null || String(row.workspaceRevision) !== candidate.workspaceRevision) {
      throw new Error(`ACE_FEATURE_ROW_WORKSPACE_REVISION_MISMATCH:${row.candidateOrdinal}`);
    }
    if (row.graphRevision !== candidate.graphRevision) {
      throw new Error(`ACE_FEATURE_ROW_GRAPH_REVISION_MISMATCH:${row.candidateOrdinal}`);
    }

    const laneMask = lane.array().parse(input.laneMaskByOrdinal[String(row.candidateOrdinal)] ?? []);
    if (laneMask.length === 0) throw new Error(`ACE_FEATURE_ROW_LANE_MASK_MISSING:${row.candidateOrdinal}`);
    return {
      schema: 'atlas.candidate-feature-row.v1',
      candidateOrdinal: row.candidateOrdinal,
      canonicalId: row.canonicalId,
      packetKey: row.packetKey,
      treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      graphRevision: row.graphRevision,
      semanticRevision: row.semantic.representationRevision,
      featureRevision: row.featureRevision,
      representationBindings: candidate.representationBindings,
      semanticRelevance: row.semantic.cosine,
      lexicalRelevance: row.lexical.bm25Score,
      astAffinity: null,
      graphAuthority: row.graph.pageRank,
      personalizedPageRank: row.graph.personalizedPageRank,
      communityAffinity: null,
      manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: row.ontology.classes.length > 0 ? row.evidence.authorityWeight : null,
      executionUtility: null,
      memoryUtility: null,
      laneMask,
      degradedIdentity: false,
      evidenceRefs: row.evidence.evidenceRefs,
    };
  });

  return materializeCandidateFeatureSnapshot({
    ordinalMap,
    rows: featureRows,
    featureRevision: rows[0]?.featureRevision ?? `${input.producerRevision}:empty`,
    producerRevision: input.producerRevision,
  });
}

/**
 * Converts the existing revision-qualified QAS rows into the same snapshot
 * contract. QAS already owns the feature values and lineage; the ordinal map
 * is rebuilt deterministically from canonical identity and never trusted from
 * query order.
 */
export function materializeCandidateFeatureSnapshotFromQasRowsV1(input: {
  rows: readonly z.input<typeof QueryAdaptiveFeatureRowV1Schema>[];
  candidateSnapshotRevision: string;
  producerRevision: string;
  laneMaskByCanonicalId: Readonly<Record<string, readonly CandidateFeatureLaneV1[]>>;
}): CandidateFeatureSnapshotV1 {
  const rows = input.rows.map((row) => QueryAdaptiveFeatureRowV1Schema.parse(row));
  if (rows.length === 0) throw new Error('ACE_QAS_SNAPSHOT_EMPTY');
  const workspaceRevision = rows[0]!.workspaceRevision;
  const featureRevision = rows[0]!.featureRevision;
  const ordinalMap = materializeCandidateOrdinalMap({
    candidateSnapshotRevision: input.candidateSnapshotRevision,
    workspaceRevision,
    producerRevision: input.producerRevision,
    candidates: rows.map((row) => ({
      canonicalId: row.canonicalId,
      packetKey: row.packetKey,
      sourceRef: row.sourceRef,
      treeNodeId: null,
      symbolVersionId: row.symbolVersionId,
      workspaceRevision: row.workspaceRevision,
      sourceRevision: row.sourceRevision,
      graphRevision: row.graphRevision,
      semanticRevision: row.representationRevision,
      degradedIdentity: false,
      evidenceRefs: row.evidenceRefs,
      representationBindings: [],
    })),
  });
  const orderedCandidates = [...ordinalMap.candidates].sort((a, b) => a.canonicalId.localeCompare(b.canonicalId));
  const sourceRows = new Map(rows.map((row) => [row.canonicalId, row]));
  const mappedRows = orderedCandidates.map((candidate) => {
    const row = sourceRows.get(candidate.canonicalId);
    if (!row) throw new Error(`ACE_QAS_CANONICAL_ID_MISSING:${candidate.canonicalId}`);
    const laneMask = lane.array().parse(input.laneMaskByCanonicalId[row.canonicalId] ?? []);
    if (laneMask.length === 0) throw new Error(`ACE_QAS_LANE_MASK_MISSING:${row.canonicalId}`);
    return {
      schema: 'atlas.candidate-feature-row.v1' as const,
      candidateOrdinal: candidate.candidateOrdinal,
      canonicalId: candidate.canonicalId,
      packetKey: candidate.packetKey,
      treeNodeId: candidate.treeNodeId,
      symbolVersionId: candidate.symbolVersionId,
      workspaceRevision: candidate.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      graphRevision: candidate.graphRevision,
      semanticRevision: row.representationRevision,
      featureRevision: row.featureRevision,
      representationBindings: candidate.representationBindings,
      semanticRelevance: row.features.semanticAffinity,
      lexicalRelevance: row.features.lexicalAffinity,
      astAffinity: row.features.astAffinity,
      graphAuthority: row.features.graphAuthority,
      personalizedPageRank: null,
      communityAffinity: null,
      manifold4OrientationSimilarity: null,
      crossEncoderRawScore: null,
      crossEncoderCalibratedScore: null,
      crossEncoderAvailable: false,
      domainAffinity: row.features.domainAffinity,
      executionUtility: row.features.priorExecutionSuccess,
      memoryUtility: row.features.reuseProbability,
      laneMask,
      degradedIdentity: false,
      evidenceRefs: row.evidenceRefs,
    };
  });
  return materializeCandidateFeatureSnapshot({
    ordinalMap,
    rows: mappedRows,
    featureRevision,
    producerRevision: input.producerRevision,
  });
}
