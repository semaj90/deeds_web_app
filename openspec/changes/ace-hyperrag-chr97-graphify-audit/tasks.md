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

- [x] Resolve the "graphify GPU indexed json packets" artifact distinction from current owners:
      ACE's graph-intel reader consumes `docs/graph/codebase-graph.json`; its canonical retrieval
      mirrors remain separate consumers. `graphify/frozen-graph-snapshot-v2.json` is the distinct
      `GRAPH_SNAPSHOT_PARITY` artifact, not ACE's current runtime input. CHR97/cartridge consumes
      case-scoped legal evidence and is unrelated to either Graphify path. No Graphify command was
      run for this resolution (2026-09-24).
- [x] Record the operator decision for AST-aware ACE context (2026-09-24): **yes, it is a
      capability worth closing**, but AST evidence may enter ACE only through the existing
      identity-qualified candidate/ordinal/feature admission path, not by injecting raw Graphify
      JSON or bypassing SearchRuntime. Current composition remains a pure consumer of already
      admitted candidates/features; `search-runtime-candidate-normalizer-v1.ts` still emits empty
      `evidenceRefs` and `representationBindings`, so production wiring is NOT proven and must wait
      for source/evidence lineage and a production route owner. This decision does not claim that
      AST evidence is currently available to ACE or authorize a lineage bypass.
- [x] **DONE (2026-09-05).** Registered all 6 components in
      `docs/architecture/runtime-ownership-registry.json`: `ace_packet_validator`,
      `ace_context_assembler` (carrying the AST-blindness `known_gap` note), `hyperrag_rpc_packet`,
      `ast_structural_extraction`, `chr97_cartridge_glyph` as top-level `CANONICAL_OWNER` entries,
      and `packet_materializer` nested as a `BACKEND` under `ace_context_assembler` (its two real
      callers). One path correction along the way: `ace_context_assembler`'s graph-intel dependency
      is `sveltekit-frontend/src/lib/server/graph/graph-intel.ts`, not
      `atlas/graph-intel.ts` as this change's `proposal.md` originally stated — verified the real
      location before registering. Re-ran `node scripts/atlas/audit-runtime-ownership.mjs` before
      and after: identical baseline violation set both times (the pre-existing
      `cutile_kernel_challenger`/`tensorrt_rtx_decoder_challenger` classification conflicts), zero
      new violations introduced by these 6 entries.

## Reference

See `proposal.md` in this same change directory for the verified-vs-open table with exact
file:line evidence from the 2026-08-12 session. Do not re-derive what's already confirmed there —
extend from it.
