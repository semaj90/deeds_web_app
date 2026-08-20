import { z } from 'zod';
import type { CandidateProjectionInput } from '$lib/server/retrieval/retrieval-candidate-feature-matrix-v1.js';
import type { SpectralNodeRowV1 } from '../spectral/spectral-multihop-contracts.js';
import type { SGraphV1 } from '../graph/s-graph-taxonomy.js';
import {
  mergeSGraphProjection,
  projectSGraphCandidateFeatures,
  type SGraphCandidateProjectionReceiptV1,
} from '../graph/s-graph-candidate-projection.js';
import {
  planNeuralExecution,
  RuntimeResourceStateV1Schema,
  type NeuralExecutionPlanV1,
  type NeuralWorkload,
  type RuntimeResourceStateV1,
} from '../neural/neural-execution-policy.js';
import {
  buildSearchRuntimeQasRows,
  toQasSamplerCandidates,
  type QueryAdaptiveFeatureRowV1,
  type SearchRuntimeQasCandidate,
  type SearchRuntimeQasFeatureResolver,
} from './query-adaptive-feature-compiler.js';

export const QasNeuralExecutionReceiptV1Schema = z.object({
  schema: z.literal('atlas.qas-neural-execution.v1'),
  requestId: z.string().min(1),
  workspaceRevision: z.string().min(1),
  representationRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  logicalLanes: z.array(z.string().min(1)).min(1).max(16),
  candidateCount: z.number().int().nonnegative(),
  acceptedCount: z.number().int().nonnegative(),
  rejectedCount: z.number().int().nonnegative(),
  matrixFeatureCount: z.literal(25),
  graphProjectionSchema: z.literal('atlas.s-graph-candidate-projection.v1'),
  neuralPlanSchema: z.literal('atlas.neural-execution-plan.v1'),
  canonicalWrites: z.literal(false),
  exactPromotionRequired: z.literal(true),
  producerRevision: z.string().min(1),
}).strict();
export type QasNeuralExecutionReceiptV1 = z.infer<typeof QasNeuralExecutionReceiptV1Schema>;

export interface QasNeuralExecutionBridgeInput {
  requestId: string;
  policyRevision: string;
  producerRevision: string;
  workspaceRevision: string;
  representationRevision: string;
  graph: SGraphV1;
  spectralRows?: readonly SpectralNodeRowV1[];
  seedCanonicalIds: readonly string[];
  maxGraphHops?: number;
  candidates: SearchRuntimeQasCandidate[];
  /** Existing query-time 25-column producer output, one row per candidate. */
  baseProjections: CandidateProjectionInput[];
  resolveFeatures: SearchRuntimeQasFeatureResolver;
  resource: RuntimeResourceStateV1;
  workload?: NeuralWorkload;
}

export interface QasNeuralExecutionBridgeResult {
  rows: QueryAdaptiveFeatureRowV1[];
  samplerCandidates: ReturnType<typeof toQasSamplerCandidates>;
  rejected: ReturnType<typeof buildSearchRuntimeQasRows>['rejected'];
  projections: CandidateProjectionInput[];
  graphProjectionReceipt: SGraphCandidateProjectionReceiptV1;
  neuralExecutionPlan: NeuralExecutionPlanV1;
  receipt: QasNeuralExecutionReceiptV1;
}

function canonicalIdFor(candidate: SearchRuntimeQasCandidate): string | null {
  return candidate.stableSymbolId?.trim() || null;
}

function addLogicalLane(row: QueryAdaptiveFeatureRowV1, lane: string): QueryAdaptiveFeatureRowV1 {
  const logicalLanes = [...new Set([...row.logicalLanes, lane])].filter((value) => value !== 'qas').sort();
  return { ...row, logicalLanes };
}

/**
 * Compose the existing owners without inventing a second retrieval or ranking
 * pipeline:
 *
 * SGraphV1 (representation)
 *   -> bounded K-hop/PageRank/degree features (algorithms)
 *   -> merge graph-owned columns into CandidateFeatureMatrix inputs
 *   -> existing QAS row producer
 *   -> resource-gated neural executor plan
 *
 * The graph algorithms do not become extra logical lanes and the executor does
 * not get an RRF vote. Exact promotion remains mandatory after QAS sampling.
 */
export function buildQasNeuralExecutionBridge(
  input: QasNeuralExecutionBridgeInput,
): QasNeuralExecutionBridgeResult {
  if (input.candidates.length !== input.baseProjections.length) {
    throw new Error('QAS neural bridge requires one base projection per candidate');
  }

  const resource = RuntimeResourceStateV1Schema.parse(input.resource);
  const graphProjection = projectSGraphCandidateFeatures({
    graph: input.graph,
    spectralRows: input.spectralRows,
    seedCanonicalIds: input.seedCanonicalIds,
    maxHops: input.maxGraphHops,
    producerRevision: input.producerRevision,
  });

  if (graphProjection.receipt.workspaceRevision !== input.workspaceRevision) {
    throw new Error('SGraph workspace revision does not match QAS request');
  }

  const projections = input.baseProjections.map((base, index) => {
    const candidate = input.candidates[index];
    if (base.packet_key !== candidate.packetKey) {
      throw new Error(`candidate/projection identity mismatch at index ${index}`);
    }
    const canonicalId = canonicalIdFor(candidate);
    return mergeSGraphProjection(
      base,
      canonicalId ? graphProjection.byCanonicalId.get(canonicalId) : undefined,
    );
  });

  const qas = buildSearchRuntimeQasRows({
    requestId: input.requestId,
    policyRevision: input.policyRevision,
    workspaceRevision: input.workspaceRevision,
    representationRevision: input.representationRevision,
    candidates: input.candidates,
    projections,
    resolveFeatures: input.resolveFeatures,
  });

  const rows = qas.rows.map((row) => graphProjection.graphMatchedCanonicalIds.has(row.canonicalId)
    ? addLogicalLane(row, 'graph')
    : row);

  const neuralExecutionPlan = planNeuralExecution({
    workload: input.workload ?? 'POINTWISE_RERANK',
    resource,
  });

  const logicalLaneSet = new Set<string>();
  for (const row of rows) {
    for (const lane of row.logicalLanes) logicalLaneSet.add(lane);
  }
  // QAS itself is a routing/sampling policy, not a retrieval lane.
  logicalLaneSet.delete('qas');

  const logicalLanes = [...logicalLaneSet].sort();
  if (logicalLanes.length === 0 && graphProjection.graphMatchedCanonicalIds.size > 0) logicalLanes.push('graph');
  if (logicalLanes.length === 0) logicalLanes.push('unattributed');

  return {
    rows,
    samplerCandidates: toQasSamplerCandidates(rows),
    rejected: qas.rejected,
    projections,
    graphProjectionReceipt: graphProjection.receipt,
    neuralExecutionPlan,
    receipt: QasNeuralExecutionReceiptV1Schema.parse({
      schema: 'atlas.qas-neural-execution.v1',
      requestId: input.requestId,
      workspaceRevision: input.workspaceRevision,
      representationRevision: input.representationRevision,
      graphRevision: graphProjection.receipt.graphRevision,
      logicalLanes,
      candidateCount: input.candidates.length,
      acceptedCount: rows.length,
      rejectedCount: qas.rejected.length,
      matrixFeatureCount: 25,
      graphProjectionSchema: 'atlas.s-graph-candidate-projection.v1',
      neuralPlanSchema: 'atlas.neural-execution-plan.v1',
      canonicalWrites: false,
      exactPromotionRequired: true,
      producerRevision: input.producerRevision,
    }),
  };
}
