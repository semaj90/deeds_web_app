# Tasks — ACE / HyperRAG / CHR97 graphify-packet chain audit

## AST extraction trace — CLOSED 2026-08-12

- [x] `rg -n "^import|require\(" sveltekit-frontend/scripts/index-codebase-fast.mjs` returns only
      `fs`/`path`/`crypto`/`url` — **confirmed no AST delegation of any kind.**
      `docs/graph/codebase-graph.json` (the file ACE's context-assembler reads, per
      `graph-intel.ts:55`) is built from pure filesystem heuristics, not tree-sitter/ast-grep.
- [x] Real AST extraction genuinely exists elsewhere in the repo — confirmed via a concurrent
      session's `docs/reports/phase2a-ast-grep-caller-chain-receipt.json` (status: `PROVEN`):
      `analysis/worker.ts` → `ast-grep-extractor.ts` → `code_features` table (packet_key-joined),
      separately backfilled into `feature_structural_facts` by
      `scripts/atlas/backfill-feature-layer-from-atlas-packets.mjs`.
- **Conclusion**: two genuinely disjoint pipelines, not one degraded one. `codebase-graph.json`
  (ACE's graph input) is AST-free by design/heuristic; the real AST/structural-facts pipeline
  feeds `code_features`/`feature_structural_facts` and is reachable only via `packet_key` joins,
  never via `codebase-graph.json`. ACE's context-assembler does **not** currently consume
  AST-derived structure through the graph-intel path — if AST-aware graph context is wanted in
  ACE, that's a real wiring gap (not yet raised as its own task; flag to user before scoping).

## CHR97/cartridge data-source trace — CLOSED 2026-08-12

- [x] Fully read `src/routes/api/cartridge/export/+server.ts` end to end. **Fully live, real
      production route** — not dead, not shallow-wired: 401 auth guard (`locals.user`), Zod
      input validation (`cartridgeExportSchema`), Redis cache check (`cartridge:{caseId}`, 30min
      TTL) before any Qdrant work, paginated Qdrant `scroll()` against `evidence_items` filtered
      by `case_id` payload match, builds real `RuneData[]` from scrolled points
      (embedding/text/sourceId/entities), calls `buildCartridge()`, writes back to Redis
      non-blocking, fires a Langfuse trace, returns the binary with proper headers.
- [x] **Resolved: CHR97/cartridge does NOT consume graphify output at all.** Its data source is
      the case-evidence Qdrant collection (`evidence_items`, scoped by `case_id`), which is
      populated by the evidence-ingestion pipeline (`docs/architecture` "Evidence Pipeline"
      section in CLAUDE.md), not by `graphify:daily`/`graphify:full`/`index-codebase-fast.mjs`.
      CHR97 is a **legal-evidence-cartridge domain**, disjoint from the **codebase-intelligence
      domain** (ACE/HyperRAG/graphify). This also answers the "which graphify artifact" question
      below — the answer for CHR97 specifically is "neither, it doesn't use graphify."
- **Conclusion**: the user's original ask bundled two genuinely separate systems under one
  sentence. ACE validator/assembler/materializer/HyperRAG RPC are the codebase-intelligence side
  (graphify-derived, confirmed in `proposal.md`). CHR97/cartridge is the legal-evidence side
  (case-scoped Qdrant, unrelated to graphify). Both are independently real and live; neither is
  broken; they were just never the same pipeline to begin with.

## Next session — pick up here

- [ ] Ask the user (or infer from context) whether "graphify GPU indexed json packets" — now that
      CHR97 is confirmed unrelated — means `graphify/frozen-graph-snapshot-v2.json` specifically
      (this session's `GRAPH_SNAPSHOT_PARITY` artifact) or the broader `graphify:daily`/
      `graphify:full` pipeline output (`docs/graph/codebase-graph.json` + Qdrant + Neo4j) for the
      ACE/HyperRAG side only. Confirmed different downstream consumers use different graphify
      outputs — don't assume they're the same thing.
- [ ] Decide whether ACE's AST-blindness (context-assembler reads `codebase-graph.json`, which
      has zero AST/tree-sitter derivation — see "AST extraction trace" above) is a gap worth
      closing, i.e. should ACE's graph-intel path also consume `code_features`/
      `feature_structural_facts` via `packet_key`. Get explicit approval before doing any wiring
      work — this is a new capability, not a bugfix.
- [ ] Register the resolved ownership status of each of the 6 components (validator, assembler,
      materializer, AST extraction, HyperRAG RPC, CHR97/cartridge) in
      `docs/architecture/runtime-ownership-registry.json`. All 6 now have a fully-traced verdict;
      this is now pure bookkeeping, not investigation.

## Reference

See `proposal.md` in this same change directory for the verified-vs-open table with exact
file:line evidence from the 2026-08-12 session. Do not re-derive what's already confirmed there —
extend from it.
