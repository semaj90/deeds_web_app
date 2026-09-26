// @vitest-environment node
/**
 * DIR-INDEX-10B / 10C (parent-atlas-canonical-directory-ingestion-fabric), proven against the PRODUCTION
 * fusion function `fuseSearchRuntimeCandidates` (SearchRuntime delegates to it). The standalone
 * `fuse-candidates.ts::fuseCandidates` is NOT the live path and is intentionally untouched:
 *  - 10B: a candidate is deduplicated INSIDE each logical lane before fusion (best score wins, one rank slot).
 *  - 10C: several physical executors of the semantic lane cannot each add an RRF contribution for one candidate.
 */
import { describe, expect, it } from 'vitest';
import { fuseSearchRuntimeCandidates as fuseCandidates, type Candidate } from './search-runtime';

const RRF_K = 60;

function cand(
  packetKey: string,
  scoreSource: Candidate['scoreSource'],
  score: number,
  extra: Partial<Candidate> = {},
): Candidate {
  return {
    id: `${packetKey}:${scoreSource}:${score}`,
    packetKey,
    sourceRef: `src/${packetKey}.ts`,
    summary: '',
    content: '',
    score,
    scoreSource,
    ...extra,
  } as Candidate;
}

describe('fuseCandidates lane-local dedupe (DIR-INDEX-10B)', () => {
  it('ranks a candidate by its BEST hit in a lane, not its last duplicate', () => {
    // one lane; A appears twice (0.9 and 0.5), B once (0.8). A must stay rank 1.
    const fused = fuseCandidates([
      cand('A', 'qdrant_768', 0.9),
      cand('B', 'qdrant_768', 0.8),
      cand('A', 'qdrant_768', 0.5),
    ]);
    expect(fused.map((f) => f.packetKey)).toEqual(['A', 'B']);
    // dedupe frees the rank slot: A rank 1, B rank 2 (not 3)
    expect(fused[0]!.fusionScore).toBeCloseTo(1 / (RRF_K + 1), 10);
    expect(fused[1]!.fusionScore).toBeCloseTo(1 / (RRF_K + 2), 10);
  });
});

describe('fuseCandidates semantic executors (DIR-INDEX-10C)', () => {
  it('counts one semantic contribution when qdrant and qdrant_768 both return the candidate', () => {
    const fused = fuseCandidates([cand('A', 'qdrant', 0.9), cand('A', 'qdrant_768', 0.9)]);
    expect(fused).toHaveLength(1);
    expect(fused[0]!.fusionScore).toBeCloseTo(1 / (RRF_K + 1), 10);
  });

  it('still adds an independent contribution from a different logical lane', () => {
    const fused = fuseCandidates([
      cand('A', 'qdrant', 0.9),
      cand('A', 'qdrant_768', 0.9),
      cand('A', 'postgres_trigram', 0.7),
    ]);
    expect(fused[0]!.fusionScore).toBeCloseTo(2 / (RRF_K + 1), 10);
  });

  it('keeps contributingLanes as the raw physical labels for diagnostics', () => {
    const fused = fuseCandidates([cand('A', 'qdrant', 0.9), cand('A', 'qdrant_768', 0.9)]);
    expect([...(fused[0]!.contributingLanes ?? [])].sort()).toEqual(['qdrant', 'qdrant_768']);
  });
});

describe('fuseSearchRuntimeCandidates diagnostics (DIR-INDEX-10D)', () => {
  it('keeps lane-local evidence separate from the cross-lane fusion score', () => {
    const fused = fuseCandidates([
      cand('A', 'qdrant', 0.9, { retrievalExecutor: 'qdrant-http' }),
      cand('A', 'qdrant_768', 0.85, { retrievalExecutor: 'pgvector-exact' }),
      cand('A', 'postgres_trigram', 0.7),
    ]);
    const a = fused[0]!;
    const evidence = a.laneEvidence ?? [];
    expect(evidence.map((e) => e.lane).sort()).toEqual(['dense', 'lexical']);

    const dense = evidence.find((e) => e.lane === 'dense')!;
    // both physical executors are recorded for audit ...
    expect([...dense.executorIds].sort()).toEqual(['pgvector-exact', 'qdrant-http']);
    expect(dense.supportingHitCount).toBe(2);
    expect(dense.bestRank).toBe(1);

    // ... but only one vote per lane reaches the cross-lane score
    const summed = evidence.reduce((sum, e) => sum + 1 / (RRF_K + e.bestRank), 0);
    expect(a.fusionScore).toBeCloseTo(summed, 10);
    expect(a.fusionScore).toBeCloseTo(2 / (RRF_K + 1), 10);
  });
});
