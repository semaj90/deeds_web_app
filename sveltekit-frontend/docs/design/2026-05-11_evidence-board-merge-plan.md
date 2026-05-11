# Evidence-board merge plan — best-of-7

**Status**: DESIGN + executing in phases.
**Created**: 2026-05-11
**Companion**: `docs/audit/2026-05-11_feature-spec-implementation-audit.md` §3.16 (board fragmentation finding) + commit `a27179aee5` (rich board behind `?board=rich` flag)

---

## 0. Goal

Take the 7 detective/evidence board variants currently in the repo and produce ONE canonical case-evidence board (`evidence/EvidenceBoard.svelte`, 1290 LoC) that has the best features from every variant. Done in **N small reviewable commits**, not one mega-merge.

## 1. Variant inventory + unique-feature audit

| File | LoC | Features already in canonical? | Worth porting |
|---|---|---|---|
| `evidence/EvidenceBoard.svelte` (canonical) | 1290 | 3 modes (grid/free/magnetic), undo/redo, layout-persist, search overlay, minimap, relationship inspector, drag-to-connect, multi-select | — (base) |
| `detective/DetectiveBoard.svelte` | 345 | search via Fuse.js, drag-drop via svelte-dnd-action, view modes (columns/canvas) | **YES**: AI Assistant Panel toggle, AI-highlighted evidence chips, UploadZone drag-drop, "analyze selected" bulk action, columns view mode |
| `detective/ContextualDetectiveBoard.svelte` | 788 | (different — RAG/ACE wiring) | **YES**: HeadlessTypingListener (predictive prompts), SSE collaboration sync, RAG-driven detective analysis trigger, connection-map generator |
| `yorha/EvidenceBoard.svelte` | 335 | YoRHa-themed re-skin | **MAYBE**: theme tokens for `data-theme="yorha"` opt-in |
| `EvidenceBoardPane.svelte` (prod default) | 121 | minimal grid | NO — kept as fallback |
| `CodeEvidenceBoard.svelte` | 496 | code-graph domain | NO — different domain, keep separate |
| `RouteInspectorDetectiveBoard.svelte` | 444 | route-debug domain | NO — different domain, keep separate |

## 2. Merge order (one port per commit)

Ordered by (user-blast-radius × additive-safety):

| Phase | Port | Source | Effort | Risk |
|---|---|---|---|---|
| **M1** | AI Assistant Panel toggle + aiHighlightedEvidence chips | `detective/DetectiveBoard.svelte` | 30 min | Low — opt-in via prop flag |
| M2 | UploadZone drag-drop onto board surface | `detective/DetectiveBoard.svelte` | 30 min | Low — additive |
| M3 | "Analyze selected evidence" bulk action button | `detective/DetectiveBoard.svelte` | 20 min | Low — additive |
| M4 | columns view mode (alongside grid/free/magnetic) | `detective/DetectiveBoard.svelte` | 45 min | Medium — new layout mode in mode state machine |
| M5 | HeadlessTypingListener for predictive prompts | `detective/ContextualDetectiveBoard.svelte` | 45 min | Medium — adds XState dep + SSE wire |
| M6 | SSE collaboration sync (multi-user real-time) | `detective/ContextualDetectiveBoard.svelte` | 1 hr | Medium-high — needs server-side SSE endpoint verified |
| M7 | RAG-driven detective analysis trigger | `detective/ContextualDetectiveBoard.svelte` | 30 min | Low — calls existing `/api/ai/*` route |
| M8 | Connection map auto-generator (RAG → suggested links) | `detective/ContextualDetectiveBoard.svelte` | 45 min | Medium — touches the connection-graph state |
| M9 | YoRHa theme tokens via `data-theme` | `yorha/EvidenceBoard.svelte` | 20 min | Low — pure CSS |

**Total budget**: ~5 hours across 9 commits. Each commit is independently reviewable + reversible.

## 3. Post-merge cleanup (M-final)

Once M1-M8 land + flag-on path is validated:

- Archive `yorha/EvidenceBoard.svelte` → `deeds_labs/` (0 consumers, theme tokens absorbed)
- Mark `detective/DetectiveBoard.svelte` as `@deprecated` in JSDoc; keep file for one release cycle
- Mark `detective/ContextualDetectiveBoard.svelte` as `@deprecated`
- Migrate consumers (`/admin/all-routes`, `/analysis-center`) to `evidence/EvidenceBoard.svelte`
- Promote `?board=rich` → default; keep `EvidenceBoardPane.svelte` as the explicit `?board=minimal` fallback

## 4. Non-goals

- **Does NOT touch** `CodeEvidenceBoard.svelte` or `RouteInspectorDetectiveBoard.svelte` — different domains (codebase graph + route inspector), kept separate
- **Does NOT replace** the production `EvidenceBoardPane.svelte` — stays the default until M-final
- **Does NOT add new MCP tools, Postgres tables, or API routes** — each port reuses what already exists
- **Does NOT drop the `?board=rich` flag** — flag stays for the duration of the merge so flag-off rollback is always available
- **Does NOT block on the schema-finalization migration** — board work is pure UI, operates on whatever data the load function returns

## 5. Hard gates per port

Each merge commit MUST:

1. Be flag-on safe — `?board=rich` URL still renders the rich board without errors
2. Be flag-off safe — default `/cases/[id]/evidence` URL still renders the minimal pane unchanged
3. Pass `svelte-check` with 0 new errors
4. Add the new feature as an OPT-IN prop or query param, not a default behavior change
5. Document the new prop / param in the commit message

## 6. Cross-references

- `docs/audit/2026-05-11_feature-spec-implementation-audit.md` §3.16 — board fragmentation finding
- commit `a27179aee5` — `?board=rich` flag introduction
- `src/lib/components/evidence/EvidenceBoard.svelte` — canonical merge target
- `src/lib/components/ai/AIAssistantPanel.svelte` + `src/lib/stores/unified/ai-assistant-store.svelte.ts` — M1 deps (verified present)