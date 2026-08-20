import {
  AStarHeuristicReceiptV1Schema,
  LandmarkDistanceSnapshotV1Schema,
  type AStarHeuristicReceiptV1,
  type LandmarkDistanceSnapshotV1,
} from './alt-landmark-contracts.js';

export interface AltDistanceAccessor {
  /** Distance from landmark L to node N in the canonical graph. */
  forward(landmarkIndex: number, nodeOrdinal: number): number;
  /** Distance from node N to landmark L. Required for directed ALT. */
  reverse?(landmarkIndex: number, nodeOrdinal: number): number;
}

export interface AltHeuristicEvaluationInput {
  requestId: string;
  snapshot: LandmarkDistanceSnapshotV1;
  accessor: AltDistanceAccessor;
  frontierOrdinals: readonly number[];
  targetOrdinal: number;
  executor?: AStarHeuristicReceiptV1['heuristicExecutor'];
  elapsedMicroseconds?: number | null;
  kernelRevision?: string | null;
  producerRevision: string;
}

export interface AltHeuristicEvaluationResult {
  heuristic: Float64Array;
  receipt: AStarHeuristicReceiptV1;
}

function finiteDistance(value: number): boolean {
  return Number.isFinite(value) && value >= 0;
}

function numericPolicy(snapshot: LandmarkDistanceSnapshotV1): {
  guard: number;
  admissibility: AStarHeuristicReceiptV1['admissibility'];
  mayTerminateExactSearch: boolean;
  mayClaimOptimality: boolean;
} {
  if (snapshot.distanceExactness === 'EXACT_INTEGER') {
    return {
      guard: 0,
      admissibility: 'PROVEN_LOWER_BOUND',
      mayTerminateExactSearch: true,
      mayClaimOptimality: true,
    };
  }

  if (snapshot.floatingErrorBoundCertified && snapshot.distanceAbsoluteErrorBound !== null) {
    // Every triangle term subtracts two independently stored distances. If each
    // is within epsilon of the true value, the raw difference can overestimate
    // the true difference by at most 2*epsilon. Subtracting that amount restores
    // a conservative lower bound before clamping at zero.
    return {
      guard: 2 * snapshot.distanceAbsoluteErrorBound,
      admissibility: 'PROVEN_LOWER_BOUND',
      mayTerminateExactSearch: true,
      mayClaimOptimality: true,
    };
  }

  return {
    guard: 0,
    admissibility: 'UNPROVEN_NUMERIC',
    mayTerminateExactSearch: false,
    mayClaimOptimality: false,
  };
}

/**
 * Exact undirected ALT lower bound:
 *   h(v,t) = max_l |d(l,t) - d(l,v)|
 *
 * Directed ALT lower bound:
 *   h(v,t) = max_l(0,
 *       d(l,t) - d(l,v),
 *       d(v,l) - d(t,l))
 *
 * Terms involving unreachable landmark/node pairs are skipped rather than
 * converted to zero. A landmark contributes only when both distances for the
 * corresponding triangle-inequality term are finite.
 *
 * Floating snapshots are exact-search authoritative only when their producer
 * supplies a certified absolute distance error epsilon. We then subtract
 * 2*epsilon from every difference term, restoring a conservative bound.
 */
export function evaluateAltLowerBound(input: AltHeuristicEvaluationInput): AltHeuristicEvaluationResult {
  const snapshot = LandmarkDistanceSnapshotV1Schema.parse(input.snapshot);
  if (!Number.isInteger(input.targetOrdinal) || input.targetOrdinal < 0 || input.targetOrdinal >= snapshot.nodeCount) {
    throw new Error('ALT targetOrdinal is outside landmark snapshot node range');
  }
  for (const ordinal of input.frontierOrdinals) {
    if (!Number.isInteger(ordinal) || ordinal < 0 || ordinal >= snapshot.nodeCount) {
      throw new Error(`ALT frontier ordinal ${ordinal} is outside landmark snapshot node range`);
    }
  }
  if (snapshot.directed && !input.accessor.reverse) {
    throw new Error('Directed ALT evaluation requires reverse-distance accessor');
  }

  const policy = numericPolicy(snapshot);
  const out = new Float64Array(input.frontierOrdinals.length);
  let unreachablePairCount = 0;
  let minimum = Number.POSITIVE_INFINITY;
  let maximum = Number.NEGATIVE_INFINITY;

  for (let frontierIndex = 0; frontierIndex < input.frontierOrdinals.length; frontierIndex += 1) {
    const nodeOrdinal = input.frontierOrdinals[frontierIndex];
    let best = 0;

    for (let landmarkIndex = 0; landmarkIndex < snapshot.landmarkCount; landmarkIndex += 1) {
      const landmarkToTarget = input.accessor.forward(landmarkIndex, input.targetOrdinal);
      const landmarkToNode = input.accessor.forward(landmarkIndex, nodeOrdinal);

      if (!snapshot.directed) {
        if (finiteDistance(landmarkToTarget) && finiteDistance(landmarkToNode)) {
          const raw = Math.abs(landmarkToTarget - landmarkToNode);
          best = Math.max(best, raw - policy.guard);
        } else {
          unreachablePairCount += 1;
        }
        continue;
      }

      if (finiteDistance(landmarkToTarget) && finiteDistance(landmarkToNode)) {
        const raw = landmarkToTarget - landmarkToNode;
        best = Math.max(best, raw - policy.guard);
      } else {
        unreachablePairCount += 1;
      }

      const nodeToLandmark = input.accessor.reverse?.(landmarkIndex, nodeOrdinal) ?? Number.POSITIVE_INFINITY;
      const targetToLandmark = input.accessor.reverse?.(landmarkIndex, input.targetOrdinal) ?? Number.POSITIVE_INFINITY;
      if (finiteDistance(nodeToLandmark) && finiteDistance(targetToLandmark)) {
        const raw = nodeToLandmark - targetToLandmark;
        best = Math.max(best, raw - policy.guard);
      } else {
        unreachablePairCount += 1;
      }
    }

    best = Math.max(0, best);
    out[frontierIndex] = best;
    minimum = Math.min(minimum, best);
    maximum = Math.max(maximum, best);
  }

  return {
    heuristic: out,
    receipt: AStarHeuristicReceiptV1Schema.parse({
      schema: 'atlas.a-star-heuristic-receipt.v1',
      requestId: input.requestId,
      workspaceRevision: snapshot.workspaceRevision,
      graphRevision: snapshot.graphRevision,
      algorithm: 'ALT',
      logicalLane: 'graph',
      landmarkRevision: snapshot.landmarkRevision,
      heuristicExecutor: input.executor ?? 'TYPESCRIPT_REFERENCE',
      admissibility: policy.admissibility,
      numericGuardApplied: policy.guard,
      mayTerminateExactSearch: policy.mayTerminateExactSearch,
      mayClaimOptimality: policy.mayClaimOptimality,
      frontierCount: input.frontierOrdinals.length,
      landmarkCount: snapshot.landmarkCount,
      heuristicMinimum: input.frontierOrdinals.length > 0 ? minimum : null,
      heuristicMaximum: input.frontierOrdinals.length > 0 ? maximum : null,
      unreachablePairCount,
      elapsedMicroseconds: input.elapsedMicroseconds ?? null,
      kernelRevision: input.kernelRevision ?? null,
      exactPromotionRequired: true,
      canonicalWrites: false,
      producerRevision: input.producerRevision,
    }),
  };
}

/**
 * Safe exact-search priority. Callers must only give termination authority to
 * a heuristic receipt whose mayTerminateExactSearch flag is true.
 */
export function altAStarPriority(pathCostG: number, admissibleLowerBoundH: number): number {
  if (!Number.isFinite(pathCostG) || pathCostG < 0) throw new Error('A* g cost must be finite and non-negative');
  if (!Number.isFinite(admissibleLowerBoundH) || admissibleLowerBoundH < 0) {
    throw new Error('ALT h lower bound must be finite and non-negative');
  }
  return pathCostG + admissibleLowerBoundH;
}

/** Stable secondary ordering that never changes the exact f=g+h termination criterion. */
export function compareExactThenAggressive(input: {
  left: { exactF: number; aggressiveH: number; canonicalId: string };
  right: { exactF: number; aggressiveH: number; canonicalId: string };
}): number {
  const exactDelta = input.left.exactF - input.right.exactF;
  if (Math.abs(exactDelta) > 1e-12) return exactDelta;
  const aggressiveDelta = input.left.aggressiveH - input.right.aggressiveH;
  if (Math.abs(aggressiveDelta) > 1e-12) return aggressiveDelta;
  return input.left.canonicalId.localeCompare(input.right.canonicalId);
}
