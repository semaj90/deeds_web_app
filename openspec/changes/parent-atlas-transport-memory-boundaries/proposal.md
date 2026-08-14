# Parent Atlas — Transport, Memory, and Structural Boundaries

## Status

Classification and ownership backlog only. No runtime transport, memory, vector, or agent protocol changes are authorized by this OpenSpec.

## Purpose

Keep Tree-sitter structural evidence, GIS identity, canonical memory, retrieval executors, application APIs, compute RPC, tool protocols, editor-agent sessions, and agent-to-agent delegation as distinct ownership boundaries.

## Frozen boundaries

- Tree-sitter CST and named structural nodes: syntax and parse evidence only.
- GIS / Parent Atlas: canonical `symbol_id`, `symbol_version_id`, `packet_key`, `feature_id`, `source_ref`, and provenance.
- Postgres: durable canonical packets, receipts, and ACE policy state.
- ContextManifest: exact model-context injection receipt.
- llama-server `:8090`: chat generation and ephemeral KV prompt-cache optimization only.
- Valkey/BitFrost: revision-qualified hot cache and invalidation only.
- Qdrant: persistent retrieval projection.
- TurboVec/cuVS/CAGRA: rebuildable dense retrieval executors behind SearchRuntime; one logical dense lane.
- simdjson: optional JSON/JSONL parsing accelerator, never semantic schema authority.
- tRPC: local TypeScript application/API boundary.
- gRPC: native polyglot compute-service boundary.
- MCP: agent tools and resources.
- ACP: coding-editor/IDE to agent boundary.
- A2A: independent agent-to-agent delegation boundary.
- RLM: internal bounded evidence-navigation behavior, not an external bus.

CAST is intentionally not introduced as a Tree-sitter standard or canonical Atlas schema. Use Tree-sitter CST named-node projection or an Atlas StructuralMemoryCard when a compact derived representation is required.

## Out of scope for this classification change

No CAGRA promotion, BM42 implementation, RRF changes, canonical identity changes, direct GPU kernel exposure through MCP, A2A writable graph state, or production transport migration.
