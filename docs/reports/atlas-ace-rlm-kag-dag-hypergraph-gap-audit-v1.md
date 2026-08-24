# Atlas ACE/RLM/KAG/DAG/HyperGraphRAG Gap Audit

Status: read-only contract and wiring audit, 2026-08-24.

## Executive Result

The bounded ACE, RLM, KAG/DAG, and n-ary HyperGraphRAG mechanisms are implemented
well enough to exercise on fixtures. They are not yet proven as one live pipeline
from Graphify candidates through canonical evidence, ACE injection, and durable
RLM replay. No PostgreSQL, Qdrant, Neo4j, Valkey, or source data was changed.

## Surface Status

| Surface | Status | Evidence | Missing proof |
| --- | --- | --- | --- |
| ACE packet and hypergraph schemas | PROVEN_BOUNDED | `ace-hypergraph-packet.test.mjs`, `ace-packet-v2.ts`, `ace-hypergraph-payload.ts` | Live packet transaction and cache injection |
| HyperGraphRAG identity adapter | PROVEN_BOUNDED | `hyperrag-live-integration.ts` rejects degraded/unresolved identity | Existing packet pipeline must persist the returned patch |
| N-ary relationship repository | IMPLEMENTED | `feature-intelligence-repository.ts` persists and reads typed participants/cardinality/evidence | Live canonical repository replay and migration health |
| Hypergraph fusion facade | PROVEN_BOUNDED | `hypergraph-fusion-facade.ts`, focused tests | Real feature repository binding, revision-complete lineage, live evidence inventory |
| Hypergraph PPR / chain search | PROVEN_BOUNDED | `hypergraph-ppr.test.mjs`, `adaptive-hypergraph-chain.ts` | Learned confidence propagation remains a TODO/challenger |
| KAG/DAG policy | CONTRACT_PROVEN | `compute-dag-policy.ts` | Frozen Graphify snapshot replay with actual executor receipts |
| ACE sufficient-context gate | UNIT_PROVEN | `evaluateSufficientContext` and ACE tests | Live canonicalized top-K injection and retrieve-more/synthesize receipt |
| RLM recursive runtime | BOUNDED_RUNTIME_WIRED | `rlm-contract.ts`, `rlm-runtime.ts` | Live retrieval/graph/process adapters and durable trace owner |
| Core RLM orchestrator | SCAFFOLD | `packages/parent-atlas-core/src/policy-orchestrator.ts` | Recursive engine wiring; console-only trace logging |
| ACE/KAG/RLM live join | NOT_PROVEN | No production caller was found for the facade/adapter chain | One replayable end-to-end workflow receipt |

## Concrete Gaps

The ACE context compiler now has an additive identity envelope. It computes
candidate-set and evidence-revision checksums from supplied identity fields,
while legacy candidates remain representable with `complete: false`. This is
a contract improvement, not proof that all upstream callers provide canonical
revisions.

The bounded Atlas RLM runtime now accepts an optional `RlmEnvironmentV1` and
returns `RLM_PROGRAM_FAILED` when its search/program adapter throws. This is a
fail-closed runtime behavior improvement; it is not evidence that Gemma4 can
write and execute recursive programs in a sandbox.

1. `runHypergraphFusionFacade` accepts a typed repository, but no live caller was
   found that binds it to the canonical Graphify/Postgres snapshot and records
   the repository revision.
2. `hypergraph-fusion-facade.ts` currently emits null values for
   `relationship_projection_revision`, `graph_snapshot_revision`,
   `semantic_projection_revision`, `semantic_model_revision`, and
   `feature_matrix_revision`. The payload schema permits these fields, but the
   end-to-end revision compatibility gate is therefore not proven.
3. `hyperrag-live-integration.ts` produces a validated ACE metadata patch only.
   Its own TODO says persistence into the existing packet transaction remains
   to be wired.
4. The facade caps ACE payload generation at 20 candidates with
   `input.candidates.slice(0, 20)`. The cap is bounded, but it is not recorded
   as a policy/receipt field separate from the input candidate count.
5. The evidence inventory supports contradiction and stale references, but no
   live replay was found that populates them from canonical evidence rows and
   proves the gate changes from retrieve-more to synthesize.
6. The SvelteKit RLM engine has bounded filtering, ranking, selection, and
   recursive refinement. The parent-atlas-core orchestrator still has a TODO
   for wiring that engine and logs traces to console instead of a durable owner.
7. `prove-rlm-environment.mts` proves fixture adapters only; it explicitly does
   not exercise live Neo4j/Postgres/ACE persistence.
8. Adaptive hypergraph search is deterministic, but its own contract still
   identifies iterative entity-to-hyperedge confidence propagation and ablation
   against greedy traversal as future work.
9. RLM still receives `ScoredCandidate[]` in the current runtime path. The ACE
   identity envelope does not qualify those candidates automatically; callers
   must populate the fields and RLM needs its own bounded environment contract.

## Required Proof Sequence

1. Freeze a Graphify source snapshot and CandidateOrdinal/identity checksum.
2. Bind the live canonical FeatureIntelligenceRepository and resolve only
   canonical entity/relationship/evidence IDs.
3. Require all available graph, relationship, semantic, and feature revisions
   before building an ACE payload; fail closed on missing compatibility data.
4. Run bounded relation expansion with explicit hop, fanout, candidate, and
   payload caps, and emit one receipt with expanded/pruned counts.
5. Pass only the canonicalized top-K result through the ACE metadata/packet
   transaction and record the cache key/namespace without storing hidden model
   reasoning.
6. Replay the same query through the live RLM adapters and persist an observable
   trace containing request, revisions, selected packet keys, reward/outcome,
   and provenance. Do not use the trace as canonical evidence.
7. Compare retrieve-more versus synthesize decisions and retain a blocked
   receipt until all identity, evidence, and revision gates pass.

## Current Test Boundary

The focused ACE/HyperGraph tests pass: 17 passed, 0 failed. This proves schemas,
identity rejection, bounded fusion, PPR, and fixture sufficiency behavior. It
does not prove live stores, daily Graphify adoption, ACE cache persistence, or
durable RLM traces.

## Source Ledger

| Technology | Official source | Version/date | Checked invariant | Repository implication |
| --- | --- | --- | --- | --- |
| OKF | GoogleCloudPlatform/knowledge-catalog `okf/SPEC.md` | v0.2 | Markdown concepts require YAML frontmatter with `type`; provenance/trust/lifecycle are optional families; OKF does not prescribe storage | Treat `.okf` as a portable projection; determine reader/writer compatibility before migration |
| MCP | Model Context Protocol 2026-07-28 release | 2026-07-28 | Resources/tools/prompts are discoverable protocol surfaces; state should use explicit handles; list results carry cache metadata | Audit existing MCP config/capabilities against the current revision; do not use hidden transport session state as canonical memory |
| cuTile Python | NVIDIA cuTile Quickstart / language reference | current docs checked 2026-08-24 | Compute capability 8.x is supported; tile dimensions are powers of two; tiles are the execution abstraction | RTX physical tiles remain implementation receipts; they do not redefine logical feature width |
| Protobuf | protobuf.dev Encoding and Editions guides | current docs checked 2026-08-24 | Tags use `(field_number << 3) | wire_type`; duplicate map keys resolve to the last value; maps are not multiplicity-safe | Use repeated typed `FeatureEntry` messages for one-to-many features |

Sources: [OKF v0.2](https://github.com/GoogleCloudPlatform/knowledge-catalog/blob/main/okf/SPEC.md), [MCP 2026-07-28](https://blog.modelcontextprotocol.io/posts/2026-07-28/), [cuTile Quickstart](https://docs.nvidia.com/cuda/cutile-python/quickstart.html), [cuTile language reference](https://docs.nvidia.com/cuda/cutile-basic-experimental/language_reference.html), [protobuf encoding](https://protobuf.dev/programming-guides/encoding/), and [protobuf editions/maps](https://protobuf.dev/programming-guides/editions/).
