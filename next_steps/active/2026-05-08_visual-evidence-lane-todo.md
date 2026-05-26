# Visual Evidence Lane — TODO (Bits UI / Svelte screenshots)

> Scope: a parallel retrieval lane for **UI artifacts** that mirrors the
> existing code graph. Treats screenshots as evidence with the same shape
> (ID, payload, embedding, topology link) so ACE can recommend UI fixes
> alongside code fixes. **Not a replacement** for the codebase graph.

## Current state (verified 2026-05-08)

**Pipeline runs:** logs/task-output/pipeline-test/09-visual-lane.log

| Stage | Script | Result |
|---|---|---|
| Index | `npm run screenshots:index` | ✅ 30 rows (`tests/screenshots/latest/*.png`) |
| Sharp enrich | `npm run screenshots:enrich:apply` | ✅ 30 phashed + 16×16 thumbs + dims (avg 1365×798) |
| Gemma4 VLM caption | `npm run screenshots:caption:apply` | ❌ Ollama 500 — model failed to load (VRAM contention with TurboQuant :8090) |

**Postgres**: `screenshot_artifacts` provisioned (1 table, 12 indexes, HNSW
tested with synthetic 768-dim vector → similarity 1.0). 30 real rows
indexed with phash + thumb URI + dims; caption + caption_embedding still
NULL.

**Bits UI components in active use** (9 unique across 40 files):
`Button · Collapsible · Dialog · DropdownMenu · Label · ScrollArea · Select · Tabs · Tooltip`

## P0 — Unblock captioning

### 1. VRAM coordination (Gemma4 VLM ↔ TurboQuant)
The RTX 3060 Ti has 8 GB. TurboQuant llama-server holds it; Ollama can't
load gemma4-rotorquant:latest in parallel.

**Options** (in order of disruption):
- **a)** Add a `caption-screenshots-via-turbo.mjs` that hits TurboQuant's
  llama-server at :8090 directly (it already has the mmproj vision tower)
  via `/v1/chat/completions` with `image_url` data URLs. No Ollama
  involvement, no model swap.
- **b)** Add `screenshots:caption:exclusive` that calls `npm run turbo:stop`,
  caption, then `npm run turbo:start:detached`. Documented for batch
  re-caption only (kills tab completion latency for the duration).
- **c)** Quantise to a smaller VLM (e.g. `gemma3:e2b-it-q4` + minimal
  mmproj) for screenshot captioning specifically. Ollama can hold both at
  once. Trade caption quality for parallelism.

Recommendation: **(a)** first — reuse existing TurboQuant. Falls back to
(b) for batch re-caption. Skip (c) until volume warrants it.

### 2. Caption embedding write path
Currently `caption-screenshots-gemma4.mjs` calls embeddinggemma after
caption. Verify the 768-dim vector lands in `caption_embedding` and is
HNSW-indexable. Need to test once captioning unblocks.

## P1 — Bits UI tagging

### 3. Component name + ui_library payload
Indexer sets `component_name` only when filename matches `route_*` pattern.
For Bits UI, parse the source `.svelte` file imports to extract the
primitive being shown:

```ts
// Tag screenshot with all Bits UI primitives in the rendered route's
// component tree (recursive walk of imports).
{
  ui_library:    "bits-ui",
  framework:     "svelte",
  componentName: "Dialog",      // dominant primitive
  visualTags:    ["modal","button","form"],
  stateTags:     ["loading","error"],
}
```

**Where**: extend `index-screenshots.mjs` to read `route_path` →
resolve `+page.svelte` → walk imports → tag.

### 4. Qdrant `ui_screenshots_768` collection
Currently only Postgres holds the data. Add a Qdrant mirror:
- Collection: `ui_screenshots_768` (768-dim, cosine, INT8 quantised)
- Vector input: `<ui_library>\\n<framework>\\n<component>\\n<route>\\n<file>\\n<caption>\\n<ocr>\\n<tags>`
- Payload: full screenshot row + `cluster_key` + `topo_class` for cross-join with code graph

**Where**: new `scripts/screenshots/embed-screenshots-qdrant.mjs` that runs
after caption pass. Stays out of Postgres-only flow when GPU/VRAM unavailable.

## P2 — Topology + ranking

### 5. Link screenshot → cluster → file
After caption, set `screenshot_artifacts.cluster_id` from the route's
`+page.svelte` cluster (lookup via `qdrant_cluster_members` or
`code_retrieval_chunks`). This makes:
```sql
SELECT s.* FROM screenshot_artifacts s
JOIN code_retrieval_chunks c ON c.cluster_key = s.cluster_id
WHERE c.file_path = $1
```
return all UI screenshots that show code from the requested file.

### 6. `visual_change_score` and dirty queue
Add Sharp-based pixel diff between current and previous phash for the same
`route_path`. Push high-diff routes to Redis `ace:visual:dirty_screenshots`
(sorted set by score) so ACE knows which screens drifted.

### 7. `visual_rank` composite (per the architecture note)
```
visual_rank = 0.25 * graphAuthorityScore
            + 0.20 * recentSourceChange
            + 0.20 * visualChangeScore
            + 0.15 * auditRisk
            + 0.10 * retrievalHitFrequency
            + 0.05 * screenshotStaleness
            + 0.05 * componentCentrality
```
Recompute on `graph:synthesize`; cache in Redis `ace:rank:screenshot:{id}`.

## P3 — Capture coverage

### 8. Playwright route capture script
Currently 30 screenshots are baselines from old runs. Need a deliberate
capture pass:
- Walk all `+page.svelte` routes (~110 known)
- Use `tests/all-routes-screenshot.spec.ts` pattern
- Save to `tests/e2e/screenshots/route_<dir>__<page>.png`
- Auto-run `screenshots:index:apply` after capture

**Naming**: keep the `route_` prefix the indexer already infers from.

### 9. Per-Bits-UI-primitive screenshots
For each of the 9 primitives, capture the canonical demo state from
`/dev-tools/bits-ui-demo` (or similar). Tag with `componentName=<primitive>`,
`source_kind='component'`. This gives the agent a known-good visual
fingerprint for "what should Dialog look like?".

## P4 — Optional (deferred)

### 10. OCR fallback (Tesseract)
Only run when caption is empty/uninformative. `tesseract.js` already in
deps. Keep behind `--ocr` flag.

### 11. YOLO / SAM
Defer until ACE asks "where is the broken element?" rather than "what is
shown?". Current pipeline (Sharp + phash + caption) handles dedupe and
"what changed?" without box detection.

## Schema inventory (already in place)

`drizzle/manual/screenshot_artifacts.sql` provides everything in the
architecture note plus a few extras:

| Architecture field | Schema column | Notes |
|---|---|---|
| `cluster_key` | `cluster_id` | text, indexed (line 70) |
| `caption_embedding` 768-dim | ✓ HNSW indexed | `vector(768)` cosine, m=16, ef_construction=64 |
| `visual_change_score` | ⚠️ missing | add via `ALTER TABLE … ADD COLUMN IF NOT EXISTS` |
| `graph_authority_score` | ⚠️ missing | same |
| `ui_library`, `framework` | ⚠️ missing | same |

**Migration follow-up**: extend `screenshot_artifacts.sql` with the 4
missing columns above. Idempotent; safe to re-apply.

## VS Code wiring

**Do not auto-run on folderOpen**:
- `screenshots:caption:apply` — burns GPU + Ollama, conflicts with TurboQuant
- `screenshots:index:apply` — rapid file walk is fine but not a startup essential

**Manual task labels to add** (`.vscode/tasks.json`):
- `📸 Visual: Index + Enrich (no GPU)` — `index:apply && enrich:apply`
- `🖼️ Visual: Caption pass (GPU, exclusive)` — stop TurboQuant, caption, restart
- `🔍 Visual: Lane status` — `agents:db:verify` analogue for screenshot_artifacts

## Verification commands

```bash
# Confirm the lane is healthy
PGPASSWORD=123456 psql -h 127.0.0.1 -p 5434 -U legal_admin -d legal_ai_db -c "
  SELECT count(*) AS total,
         count(phash) AS phashed,
         count(caption) AS captioned,
         count(caption_embedding) AS embedded
  FROM screenshot_artifacts;
"

# Dry-run a re-index (idempotent)
npm run screenshots:index
npm run screenshots:enrich

# Trigger caption (currently fails — see P0 #1)
npm run screenshots:caption:apply
```

## Commits this lane

| Commit | Subject |
|---|---|
| `screenshot_artifacts.sql` migration | 12 indexes, HNSW verified |
| `index-screenshots.mjs` companion | Dry-run default, idempotent ON CONFLICT |
| (linter pre-added) `enrich-screenshots.mjs` | Sharp phash + 16×16/64×64 thumbs |
| (linter pre-added) `caption-screenshots-gemma4.mjs` | Ollama VLM + 768-dim embed |

Total visual-lane state: schema + 3 scripts + npm wiring + 30 indexed
real screenshots with full Sharp metadata. Caption gated on VRAM
coordination (P0 #1).
