
---

## July 4, 2026 (Session 104+ CONTINUATION) — **IDENTITY SEMANTICS PINNED + PHASE 4-5 GATE FIXES**

✅ **IDENTITY SEMANTICS PINNED**:
- [**Identity Semantics Pinned (July 4)**](IDENTITY-SEMANTICS-PINNED-2026-07-04.md) — Canonical identity chain (packet_key ≠ title_id ≠ ULID ≠ domain_class). Fixes Phase 4-5 gate semantics: Phase 4 must check SQL data coverage (domain_class %), not file existence. Phase 5 must verify Qdrant payload fields (packet_key, source_ref, feature_id, domain_class), not just collection shape. Real gates documented with SQL + TypeScript scripts.

✅ **CHECKOUT STATE PINNED**:
- `:8090` = production synthesis (Gemma4 RotorQuant, canonical)
- `:8091` TurboQuant = **benchmark-only** (`.tmp/test1111-src/`, not default)
- `:11434` = Ollama embeddings (separate, immutable)
- No local docling model artifact; no local embeddinggemma ONNX artifact
- This repo = contracts + Atlas scripts only (not app checkout with opencode.json)

- [Retrieval Pipeline 20-Step Plan](RETRIEVAL-PIPELINE-20STEP-PLAN.md) — Complete roadmap for aggressive Bitfrost cache, vector indexing, clustering, ACE integration (14h critical path, 3 phases parallel)
- [Retrieval 20-Step TODO Tracker](.claude/RETRIEVAL-20-STEP-TODO.md) — Checklist for Steps 1-18 implementation with validation gates
