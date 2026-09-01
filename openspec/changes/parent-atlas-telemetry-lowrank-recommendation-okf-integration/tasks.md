# Tasks: parent-atlas-telemetry-lowrank-recommendation-okf-integration

## Implementation evidence — 2026-08-11

- Wired and tested: `AtlasEvent` / event hypergraph contract, n-ary tuple projection, semantic enrichment, and replay-stable event IDs.
- Wired and tested: ontology-linked tuple contract, cache projection, and the POS / concept-tagging lane with bounded MCP tool fanout.
- Wired and tested: telemetry breadth contract as a derived projection with explicit HLL keys plus breadth counts, kept separate from policy, identity, and event truth.
- Wired and tested: low-rank derived-feature contract with an explicit `semantic_768` source binding and derived low-rank feature block.
- Not promoted here: any live Redis HLL writer, production recommendation promotion guard, or exact-baseline comparison receipt beyond the focused contract tests already in repo.

## Reconciliation note (2026-08-31, doc-accuracy pass) — this doc's checklist undercounts real progress, but not by as much as it might look

The MASTER-TOC 0/31 count is misleadingly low given the "Implementation evidence" note above, but
checking Lane A's boxes wholesale off that note would overclaim. Verified individually:

- `AtlasEvent` contract, `buildAtlasEvent()`/`canonicalizeAtlasEvent()`/`sortAtlasEvents()`,
  `compileOntologyEventTuples()` all confirmed live in
  `sveltekit-frontend/src/lib/server/analysis/event-hypergraph-contract.ts`, consumed by 2 real
  files (`nlp-feature-compiler.ts`, `atlas/temporal/temporal-action-hypergraph-adapter.ts`) — the
  "Add an `AtlasEvent` contract" item is genuinely done.
- **Checked and NOT satisfied, despite the note's phrasing**: "Build a deterministic AST-to-event
  compiler from Tree-sitter / ast-grep evidence" — grepped `nlp-feature-compiler.ts` (the file that
  actually calls `buildAtlasEvent`) for any Tree-sitter/ast-grep reference; zero hits. The contract
  (schema + builder functions) is wired and tested, but nothing in the repo yet compiles events
  *from* deterministic AST evidence as this specific task requires — that's a materially different,
  larger claim than "the contract exists." Left unchecked; do not conflate contract-wired with
  compiler-wired.
- The remaining Lane A items (Neo4j/cuGraph derived projection, event ordering/idempotency/replay
  proof under a fixed source revision) were not individually re-verified this pass — left unchecked
  rather than inferred from the top-of-file summary. Whoever picks this up next should verify each
  one against actual call sites the way the two items above were, not trust the summary note alone.

## Lane A — deterministic event hypergraph and symbolic evidence

- [ ] Add an `AtlasEvent` contract for n-ary symbolic events with explicit
      participants, roles, evidence, and revision lineage.
- [ ] Keep event records canonical and n-ary; derive telemetry breadth and
      other mutable counts in a separate projection lane.
- [ ] Build a deterministic AST-to-event compiler from Tree-sitter / ast-grep
      evidence; do not let an LLM invent canonical events when deterministic
      structure exists.
- [ ] Add a derived graph projection for Neo4j / cuGraph consumers, but keep
      the event record canonical and n-ary.
- [ ] Add a separate semantic enrichment pass for event annotations and keep
      it downstream of AST truth.
- [ ] Prove event ordering, idempotency, and replay stability with the same
      source revision producing the same event IDs and participant sets.

## Lane B — OKF ontology and linked tuples

Cross-domain envelope ownership and the 4×6 feature mapping are now tracked
by `parent-atlas-okf-knowledge-layers` OKF-06.1–OKF-06.9. This lane remains
the evidence/projection consumer; it must not define a competing tuple,
feature, or recommendation truth owner.

- [ ] Extend the OKF schema/registry to carry ontology-linked tuples as first-class evidence.
- [ ] Record domain classification as a lineage-linked navigation surface, not canonical identity.
- [ ] Add explicit provenance fields for tuple observation and revision history.
- [ ] Verify OKF validation passes without turning telemetry or recommendation artifacts into OKF owners.

## Lane C — telemetry and provenance breadth

- [ ] Add HyperLogLog breadth telemetry for workflows, symbols, sessions, users, and neighborhoods.
- [ ] Keep HyperLogLog as a telemetry projection only; it must not mutate
      event truth, packet identity, or policy ownership.
- [ ] Keep timestamp/provenance fields on packet and tuple records.
- [ ] Add a read-only breadth feature materialization path.
- [ ] Prove HLL is telemetry only and never directly decides eviction, promotion, or residency.

## Lane D — low-rank approximation and feature construction

- [ ] Add low-rank / sketch-based feature blocks behind an explicit experiment boundary.
- [ ] Keep approximate features revisioned and provenance-tagged.
- [ ] Verify low-rank outputs remain derived artifacts, not canonical embeddings or ontology truth.
- [ ] Avoid naming the derived block as model-space latent state; keep the contract framed as a low-rank / projection feature block over `semantic_768`.
- [ ] Compare sampled approximation against exact baselines before any promotion.

## Lane E — recommendation scoring and oracle validation

- [ ] Define the recommendation judge over normalized feature groups.
- [ ] Add GPU batched projection/scoring as compute only.
- [ ] Keep exact-oracle comparison separate from policy execution.
- [ ] Add a promotion guard that requires oracle evidence, revision compatibility, and fallback proof.

## Cross-lane gates

- [ ] No event hypergraph may replace deterministic AST truth.
- [ ] No semantic enrichment pass may overwrite canonical event identity.
- [ ] No telemetry-only record may overwrite canonical identity.
- [ ] No low-rank approximation result may replace exact evaluation.
- [ ] No GPU scorer may mutate canonical packet state.
- [ ] No OKF tuple may act as the sole owner of cache policy or residency policy.
- [ ] Record all lane outputs in lineage-aware manifests.
