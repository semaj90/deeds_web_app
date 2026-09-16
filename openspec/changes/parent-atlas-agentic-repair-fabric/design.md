## Context

Full operator-supplied architecture (verbatim intent, condensed): a bounded agentic error-repair/
recommendation fabric where text discovers candidates, ontology normalizes meaning, lineage
establishes identity, hyperedges bind n-ary facts/actions, retrieval finds options, feature
matrices make them computable, recommendation ranks them, DAGs schedule them, ACE/BitFrost move
bytes, GPU executors calculate, validators decide success, and receipts create future evidence.
Nothing in that chain — OAK CURIE, Qdrant point ID, cuVS row, CandidateOrdinal, GPU pointer, BM25
rank, GEPA prompt candidate, or LLM tool suggestion — may become canonical packet identity.

## Goals / Non-Goals

**Goals (this pass, AR-01 + AR-03 only):**
- A typed, fail-closed client for the live OAK kernel (`:8095`), producing `OakResolutionEvidenceV1`
  evidence records — never synthesizing a fake CURIE on failure.
- A typed action vocabulary (`AgenticActionV1`) plus a small seed registry of the example moves the
  operator listed (AST_EXPAND, RG_EXACT_SEARCH, BM25_SEARCH, SEMANTIC_SEARCH, OAK_RESOLVE,
  HYPERGRAPH_EXPAND, APPLY_SOURCE_PATCH, RUN_TYPECHECK, RUN_TESTS, AWAIT_OPERATOR,
  RETRY_WITH_MORE_CONTEXT, STOP_SUCCESS, STOP_BLOCKED).
- Record every other gate (AR-02, AR-04..AR-17) as an explicit, unimplemented task — not silently
  dropped, not fabricated as done.

**Non-Goals (this pass):**
- No DAG runtime, no ParameterResolver, no CandidateFeatureMatrix wiring, no Tang challenger, no
  DSPy/GEPA harness, no bitencoded capability mask, no Go Retrieval adapter, no repair-loop fixture.
  All of these remain real, scoped, pending tasks — this design explicitly does not claim they
  exist.
- No new ontology service (reuses OAK `:8095` + the existing TS resolver), no new retrieval-fusion
  owner (reuses Go Retrieval/SearchRuntime, unmodified), no new cache authority (ACE/BitFrost
  unmodified), no new workflow engine (existing DAG runner referenced, not replaced).

## Decisions

**D1 — OAK client lives beside the existing OAKLIB TypeScript resolver, not inside it.** The
Phase-1 resolver (`ontology-resolution-boundary-postgres.ts`) reads `atlas_domain_ontology`
directly and has no HTTP dependency; keeping it that way preserves it as a genuinely cheap,
dependency-free fast path. The new OAK client is a separate module
(`oak-resolution-evidence-client.ts`) that calls the live sidecar over HTTP with a short timeout
and fails closed to `RESOLUTION_UNAVAILABLE` — mirroring the existing `oak-search` admin proxy
route's error handling, not duplicating it (the admin route becomes a consumer of this client in
a later pass, not rewritten now).

**D2 — `AgenticActionV1` is a new, distinct contract, not an extension of `HyperedgeV1` or the
existing `OntologyFanoutAuthorityV1`-style admission envelopes.** Actions are a vocabulary of legal
moves (schema/tool/mutability/approval metadata), structurally unrelated to either an evidence
tuple or an admission gate. Confirmed via grep before creating it: no existing contract in this
repo declares an action/tool vocabulary with `mutability`/`requiresHumanApproval` fields.

**D3 — Seed action registry is a plain in-memory array (`AGENTIC_ACTION_REGISTRY_V1_SEED`), not a
migrated Postgres table, in this pass.** The operator's own gate list (AR-02) is "Action/Workflow
registry owner census" — a distinct, later gate whose job is to decide whether this becomes a
Postgres-backed BM25-searchable registry (section 7 of the operator's spec) or stays code-defined.
Building the Postgres table now would pre-empt that undone census.

## Risks / Trade-offs

- [Building AR-01/AR-03 without AR-02's registry-owner census means the action registry is
  code-only, not yet BM25-searchable as section 7 describes] → Mitigation: explicitly scoped as
  the AR-02 follow-up task, not conflated with what's built here.
- [The OAK client depends on the live sidecar being reachable; if the container is down, every
  Tier-2 resolution silently degrades to `RESOLUTION_UNAVAILABLE`] → Mitigation: this is the
  operator's own explicit "fail closed" requirement — not a bug, a deliberate design constraint.

## Migration Plan

Additive only, this pass: 2 new TypeScript modules + tests. No schema change, no production write
path, no service dependency change. AR-02 and later gates each get their own migration plan when
attempted.

## Open Questions

- Whether the action registry (AR-02) should become a Postgres table now or stay code-defined
  longer — deferred to when AR-02 is actually picked up.
- Whether `AgenticHyperEdgeV1` (AR-04) should be a genuinely separate contract or an optional-
  `canonicalId` variant of `HyperedgeV1` itself — deferred; `HyperedgeV1`'s `.strict()` schema and
  existing callers make a breaking change there risky without a dedicated audit.
