# Integration points

The local workstation is ahead of the connected GitHub snapshot, so verify exact paths before editing.

## 1. Existing OKF/HMM path

Expected existing files:

- `src/lib/server/atlas/okf-fit.ts`
- `src/lib/server/atlas/okf-topic-ingestion.ts`
- `src/lib/server/analysis/nlp-feature-compiler.ts`

The new bridge consumes the already-emitted `fit_decision`, classifier scores, `hmm_observation`,
and `stateHint`; it does not create another classifier or HMM owner.

Find the existing workflow estimator/router:

```powershell
rg -n "Viterbi|RouteTrace|workflow estimator|stateHint|hmm_observation|RouterState" src scripts
```

At that boundary:

1. Build `PolicyStateInput`.
2. Call `buildPolicyStateVector(...)`.
3. Call `routePolicy(...)`.
4. Convert the decision to an `ExecutionBudget`.
5. Schedule only actions allowed by the HMM state.

## 2. Existing retrieval owner

Do not add a new retrieval lane. The policy chooses existing programs:

- lexical search
- semantic search
- graph trace/expand
- fast/deep rerank
- source inspection
- compile/test

Find the canonical owner before wiring:

```powershell
rg -n "canonical.*retriev|rrf-combiner|canonical-rerank-executor|orchestrator" src/lib/server
```

## 3. Existing ACE owner

`ace-residency.ts` only defines deterministic selection helpers and manifests. Wire it behind the
existing ACE/BitFrost materializer/cache owner rather than creating another cache service.

## 4. Model execution

Atlas owns `maxParallelToolCalls = 3`. A model may emit one or multiple tool requests, but the
bounded executor decides what can actually run concurrently. GPU-heavy and LLM tasks default to
one concurrent job.

## 5. Patch H

Do not consume betweenness as a policy feature until Patch H is runtime-smoke proven against a
frozen graph revision.
