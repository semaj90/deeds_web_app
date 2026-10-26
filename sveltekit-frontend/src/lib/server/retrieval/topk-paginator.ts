/**
 * topk-paginator.ts — Memory-bounded Top-K extraction and pagination for Parent Atlas.
 *
 * Use Cases:
 * 1. Graph PageRank fanout: extract top-K highest-scoring authority nodes from large
 *    snapshots (e.g. 162K nodes) without allocating massive sort buffers or blowing context.
 * 2. Multi-lane candidate fusion: bounded merge and pagination across lexical, semantic,
 *    and AST candidate lists.
 * 3. Deterministic tie-breaking: strictly orders by SCORE_DESC_ORDINAL_ASC_ID_ASC to ensure
 *    absolute cross-language parity between TypeScript, Python CPU, and CUDA execution.
 */

export interface RankedCandidateV1 {
  canonicalId: string;
  candidateOrdinal: number;
  score: number;
  sourceRevision: string;
  evidenceRefs: string[];
}

export interface CanonicalTopKResultV1 {
  schema: 'atlas.topk.v1';
  totalCandidates: number;
  offset: number;
  k: number;
  hasMore: boolean;
  order: 'SCORE_DESC_ORDINAL_ASC_ID_ASC';
  candidates: RankedCandidateV1[];
}

export interface ScoredCandidate<T = unknown> {
  id: string;
  score: number;
  candidateOrdinal?: number;
  data?: T;
}

export interface TopKPageResult<T = unknown> {
  items: ScoredCandidate<T>[];
  totalCandidates: number;
  k: number;
  offset: number;
  hasMore: boolean;
}

/**
 * Min-Heap for bounded Top-K extraction.
 * Keeps at most capacity elements in memory. Runs in O(N log K) time and O(K) space.
 * Evicts the *worst* candidate according to SCORE_DESC_ORDINAL_ASC_ID_ASC:
 * - Lowest score
 * - On score tie: highest candidateOrdinal
 * - On ordinal tie: lexicographically greatest id
 */
export class BoundedMinHeap<T> {
  private heap: ScoredCandidate<T>[] = [];
  private readonly capacity: number;

  constructor(capacity: number) {
    if (capacity <= 0) throw new Error(`Heap capacity must be positive, got ${capacity}`);
    this.capacity = capacity;
  }

  get size(): number {
    return this.heap.length;
  }

  /**
   * Compare two candidates for min-heap placement.
   * Returns < 0 if a is WORSE than b (a should be closer to root and evicted first).
   */
  private compare(a: ScoredCandidate<T>, b: ScoredCandidate<T>): number {
    // 1. Lower score is worse (floats to root)
    if (a.score !== b.score) {
      return a.score - b.score;
    }
    // 2. On score tie: HIGHER ordinal is worse (floats to root)
    const ordA = a.candidateOrdinal ?? Number.MAX_SAFE_INTEGER;
    const ordB = b.candidateOrdinal ?? Number.MAX_SAFE_INTEGER;
    if (ordA !== ordB) {
      return ordB - ordA;
    }
    // 3. On ordinal tie: lexicographically GREATER id is worse (floats to root)
    return b.id.localeCompare(a.id);
  }

  public push(item: ScoredCandidate<T>): void {
    if (!Number.isFinite(item.score)) {
      throw new Error(`Non-finite candidate score: ${item.score}`);
    }

    if (this.heap.length < this.capacity) {
      this.heap.push(item);
      this.bubbleUp(this.heap.length - 1);
    } else if (this.compare(item, this.heap[0]) > 0) {
      // item is BETTER than the current worst candidate in the top-K pool
      this.heap[0] = item;
      this.bubbleDown(0);
    }
  }

  /**
   * Extract all elements sorted canonically descending:
   * 1. Higher score first
   * 2. Lower candidateOrdinal on ties
   * 3. Lexicographically smaller id on remaining ties
   */
  public extractSorted(): ScoredCandidate<T>[] {
    const copy = [...this.heap];
    return copy.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const ordA = a.candidateOrdinal ?? Number.MAX_SAFE_INTEGER;
      const ordB = b.candidateOrdinal ?? Number.MAX_SAFE_INTEGER;
      if (ordA !== ordB) return ordA - ordB;
      return a.id.localeCompare(b.id);
    });
  }

  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIdx = Math.floor((index - 1) / 2);
      if (this.compare(this.heap[index], this.heap[parentIdx]) < 0) {
        this.swap(index, parentIdx);
        index = parentIdx;
      } else {
        break;
      }
    }
  }

  private bubbleDown(index: number): void {
    const length = this.heap.length;
    while (true) {
      let smallest = index;
      const left = 2 * index + 1;
      const right = 2 * index + 2;

      if (left < length && this.compare(this.heap[left], this.heap[smallest]) < 0) {
        smallest = left;
      }
      if (right < length && this.compare(this.heap[right], this.heap[smallest]) < 0) {
        smallest = right;
      }

      if (smallest !== index) {
        this.swap(index, smallest);
        index = smallest;
      } else {
        break;
      }
    }
  }

  private swap(i: number, j: number): void {
    const temp = this.heap[i];
    this.heap[i] = this.heap[j];
    this.heap[j] = temp;
  }
}

/**
 * Stream/iterate candidates and return a paginated Top-K slice.
 */
export function extractTopKPaginated<T = unknown>(
  candidates: Iterable<ScoredCandidate<T>>,
  options: { k: number; offset?: number }
): TopKPageResult<T> {
  const k = Math.max(1, options.k);
  const offset = Math.max(0, options.offset ?? 0);
  const targetCapacity = offset + k;

  const heap = new BoundedMinHeap<T>(targetCapacity);
  let totalCount = 0;

  for (const candidate of candidates) {
    totalCount++;
    heap.push(candidate);
  }

  const allTop = heap.extractSorted();
  const pageItems = allTop.slice(offset, offset + k);

  return {
    items: pageItems,
    totalCandidates: totalCount,
    k,
    offset,
    hasMore: offset + pageItems.length < totalCount,
  };
}

/**
 * Paginate ranked candidates into the canonical CanonicalTopKResultV1 schema.
 * Rejects non-finite scores, enforces SCORE_DESC_ORDINAL_ASC_ID_ASC ordering,
 * and preserves exact lineage.
 */
export function canonicalTopKPaginate(
  candidates: Iterable<RankedCandidateV1>,
  options: { k: number; offset?: number }
): CanonicalTopKResultV1 {
  if (options.k < 0 || (options.offset !== undefined && options.offset < 0)) {
    throw new Error('k and offset must be non-negative');
  }

  const k = Math.max(0, options.k);
  const offset = Math.max(0, options.offset ?? 0);

  if (k === 0) {
    let count = 0;
    for (const _ of candidates) count++;
    return {
      schema: 'atlas.topk.v1',
      totalCandidates: count,
      offset,
      k: 0,
      hasMore: offset < count,
      order: 'SCORE_DESC_ORDINAL_ASC_ID_ASC',
      candidates: [],
    };
  }

  const targetCapacity = offset + k;
  const heap = new BoundedMinHeap<RankedCandidateV1>(targetCapacity);
  let totalCount = 0;

  for (const candidate of candidates) {
    totalCount++;
    heap.push({
      id: candidate.canonicalId,
      score: candidate.score,
      candidateOrdinal: candidate.candidateOrdinal,
      data: candidate,
    });
  }

  const allTop = heap.extractSorted();
  const pageItems = allTop
    .slice(offset, offset + k)
    .map((item) => item.data as RankedCandidateV1);

  return {
    schema: 'atlas.topk.v1',
    totalCandidates: totalCount,
    offset,
    k,
    hasMore: offset + pageItems.length < totalCount,
    order: 'SCORE_DESC_ORDINAL_ASC_ID_ASC',
    candidates: pageItems,
  };
}
