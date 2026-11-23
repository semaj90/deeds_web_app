# Agentic documentation context pipeline v1

Date: 2026-11-18

## Result

Added a registered `.okf` YAML design contract for bounded official-document
capture, BeautifulSoup normalization, canonical external-document admission,
retrieval, KAG relation proposals, bounded DAG planning, offline DSPy evaluation,
and ACE ContextManifest assembly. The new pipeline remains `DESIGN_ONLY`; its
write and model-execution permissions are off. No database, vector, graph, or
cache writes were performed.

## Existing owners reused

- Firecrawl captures pages; BeautifulSoup parses already-captured HTML.
- The existing DSPy 3.4.0 corpus snapshot is 165/165 fetched with zero failures,
  but its receipt still says `LOCAL_UNADMITTED`.
- Existing canonical documentation tables are
  `atlas_external_doc_pages` and `atlas_external_doc_chunks`. The pipeline
  requires the external-document admission path before indexing.
- PostgreSQL FTS is the lexical path. `semantic_768` remains EmbeddingGemma's
  qualified representation; Qdrant, graph, and Valkey outputs remain derived.
- SearchRuntime owns cross-lane fusion. KAG edges remain proposals pending
  tuple admission. DAG execution stays capability-gated and cannot write stores.
- DSPy optimizers are restricted to offline held-out evaluation and a reviewed,
  versioned promotion receipt.
- ACE receives only ranked, source-qualified candidates and must verify the
  existing ContextManifest checksum and evidence allowlist before injection.

## Source review

Firecrawl retrieved Google's official Gemini structured-output and function-
calling pages, DSPy's optimizer reference, and Beautiful Soup's official docs.
The Google pages describe JSON Schema-constrained results and model-selected
function calls; these support typed proposal interfaces, not authorization for
tool execution. The docs remain external references in the pipeline contract;
they were not copied into a canonical corpus in this change.

## Validation and limits

- YAML and JSON parse checks passed for the new pipeline, the `.okf` registry,
  and its schema; registry entries and disabled-write invariants were checked.
- `git diff --check` passed on the scoped changes.
- No application tests or live indexing were run.
- Google AI docs use a mutable URL channel; capture must record the resolved URL,
  retrieval time, and content hashes. The DSPy corpus uses a pinned 3.4.0 snapshot.
- This is an ingestion and context design contract, not proof that Google pages
  are captured locally, canonical tables are populated, or recommendations run.
