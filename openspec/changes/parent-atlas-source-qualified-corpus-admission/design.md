# Design: source-qualified corpus admission

## Principle

Separate the pipelines, identify each owner, and connect them through revision-qualified contracts. Do not merge dependency source, selected workspace evidence, documentation, and retrieval results into one admission class.

## Admission classes

| Class | Meaning |
|---|---|
| EXTERNAL_DEPENDENCY_DIAGNOSTIC | Installed package source, with package version and file hashes. No workspace binding. |
| WORKSPACE_DIAGNOSTIC | Workspace source at an admitted workspace revision. Not persisted. |
| DOCUMENTATION_REFERENCE | Pinned documentation. Terminology and explanation only. Not code evidence. |
| PERSISTED_EVIDENCE | Written through an approved writer, with independent readback. |
| ADMITTED | Persisted and readback-proven, with a receipt that authorizes the production role. |

## Svelte LSP qualification

The frozen snapshot has no `node_modules`, but its Svelte configuration imports `@sveltejs/adapter-node` and `@sveltejs/vite-plugin-svelte`. The working hypothesis is that the language server cannot resolve those packages. The 35-symbol result came from a temporary project with dependencies linked. That supports the hypothesis but does not qualify the snapshot. Qualification requires recreating the frozen environment in a disposable workspace, preserving file hashes and configuration, and repeating the request with recorded initialization, diagnostics, symbols, and timing.

## Feature identity and vocabularies

- Canonical concepts, source-local identities, reviewed crosswalks, and labels are separate tables (see `drizzle/manual/20261021_feature_identity_v2.sql`).
- `atlas_features` and `atlas_fi_features` keep their roles and are not reused as canonical registries.
- Domain, capability, ontology, and source-string vocabularies each carry an owner, revision, and meaning. Mappings between them are typed, reviewed crosswalks. Name similarity alone never maps them.
- Vocabulary membership checks (such as the nine-domain normalizer) validate format and membership. They do not decide semantic equivalence.

## Embedding provenance

Historical vectors remain UNKNOWN for encoder and source revision unless a receipt proves them. The tag `embeddinggemma:latest:eg-task-prefix-v1` is treated as a label to verify, not as proof of recipe; the 40-row sample reproduced raw content, not the title-and-text recipe. A newly qualified path is proven alongside the legacy corpus, not in place of it.

## Retrieval

One semantic logical lane. Multiple executors do not count as independent votes. NULL identity comparisons are reported as UNKNOWN, separate from proven mismatches.
