# OAKLIB-ADAPTER-01 — External ontology adapter

## Purpose

Integrate `oaklib` as an optional, read-only adapter for external ontologies without creating a second Parent Atlas ontology owner.

This is deliberately separate from the repository's **OaK / Ontology-as-a-Kernel** work (`K = (S, F)`). `oaklib` is an external ontology access toolkit; OaK is an agent reasoning architecture.

## Ownership boundary

Canonical Parent Atlas owners remain unchanged:

- **Concept identity/definition:** `sveltekit-frontend/src/lib/server/atlas/taxonomy/entity-concept-taxonomy-v1.ts::ConceptV1` and `createConceptV1()`.
- **Grounded ontology-linked observations:** `OntologyLinkedTupleV1`.
- **Canonical promoted n-ary relation truth:** `HyperedgeV1` promotion.
- **KAG node/edge forms:** projections/compatibility only.
- **ACE / ContextManifest:** execution/context identity only; never ontology authority.

`oaklib_external_adapter.py` may only emit:

- `OaklibConceptCandidateV1`
- `OaklibRelationCandidateV1`
- `OaklibCandidateBundleV1`

Every candidate has `canonicalAuthority = false` and `status = PROPOSED`.

## Flow

```text
OWL / OBO / RDF / OAK selector
          |
          v
      oaklib adapter
          |
          v
OAKLIB-ADAPTER-01 normalization
     /                 \
    v                   v
concept candidate    relation candidate
    |                   |
    v                   v
review/map          predicate review/map
    |                   |
    v                   v
createConceptV1    existing HyperedgeV1 promotion
```

No external CURIE is automatically converted into a Parent Atlas `conceptId`.
No external predicate is automatically promoted into an Atlas canonical relation type.

## Why the adapter is narrow

The OAK public interface provides backend-independent access to labels, definitions, search and relationships. Parent Atlas only depends on the smallest useful surface here: `label`, `definition`, and `relationships(subjects)`. This avoids coupling Parent Atlas to a specific OAK backend such as SQLite, OWL, SPARQL, OLS, or BioPortal.

## Optional dependency

Pinned separately in:

```text
python/requirements-oaklib-adapter.txt
```

The core `parent_atlas_ontology` package does not import `oaklib` eagerly. A workstation only needs the dependency when running a live external ontology read.

## Proofs

Offline, no network or optional dependency required:

```bash
python python/parent_atlas_ontology/oaklib_external_adapter_check.py
python scripts/atlas/prove-oaklib-external-adapter-v1.py
```

Optional live read after installing the pinned dependency:

```bash
python -m pip install -r python/requirements-oaklib-adapter.txt
python scripts/atlas/prove-oaklib-external-adapter-v1.py \
  --selector sqlite:obo:cl \
  --subject CL:0000540 \
  --ontology-revision cl:external-current \
  --report
```

The live selector may download/cache ontology resources according to OAK/pystow behavior. It still performs no Parent Atlas canonical writes.

## Promotion policy

Concept candidate promotion must eventually pass through the existing ConceptV1 owner. Relationship candidates require an explicit predicate mapping plus normal Parent Atlas review/evidence gates before a canonical `HyperedgeV1` can be emitted.

The adapter intentionally does not implement those promotion actions in this tranche.

## Status

```text
OAKLIB_EXTERNAL_ADAPTER_CONTRACT    IMPLEMENTED
OFFLINE_FIXTURE_PROOF               IMPLEMENTED
OPTIONAL_DEPENDENCY_PIN             IMPLEMENTED
LIVE_EXTERNAL_ONTOLOGY_PROOF        NOT_YET_RUN_ON_WORKSTATION
CANONICAL_WRITES                    0 BY DESIGN
CONCEPT_OWNER_CHANGED               NO
RELATION_OWNER_CHANGED              NO
```
