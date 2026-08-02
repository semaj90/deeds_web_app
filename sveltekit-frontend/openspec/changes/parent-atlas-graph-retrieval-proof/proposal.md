## Why

Parent Atlas graph retrieval is still failing its canonical join-back contract in the `trace_search` path. Qdrant ANN results can surface a valid similarity score, but the downstream tool surface still risks using payload fallbacks instead of canonical Postgres content and lineage. This change captures the proof-focused cutover needed to make `source_ref` the active identity, keep the 768 semantic lane authoritative, and fail closed when join-back coverage is missing.

## What Changes

- Route `trace_search` through the canonical 768 collection exposed by the vector registry, not a hardcoded legacy lane
- Join Qdrant hits back to Postgres for content, summary, revision, and pagerank metadata
- Treat `source_ref` as the active identity and `path` as legacy compatibility only
- Fail closed when no canonical join-back rows are available
- Keep ordered ANN rank stable after join-back
- Update the surfaced result shape so downstream callers read canonical fields from `source_ref`-anchored payloads

## Non-Goals

- No Qdrant rebuild or alias swap in this change
- No PageRank recomputation or persistence work in this change
- No 162-tool sweep in this change
- No schema migration for legacy 384 data in this change

## Proof Target

The immediate proof target is a bounded `kb trace_search` invocation that returns nonempty canonical Postgres content, `source_ref` lineage, and a bounded result set without falling back to raw Qdrant payload text.
