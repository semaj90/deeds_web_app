## Context

Parent Atlas currently has several RRF-shaped implementations. The existing
evidence identifies `fuseSearchRuntimeCandidates` in `search-runtime.ts` as the
default canonical fusion owner, while `combineViaRRF` and
`fuseRetrievalLanes` remain live backend surfaces with different caller
contracts. `fuseContributionsV1` is already a shared adapter used by two real
callers. The `retrieval-fusion-rrf.ts` family has no external source imports in
the current census and is therefore a dead-candidate, not yet an archive
decision.

This change is governance and convergence work. It must preserve one logical
vote per lane and must not invent canonical packet identity, rewrite live
callers, or make Qdrant/cuVS/graph executors additional fusion authorities.

## Goals / Non-Goals

**Goals:**

- Record explicit ownership classifications for the audited RRF primitives.
- Preserve the existing canonical `SearchRuntime` fusion boundary.
- Make behavioral differences visible before any migration, especially
  caller-side identity normalization and optional lane weights.
- Provide a staged path for future caller migration or formal backend
  designation.
- Keep the decision process compatible with revision-qualified identity and
  the existing one-vote-per-logical-lane rule.

**Non-Goals:**

- No caller migration in this change.
- No deletion or archiving of `retrieval-fusion-rrf.ts`.
- No change to RRF constants, lane weights, ranking scores, or API behavior.
- No PostgreSQL, Qdrant, Valkey, Neo4j, GPU, or source-data writes.
- No claim that runtime ownership is fully registered while the shared
  ownership registry has unrelated failing invariants.

## Decisions

### 1. Keep SearchRuntime as the default canonical owner

`fuseSearchRuntimeCandidates` remains the canonical owner because it performs
the production cross-executor normalization and lane collapsing. Other
implementations are classified as backend or adapter surfaces until callers
are migrated under a separate reviewed task.

Alternatives considered:

- Make `combineViaRRF` canonical: rejected because its optional lane weights
  and caller-side identity normalization are not equivalent to the
  SearchRuntime contract.
- Make `fuseRetrievalLanes` canonical: rejected because it includes richer
  freshness/weighting behavior and is used by evaluation/analytics routes.
- Delete every other implementation: rejected because live callers and
  compatibility behavior have not been migrated or replayed.

### 2. Treat identity normalization as a precondition, not a fusion vote

The parity fixture proved that `combineViaRRF` can match the canonical score
when callers provide the same packet identity, but can produce separate
candidates when lane IDs differ. Future migration must normalize canonical
identity before fusion and must not use Qdrant point IDs or executor names as
identity.

### 3. Keep lane weights explicit and versioned

The optional lane-weight behavior is a genuine backend capability difference.
It must be represented by an explicit policy revision if migrated; it must not
be silently folded into the canonical unweighted RRF contract.

### 4. Separate classification from registry mutation

The runtime-ownership registry has no current RRF capability section and its
audit currently reports unrelated owner violations. Registry entries should be
added only after the schema boundary and baseline treatment are reviewed. The
OpenSpec classification remains authoritative for this tranche.

## Risks / Trade-offs

- [Different identity normalization] → Require a shared identity-envelope
  replay before migrating any caller.
- [Lane-weight score drift] → Compare weighted and unweighted fixtures and
  bind the selected policy to an explicit revision.
- [Dead-candidate misclassification] → Archive only after a repository-wide
  import census and human review; static absence alone is not deletion
  authorization.
- [Registry audit noise] → Keep unrelated ownership violations visible and
  do not weaken the audit to make this change appear complete.
- [Duplicate votes across executors] → Preserve one logical lane contribution
  and reject executor-specific extra votes.

## Migration Plan

1. Keep the current canonical SearchRuntime owner unchanged.
2. Add or review ownership-registry entries only after registry governance
   blockers are resolved.
3. For each live noncanonical caller, capture a baseline identity envelope,
   lane set, score output, and rank output.
4. Migrate one caller at a time behind a read-only replay or compatibility
   adapter.
5. Independently verify score/rank parity and one-vote-per-lane behavior.
6. Roll back by retaining the existing backend caller path; no data migration
   is required.
7. Consider archiving the dead candidate only after explicit human sign-off
   and a final import/history review.

## Open Questions

- Should lane weights become a first-class SearchRuntime policy revision, or
  remain isolated to a backend/evaluation lane?
- Which ownership-registry change should resolve the unrelated
  `n_ary_relationship_synthesis` and optional GPU classification violations?
- Does the dead-candidate family have historical/operational consumers outside
  the current source tree that require an archive receipt?
- Which live RRF callers are eligible for migration after packet/source
  identity authority is closed?
