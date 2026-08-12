# ACE / HyperRAG / CHR97 — Does the graphify-indexed packet chain actually work end to end?

**Status**: FULLY TRACED 2026-08-12. All 6 components have a verified verdict (see table + closed
tasks below); no code was changed. Two genuinely separate systems were found bundled under one
ask — see "Genuinely still open" below for the one real design question left (ACE's AST-blindness)
and `tasks.md` for the closed-task detail. Started 2026-08-12 in response to:
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
- [x] **Which "graphify GPU indexed json packets" the user means — PARTIALLY RESOLVED.** For the
  CHR97 half: moot, it uses neither graphify artifact. For the ACE/HyperRAG half: still genuinely
  ambiguous between `frozen-graph-snapshot-v2.json` (this session's GRAPH_SNAPSHOT_PARITY subject)
  and `codebase-graph.json` (what ACE's context-assembler actually reads, confirmed above) —
  worth a direct question to the user before any further work assumes one or the other.

## Genuinely still open

- [ ] **Should ACE consume AST-derived structure?** `codebase-graph.json` has none; real AST
  facts (`code_features`/`feature_structural_facts`) exist but are reachable only via `packet_key`
  joins, never through the graph-intel path ACE uses. This is a scoping/design question for the
  user, not a bug to silently fix.
- [ ] **Which graphify artifact for ACE specifically** — see above, still ambiguous.
- [ ] **Register findings** in `docs/architecture/runtime-ownership-registry.json` — all 6
  components now have a fully-traced verdict (table above + this section); registering them is
  now pure bookkeeping, not investigation.

## Explicitly not done this session (scope boundary)

No code was written or changed for this investigation — read-only verification only, per the
user's original framing ("make sure ... works"), which was treated as an audit ask, not an
implementation ask. If gaps are found on the next pass, treat fixing them as a separate,
explicitly-approved step — do not fix-while-auditing.
