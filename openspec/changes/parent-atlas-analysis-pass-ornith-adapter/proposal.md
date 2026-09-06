## Why

`docs/reports/parent-atlas-workstation-phase-11-17-implementation-plan-v1.md` names Phase 11
("Engram / model memory wiring") and two gates — `ORNITH-ANALYSIS-ADAPTER-01` and
`ANALYSIS-PASS-CURRENT-SELECTION-01` — as the control path for routing analysis-pass synthesis
calls through the canonical Ornith resolver and persisting only revision-qualified, grounded
receipts. Confirmed live (2026-09-05, via `grep -rli "ornith.*analysis\|ORNITH-ANALYSIS"
openspec/changes/`, zero hits): neither gate has an owning OpenSpec change, despite the plan
document's own stated role requiring one. Given this repo's confirmed heavy concurrent multi-session
activity, an orphaned, unowned gate name is a real risk of duplicate or conflicting work by a
different session. This change claims ownership and records what a same-day caller-census audit
already found, so the remaining real work isn't re-derived or duplicated.

## What Changes

- Claim ownership of `ORNITH-ANALYSIS-ADAPTER-01` and `ANALYSIS-PASS-CURRENT-SELECTION-01`.
- Record the corrected caller-census finding: contrary to an initial grep-level assumption, reading
  the actual call sites in `sveltekit-frontend/src/lib/server/analysis/` shows every real synthesis
  call site already routes through the canonical shared resolver
  (`resolveLlamaInferenceTarget()` in `sveltekit-frontend/src/lib/server/llm/runtime-contract.ts`)
  or `VLM_MODELS.legal` (`sveltekit-frontend/src/lib/server/ollama.ts`, already `'ornith-1.5-9b'`)
  — or correctly stays on the separate, deliberately-unchanged VLM lane (`LOCAL_VLM_MODEL`,
  Granite-Docling). Zero of the 12 files originally flagged by string-matching need functional
  rerouting; only cosmetic filenames/labels remain stale.
- **CORRECTED (2026-09-05, same day, web-verified)**: Ornith 1.5 9B is upstream vision-capable —
  confirmed via Hugging Face (`ornith-ai/Ornith-1.5-9B-GGUF`), which ships a real, dedicated
  projector file, `mmproj-Ornith-1.5-9B-BF16.gguf`, auto-resolvable by llama.cpp's `-hf` flag or
  loadable via `--mmproj`. The earlier finding that "Ornith has no VLM" was correct only about the
  *current local runtime configuration* (`GET :8090/props` → `modalities: {vision: false}`,
  confirmed live — no projector loaded) but wrong to state as a capability limit of the model
  itself. `models/mmproj-F16.gguf` remains a Gemma-4-family SigLIP tower (per
  `models/model-manifest.json`) and MUST NOT be paired with Ornith — the fix is acquiring the
  correct, Ornith-specific projector, not repurposing the Gemma one.
- Add a new gate, `ORNITH-VLM-MMPROJ-01`, scoped narrowly: acquire/register the real
  `mmproj-Ornith-1.5-9B-BF16.gguf`, extend `models/model-manifest.json` with a
  model-family→projector-family mapping (never a global "whatever's in `TURBO_MMPROJ_PATH`"
  pointer), update `launch-turboquant.ps1` to stop unconditionally skipping mmproj for the
  `ornith-1.5` profile, and prove a live `ornith-1.5-vlm` startup profile
  (`GET :8090/props` → `modalities.vision: true`) alongside the existing text-only profile — not a
  new model architecture, not a replacement for the text/tool path.
- Scope the genuinely remaining work: complete the deferred Engram ingestion lane (per
  `reports/parent-atlas-workstation-todo.md`'s "Engram ingestion | created + wired; deferred" and
  "Missing: complete Engram ingestion and current analysis-memory wiring"), and prove replay +
  current-pass selection for `analysis_pass_results` before any supersession operation is allowed.
- Extend, not replace: `analysis-pass-results.ts` (writer), `analysis-pass-current.ts`
  (current-pass selector), `analysis-pass-boundary.ts` (caller boundary) remain the canonical
  trio per `reports/parent-atlas-workstation-todo.md`'s own Pass Fabric row — this change does not
  introduce a second receipt owner.

## Capabilities

### New Capabilities

- `analysis-pass-ornith-adapter`: governs the caller-census-verified Ornith routing boundary for
  analysis-pass synthesis calls, the Engram-ingestion completion sequence, and the
  replay/current-selection proof gate required before any `analysis_pass_results` supersession.
- `ornith-vlm-mmproj`: governs acquiring/registering the correct Ornith-specific mmproj projector,
  the model-family→projector-family resolution rule, and the live proof that a local
  `ornith-1.5-vlm` startup profile actually serves vision requests.

### Modified Capabilities

(none — no existing `openspec/specs/` capability covers this boundary)

## Impact

- **Code** (verification/completion only, no rewrite of already-correct call sites):
  `sveltekit-frontend/src/lib/server/analysis/*` (12 files audited, 0 need rerouting),
  `sveltekit-frontend/src/lib/server/ai/engram-memory.ts`,
  `sveltekit-frontend/src/lib/server/memory/local-engram-memory-adapter.ts` (deferred ingestion
  lane), `sveltekit-frontend/src/lib/server/analysis/analysis-pass-{results,current,boundary}.ts`
  (canonical receipt trio, extend not replace).
- **Docs**: `docs/reports/parent-atlas-workstation-phase-11-17-implementation-plan-v1.md` (Phase 11
  section, already updated same day with the caller-census evidence this change formalizes).
- **No datastore writes, no mutation authorization needed** — this change is governance/proof
  scoping only at proposal stage; any actual Engram-ingestion write work is a later, separately
  authorized task under this change's `tasks.md`.
