# Domain Registry Contract V1

Status: ownership contract frozen; runtime normalizer and persisted mapping are not implemented.

## Separate meanings, separate owners

```yaml
schema: atlas.domain-registry-contract.v1

classifierVocabulary:
  owner: sveltekit-frontend/src/lib/server/atlas/domain-taxonomy.ts
  meaning: runtime classifier labels and normalization semantics

ontologyIdentity:
  owner: atlas_domain_ontology
  idField: group_id
  meaning: persisted ontology node identity

taxonomyVersionAdapter:
  owner: domain_taxonomy_v1
  status: UNPOPULATED_NOT_AUTHORIZED
  meaning: future version, alias, deprecation, and replacement bridge

legacyDomainClass:
  field: atlas_packets.domain_class
  semantics: HISTORICAL_MIXED_OBSERVATION
  canonicalAuthority: false
```

`atlas_packets.domain_class` is retained as historical classifier evidence. It is not a foreign key to the classifier vocabulary, ontology identity, or taxonomy topology. No existing rows are rewritten by this contract.

## Census evidence

The read-only vocabulary census in `docs/reports/domain-vocab-proposal-v1.json` covers 61,718 rows and 39 case-folded labels. Its buckets are:

| Bucket | Rows | Interpretation |
| --- | ---: | --- |
| `EXACT_IN_DOMAIN_ONTOLOGY` | 31,676 | Exact ontology labels |
| `FOLD_ALIAS` | 6,896 | Proposed normalized aliases |
| `SUBTYPE_OF` | 2,119 | Proposed narrower domain labels |
| `ARTIFACT_KIND_NOT_A_DOMAIN` | 16,664 | Artifact/feature kinds, not domains |
| `PRODUCT_FEATURE_AREA_NOT_IN_EITHER_VOCABULARY` | 659 | Product areas, not domains |
| `AMBIGUOUS_OR_ABSENT_FROM_ONTOLOGY` | 3,682 | Unresolved; retain as unresolved |
| `QUARANTINE_NOT_A_LABEL` | 22 | Error/noise values |

The census is a proposal, not a promotion receipt: `applied=false`, `writesPerformed=false`, `canonicalAuthority=false`, and `requiresOperatorApproval=true`.

## Vocabulary mismatch is explicit

The runtime classifier vocabulary currently contains `auth`, `ui`, `retrieval`, `network`, `database`, `cache`, `agent`, `graph`, and `ml`. The persisted ontology has additional nodes, including `api`, `compiler`, `devops`, `error-handling`, `frontend`, `gpu`, `machine-learning`, and `test`.

Any alias or subtype mapping (including `ui` → `frontend` and `ml` → `machine-learning`) must be represented in a future revisioned adapter with evidence. `network` and `agent` remain unmapped until an ontology identity is explicitly established. Do not infer mappings from label similarity or populate `domain_taxonomy_v1` as part of this contract.

## Read-side normalizer boundary

A future `DomainClassNormalizerV1` may classify each raw observation as `EXACT`, `ALIAS`, `SUBTYPE`, `AMBIGUOUS`, `NON_DOMAIN`, or `QUARANTINED`. It must preserve the raw value and evidence reference, return unresolved values without coercion, and expose classifier and taxonomy revisions when available. It must not mutate `atlas_packets.domain_class`, mint ontology IDs, or promote classifier observations into canonical ontology facts.

**Authority:** classifier labels are owned by the runtime classifier vocabulary; persisted ontology identity is owned by `atlas_domain_ontology`; taxonomy versioning is not active; legacy packet labels are historical mixed observations. This document does not authorize DDL, data writes, alias population, or ontology promotion.
