---
name: DeepSeek Engram Architecture Search
description: Research note for the parent atlas memory search stack using Git metadata, DeepSeek, TurboQuant, RotorQuant, ngram Engram, and Gemma4.
type: project
tags:
  - engram
  - deepseek
  - gemma4
  - turboquant
  - rotorquant
  - git
---

# DeepSeek Engram Architecture Search

This is a research-only search lane for the parent atlas memory layer.

## Inputs

- Git repository metadata via a proper library-backed adapter
- Repo-root atlas outputs
- SvelteKit route/import/env maps
- Redis hot cache summaries
- Qdrant cluster payloads
- Gemma4 summaries

## Candidate Roles

- DeepSeek: architecture search, decomposition, and plan comparison
- TurboQuant: low-latency summarization / rerank path
- RotorQuant: quantized memory compression and search hinting
- ngram Engram: sequential query memory and local hot context
- Gemma4: local synthesis and report generation

## Search Questions

- Which files should produce episodic memory cards?
- Which stores should own writeback for each memory kind?
- Which signals should stay in Redis only?
- Which memory payloads need Qdrant, Neo4j, or CouchDB projection?

## Code Anchors (Verified)

- `src/lib/server/ai/engram-memory.ts` (Redis logic)
- `src/lib/server/search/engram-bigram.ts` (N-gram logic)
- `src/lib/server/memory/local-engram-memory-adapter.ts` (Adapter logic)

## Rule

No search result becomes a hard dependency unless it is backed by a concrete code path or validated store write. Storing raw "thinking tokens" or internal LLM traces is strictly prohibited.
