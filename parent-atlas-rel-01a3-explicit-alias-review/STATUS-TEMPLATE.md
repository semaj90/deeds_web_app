# Parent Atlas graph revision fix — REL-01A3

Status: `EXPLICIT_ALIAS_REVIEW_PENDING`

## Frozen finding

Legacy `atlas-packets-ontology-v1` `USES_CONCEPT` rows use frontend-relative
`src/...` locators for six application sources, while WorkspaceSourceBindingV1
uses repository-relative `sveltekit-frontend/src/...` locators.

A real root-level `src/` tree also exists, so prefixing is not a global
normalization rule.

## Candidate rule

```text
resolverRevision: feature-ontology-explicit-alias:v1
resolutionKind: ROOT_PREFIX_ALIAS

src/...
  -> sveltekit-frontend/src/...
```

Scope: reviewed `USES_CONCEPT` source refs only.

Promotion: false until a durable alias owner records a VERIFIED relation.

## Still blocked

- REL-01B
- RelationshipGraphRevision
- ALIGN-01
- CandidateOrdinal promotion
- GPU relationship features

No Tree-sitter or GPU changes are part of this tranche.
