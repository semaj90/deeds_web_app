# `.okf` Schema and Registry Alignment — 2026-10-14

## Language profiles

The four current language profile YAML files validate against `.okf/schemas/language-profile-v1.schema.json`:

- Go: 5 symbol kinds
- Python: 8 symbol kinds
- Rust: 7 symbol kinds
- TypeScript: 11 symbol kinds and 8 feature rules

The manifest previously registered only `typescript.yaml`. It now registers all four existing profiles. A regression test asserts the manifest profile set equals the validated YAML file set. The Tree-sitter grammar catalog remains candidate-only and does not imply LSP support or 371 integrated languages.

Validation: `py -3.13 python/parent_atlas_ontology/language_profile_v1.py --profile-dir .okf/languages --schema .okf/schemas/language-profile-v1.schema.json` — exit 0; 4/4 valid; schema SHA-256 `28500e5c5f61c925e83e02e45e3359d00880d3eefafdf07df19a4ad55a729173`; profile snapshot SHA-256 `389b71bd0a17312f8ddb172c3aa4de7a6a37fa3ccf1c4f6d0e058f67a8ce9c61`.

## Manifest coverage remaining

`py -3.13 scripts/atlas/audit_okf_manifest_coverage_v1.py` — exit 2, status `OKF_MANIFEST_REFERENCES_STALE`. It now resolves 20 of 27 declared references. Seven declared domain/symbol/tool/predicate files are missing: `domains/retrieval.yaml`, `domains/cache.yaml`, `domains/database.yaml`, `symbols/functions.yaml`, `symbols/routes.yaml`, `tools/ast-grep.yaml`, and `predicates/ontology.yaml`. Two existing structured files are present but not listed (`domains/structured-value.yaml`, `indexes/parent-atlas-code-explore.yaml`); `pipelines/ast-entity-prefill.yaml` is outside declared registries. This is path-coverage evidence, not content-schema validation.

A path-scoped `git log --all` check found no reachable history for any of those seven missing paths. This means there is no tracked version to restore from the current repository refs; it does not establish whether the declarations were intended for future schemas. Keep them unresolved until the owner either removes obsolete declarations or supplies typed artifacts grounded in current source contracts.

## Limits of the blanket v0.2 scan

The existing `audit-okf-v02-bundle-v1.mjs` scanned 364 YAML/Markdown files and reported 0/364 matching its required `provenance`, `trust`, and `lifecycle` field profile. It is not a valid whole-corpus conformance result: the internal OpenSpec Knowledge Framework has no ratified v0.2 field schema, the public Google OKF field families are not all universally required, the scan includes arbitrary Markdown and nested documentation, and YAML parse exceptions are converted to empty objects. It does not scan JSON/JSONL, validate per-type schemas, or report syntax errors distinctly. Do not bulk-add metadata or call this Google OKF conformance.

Existing type-specific checks cover four language profiles, six concept-gap YAML files, the keyword corpus schema, and synthetic Python/Zod parity fixtures. They do not yet constitute validation of all `.okf` artifacts or OAK/GraphRAG admission. Keep `OKF-01`, the internal metadata profile decision, manifest-path reconciliation, OAK semantic resolution, and actual-document Python/Pydantic parity as separate open gates.

No database, cache, vector index, graph snapshot, or service was changed.
