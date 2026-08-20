import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { GraphProjectionManifestV1 } from './graph-projection-manifest.js';
import {
  LandmarkDistanceSnapshotV1Schema,
  type AltDistanceValueType,
  type LandmarkDistanceArtifactRefV1,
  type LandmarkDistanceSnapshotV1,
} from './alt-landmark-contracts.js';
import {
  SGraphV1Schema,
  transposeSGraph,
  type SGraphEdgeKind,
  type SGraphV1,
} from './s-graph-taxonomy.js';

export const LandmarkSelectionStrategySchema = z.enum([
  'EXPLICIT',
  'FARTHEST_GRAPH_DISTANCE',
]);
export type LandmarkSelectionStrategy = z.infer<typeof LandmarkSelectionStrategySchema>;

export const LandmarkPrecomputeReceiptV1Schema = z.object({
  schema: z.literal('atlas.landmark-precompute-receipt.v1'),
  workspaceRevision: z.string().min(1),
  graphRevision: z.string().min(1),
  projectionRevision: z.string().min(1),
  nodeOrdinalRevision: z.string().min(1),
  landmarkRevision: z.string().min(1),
  costModelRevision: z.string().min(1),
  edgeCostChecksumSha256: z.string().regex(/^[a-f0-9]{64}$/),
  selectionStrategy: LandmarkSelectionStrategySchema,
  selectedCanonicalIds: z.array(z.string().min(1)).min(1).max(256),
  directed: z.boolean(),
  weighted: z.boolean(),
  precomputeAlgorithm: z.enum(['BFS', 'DIJKSTRA']),
  executor: z.literal('TYPESCRIPT_REFERENCE'),
  forwardRunCount: z.number().int().positive(),
  reverseRunCount: z.number().int().nonnegative(),
  unreachableForwardCount: z.number().int().nonnegative(),
  unreachableReverseCount: z.number().int().nonnegative(),
  canonicalWrites: z.literal(false),
  producerRevision: z.string().min(1),
}).strict();
export type LandmarkPrecomputeReceiptV1 = z.infer<typeof LandmarkPrecomputeReceiptV1Schema>;

export interface LandmarkPrecomputeInput {
  graph: SGraphV1;
  projection: GraphProjectionManifestV1;
  landmarkRevision: string;
  costModelRevision: string;
  producerRevision: string;
  landmarkCount: number;
  selectionStrategy: LandmarkSelectionStrategy;
  explicitLandmarkCanonicalIds?: readonly string[];
  /** Required for weighted reference precompute. Missing kinds default to 1. */
  edgeCostsByKind?: Partial<Record<SGraphEdgeKind, number>>;
}

export interface PackedLandmarkArtifact {
  ref: LandmarkDistanceArtifactRefV1;
  bytes: Uint8Array;
}

export interface LandmarkPrecomputeResult {
  nodeOrdinals: readonly string[];
  nodeOrdinalByCanonicalId: ReadonlyMap<string, number>;
  forward: PackedLandmarkArtifact;
  reverse: PackedLandmarkArtifact | null;
  snapshot: LandmarkDistanceSnapshotV1;
  receipt: LandmarkPrecomputeReceiptV1;
}

interface WeightedEdge {
  target: string;
  cost: number;
}

const sha256 = (bytes: Uint8Array | string): string => createHash('sha256').update(bytes).digest('hex');

function assertProjectionMatches(graph: SGraphV1, projection: GraphProjectionManifestV1): void {
  if (projection.workspaceRevision !== graph.workspaceRevision) {
    throw new Error('ALT projection workspace revision does not match SGraph');
  }
  if (projection.graphRevision !== graph.graphRevision) {
    throw new Error('ALT projection graph revision does not match SGraph');
  }
  if (projection.nodeCount !== graph.nodes.length || projection.edgeCount !== graph.edges.length) {
    throw new Error('ALT projection node/edge counts do not match SGraph reference representation');
  }
  if (projection.negativeWeightsPresent) {
    throw new Error('ALT reference precompute requires non-negative edge costs');
  }
  if (projection.symmetrized && projection.directed) {
    throw new Error('symmetrized projection cannot retain directed ALT semantics');
  }
}

function canonicalNodeOrdinals(graph: SGraphV1): {
  nodeOrdinals: string[];
  nodeOrdinalByCanonicalId: Map<string, number>;
  nodeIdByCanonicalId: Map<string, string>;
  canonicalIdByNodeId: Map<string, string>;
  revision: string;
} {
  const sorted = [...graph.nodes].sort((a, b) =>
    a.canonicalId.localeCompare(b.canonicalId) || a.id.localeCompare(b.id));
  const nodeOrdinals = sorted.map((node) => node.canonicalId);
  const nodeOrdinalByCanonicalId = new Map<string, number>();
  const nodeIdByCanonicalId = new Map<string, string>();
  const canonicalIdByNodeId = new Map<string, string>();
  sorted.forEach((node, ordinal) => {
    if (nodeOrdinalByCanonicalId.has(node.canonicalId)) {
      throw new Error(`duplicate canonicalId cannot receive an ALT ordinal: ${node.canonicalId}`);
    }
    nodeOrdinalByCanonicalId.set(node.canonicalId, ordinal);
    nodeIdByCanonicalId.set(node.canonicalId, node.id);
    canonicalIdByNodeId.set(node.id, node.canonicalId);
  });
  const revision = sha256(JSON.stringify({
    graphRevision: graph.graphRevision,
    nodeOrdinals,
  }));
  return { nodeOrdinals, nodeOrdinalByCanonicalId, nodeIdByCanonicalId, canonicalIdByNodeId, revision };
}

function normalizedCostModel(input: LandmarkPrecomputeInput): {
  weighted: boolean;
  edgeCostByKind: Record<SGraphEdgeKind, number>;
  checksum: string;
} {
  const edgeKinds = [...new Set(input.graph.edges.map((edge) => edge.kind))].sort();
  const pairs = edgeKinds.map((kind) => {
    const cost = input.projection.weighted ? (input.edgeCostsByKind?.[kind] ?? 1) : 1;
    if (!Number.isFinite(cost) || cost < 0) throw new Error(`invalid non-negative edge cost for ${kind}`);
    return [kind, cost] as const;
  });
  const edgeCostByKind = Object.fromEntries(pairs) as Record<SGraphEdgeKind, number>;
  return {
    weighted: input.projection.weighted,
    edgeCostByKind,
    checksum: sha256(JSON.stringify({
      costModelRevision: input.costModelRevision,
      weighted: input.projection.weighted,
      pairs,
    })),
  };
}

function adjacency(
  graph: SGraphV1,
  edgeCostByKind: Record<SGraphEdgeKind, number>,
): Map<string, WeightedEdge[]> {
  const out = new Map<string, WeightedEdge[]>();
  for (const node of graph.nodes) out.set(node.id, []);
  for (const edge of graph.edges) {
    if (!out.has(edge.source) || !out.has(edge.target)) {
      throw new Error(`ALT edge references missing node: ${edge.source} -> ${edge.target}`);
    }
    out.get(edge.source)?.push({ target: edge.target, cost: edgeCostByKind[edge.kind] ?? 1 });
  }
  for (const [nodeId, edges] of out) {
    out.set(nodeId, edges.sort((a, b) => a.target.localeCompare(b.target) || a.cost - b.cost));
  }
  return out;
}

function bfsDistances(sourceId: string, out: Map<string, WeightedEdge[]>): Map<string, number> {
  const distance = new Map<string, number>([[sourceId, 0]]);
  const queue = [sourceId];
  for (let cursor = 0; cursor < queue.length; cursor += 1) {
    const nodeId = queue[cursor];
    const nextDistance = (distance.get(nodeId) ?? 0) + 1;
    for (const edge of out.get(nodeId) ?? []) {
      if (distance.has(edge.target)) continue;
      distance.set(edge.target, nextDistance);
      queue.push(edge.target);
    }
  }
  return distance;
}

function dijkstraDistances(sourceId: string, out: Map<string, WeightedEdge[]>): Map<string, number> {
  const distance = new Map<string, number>([[sourceId, 0]]);
  const settled = new Set<string>();
  const frontier: Array<{ nodeId: string; distance: number }> = [{ nodeId: sourceId, distance: 0 }];

  while (frontier.length > 0) {
    frontier.sort((a, b) => a.distance - b.distance || a.nodeId.localeCompare(b.nodeId));
    const current = frontier.shift();
    if (!current || settled.has(current.nodeId)) continue;
    settled.add(current.nodeId);
    const known = distance.get(current.nodeId);
    if (known === undefined || current.distance > known) continue;

    for (const edge of out.get(current.nodeId) ?? []) {
      const candidate = current.distance + edge.cost;
      const previous = distance.get(edge.target);
      if (previous === undefined || candidate < previous) {
        distance.set(edge.target, candidate);
        frontier.push({ nodeId: edge.target, distance: candidate });
      }
    }
  }
  return distance;
}

function allDistances(
  sourceId: string,
  out: Map<string, WeightedEdge[]>,
  weighted: boolean,
): Map<string, number> {
  return weighted ? dijkstraDistances(sourceId, out) : bfsDistances(sourceId, out);
}

function selectLandmarks(input: {
  graph: SGraphV1;
  landmarkCount: number;
  strategy: LandmarkSelectionStrategy;
  explicit?: readonly string[];
  out: Map<string, WeightedEdge[]>;
  weighted: boolean;
  nodeIdByCanonicalId: Map<string, string>;
  canonicalIdByNodeId: Map<string, string>;
}): string[] {
  const canonicalIds = [...input.nodeIdByCanonicalId.keys()].sort();
  if (input.landmarkCount < 1 || input.landmarkCount > Math.min(256, canonicalIds.length)) {
    throw new Error('landmarkCount must be between 1 and min(256, nodeCount)');
  }

  if (input.strategy === 'EXPLICIT') {
    const explicit = [...new Set(input.explicit ?? [])];
    if (explicit.length !== input.landmarkCount) {
      throw new Error('EXPLICIT landmark selection requires exactly landmarkCount unique canonical IDs');
    }
    for (const canonicalId of explicit) {
      if (!input.nodeIdByCanonicalId.has(canonicalId)) {
        throw new Error(`explicit landmark is absent from graph: ${canonicalId}`);
      }
    }
    return explicit;
  }

  // Deterministic farthest-point reference. The first landmark is the first
  // canonical ID. Subsequent landmarks maximize minimum finite distance from
  // the selected set. Unreachable nodes sort ahead of finite candidates to
  // spread landmarks across weakly disconnected regions/components.
  const selected: string[] = [canonicalIds[0]];
  const selectedSet = new Set(selected);
  const distanceCaches = new Map<string, Map<string, number>>();

  while (selected.length < input.landmarkCount) {
    for (const landmark of selected) {
      if (distanceCaches.has(landmark)) continue;
      const nodeId = input.nodeIdByCanonicalId.get(landmark);
      if (!nodeId) throw new Error(`landmark node id missing: ${landmark}`);
      distanceCaches.set(landmark, allDistances(nodeId, input.out, input.weighted));
    }

    let best: string | null = null;
    let bestDisconnected = false;
    let bestMinDistance = Number.NEGATIVE_INFINITY;

    for (const candidate of canonicalIds) {
      if (selectedSet.has(candidate)) continue;
      const candidateNodeId = input.nodeIdByCanonicalId.get(candidate);
      if (!candidateNodeId) continue;
      let disconnected = false;
      let minimum = Number.POSITIVE_INFINITY;
      for (const landmark of selected) {
        const d = distanceCaches.get(landmark)?.get(candidateNodeId);
        if (d === undefined) {
          disconnected = true;
          minimum = Number.POSITIVE_INFINITY;
          break;
        }
        minimum = Math.min(minimum, d);
      }

      if (
        best === null
        || (disconnected && !bestDisconnected)
        || (disconnected === bestDisconnected && minimum > bestMinDistance)
        || (disconnected === bestDisconnected && minimum === bestMinDistance && candidate.localeCompare(best) < 0)
      ) {
        best = candidate;
        bestDisconnected = disconnected;
        bestMinDistance = minimum;
      }
    }

    if (!best) break;
    selected.push(best);
    selectedSet.add(best);
  }
  return selected;
}

function packUint32LandmarkMajor(input: {
  landmarks: readonly string[];
  nodeOrdinals: readonly string[];
  nodeIdByCanonicalId: Map<string, string>;
  canonicalIdByNodeId: Map<string, string>;
  out: Map<string, WeightedEdge[]>;
}): { bytes: Uint8Array; unreachableCount: number } {
  const unreachable = 0xffffffff;
  const values = new Uint32Array(input.landmarks.length * input.nodeOrdinals.length);
  values.fill(unreachable);
  let unreachableCount = 0;

  for (let landmarkIndex = 0; landmarkIndex < input.landmarks.length; landmarkIndex += 1) {
    const landmarkId = input.nodeIdByCanonicalId.get(input.landmarks[landmarkIndex]);
    if (!landmarkId) throw new Error('landmark id missing during BFS pack');
    const distances = bfsDistances(landmarkId, input.out);
    for (let nodeOrdinal = 0; nodeOrdinal < input.nodeOrdinals.length; nodeOrdinal += 1) {
      const canonicalId = input.nodeOrdinals[nodeOrdinal];
      const nodeId = input.nodeIdByCanonicalId.get(canonicalId);
      const distance = nodeId ? distances.get(nodeId) : undefined;
      const offset = landmarkIndex * input.nodeOrdinals.length + nodeOrdinal;
      if (distance === undefined) {
        unreachableCount += 1;
        continue;
      }
      if (!Number.isSafeInteger(distance) || distance < 0 || distance >= unreachable) {
        throw new Error('UINT32_HOPS overflow; choose a wider exact distance representation');
      }
      values[offset] = distance;
    }
  }
  return { bytes: new Uint8Array(values.buffer), unreachableCount };
}

function packFloat64LandmarkMajor(input: {
  landmarks: readonly string[];
  nodeOrdinals: readonly string[];
  nodeIdByCanonicalId: Map<string, string>;
  out: Map<string, WeightedEdge[]>;
}): { bytes: Uint8Array; unreachableCount: number } {
  const values = new Float64Array(input.landmarks.length * input.nodeOrdinals.length);
  values.fill(Number.POSITIVE_INFINITY);
  let unreachableCount = 0;

  for (let landmarkIndex = 0; landmarkIndex < input.landmarks.length; landmarkIndex += 1) {
    const landmarkId = input.nodeIdByCanonicalId.get(input.landmarks[landmarkIndex]);
    if (!landmarkId) throw new Error('landmark id missing during Dijkstra pack');
    const distances = dijkstraDistances(landmarkId, input.out);
    for (let nodeOrdinal = 0; nodeOrdinal < input.nodeOrdinals.length; nodeOrdinal += 1) {
      const canonicalId = input.nodeOrdinals[nodeOrdinal];
      const nodeId = input.nodeIdByCanonicalId.get(canonicalId);
      const distance = nodeId ? distances.get(nodeId) : undefined;
      const offset = landmarkIndex * input.nodeOrdinals.length + nodeOrdinal;
      if (distance === undefined) {
        unreachableCount += 1;
        continue;
      }
      values[offset] = distance;
    }
  }
  return { bytes: new Uint8Array(values.buffer), unreachableCount };
}

function artifactRef(input: {
  artifactId: string;
  bytes: Uint8Array;
  rows: number;
  cols: number;
  valueType: AltDistanceValueType;
}): LandmarkDistanceArtifactRefV1 {
  return {
    artifactId: input.artifactId,
    checksumSha256: sha256(input.bytes),
    rows: input.rows,
    cols: input.cols,
    valueType: input.valueType,
    layout: 'LANDMARK_MAJOR',
    byteLength: input.bytes.byteLength,
  };
}

/**
 * Build a deterministic CPU reference landmark snapshot.
 *
 * Unweighted graphs use exact UINT32 hop counts. Weighted reference graphs use
 * FLOAT64 Dijkstra distances and are marked AUTHORITATIVE_FLOAT with no
 * automatic exact-search claim until a floating error policy is certified.
 * This avoids silently treating ordinary floating arithmetic as a proof of an
 * admissible lower bound across different executors/architectures.
 */
export function precomputeAltLandmarks(input: LandmarkPrecomputeInput): LandmarkPrecomputeResult {
  const graph = SGraphV1Schema.parse(input.graph);
  assertProjectionMatches(graph, input.projection);
  const ordinals = canonicalNodeOrdinals(graph);
  const costModel = normalizedCostModel(input);
  const out = adjacency(graph, costModel.edgeCostByKind);

  const landmarks = selectLandmarks({
    graph,
    landmarkCount: input.landmarkCount,
    strategy: input.selectionStrategy,
    explicit: input.explicitLandmarkCanonicalIds,
    out,
    weighted: costModel.weighted,
    nodeIdByCanonicalId: ordinals.nodeIdByCanonicalId,
    canonicalIdByNodeId: ordinals.canonicalIdByNodeId,
  });

  const valueType: AltDistanceValueType = input.projection.weighted ? 'FLOAT64_COST' : 'UINT32_HOPS';
  const forwardPacked = input.projection.weighted
    ? packFloat64LandmarkMajor({ landmarks, nodeOrdinals: ordinals.nodeOrdinals, nodeIdByCanonicalId: ordinals.nodeIdByCanonicalId, out })
    : packUint32LandmarkMajor({
        landmarks,
        nodeOrdinals: ordinals.nodeOrdinals,
        nodeIdByCanonicalId: ordinals.nodeIdByCanonicalId,
        canonicalIdByNodeId: ordinals.canonicalIdByNodeId,
        out,
      });

  let reversePacked: { bytes: Uint8Array; unreachableCount: number } | null = null;
  if (input.projection.directed) {
    const transposed = transposeSGraph(graph);
    const reverseOut = adjacency(transposed, costModel.edgeCostByKind);
    reversePacked = input.projection.weighted
      ? packFloat64LandmarkMajor({ landmarks, nodeOrdinals: ordinals.nodeOrdinals, nodeIdByCanonicalId: ordinals.nodeIdByCanonicalId, out: reverseOut })
      : packUint32LandmarkMajor({
          landmarks,
          nodeOrdinals: ordinals.nodeOrdinals,
          nodeIdByCanonicalId: ordinals.nodeIdByCanonicalId,
          canonicalIdByNodeId: ordinals.canonicalIdByNodeId,
          out: reverseOut,
        });
  }

  const forwardRef = artifactRef({
    artifactId: `alt:${input.landmarkRevision}:forward`,
    bytes: forwardPacked.bytes,
    rows: landmarks.length,
    cols: ordinals.nodeOrdinals.length,
    valueType,
  });
  const reverseRef = reversePacked
    ? artifactRef({
        artifactId: `alt:${input.landmarkRevision}:reverse`,
        bytes: reversePacked.bytes,
        rows: landmarks.length,
        cols: ordinals.nodeOrdinals.length,
        valueType,
      })
    : null;

  const snapshot = LandmarkDistanceSnapshotV1Schema.parse({
    schema: 'atlas.landmark-distance-snapshot.v1',
    workspaceRevision: graph.workspaceRevision,
    graphRevision: graph.graphRevision,
    projectionRevision: input.projection.projectionRevision,
    nodeOrdinalRevision: ordinals.revision,
    landmarkRevision: input.landmarkRevision,
    costModelRevision: input.costModelRevision,
    edgeCostChecksumSha256: costModel.checksum,
    directed: input.projection.directed,
    weighted: input.projection.weighted,
    nonnegativeWeightsRequired: true,
    landmarkCanonicalIds: landmarks,
    landmarkCount: landmarks.length,
    nodeCount: graph.nodes.length,
    forwardDistances: forwardRef,
    reverseDistances: reverseRef,
    distanceValueType: valueType,
    distanceExactness: input.projection.weighted ? 'AUTHORITATIVE_FLOAT' : 'EXACT_INTEGER',
    distanceAbsoluteErrorBound: input.projection.weighted ? null : 0,
    floatingErrorBoundCertified: false,
    quantizedForExactSearch: false,
    precomputeExecutor: 'TYPESCRIPT_REFERENCE',
    unreachableSentinel: input.projection.weighted ? 'POSITIVE_INFINITY' : 'UINT_MAX',
    producerRevision: input.producerRevision,
  });

  return {
    nodeOrdinals: ordinals.nodeOrdinals,
    nodeOrdinalByCanonicalId: ordinals.nodeOrdinalByCanonicalId,
    forward: { ref: forwardRef, bytes: forwardPacked.bytes },
    reverse: reversePacked && reverseRef ? { ref: reverseRef, bytes: reversePacked.bytes } : null,
    snapshot,
    receipt: LandmarkPrecomputeReceiptV1Schema.parse({
      schema: 'atlas.landmark-precompute-receipt.v1',
      workspaceRevision: graph.workspaceRevision,
      graphRevision: graph.graphRevision,
      projectionRevision: input.projection.projectionRevision,
      nodeOrdinalRevision: ordinals.revision,
      landmarkRevision: input.landmarkRevision,
      costModelRevision: input.costModelRevision,
      edgeCostChecksumSha256: costModel.checksum,
      selectionStrategy: input.selectionStrategy,
      selectedCanonicalIds: landmarks,
      directed: input.projection.directed,
      weighted: input.projection.weighted,
      precomputeAlgorithm: input.projection.weighted ? 'DIJKSTRA' : 'BFS',
      executor: 'TYPESCRIPT_REFERENCE',
      forwardRunCount: landmarks.length,
      reverseRunCount: input.projection.directed ? landmarks.length : 0,
      unreachableForwardCount: forwardPacked.unreachableCount,
      unreachableReverseCount: reversePacked?.unreachableCount ?? 0,
      canonicalWrites: false,
      producerRevision: input.producerRevision,
    }),
  };
}

/**
 * Decode a reference artifact. UINT_MAX is converted to +Infinity here so the
 * ALT evaluator never accidentally subtracts the cuGraph/BFS-style sentinel.
 */
export function landmarkArtifactAccessor(input: {
  snapshot: LandmarkDistanceSnapshotV1;
  forwardBytes: Uint8Array;
  reverseBytes?: Uint8Array | null;
}): {
  forward(landmarkIndex: number, nodeOrdinal: number): number;
  reverse?(landmarkIndex: number, nodeOrdinal: number): number;
} {
  const snapshot = LandmarkDistanceSnapshotV1Schema.parse(input.snapshot);
  const width = snapshot.nodeCount;
  const offset = (landmarkIndex: number, nodeOrdinal: number): number => {
    if (landmarkIndex < 0 || landmarkIndex >= snapshot.landmarkCount) throw new Error('landmark index out of range');
    if (nodeOrdinal < 0 || nodeOrdinal >= snapshot.nodeCount) throw new Error('node ordinal out of range');
    return landmarkIndex * width + nodeOrdinal;
  };

  if (snapshot.distanceValueType === 'UINT32_HOPS') {
    const forward = new Uint32Array(input.forwardBytes.buffer, input.forwardBytes.byteOffset, input.forwardBytes.byteLength / 4);
    const reverse = input.reverseBytes
      ? new Uint32Array(input.reverseBytes.buffer, input.reverseBytes.byteOffset, input.reverseBytes.byteLength / 4)
      : null;
    const decode = (value: number): number => value === 0xffffffff ? Number.POSITIVE_INFINITY : value;
    return {
      forward: (landmarkIndex, nodeOrdinal) => decode(forward[offset(landmarkIndex, nodeOrdinal)]),
      ...(snapshot.directed
        ? { reverse: (landmarkIndex: number, nodeOrdinal: number) => {
            if (!reverse) throw new Error('directed ALT artifact is missing reverse bytes');
            return decode(reverse[offset(landmarkIndex, nodeOrdinal)]);
          } }
        : {}),
    };
  }

  if (snapshot.distanceValueType === 'FLOAT64_COST') {
    const forward = new Float64Array(input.forwardBytes.buffer, input.forwardBytes.byteOffset, input.forwardBytes.byteLength / 8);
    const reverse = input.reverseBytes
      ? new Float64Array(input.reverseBytes.buffer, input.reverseBytes.byteOffset, input.reverseBytes.byteLength / 8)
      : null;
    return {
      forward: (landmarkIndex, nodeOrdinal) => forward[offset(landmarkIndex, nodeOrdinal)],
      ...(snapshot.directed
        ? { reverse: (landmarkIndex: number, nodeOrdinal: number) => {
            if (!reverse) throw new Error('directed ALT artifact is missing reverse bytes');
            return reverse[offset(landmarkIndex, nodeOrdinal)];
          } }
        : {}),
    };
  }

  throw new Error(`reference accessor does not yet decode ${snapshot.distanceValueType}`);
}
