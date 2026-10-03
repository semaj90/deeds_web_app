# ACE / HyperRAG / CHR97 — Does the graphify-indexed packet chain actually work end to end?

**Status**: AUDIT AND DESIGN DECISIONS RECORDED 2026-09-24. The runtime trace found two genuinely
separate systems bundled under one ask. The artifact distinction and AST-aware ACE direction are
now recorded; production AST wiring remains a separate lineage-gated capability and is not claimed
complete here. Started 2026-08-12 in response to:
"make sure our ace validator assembler materializer ast semantic hypergraphrag rpc packet nes
chrom97 works from indexed graphify gpu indexed json packets". This change captures what was
verified live via grep/read (not fabricated), what remains genuinely unresolved, and the exact
next commands for whoever picks this up.

## Why this exists

A background verification fork did an initial pass and reported several components
"DISCONNECTED" (packet materializer, CHR97/glyph layer) based on a narrow grep. A follow-up
direct grep in the main session **contradicted that** — both components have real, live callers
including production API routes. The fork's finding was too narrow, not fabricated, but it would
have been wrong to hand off as-is. This change exists so the corrected, verified state is what
persists, not the fork's incomplete first pass.

## Verified live (2026-08-12, direct grep + read, not assumed)

| Component | File | Evidence |
|---|---|---|
| ACE packet validator | `sveltekit-frontend/src/lib/server/atlas/envelope-validator.ts` | Validates against `atlas_packets` (Postgres canonical identity table, populated by graphify) |
| ACE context assembler | `sveltekit-frontend/src/lib/server/features/ai/ace/context-assembler.ts:2196` → `graph-intel.ts:55` | `GRAPH_PATH = path.resolve('docs/graph/codebase-graph.json')` — direct read of graphify's fast-indexer output. Confirmed live code path. |
| HyperRAG RPC packet | `sveltekit-frontend/src/routes/api/hyperrag/packet-rpc/+server.ts` | Reads Qdrant + Postgres FTS + Neo4j — the three canonical mirrors graphify populates (per this repo's architecture rule: raw graphify JSON is transient, the mirrors are canonical) |
| Packet materializer | `sveltekit-frontend/src/lib/server/atlas/tensors/packet-assembler.ts` | **Real callers found**: `src/lib/server/ace/indexed-source-packet.ts`, `src/lib/server/features/ai/ace/context-assembler.ts`. (Corrects the verification fork's "DISCONNECTED" finding — that was based on too narrow a grep.) |
| CHR97 / glyph / cartridge | `chr97-builder.ts`, `glyph-record.ts` | **Real callers found**, including live API routes: `src/routes/api/cartridge/{export,search,timeline}/+server.ts`, `src/routes/api/glyph/search/+server.ts`, plus `cartridge-tensor-bridge.ts`, `glyph-tile-engine.ts`, `hmm-ace-analyzer.ts`, `rune-to-legal-doc.ts`, and 10+ more. (Also corrects the fork's "DISCONNECTED" finding.) |

## Resolved this session (2026-08-12, second pass)

- [x] **AST/semantic extraction trace — CLOSED.** `index-codebase-fast.mjs` imports only
  `fs`/`path`/`crypto`/`url` — confirmed zero AST delegation. `docs/graph/codebase-graph.json`
  (ACE's graph-intel input) is built from pure filesystem heuristics, not tree-sitter/ast-grep.
  Real AST extraction genuinely exists (confirmed via a concurrent session's
  `docs/reports/phase2a-ast-grep-caller-chain-receipt.json`, status `PROVEN`): `analysis/worker.ts`
  → `ast-grep-extractor.ts` → `code_features` table, packet_key-joined into
  `feature_structural_facts`. This is a **disjoint pipeline** from `codebase-graph.json` — ACE does
  not currently consume AST-derived structure via its graph-intel path. Not a bug; a real design
  gap if AST-aware ACE context is wanted (flagged as an open question below, not auto-fixed).
- [x] **Full call-chain proof for CHR97 — CLOSED.** Read `src/routes/api/cartridge/export/+server.ts`
  end to end: fully live, real production route (401 guard, Zod validation, Redis 30min cache,
  paginated Qdrant `evidence_items` scroll filtered by `case_id`, real `RuneData[]` construction,
  `buildCartridge()`, Langfuse trace, correct binary response headers). **CHR97/cartridge does NOT
  consume graphify output at all** — its source is case-scoped evidence embeddings from the
  evidence-ingestion pipeline, a domain entirely separate from codebase-intelligence graphify.
- [x] **Which Graphify artifact each consumer uses — RESOLVED 2026-09-24 by owner trace.** ACE's
  current graph-intel input is `docs/graph/codebase-graph.json`; its retrieval mirrors are separate
  consumers. `frozen-graph-snapshot-v2.json` is a different GRAPH_SNAPSHOT_PARITY artifact, not the
  ACE runtime input. CHR97/cartridge uses case-scoped legal evidence and consumes neither Graphify
  artifact. No Graphify command was run for this resolution.

## Decisions recorded; implementation follow-up remains

- **AST-aware ACE context: desired, but lineage-gated.** The operator direction recorded in
  `tasks.md` is to admit AST-derived structural evidence through the existing identity-qualified
  candidate/ordinal/feature path. Raw Graphify JSON must not bypass SearchRuntime. The current
  normalizer still emits empty `evidenceRefs` and `representationBindings`, so production wiring
  remains unproven and requires a separate implementation/proof gate after lineage and route-owner
  readiness.
- **Graphify artifact: resolved.** ACE currently reads `docs/graph/codebase-graph.json`; the frozen
  graph snapshot is a separate parity artifact. CHR97/cartridge is an independent legal-evidence
  pipeline.
- **Runtime ownership registry: registered 2026-09-05** (see completed task 7); no further registry
  edit is required for this audit.

## Explicitly not done this session (scope boundary)

No code was written or changed for this investigation — read-only verification only, per the
user's original framing ("make sure ... works"), which was treated as an audit ask, not an
implementation ask. If gaps are found on the next pass, treat fixing them as a separate,
explicitly-approved step — do not fix-while-auditing.
