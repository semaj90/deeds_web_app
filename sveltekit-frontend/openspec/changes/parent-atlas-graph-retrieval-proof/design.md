## Context

The repository already treats `codebase_chunks_768` as the active semantic lane in the vector registry. The remaining defect is at the retrieval boundary: Qdrant results are still allowed to surface payload content or legacy path fields before Postgres join-back has proven the canonical text and lineage.

## Design

### Canonical retrieval identity

- Use `source_ref` as the active identity for trace search results.
- Accept `path` only as temporary legacy compatibility input when a payload does not yet carry `source_ref`.
- Preserve Qdrant ANN rank order after Postgres join-back.

### Join-back behavior

- Query Postgres for `codebase_chunk_index` content and `atlas_packets` lineage using the strongest available identity.
- Return nonempty canonical content and summary from Postgres-backed rows.
- Attach `workspace_revision`, `representation_revision`, `pagerank_score`, and semantic lane metadata to the returned payload.
- Fail closed when join-back coverage is zero or below the configured minimum threshold.

### Result contract

- The tool surface must expose `source_ref`, not `path`, as the canonical field.
- Downstream callers may keep a legacy `path` alias only for compatibility during the cutover.
- The payload returned by `trace_search` should be the joined canonical record, not the raw Qdrant payload.

## Risks

- If join-back coverage is lower than expected, retrieval will fail closed instead of silently returning empty or noncanonical content.
- If callers still read only `path`, they may miss canonical identities until they are updated to prefer `source_ref`.
