# LangExtract and Parent Atlas Integrations

This document records the integration boundary for official LangExtract `1.6.0`
and the local Parent Atlas pipeline. LangExtract is an extraction and grounding
stage; it is not the owner of retrieval, tool selection, caching, graph
coordinates, or synthesis.

## Pipeline

```text
source bytes and source_ref
        |
        v
LangExtract 1.6.0
  grounded extraction spans
  extraction_class and attributes
  char_interval and alignment_status
        |
        v
provenance-v2 normalization
        |
        +--> AST / lexical / ontology feature preparation
        |
        +--> EmbeddingGemma document encoder
        |      semantic_768, 768 dimensions
        |      Qdrant projection
        |
        +--> CandidateFeatureMatrix
               Go Retrieval and ACE
```

## Ownership

| Concern | Owner | LangExtract role |
| --- | --- | --- |
| Grounded entities and source spans | LangExtract sidecar | Produces observations with intervals |
| Canonical identity and revisions | PostgreSQL / Graphify | Supplies `source_ref`, revisions, and hashes |
| Dense semantic search | EmbeddingGemma and Qdrant | Consumes normalized document text |
| Lexical retrieval | PostgreSQL FTS / approved sparse lane | Consumes extracted terms as evidence |
| MCP tool selection | MCP registry and query router | LangExtract may provide evidence, never selects tools |
| ACE packets and ContextManifest | ACE / Parent Atlas | Packs ranked evidence under a token budget |
| Redis/Valkey | Derived cache | Stores revision-qualified packets and plans only |
| Centroids/SOM/KMeans | Derived topology lane | Supplies routing and affinity features, not identity |
| Final synthesis | Agent/orchestrator | Must consume canonicalized ACE context |

## Evidence rules

- A LangExtract span is derived evidence and must retain `source_ref`, source
  revision, and alignment metadata.
- LangExtract output must not become canonical identity by itself.
- `semantic_768` is a representation contract, not a freshness or identity
  proof.
- Qdrant payloads, centroid assignments, and Valkey entries are projections;
  PostgreSQL and approved source bytes remain authoritative.
- ACE must receive canonicalized, revision-qualified context rather than raw
  LangExtract or Qdrant results.
- Generated synthesis is not source evidence unless its underlying evidence
  references are retained and independently admitted.

## Captured official sources

The derived crawl is stored under `docs/.okf/langextract` and currently includes
the repository, README, package metadata, releases, PyPI metadata, provider
integration guidance, and the grounded long-document example. The crawl is
documentation evidence only; it does not promote any Atlas data.

Report: `docs/reports/langextract-okf-fetch-v1.json`.
