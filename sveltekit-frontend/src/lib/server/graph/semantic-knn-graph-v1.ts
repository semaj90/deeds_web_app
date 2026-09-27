export interface SemanticKnnGraphV1 {
  schema: 'atlas.semantic-knn-graph.v1';
  nodeCount: number;
  dimension: number;
  k: number;
  minSimilarity: number;
  symmetric: boolean;
  adjacency: Float32Array;
  directedEdgeCount: number;
  undirectedEdgeCount: number;
  density: number;
  canonicalAuthority: false;
}

function assertVectors(vectors: readonly Float32Array[]): number {
  if (vectors.length === 0) return 0;
  const dim = vectors[0]?.length ?? 0;
  if (dim <= 0) throw new Error('SEMANTIC_KNN_EMPTY_DIMENSION');
  for (let i = 0; i < vectors.length; i++) {
    if (!(vectors[i] instanceof Float32Array)) {
      throw new Error(`SEMANTIC_KNN_VECTOR_NOT_FLOAT32:${i}`);
    }
    if (vectors[i].length !== dim) {
      throw new Error(`SEMANTIC_KNN_DIMENSION_MISMATCH:${i}`);
    }
  }
  return dim;
}

export function flattenEmbeddingMatrixV1(
  vectors: readonly Float32Array[],
): Float32Array {
  const dim = assertVectors(vectors);
  if (vectors.length === 0) return new Float32Array(0);
  const flat = new Float32Array(vectors.length * dim);
  for (let i = 0; i < vectors.length; i++) flat.set(vectors[i], i * dim);
  return flat;
}

function l2Norm(vector: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < vector.length; i++) sum += vector[i] * vector[i];
  return Math.sqrt(sum);
}

function cosineFromNorms(
  a: Float32Array,
  b: Float32Array,
  normA: number,
  normB: number,
): number {
  if (!(normA > 0) || !(normB > 0)) return 0;
  let dot = 0;
  for (let i = 0; i < a.length; i++) dot += a[i] * b[i];
  return dot / (normA * normB);
}

/**
 * Builds a deterministic weighted semantic k-NN graph from embeddings.
 *
 * This is a derived retrieval/topology artifact only. It is not the canonical
 * code dependency graph and must never mint packet/source identity.
 */
export function buildSemanticKnnGraphV1(
  vectors: readonly Float32Array[],
  options: {
    k?: number;
    minSimilarity?: number;
    symmetric?: boolean;
  } = {},
): SemanticKnnGraphV1 {
  const n = vectors.length;
  const dim = assertVectors(vectors);
  if (n === 0) {
    return {
      schema: 'atlas.semantic-knn-graph.v1',
      nodeCount: 0,
      dimension: 0,
      k: 0,
      minSimilarity: options.minSimilarity ?? 0,
      symmetric: options.symmetric ?? true,
      adjacency: new Float32Array(0),
      directedEdgeCount: 0,
      undirectedEdgeCount: 0,
      density: 0,
      canonicalAuthority: false,
    };
  }

  const k = Math.max(0, Math.min(Math.trunc(options.k ?? 8), n - 1));
  const minSimilarity = Number.isFinite(options.minSimilarity)
    ? Number(options.minSimilarity)
    : 0;
  const symmetric = options.symmetric ?? true;
  const adjacency = new Float32Array(n * n);
  const norms = vectors.map(l2Norm);

  for (let i = 0; i < n; i++) {
    const candidates: Array<{ j: number; similarity: number }> = [];
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const similarity = cosineFromNorms(vectors[i], vectors[j], norms[i], norms[j]);
      if (!Number.isFinite(similarity) || similarity < minSimilarity) continue;
      candidates.push({ j, similarity });
    }

    candidates.sort((a, b) => {
      const delta = b.similarity - a.similarity;
      return Math.abs(delta) > 1e-12 ? delta : a.j - b.j;
    });

    for (const candidate of candidates.slice(0, k)) {
      adjacency[i * n + candidate.j] = candidate.similarity;
    }
  }

  if (symmetric) {
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const weight = Math.max(adjacency[i * n + j], adjacency[j * n + i]);
        adjacency[i * n + j] = weight;
        adjacency[j * n + i] = weight;
      }
    }
  }

  let directedEdgeCount = 0;
  let undirectedEdgeCount = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i !== j && adjacency[i * n + j] > 0) directedEdgeCount++;
    }
    for (let j = i + 1; j < n; j++) {
      if (adjacency[i * n + j] > 0 || adjacency[j * n + i] > 0) undirectedEdgeCount++;
    }
  }

  const possibleDirected = n > 1 ? n * (n - 1) : 0;
  return {
    schema: 'atlas.semantic-knn-graph.v1',
    nodeCount: n,
    dimension: dim,
    k,
    minSimilarity,
    symmetric,
    adjacency,
    directedEdgeCount,
    undirectedEdgeCount,
    density: possibleDirected ? directedEdgeCount / possibleDirected : 0,
    canonicalAuthority: false,
  };
}

/** CPU PageRank oracle used to validate GPU results on the exact same matrix. */
export function pageRankCpuOracleV1(
  adjacency: Float32Array,
  n: number,
  damping = 0.85,
  iterations = 50,
): Float32Array {
  if (adjacency.length !== n * n) throw new Error('PAGERANK_ADJACENCY_SHAPE_MISMATCH');
  if (n === 0) return new Float32Array(0);

  const ranks = new Float64Array(n);
  ranks.fill(1 / n);
  const rowSums = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    let sum = 0;
    for (let j = 0; j < n; j++) sum += adjacency[i * n + j];
    rowSums[i] = sum;
  }

  for (let iteration = 0; iteration < iterations; iteration++) {
    const next = new Float64Array(n);
    let danglingMass = 0;
    for (let i = 0; i < n; i++) {
      if (rowSums[i] <= 1e-12) danglingMass += ranks[i];
    }
    const base = (1 - damping) / n + (damping * danglingMass) / n;
    next.fill(base);

    for (let from = 0; from < n; from++) {
      const denom = rowSums[from];
      if (denom <= 1e-12) continue;
      const scale = damping * ranks[from] / denom;
      for (let to = 0; to < n; to++) {
        const weight = adjacency[from * n + to];
        if (weight > 0) next[to] += scale * weight;
      }
    }
    ranks.set(next);
  }

  let total = 0;
  for (let i = 0; i < n; i++) total += ranks[i];
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = total > 0 ? ranks[i] / total : 0;
  return out;
}

export function connectedComponentsFromAdjacencyV1(
  adjacency: Float32Array,
  n: number,
): Int32Array {
  if (adjacency.length !== n * n) throw new Error('COMPONENT_ADJACENCY_SHAPE_MISMATCH');
  const component = new Int32Array(n);
  component.fill(-1);
  let componentId = 0;

  for (let start = 0; start < n; start++) {
    if (component[start] !== -1) continue;
    const queue = [start];
    component[start] = componentId;
    for (let q = 0; q < queue.length; q++) {
      const node = queue[q];
      for (let other = 0; other < n; other++) {
        if (node === other || component[other] !== -1) continue;
        if (adjacency[node * n + other] > 0 || adjacency[other * n + node] > 0) {
          component[other] = componentId;
          queue.push(other);
        }
      }
    }
    componentId++;
  }
  return component;
}

export function maxAbsDifferenceV1(a: ArrayLike<number>, b: ArrayLike<number>): number {
  if (a.length !== b.length) throw new Error('ARRAY_LENGTH_MISMATCH');
  let max = 0;
  for (let i = 0; i < a.length; i++) max = Math.max(max, Math.abs(a[i] - b[i]));
  return max;
}
