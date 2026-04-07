# Knowledge Source Evaluation

## Goal

Decide which external sources should be pulled into the local knowledge base for web-assisted retrieval, and which ones should remain fallback-only at query time.

## Current Ground Truth

- The live `knowledge_base` Qdrant collection is dense-only right now, so ingestion must tolerate dense-only upserts.
- The app already has a real multi-source search path through `/api/knowledge/search` that reranks Qdrant, glossary, statutes, and precedents together.
- The new `scripts/knowledge-base-builder.ts` can now do two things:
  - web-search and Wikipedia discovery for seed topics
  - direct `--seed-url` ingestion for first-party docs pages and curated repo docs

## Best Candidates To Ingest

### 1. Official API docs

Use: high value.

Why:
- stable structure
- low hallucination risk
- strong fit for RAG and KAG grounding
- best source for configuration, ports, env vars, and supported features

Examples worth seeding:
- Qdrant docs
- pgvector docs
- Redis docs
- Docker docs
- Google Custom Search / Programmable Search docs
- SearXNG docs

Recommendation:
- ingest directly with `--seed-url`
- tag them as canonical infra sources
- prefer these before blog posts or videos during answer synthesis

### 2. GitHub repo docs and READMEs

Use: medium to high value.

Why:
- useful for setup, examples, feature matrices, changelog context
- often better than generic blog posts for implementation details

Risks:
- repo landing pages include navigation noise
- issue threads can be speculative or outdated
- code-only pages are weak retrieval documents unless chunked carefully

Recommendation:
- ingest README, docs pages, release notes, and examples
- avoid bulk-ingesting entire repos unless there is a clear domain win
- prefer raw markdown or rendered docs pages over random code files

### 3. Karpathy LLM wiki / gist-style references

Use: medium value.

Why:
- compact conceptual overviews
- good for onboarding and terminology
- useful as non-canonical background context

Risks:
- not authoritative API documentation
- can drift from current implementations

Recommendation:
- ingest as explanatory context, not as a source of truth
- lower ranking than official docs for infra or runtime decisions

### 4. YouTube videos

Use: low to medium value.

Why:
- can explain architecture and mental models well
- occasionally useful for broad design understanding

Risks:
- poor HTML extraction from normal watch pages
- transcript quality varies
- higher noise than docs or repos
- weak citation quality unless transcripts are available

Recommendation:
- do not ingest raw YouTube watch pages
- only ingest transcripts, author notes, or linked companion docs
- treat as enrichment, not canonical retrieval material

## What Should Stay Query-Time Only

These are better as live retrieval or fallback context, not bulk-ingested by default:

- web search results with short snippets only
- generic blogs without stable ownership
- forum posts and issue comments
- arbitrary repo code blobs with little explanatory text

## Recommended Retrieval Order

1. Canonical local sources: glossary, statutes, precedents, internal knowledge base
2. Curated official docs ingested into `knowledge_base`
3. Curated repo docs and READMEs
4. Conceptual external references such as Karpathy notes
5. Live web search and Wikipedia as fallback enrichment

## Suggested First Seed Set

Use the builder with direct URLs for:

- pgvector documentation
- Qdrant documentation
- Redis documentation
- Docker Compose documentation
- SearXNG documentation
- Google Programmable Search documentation
- selected Karpathy gist/wiki pages as explanatory context

## Notes For This Repo

- The Go search service health remains degraded because the running Qdrant container only publishes `6333`, while the service expects gRPC on `6334`.
- Because of that, dense-only KB ingestion is the correct compatibility baseline today.
- Sparse and hybrid retrieval can be enabled later when the live Qdrant deployment exposes gRPC or the collection layout is rebuilt with sparse support.