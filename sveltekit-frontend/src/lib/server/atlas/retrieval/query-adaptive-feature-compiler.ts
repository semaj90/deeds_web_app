import { z } from 'zod';
import {
  QAS_CORE_FEATURE_NAMES,
  type QueryAdaptiveCandidate,
} from './query-adaptive-sampler.js';
import type { CandidateFeatureMatrixRowV1 } from '../contracts/feature-extraction-v1.js';
import {
  buildCandidateFeatureMatrix,
  type CandidateProjectionInput,
} from '../../retrieval/retrieval-candidate-feature-matrix-v1.js';

export const QueryAdaptiveFeatureRowV1Schema = z.object({
  schema: z.literal('atlas.qas.candidate-feature.v1'),
  requestId: z.string().min(1),
  canonicalId: z.string().min(1),
  packetKey: z.string().min(1),
  symbolVersionId: z.string().min(1).nullable(),
  sourceRef: z.string().min(1),
  workspaceRevision: z.string().min(1),
  sourceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  featureRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  policyRevision: z.string().min(1),
  taskKind: z.string().min(1),
  domainClass: z.string().min(1).nullable(),
  somRevision: z.string().min(1).nullable(),
  features: z.object({
    semanticAffinity: z.number().min(0).max(1),
    lexicalAffinity: z.number().min(0).max(1),
    graphAuthority: z.number().min(0).max(1),
    astAffinity: z.number().min(0).max(1),
    processAffinity: z.number().min(0).max(1),
    domainAffinity: z.number().min(0).max(1),
    priorExecutionSuccess: z.number().min(0).max(1),
    reuseProbability: z.number().min(0).max(1),
    recency: z.number().min(0).max(1),
    memoryCost: z.number().min(0).max(1).optional(),
    promotionCost: z.number().min(0).max(1).optional(),
  }).strict(),
  logicalLanes: z.array(z.string().min(1)).max(16),
  fusedRank: z.number().int().positive().nullable(),
  rerankScore: z.number().min(0).max(1).nullable(),
  evidenceRefs: z.array(z.string().min(1)).max(64),
}).strict();

export type QueryAdaptiveFeatureRowV1 = z.infer<typeof QueryAdaptiveFeatureRowV1Schema>;

/**
 * The SearchRuntime candidate envelope is intentionally narrower than the QAS
 * feature row.  This bridge accepts only features already produced by an
 * existing feature owner; it never derives a score from packet text or treats
 * packetKey as canonical identity.
 */
export interface SearchRuntimeQasCandidate {
  packetKey: string;
  sourceRef: string;
  stableSymbolId?: string | null;
  symbolVersionId?: string | null;
  workspaceRevision?: string | null;
  sourceRevision?: string | null;
  representationRevision?: string | number | null;
  score?: number;
  fusionScore?: number;
  rankBefore?: number;
}

export interface SearchRuntimeQasFeatureContext {
  graphRevision: string;
  featureRevision: string;
  representationRevision: string;
  taskKind: string;
  domainClass?: string | null;
  somRevision?: string | null;
  features: QueryAdaptiveFeatureRowV1['features'];
  evidenceRefs?: string[];
}

export type SearchRuntimeQasFeatureResolver = (
  candidate: SearchRuntimeQasCandidate,
) => SearchRuntimeQasFeatureContext | null | undefined;

export interface SearchRuntimeQasAdapterRejection {
  packetKey: string;
  reason:
    | 'MISSING_CANONICAL_ID'
    | 'MISSING_SOURCE_REVISION'
    | 'MISSING_WORKSPACE_REVISION'
    | 'WORKSPACE_REVISION_MISMATCH'
    | 'MISSING_FEATURE_CONTEXT'
    | 'MISSING_MATRIX_FEATURE'
    | 'REPRESENTATION_REVISION_MISMATCH';
}

export interface SearchRuntimeQasAdapterResult {
  rows: QueryAdaptiveFeatureRowV1[];
  rejected: SearchRuntimeQasAdapterRejection[];
}

/**
 * Adapt SearchRuntime's existing candidate envelope into QAS rows.
 *
 * This is a read-only integration boundary.  The resolver must point at the
 * existing query-time feature owner; it is deliberately injected so this
 * module cannot query Postgres, Qdrant, Neo4j, or Valkey and accidentally
 * become a second retrieval owner.
 */
export function adaptSearchRuntimeCandidatesToQasRows(input: {
  requestId: string;
  policyRevision: string;
  workspaceRevision: string;
  representationRevision: string;
  candidates: SearchRuntimeQasCandidate[];
  resolveFeatures: SearchRuntimeQasFeatureResolver;
}): SearchRuntimeQasAdapterResult {
  const rows: QueryAdaptiveFeatureRowV1[] = [];
  const rejected: SearchRuntimeQasAdapterRejection[] = [];

  for (const candidate of input.candidates) {
    if (!candidate.stableSymbolId?.trim()) {
      rejected.push({ packetKey: candidate.packetKey, reason: 'MISSING_CANONICAL_ID' });
      continue;
    }
    if (candidate.workspaceRevision && candidate.workspaceRevision !== input.workspaceRevision) {
      rejected.push({ packetKey: candidate.packetKey, reason: 'WORKSPACE_REVISION_MISMATCH' });
      continue;
    }
    if (!candidate.sourceRevision?.trim()) {
      rejected.push({ packetKey: candidate.packetKey, reason: 'MISSING_SOURCE_REVISION' });
      continue;
    }

    const context = input.resolveFeatures(candidate);
    if (!context) {
      rejected.push({ packetKey: candidate.packetKey, reason: 'MISSING_FEATURE_CONTEXT' });
      continue;
    }
    if (context.representationRevision !== input.representationRevision) {
      rejected.push({ packetKey: candidate.packetKey, reason: 'REPRESENTATION_REVISION_MISMATCH' });
      continue;
    }

    rows.push(QueryAdaptiveFeatureRowV1Schema.parse({
      schema: 'atlas.qas.candidate-feature.v1',
      requestId: input.requestId,
      canonicalId: candidate.stableSymbolId,
      packetKey: candidate.packetKey,
      symbolVersionId: candidate.symbolVersionId ?? null,
      sourceRef: candidate.sourceRef,
      workspaceRevision: input.workspaceRevision,
      sourceRevision: candidate.sourceRevision,
      graphRevision: context.graphRevision,
      featureRevision: context.featureRevision,
      representationRevision: context.representationRevision,
      policyRevision: input.policyRevision,
      taskKind: context.taskKind,
      domainClass: context.domainClass ?? null,
      somRevision: context.somRevision ?? null,
      features: context.features,
      logicalLanes: [],
      fusedRank: candidate.rankBefore ?? null,
      rerankScore: candidate.fusionScore ?? candidate.score ?? null,
      evidenceRefs: context.evidenceRefs ?? [candidate.sourceRef],
    }));
  }

  return { rows, rejected };
}

/**
 * Producer caller for the existing query-time matrix owner. It deliberately
 * rejects incomplete rows before the QAS adapter runs; the matrix builder's
 * zero values are not treated as evidence when the presence mask is false.
 */
export function buildSearchRuntimeQasRows(input: {
  requestId: string;
  policyRevision: string;
  workspaceRevision: string;
  representationRevision: string;
  candidates: SearchRuntimeQasCandidate[];
  projections: CandidateProjectionInput[];
  resolveFeatures: SearchRuntimeQasFeatureResolver;
}): SearchRuntimeQasAdapterResult {
  if (input.candidates.length !== input.projections.length) {
    throw new Error('SearchRuntime candidate/projection counts must match');
  }

  const matrix = buildCandidateFeatureMatrix(input.projections);
  const requiredColumns = [0, 1, 3, 4, 6, 16, 17, 18, 20];
  const rejectedPackets = new Set<string>();
  const featureOverrides = new Map<string, SearchRuntimeQasFeatureContext>();

  for (let index = 0; index < input.candidates.length; index += 1) {
    const candidate = input.candidates[index];
    const packetKey = matrix.candidate_packet_keys[index];
    if (packetKey !== candidate.packetKey) {
      rejectedPackets.add(candidate.packetKey);
      continue;
    }
    const offset = index * matrix.feature_count;
    if (requiredColumns.some((column) => matrix.presence_mask[offset + column] !== 1)) {
      rejectedPackets.add(candidate.packetKey);
      continue;
    }
    const context = input.resolveFeatures(candidate);
    if (!context) continue;
    featureOverrides.set(candidate.packetKey, {
      ...context,
      features: {
        ...context.features,
        semanticAffinity: matrix.candidate_features[offset],
        lexicalAffinity: matrix.candidate_features[offset + 1],
        astAffinity: matrix.candidate_features[offset + 3],
        graphAuthority: matrix.candidate_features[offset + 4],
        domainAffinity: matrix.candidate_features[offset + 6],
        recency: matrix.candidate_features[offset + 16],
        reuseProbability: matrix.candidate_features[offset + 17],
        priorExecutionSuccess: matrix.candidate_features[offset + 18],
        processAffinity: matrix.candidate_features[offset + 20],
      },
    });
  }

  const adapted = adaptSearchRuntimeCandidatesToQasRows({
    ...input,
    resolveFeatures: (candidate) => {
      if (rejectedPackets.has(candidate.packetKey)) return null;
      return featureOverrides.get(candidate.packetKey) ?? null;
    },
  });

  return {
    rows: adapted.rows,
    rejected: [
      ...adapted.rejected,
      ...Array.from(rejectedPackets, (packetKey) => ({ packetKey, reason: 'MISSING_MATRIX_FEATURE' as const })),
    ],
  };
}

export function compileQasCandidateFeatures(input: {
  requestId: string;
  policyRevision: string;
  candidates: Array<{
    canonicalId: string;
    packetKey: string;
    symbolVersionId?: string | null;
    sourceRef: string;
    workspaceRevision: string;
    sourceRevision: string;
    graphRevision: string;
    featureRevision: string;
    representationRevision: string;
    taskKind: string;
    domainClass?: string | null;
    somRevision?: string | null;
    features: QueryAdaptiveFeatureRowV1['features'];
    logicalLanes?: string[];
    fusedRank?: number | null;
    rerankScore?: number | null;
    evidenceRefs?: string[];
  }>;
}): QueryAdaptiveFeatureRowV1[] {
  return input.candidates.map((candidate) => QueryAdaptiveFeatureRowV1Schema.parse({
    schema: 'atlas.qas.candidate-feature.v1',
    requestId: input.requestId,
    canonicalId: candidate.canonicalId,
    packetKey: candidate.packetKey,
    symbolVersionId: candidate.symbolVersionId ?? null,
    sourceRef: candidate.sourceRef,
    workspaceRevision: candidate.workspaceRevision,
    sourceRevision: candidate.sourceRevision,
    graphRevision: candidate.graphRevision,
    featureRevision: candidate.featureRevision,
    representationRevision: candidate.representationRevision,
    policyRevision: input.policyRevision,
    taskKind: candidate.taskKind,
    domainClass: candidate.domainClass ?? null,
    somRevision: candidate.somRevision ?? null,
    features: candidate.features,
    logicalLanes: candidate.logicalLanes ?? [],
    fusedRank: candidate.fusedRank ?? null,
    rerankScore: candidate.rerankScore ?? null,
    evidenceRefs: candidate.evidenceRefs ?? [],
  }));
}

/**
 * Bridge the existing query-time 25-column feature owner into QAS. The row
 * already contains the required execution/process/domain/reuse dimensions;
 * identity and graph/task lineage remain explicit inputs because the matrix
 * contract intentionally does not own canonical symbol identity.
 */
export function adaptCandidateFeatureMatrixRowToQas(input: {
  requestId: string;
  policyRevision: string;
  graphRevision: string;
  taskKind: string;
  domainClass?: string | null;
  somRevision?: string | null;
  row: CandidateFeatureMatrixRowV1;
  canonicalId: string;
  symbolVersionId?: string | null;
  logicalLanes?: string[];
  fusedRank?: number | null;
  rerankScore?: number | null;
  evidenceRefs?: string[];
}): QueryAdaptiveFeatureRowV1 {
  return compileQasCandidateFeatures({
    requestId: input.requestId,
    policyRevision: input.policyRevision,
    candidates: [{
      canonicalId: input.canonicalId,
      packetKey: input.row.candidate_packet_key,
      symbolVersionId: input.symbolVersionId ?? null,
      sourceRef: input.row.source_ref,
      workspaceRevision: input.row.workspace_revision,
      sourceRevision: input.row.source_revision,
      graphRevision: input.graphRevision,
      featureRevision: input.row.feature_revision,
      representationRevision: input.row.representation_revision,
      taskKind: input.taskKind,
      domainClass: input.domainClass ?? null,
      somRevision: input.somRevision ?? null,
      features: {
        semanticAffinity: input.row.semantic_similarity_768,
        lexicalAffinity: input.row.lexical_score,
        graphAuthority: input.row.authority_norm,
        astAffinity: input.row.ast_signal,
        processAffinity: input.row.process_fit,
        domainAffinity: input.row.domain_fit_query,
        priorExecutionSuccess: input.row.execution_utility,
        reuseProbability: input.row.retrieval_frequency,
        recency: input.row.recency,
        memoryCost: undefined,
        promotionCost: undefined,
      },
      logicalLanes: input.logicalLanes,
      fusedRank: input.fusedRank,
      rerankScore: input.rerankScore,
      evidenceRefs: input.evidenceRefs ?? [input.row.source_ref],
    }],
  })[0];
}

export function toQasSamplerCandidates(rows: QueryAdaptiveFeatureRowV1[]): QueryAdaptiveCandidate[] {
  return rows.map((row) => {
    for (const name of QAS_CORE_FEATURE_NAMES) {
      if (!Number.isFinite(row.features[name])) throw new Error(`invalid QAS feature ${name}`);
    }
    return {
      packetKey: row.packetKey,
      sourceRef: row.sourceRef,
      symbolVersionId: row.symbolVersionId,
      workspaceRevision: row.workspaceRevision,
      sourceRevision: row.sourceRevision,
      representationRevision: row.representationRevision,
      featureRevision: row.featureRevision,
      features: row.features,
    };
  });
}
