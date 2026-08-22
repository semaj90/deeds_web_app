# Parent Atlas workstation TODO — SearchRuntime domain feature addendum

Updated: 2026-08-22

Status: **IMPLEMENTED_UNPROVEN**

This addendum records the current SearchRuntime/domain-classification tranche without rewriting older workstation history. It is intentionally additive and should be read with `parent-atlas-workstation-todo.md`.

## Architecture correction

The current retrieval/training order is:

```text
semantic_768 canonical retrieval
  -> optional latent_128 derived representation
  -> latent_64 routing/topology feature only
  -> SearchRuntime candidate fusion
  -> typed feature evidence
  -> reranker / XGBoost evaluation
```

`latent_64` is **not** an independent RRF lane. No fifth semantic vote is added by this tranche.

Domain classification is also not a retrieval lane and not an identity owner. It is typed feature evidence.

## Progress in this branch

Branch: `agent/search-runtime-domain-feature-20260822`

- [x] Locate the root Parent Atlas `SearchRuntime` owner.
- [x] Locate the paired root domain classifier and shared `Domain` taxonomy.
- [x] Add query-level `domain_analysis` to `SearchRuntimeResult`.
- [x] Add candidate-level domain observation after RRF and optional cross-encoder reranking.
- [x] Preserve pre-existing `metadata.domain_class`; keyword classification never overwrites it.
- [x] Preserve classifier disagreement as `domain_classifier_observation` rather than hiding it.
- [x] Preserve candidate `packet_key`, `source_ref`, lane, rank, score, packet ID, and Qdrant point ID.
- [x] Add pure bounded fixtures for deterministic classification, authority preservation, and general fallback.
- [ ] Execute the bounded fixture on the workstation.
- [ ] If the fixture passes, decide whether to bridge this observation into the larger SvelteKit `FeatureEnvelope`/XGBoost path with an explicit adapter. Persisted/enriched domain metadata must remain authoritative there.
- [ ] Produce a lineage-qualified XGBoost evaluation receipt before changing any runtime domain weight.

## Ownership invariants

```text
RRF lanes
  exact / lexical / dense / AST / graph
        |
        v
candidate ordering
        |
        v
optional cross-encoder ordering
        |
        v
DomainClassification observation
  feature evidence only
```

The classifier must not:

- create another RRF vote;
- change CandidateOrdinal or canonical identity;
- overwrite a persisted `domain_class` owner;
- promote `latent_64` into a retrieval lane;
- write Postgres, Qdrant, Neo4j, or Valkey state from this proof tranche.

## Bounded workstation proof

```powershell
cd C:\Users\james\Videos\deeds_web_app
npx vitest run src/lib/server/atlas/runtime/search-runtime-domain.spec.ts
```

Required acceptance:

```text
SEARCH_RUNTIME_DOMAIN_FEATURE_PROVEN
  deterministic observation
  persisted domain preserved
  rank unchanged
  score unchanged
  lane unchanged
  identity unchanged
```

The literal terminal token above is a proof target, not currently observed output. Until the test is actually run, this tranche stays `IMPLEMENTED_UNPROVEN` / `WRITTEN_UNPROVEN`.

## Next gates

1. Run `search-runtime-domain.spec.ts` only; fix any real import/type/runtime issue it exposes.
2. If green, add one integration fixture proving query classification and candidate observations flow through `SearchRuntime.search()` without changing the cross-encoder order.
3. Audit the larger SvelteKit retrieval runtime's existing persisted `domain`/`domain_class` hydration and define one explicit bridge into its canonical rerank/XGBoost feature surface; do not duplicate the classifier owner.
4. Resume revision-qualified graph lineage / FANOUT read-only proof.
5. Produce a lineage-valid XGBoost dataset and evaluation receipt only after domain and graph evidence are revision qualified.
6. Keep `latent_64` as routing/topology evidence unless a separate retrieval evaluation explicitly proves an additional lane is beneficial without duplicate semantic voting.

No database migration, production write, Qdrant mutation, Neo4j mutation, Valkey mutation, or retrieval-lane change was performed in this tranche.
