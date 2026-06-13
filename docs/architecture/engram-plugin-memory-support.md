---
name: Engram Plugin Memory Support
description: Optional adapter contract for low-trust episodic memory support in the parent atlas pipeline.
type: project
tags:
  - engram
  - memory
  - atlas
---

# Engram Plugin Memory Support

This document defines the optional memory plugin boundary for the parent atlas pipeline.

## Intent

- Add episodic memory support without making it a correctness dependency.
- Keep Redis, Qdrant, Neo4j, CouchDB, and Postgres as the authoritative stores.
- Allow a no-op adapter so the pipeline stays safe in dry-run mode.

## Research Stack

- Git library: use a real library (`simple-git` or equivalent) for repo metadata, status, and branch context instead of shell parsing.
- DeepSeek: candidate model family for architecture search and plan synthesis when Gemma4 needs a second opinion.
- TurboQuant: low-latency inference path for repeated summarization and hot-path scoring.
- RotorQuant: quantized compression / rerank research lane for memory payloads and n-gram style hints.
- deeds/engram: the preferred optional memory adapter lane for query transitions, directory-level hot context, and replay hints.
- Tiny-Engram: fallback-sized experiments only; not the canonical memory boundary.
- ngram Engram: lightweight sequence memory for query transitions and directory-level hot context.
- Gemma4: default local synthesizer for summaries, cards, and report text.

## Existing Code Surface

- `sveltekit-frontend/src/lib/server/search/engram-bigram.ts`
- `sveltekit-frontend/src/lib/server/ai/engram-memory.ts`
- `sveltekit-frontend/src/lib/server/ace/ngram-retrieval.ts`
- `sveltekit-frontend/src/lib/server/ace/context-assembler.ts`
- `sveltekit-frontend/src/lib/server/ace/adaptive-prefetch.ts`
- `sveltekit-frontend/tests/engram-dym.spec.ts`
- `sveltekit-frontend/tests/engram-graph-rerank.spec.ts`
- `docs/obsidian-vault/Files/src__lib__server__ai__engram-memory.md`
- `docs/obsidian-vault/Files/src__lib__server__search__engram-bigram.md`
- `docs/graph/codebase-graph.json`
- `docs/graph/multihop-codebase-map.json`
- `docs/graph/nes-glyph-architecture.json`

## Adapter Shape

- `health()`
- `writeMemory(memory)`
- `searchMemories(query, opts)`

## Rules

- Engram is optional and fails open (empty results on error).
- Engram must not override source code, provenance, or audit data.
- Engram writes should be adapter-only to ensure strict validation.
- Git context should be read through a library-backed adapter (e.g. `simple-git`), not ad hoc shell output.
- The existing Redis bigram and n-gram code paths are the current implementation base; the plugin adapter should wrap them, not replace them.
- deeds/engram is the preferred adapter surface for the optional memory lane; Tiny-Engram remains an experimental fallback, not the target contract.
- **DeepSeek/TurboQuant/RotorQuant** are research labels for the memory search stack, not currently verified repo dependencies.
- **NO THINKING TOKENS**: Storing raw internal LLM chain-of-thought or <thought> tags is strictly forbidden.

## Pipeline Fit

- `atlas:engram:sync` builds adapter-friendly memory candidates from workspace, cluster, and feature hot spots.
- The adapter can later point at Redis, Qdrant, or a dedicated Engram service without changing the atlas stage.
- Keep the adapter fail-open. If deeds/engram is unavailable, return empty results and continue the parent atlas flow.
- **DeepSeek/TurboQuant/RotorQuant** are research accelerators, not correctness dependencies.
- Integration into `HyperRagFusionService` is limited to low-trust `routingExplanation` hints and a minor rerank boost (0.05) for specific debug/workflow profiles.
