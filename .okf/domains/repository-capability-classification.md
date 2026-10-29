---
type: domain_profile
title: Repository Capability Classification
description: Evidence-first, revision-bound proposals for repository capabilities and fit-for-purpose tools.
resource: .okf/domains/repository-capability-classification-v1.yaml
tags: [parent-atlas, classification, tree-sitter, ast-grep, networkx, graphrag, openwiki]
timestamp: 2026-10-28T00:00:00Z
---

# Repository Capability Classification

The machine-readable contract is [repository-capability-classification-v1.yaml](repository-capability-classification-v1.yaml), validated by [the Pydantic profile model](../../python/parent_atlas_ontology/repository_capability_profile_v1.py) and [its focused tests](../../python/tests/test_repository_capability_profile_v1.py).

## Recommended evidence path

1. Bind exact source/workspace revisions and verified symbol identity first.
2. Inventory source files and declared/resolved dependencies (`rg --files`, package manifests, and lockfiles).
3. Ask the existing **8095 Tree-sitter lane** for CST/AST nodes and exact byte spans; use **ast-grep** for structural patterns and metavariable captures.
4. Add compiler-backed TypeScript semantic observations through the verified ts-morph owner. Treat LSP/tsserver as optional unless a live caller is verified; keep unresolved symbols unresolved.
5. Verify API, route, and Drizzle relationships; use document semantics only with attributable spans.
6. Treat graph proximity and embedding matches as lower-priority recommendations, then emit a proposal with feature label, domain class, source scope, function/API fit, version evidence, tradeoffs, alternatives, and abstention reason.

Tree-sitter provides syntax structure; ast-grep provides syntax-aware pattern matches; neither by itself proves runtime execution or canonical admission. OpenWiki indexes and links curated claims, but every claim must be checked against its owning source or receipt.

## BYOG and GraphRAG

The existing [NetworkX executor](../../python/atlas_graph_runtime/networkx_executor.py) is the CPU reference for bounded directed graph traversal, PageRank, personalized PageRank, and CheiRank. Accept BYOG only with a graph revision, typed/directed edges, source-bound nodes, and provenance. GraphRAG may nominate hidden paths such as `finding → file → symbol → caller → test`; each edge must be verified from source evidence before it informs a recommendation. Limit traversal depth and fanout as specified in the YAML profile. Missing or stale graph metrics are omitted; deterministic ranking continues without them.

## Agent and data-tool choices

- **Pydantic** validates the proposal contract; **Zod** remains the TypeScript request boundary.
- **DuckDB/PyArrow** are the CPU-first local batch and Parquet path. Use cuDF/cuML/PyTorch only for bounded, revision-qualified batches where measured benefit justifies GPU use.
- **LangChain Deep Agents** and **Google ADK** are separate optional orchestration ecosystems. Neither is installed/enabled by this profile; neither can author labels, revisions, or store writes.
- **OpenWiki** is navigation and linked Markdown, not an inference or classification engine.

The goal is function/library recommendations grounded in actual repository package manifests and implementation call sites—not package installation or a guessed taxonomy assignment. `source_scope` (first-party, vendored, generated, documentation, test, or unknown) is kept distinct from domain classification.

## Authority and related owners

- [Domain profile index](index.md)
- [Domain profile changelog](logs.md)
- [Parent Atlas compute ownership](../systems/parent-atlas-compute-ownership.md)
- Existing [feature-label derivation owner](../../openspec/changes/feature-label-semantic-derivation/tasks.md)

Classification outputs stay `PROPOSAL_ONLY`; labels are not packet identity. Canonical labels remain with the existing feature-label owner and require reviewed assignments, lineage, held-out evaluation, and owner approval.

## ACE and cache boundary

ACE packet readers/writers and BitFrost/Valkey cache helpers exist, but the feature-label → admitted ACE packet → revision-qualified prefill → cache warm path is not proven end to end. Cache code presence is not a cache hit receipt. Do not warm live caches from proposed labels or incomplete packet lineage; require a reviewed label, admitted identity/revision, cache-key receipt, readback, and hit/miss evidence first. No live cache operation is part of this profile.
