# OpenCode ACE addendum: next steps (updated 2026-10-12)

**Status**: Gate 0 partial; containment and consumer fixes done | **Model**: Ornith 1.5 9B via llama-server `:8090` | **Date**: 2026-10-12

## TL;DR

Containment and inference-path work is done. `codebase.awk_analyze` is gated off in source, but the running TRACE process still serves it until restart. Six runtime scripts now send chat to llama-server, with embeddings still on Ollama. The ACE consumers report `ACE_PACKET_UNAVAILABLE` instead of failing silently. The active `.opencode/ace-packet*` files are removed; the June packet and the empty run are preserved. The packer still packs 0 cards because the card bodies it reads (`.opencode/cards/`) are missing. The working card store is `neschrom97/cards/` (8,170 files; all 500 ranked IDs resolve there).

## Gate status

| Gate | Status | Evidence |
|---|---|---|
| 0 Script repair discipline | Partial | `node --check` passes on changed scripts; packer still packs 0 cards |
| 1 Valkey ACE hot cache | Scripts exist, not run | `cache_ace_packet.mjs`, `verify_cache.mjs` present; no acceptance run |
| 2 Intent memory table | Not started | Key contract only |
| 3 Feature labeling pass | Not started | `build-feature-labels.mjs` missing |
| 4 Domain topology | Not started | `graphify-domain-topology.mjs` missing |
| 5 TurboVec rerank | Not started | `npm run retrieval:turbovec:smoke` not checked |
| 6 Ornith tool-calling prompt | Not started | `build-agentic-prompt.mjs` missing |
| 7 Nightly and weekly summary | Partial | `nightly-summary.mjs` exists; weekly and acceptance not checked |
| 8 Later experiments | Deferred | Offline only |

## Done this round

- **MCP containment:** `codebase.awk_analyze` registration gated off in `sveltekit-frontend/src/mcp/codebase_tools.ts`. Handler kept. Parse check passes. Not in effect until TRACE restarts.
- **Chat to llama-server:** `scripts/config/llama_chat.py` helper (live-tested). Converted: `index_court_opinions_qdrant.py`, `eval/adversarial_tests.py`, `eval/citation_fidelity.py`, `content_ops/fictional_case_generator.py`, `phase96_intelligent_error_fixer.py`, `graphify-audit/langextract-bridge.ts`. Embeddings stay on Ollama.
- **ACE consumer status:** `feature-labeling.mjs` no longer defaults to `{}`; `ingest-ace-cards-to-glyphs.mjs`, `generate-glyph-upsert-preview.mjs`, `cache-ace-packet.mjs` and `prompt-generator.mjs` print `ACE_PACKET_UNAVAILABLE` when the packet is missing.
- **Packet preservation:** June packet and summary moved out of `.opencode/`. Copies in `.tmp/atlas/ace-recovery/` and `.opencode/production/` (manifest status `BASELINE_UNVERIFIED_INPUTS`). Empty run kept in `.tmp/atlas/ace-packet-empty-2026-10-12/` and `.opencode/candidates/`.
- **Snapshot:** copy-only snapshot with SHA-256 manifest in `.archive/production-hardening-2026-10-12/`.

## Findings

1. **Why the packer packs 0 cards.** `compress-cards.mjs` builds its card map from `.opencode/cards/` (absent). Ranked IDs match files in `neschrom97/cards/`. Path change needed; not yet made.
2. **`qdrant_id` is unreliable.** Populated on latent rows but does not resolve in `codebase_chunks_768` or `codebase_chunks_latent256`. Qdrant point IDs equal the chunk `id`.
3. **Second packet writer.** `scripts/ingest/build-ace-packet.mjs` writes `.opencode/ace-packet.json` from the cards directory.
4. **Remaining Ollama chat.** Shell tests (`scripts/test-ollama.sh`, `scripts/ollama-curl-tests.md`), docs and notebooks under `scripts/unsloth-training/`, `scripts/atlas/Index-DatabaseWithSummaries.ps1`, `scripts/audit/backend-infrastructure-audit.sh`. `src/lib/server/ollama.ts` already reroutes chat when `TURBOQUANT_INTERCEPT` is on (default `true`).

## Next steps

1. Restart TRACE through the governed procedure, then confirm `codebase.awk_analyze` is absent from `tools/list`.
2. Point `compress-cards.mjs` at `neschrom97/cards/` (decision needed). Add a non-empty check, backup before write, and an atomic write with readback. Test in a bounded run that writes only to `.opencode/candidates/`.
3. Decide whether `build-ace-packet.mjs` stays, is archived, or is routed through the same write path.
4. After gate 0 passes, run gate 1's Valkey smoke test.

## Rules for script edits (gate 0)

- Never assume a failed edit succeeded. Re-read the file.
- After any `.js` or `.mjs` or `.py` patch, run `node --check` or `python -m py_compile`.
- After repeated patch failures, restore the file and rewrite the affected section, rather than applying more string edits.

## Not done

- No `tasks.md` under `openspec/changes/` yet.
- No OpenCode skill files created.
- No Valkey or Qdrant writes.
- TRACE not restarted.
- Master TOC not regenerated (drift check fails; see `.tmp/atlas/toc-check-readonly.txt`).
