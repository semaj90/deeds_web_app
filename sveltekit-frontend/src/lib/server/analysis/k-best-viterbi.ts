/**
 * Generic k-best Viterbi / dynamic-programming decoder.
 *
 * This is intentionally independent of retrieval, graph storage, and the error
 * classifier. Callers provide local emission scores and transition scores.
 * Scores are additive (log-probabilities, logits, or any comparable utility).
 *
 * Parent Atlas use: each frame is a revision-qualified CandidateFiber and the
 * transition function can combine lineage, rename/move evidence, AST continuity,
 * call-neighborhood overlap, source-span movement, and revision ancestry.
 */

export interface ViterbiCandidate<T> {
  id: string;
  value: T;
  emissionScore: number;
}

export interface ViterbiFrame<T> {
  revision: string;
  candidates: ViterbiCandidate<T>[];
}

export interface ViterbiTransitionContext<T> {
  previousRevision: string;
  currentRevision: string;
  previous: ViterbiCandidate<T>;
  current: ViterbiCandidate<T>;
  frameIndex: number;
}

export interface ViterbiPath<T> {
  score: number;
  candidateIds: string[];
  revisions: string[];
  values: T[];
}

interface PartialPath<T> extends ViterbiPath<T> {
  tail: ViterbiCandidate<T>;
}

function assertFiniteScore(score: number, label: string): void {
  if (!Number.isFinite(score)) throw new Error(`${label} must be finite`);
}

function pathTieKey<T>(path: Pick<ViterbiPath<T>, 'candidateIds' | 'revisions'>): string {
  return `${path.revisions.join('\u001f')}\u001e${path.candidateIds.join('\u001f')}`;
}

function rankPaths<T>(paths: PartialPath<T>[], k: number): PartialPath<T>[] {
  return paths
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score;
      return pathTieKey(a).localeCompare(pathTieKey(b));
    })
    .slice(0, k);
}

/**
 * Decode the k highest-scoring hidden-state paths through revision frames.
 *
 * Unlike a stationary emission-only classifier, this keeps explicit transitions
 * and backpointer-equivalent path state at every frame. Complexity is bounded by
 * O(T * N^2 * k), where N is the largest candidate fiber.
 */
export function decodeKBestViterbi<T>(
  frames: readonly ViterbiFrame<T>[],
  transitionScore: (context: ViterbiTransitionContext<T>) => number,
  options: { k?: number } = {},
): ViterbiPath<T>[] {
  const k = Math.max(1, Math.trunc(options.k ?? 3));
  if (frames.length === 0) return [];

  for (const [frameIndex, frame] of frames.entries()) {
    if (!frame.revision.trim()) throw new Error(`frame ${frameIndex} requires revision`);
    if (frame.candidates.length === 0) return [];
    const ids = new Set<string>();
    for (const candidate of frame.candidates) {
      if (!candidate.id.trim()) throw new Error(`frame ${frameIndex} candidate requires id`);
      if (ids.has(candidate.id)) throw new Error(`duplicate candidate id '${candidate.id}' in frame ${frameIndex}`);
      ids.add(candidate.id);
      assertFiniteScore(candidate.emissionScore, `emission score for ${candidate.id}`);
    }
  }

  let pathsByTail = new Map<string, PartialPath<T>[]>();
  const first = frames[0];
  for (const candidate of first.candidates) {
    pathsByTail.set(candidate.id, [{
      score: candidate.emissionScore,
      candidateIds: [candidate.id],
      revisions: [first.revision],
      values: [candidate.value],
      tail: candidate,
    }]);
  }

  for (let frameIndex = 1; frameIndex < frames.length; frameIndex++) {
    const previousFrame = frames[frameIndex - 1];
    const currentFrame = frames[frameIndex];
    const nextByTail = new Map<string, PartialPath<T>[]>();

    for (const current of currentFrame.candidates) {
      const proposals: PartialPath<T>[] = [];
      for (const previousPaths of pathsByTail.values()) {
        for (const previousPath of previousPaths) {
          const transition = transitionScore({
            previousRevision: previousFrame.revision,
            currentRevision: currentFrame.revision,
            previous: previousPath.tail,
            current,
            frameIndex,
          });
          assertFiniteScore(transition, `transition score ${previousPath.tail.id}->${current.id}`);
          proposals.push({
            score: previousPath.score + transition + current.emissionScore,
            candidateIds: [...previousPath.candidateIds, current.id],
            revisions: [...previousPath.revisions, currentFrame.revision],
            values: [...previousPath.values, current.value],
            tail: current,
          });
        }
      }
      nextByTail.set(current.id, rankPaths(proposals, k));
    }

    pathsByTail = nextByTail;
  }

  const finalPaths = rankPaths([...pathsByTail.values()].flat(), k);
  return finalPaths.map(({ tail: _tail, ...path }) => ({
    ...path,
    score: Number(path.score.toFixed(8)),
  }));
}
