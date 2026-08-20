export interface BfsParityEdge {
  from: string;
  to: string;
  type?: string;
}

export interface BfsReferenceResultV1 {
  visited: string[];
  distanceByNode: Record<string, number>;
}

export interface BfsParityResultV1 {
  schemaVersion: 'atlas.bfs-parity.v1';
  status: 'PASS' | 'FAIL';
  missingFromExecutor: string[];
  unexpectedFromExecutor: string[];
  distanceMismatches: Array<{ nodeId: string; expected: number; actual: number | null }>;
}

/** Deterministic CPU reference for bounded unweighted BFS fixtures. */
export function referenceBfs(input: {
  seed: string;
  edges: readonly BfsParityEdge[];
  maxHops: number;
  direction?: 'out' | 'in' | 'both';
  edgeTypes?: readonly string[];
}): BfsReferenceResultV1 {
  const direction = input.direction ?? 'both';
  const allowedTypes = input.edgeTypes?.length ? new Set(input.edgeTypes) : null;
  const adjacency = new Map<string, Set<string>>();
  const add = (from: string, to: string) => {
    const neighbors = adjacency.get(from) ?? new Set<string>();
    neighbors.add(to);
    adjacency.set(from, neighbors);
  };
  for (const edge of input.edges) {
    if (allowedTypes && !allowedTypes.has(edge.type ?? 'RELATED')) continue;
    if (direction === 'out' || direction === 'both') add(edge.from, edge.to);
    if (direction === 'in' || direction === 'both') add(edge.to, edge.from);
  }

  const distances = new Map<string, number>([[input.seed, 0]]);
  const queue = [input.seed];
  for (let index = 0; index < queue.length; index += 1) {
    const current = queue[index]!;
    const distance = distances.get(current)!;
    if (distance >= Math.max(0, input.maxHops)) continue;
    for (const next of [...(adjacency.get(current) ?? [])].sort()) {
      if (distances.has(next)) continue;
      distances.set(next, distance + 1);
      queue.push(next);
    }
  }
  return {
    visited: [...distances.keys()].sort(),
    distanceByNode: Object.fromEntries([...distances.entries()].sort(([a], [b]) => a.localeCompare(b))),
  };
}

export function compareBfsParity(input: {
  oracle: BfsReferenceResultV1;
  executorDistanceByNode: Readonly<Record<string, number>>;
}): BfsParityResultV1 {
  const expected = new Set(input.oracle.visited);
  const actual = new Set(Object.keys(input.executorDistanceByNode));
  const missingFromExecutor = [...expected].filter((id) => !actual.has(id)).sort();
  const unexpectedFromExecutor = [...actual].filter((id) => !expected.has(id)).sort();
  const distanceMismatches = [...expected]
    .map((nodeId) => ({
      nodeId,
      expected: input.oracle.distanceByNode[nodeId]!,
      actual: input.executorDistanceByNode[nodeId] ?? null,
    }))
    .filter((entry) => entry.actual !== entry.expected)
    .sort((a, b) => a.nodeId.localeCompare(b.nodeId));
  return {
    schemaVersion: 'atlas.bfs-parity.v1',
    status: missingFromExecutor.length || unexpectedFromExecutor.length || distanceMismatches.length ? 'FAIL' : 'PASS',
    missingFromExecutor,
    unexpectedFromExecutor,
    distanceMismatches,
  };
}
