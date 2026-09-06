/**
 * FusionContributionV1 — RF7-02, the neutral input representation for RF7-CONTRACT-PARITY-01.
 *
 * Per `openspec/changes/parent-atlas-retrieval-fusion-reachability/tasks.md`'s
 * `RF7-LANE-ALIAS-CONVERGENCE-01` entry (external review, 2026-09-06): before extracting a shared
 * fusion kernel, define the smallest neutral shape both existing implementations
 * (`SearchRuntime.fuseSearchRuntimeCandidates` and `rrf-fuse.ts::reciprocalRankFusion`) can project
 * into WITHOUT changing their public APIs or runtime behavior. This type exists FIRST for
 * differential proofs (RF7-CONTRACT-PARITY-01) — neither implementation executes through it yet.
 *
 * Do not import this into `search-runtime.ts` or `rrf-fuse.ts` production code paths. It is
 * consumed only by read-only projection adapters (`fusion-contribution-adapters.ts`) and the
 * differential parity fixtures/tests that compare projections against each caller's real output.
 */

export interface FusionContributionV1 {
  canonicalId: string;
  logicalLane: string;
  rank: number;
  weight: number;
  executorId: string;
  provenanceRefs: string[];
}
