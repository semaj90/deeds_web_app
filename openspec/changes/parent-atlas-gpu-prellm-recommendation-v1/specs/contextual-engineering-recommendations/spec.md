## ADDED Requirements

### Requirement: Contextual recommendations preserve retrieval and source-evidence ownership
Any future contextual engineering recommendation SHALL consume a bounded, frozen Top-K candidate
set from SearchRuntime and preserve the exact candidate/source identity and revision. Low-rank,
transformer, graph, and NLP results SHALL remain advisory and SHALL NOT add a retrieval vote or
create canonical identity.

#### Scenario: A contextual recommendation is assembled
- **WHEN** the system assembles evidence for a diagnostic or repair query
- **THEN** it SHALL retain the SearchRuntime candidate identity/order and include only source
  excerpts whose source digest and original-file byte spans validate against exact source bytes

### Requirement: Background analysis is bounded and exposes honest progress
Parallel contextual analysis SHALL use bounded workers and per-provider concurrency limits, preserve
stable result order, and report partial, timed-out, cancelled, and failed stages explicitly. Progress
SHALL be stage-based unless a validated total-work estimate exists.

#### Scenario: One evidence provider times out
- **WHEN** AST, NLP, graph, or example retrieval times out for one candidate
- **THEN** the run SHALL report that provider as partial/failed, retain other completed results, and
  SHALL NOT mark the recommendation complete or silently replace the failure with an empty success

### Requirement: Model synthesis consumes only admitted context
Ornith or another generator SHALL receive the existing validated ContextManifest, not raw MCP hits,
unverified graph tuples, worker state, hidden reasoning, or tensor/KV data. Generated repair text
SHALL cite only exact evidence references present in that manifest and SHALL remain a proposal until
the existing authorization gate approves an action.

#### Scenario: A generated citation is not in the manifest
- **WHEN** a model output cites a source/range absent from the admitted ContextManifest
- **THEN** output validation SHALL reject the citation and the repair SHALL remain unapproved

### Requirement: Adaptive and transformer rankers remain challengers
DLSS SHALL NOT be treated as a retrieval algorithm or copied as a low-rank sampler. Any adaptive
subsampling or transformer/cross-encoder ranker SHALL be evaluated against the exact/current
low-rank baseline on frozen identities and judged outcomes before any promotion.

#### Scenario: A challenger changes Top-K ordering
- **WHEN** a challenger returns a different order or candidate set from the baseline
- **THEN** the evaluation receipt SHALL report candidate recall, ranking metrics, latency, memory,
  and abstention separately, and SHALL NOT alter canonical vectors or SearchRuntime fusion
