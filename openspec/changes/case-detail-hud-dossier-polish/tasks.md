# OpenSpec: Case Detail HUD & Compact Parchment Dossier Polish (`tasks.md`)

Scope:
- `sveltekit-frontend/src/routes/+layout.svelte`
- `sveltekit-frontend/src/routes/(app)/cases/[id]/+page.svelte`
- `sveltekit-frontend/src/lib/components/cases/StreamingAnalysisPanel.svelte`
- `sveltekit-frontend/src/lib/components/evidence/EvidenceUploadButton.svelte`

Design Direction:
Hybrid combination of the **YoRHa Obsidian Tactical Command Bar** (`#0d1017` bridging the left sidebar and `[CASE_NOTES::TERMINAL]`) with **Compact Custom Modal Light (Parchment Legal Dossier) Cards** (`#fcfbf9` ivory, `#f7f2ea` slim headers, `#d8cdb8` warm borders, `#c59e2b` 9-slice corner notches, skinnier `30px`–`34px` precision buttons, and Bits UI hover tooltips).

## Phase 1: CSS Scoping & Tab Bar Isolation
- [x] 1.1 Scope `:global(button)` in `src/routes/+layout.svelte` via `:where(...)` exclusions so it never infects navigation tabs (`role="tab"`), Bits UI triggers, icon actions, or `.dossier-*` / `.hud-*` controls, and tighten fallback button padding.
- [x] 1.2 Refactor the 13-tab strip in `cases/[id]/+page.svelte` into a sleek horizontal-scrolling HUD/Dossier Segmented Control (`overflow-x-auto`, slim `34px` height, `#c59e2b` burnished gold active indicator).
- [x] 1.3 Add crisp monospace bracketed badge counts: `EVIDENCE [0]`, `CITATIONS [0]`, etc.

## Phase 2: Theme Harmony (YoRHa HUD Command Bar + Compact Parchment Dossier Cards)
- [x] 2.1 Replace stark `bg-white shadow` cards and `bg-gray-50` page wrapper with a cohesive warm dossier desk (`#efe9dd`) and compact Parchment Legal Dossier cards (`#fcfbf9`, `#d8cdb8` border, 4 gold `.dossier-notch-*` corner brackets, slim `#f7f2ea` header bar).
- [x] 2.2 Unify the header action buttons (`Edit Brief`, `Case Notes`, `Intel Hub`, `AI Counsel`, `Write Doc`, `Export Packet`) into a skinnier (`30px` height) tactical toolbar with ochre gold hover accents (`#c59e2b`) and Bits UI hover tooltips. Support `?edit=true` URL state cleanly.
- [x] 2.3 Fix contrast and compact proportions in `StreamingAnalysisPanel.svelte` and `EvidenceUploadButton.svelte` (replace invisible `text-sand` on white with high-contrast `#0f172a` / `#334155` parchment chips and gold/ink primary trigger).

## Phase 3: Layout & Floating Action Button Grounding
- [x] 3.1 Remove the unanchored bottom-right floating `Write Document` button and ground `Write Doc` inside the primary header toolbar.
- [x] 3.2 Polish the drag-and-drop upload dropzone with 9-slice corner brackets (`.dossier-bracket`) and monospace prompt text (`DROP LEGAL ARTIFACT HERE`).
- [x] 3.3 Consolidate `Case Stats` and review placeholders into orthographic data HUD dossier widgets with clean tabular key-value readouts and micro-bars.

## Phase 4: Verification & Regression Gates
- [x] 4.1 Run `svelte-check` (`npm run check`) to verify 0 diagnostic errors.
- [x] 4.2 Capture Playwright screenshot verification (`case-detail-hud-refined-1080p.png` & `case-detail-hud-refined-720p.png`) at `1280×720` and `1920×1080` against `/cases/[id]?edit=true`.

## Phase 5: Celestial Arcana, Editorial Luxury & Crystarium HUD Elevation
- [x] 5.1 Replace all ASCII/Unicode/emoji placeholders across `cases/[id]/+page.svelte`, `StreamingAnalysisPanel.svelte`, and `EvidenceUploadButton.svelte` with unified `<Icon name="yorha-..." />` Celestial SVGs (`yorha-law-book`, `yorha-citation`, `yorha-glossary`, `yorha-precedent`, `yorha-regulation`, `yorha-subject`, `yorha-evidence`, `yorha-timeline`, `yorha-network`, `yorha-integrity`, `yorha-warning`, `yorha-ai-assistant`).
- [x] 5.2 Apply the Editorial Luxury (`GOLDENBLOOM`) architectural palette: Obsidian `#0B0D13`, Dark Tan / Oxblood `#67140F`, Pablo `#7F7565`, Bronco `#B9A699` `1px` hairlines, Swirl `#DBCFC5` / `#EAE3DC` compartment headers, and Ebb `#E9E4E0` / `#F6F3EF` museum parchment sheets with `0.14em`–`0.2em` tracked micro-caps.
- [x] 5.3 Frame dossier cards with Celestial Arcana gilded filigree double-borders (`1px` Bronco outer + `3px` inset `rgba(200, 162, 74, 0.28)` inner hairline) and 4-point celestial compass-star (`✦`) SVG corner ornaments.
- [x] 5.4 Add Crystarium-inspired tactical HUD telemetry: subtle geometric astrolabe ring + starlight watermark and bottom status ribbon (`STAGE` | `EXHIBITS` | `AUTHORITIES` | `VECTOR LANE`) in `.hud-command-bar`, plus crystalline micro-gauge bars and YoRHa Celestial icons in `Case Telemetry`.
- [x] 5.5 Re-verify `svelte-check` (`0 errors`) and capture `1920×1080` + `1280×720` Playwright visual proof (`case-detail-celestial-arcana-1080p.png` & `case-detail-celestial-arcana-720p.png`).

## Phase 6: Editorial Top Navbar, Flush Minimized Rail, Global Stylesheet & Production Fabric Hardening
- [x] 6.1 Align canonical shell & GOLDENBLOOM/Arcana CSS custom properties in `src/app.postcss` (`--shell-sidebar-w: 224px`, `--shell-sidebar-rail-w: 76px`, `--shell-navbar-h: 58px`, `--shell-crimson`, `--shell-gold`, `--shell-obsidian`, `--shell-parchment`, `--shell-swirl`, `--shell-bronco`, `--shell-pablo`) and zero-specificity `:where(...)` scoping in `src/routes/+layout.svelte`.
- [x] 6.2 Upgrade `YorhaSidebar.svelte` to default-minimized `76px` Museum-Parchment / Oxblood-Gold crest rail (`VERITAS` shield header flush at `58px`, active Oxblood `#67140F` + `#C8A24A` gilded tile with `✦` star, micro-labels, Bits UI `Tooltip` HUD cards, and synchronized `yorha:toggle-sidebar` / `yorha:sidebar-state` events).
- [x] 6.3 Eliminate the outer `.content` padding moat in `src/routes/+layout.svelte` (`:global(body:has(.yorha-top-navbar)) .content { padding: 0; }`) so `YorhaSidebar`, `YorhaTopNavBar`, and `(app)` workspaces sit 100% flush edge-to-edge.
- [x] 6.4 Build `YorhaTopNavBar.svelte` (Bits UI v2 `DropdownMenu` + `Tooltip`, Svelte 5 runes) and mount across `(app)/+layout.svelte` with `YORHA LAW · LEX ET IUSTITIA` crest, primary section links, hybrid BM25 + 768-D search pill (`Ctrl K` Command Palette bridge + Ewin Tang low-rank leverage popover), and gilded User Profile avatar + live Production Fabric Matrix readout.
- [x] 6.5 Create `/api/search/fabric` (`GET` live readiness + `POST` Zod-validated hybrid retrieval) bridging PG18 AIO/bitmap/JSONB GIN/B-Tree + `pgvector` `semantic_768` (`EmbeddingGemma`), `:8095` Python CST/NetworkX sidecar probe, TurboVec AVX2/AVX-512 SIMD + BitEncoding FSM prefilter, MsgPack `FP16` `latent_64` tags (`0..29`) / CouchDB MapReduce / DuckDB staging synthesis, Qdrant BM25 + `content` 768-D RRF fanout, `ae:train` 64-D + Ewin Tang squared-l2 leverage recommendations (`scoreEwinTangLowRank`), PyTorch ATen / `cuTile` SIMT cache status, and canonical ACE Context Editor Gate packet (`sourceRef`, `ConceptID`, `ConfidenceScore`, `ContextBlob`).
- [x] 6.6 Verify `svelte-check --threshold error` (`0 errors`), `fabric-lanes.spec.ts` Vitest suite (`2/2 passed`), and `1920×1080` + `1280×720` Playwright visual verification.

## Phase 7: Contextual AI Counsel & Ornith `:8090` Screen VLM Dual-Button Dock
- [x] 7.1 Remove the duplicate overlapping floating buttons (`AIChatWidget.svelte` stacked on `AIAssistantButton.svelte` at `bottom-6 right-6`, plus unscoped empty `ResearchTaskPanel.svelte` circle) that rendered blank frosted blobs in the bottom-right corner.
- [x] 7.2 Create `/api/ai/screen-analysis/+server.ts` (`GET` live `:8090` model/vision readiness + `POST` Zod-validated screen & contextual chat synthesis) wired to dynamic `getActiveLocalVlmModel()` (`ornith-1.5-9b` on `llama-server :8090`), `/props` `modalities.vision` detection (multimodal `image_url` when vision `mmproj` is active; structured DOM + viewport reconnaissance when text-only), PostgreSQL 18 case/evidence grounding, and transient ACE Context Editor Gate packet (`ace:packet:{runId}` with `sourceRef`, `ConceptID`, `ConfidenceScore`, `ContextBlob`).
- [x] 7.3 Build `ContextualScreenAssistantDock.svelte` (Svelte 5 runes + Bits UI v2 `Tooltip`) with two crisp gilded bottom-right buttons:
  - **Upper Button (`yorha-screen-vlm-btn`)**: Obsidian + Gold reticle medallion that captures live screen DOM + orthographic `<canvas>` viewport thumbnail (plus `getDisplayMedia` live window pixel capture & screenshot upload) and runs 1-click Ornith `:8090` Screen Analysis.
  - **Lower Button (`yorha-contextual-chat-btn`)**: Oxblood Crimson + Gold medallion with live `:8090` health pip opening the Parchment Legal Dossier multi-turn Contextual AI Counsel window.
- [x] 7.4 Verify live end-to-end Ornith `:8090` Screen VLM + Contextual Chat execution in Playwright and `svelte-check --threshold error` (`0 errors`).

## Phase 8: Editorial Case Dossier Title Fix, Slim `56px` Top-Hover Sidebar & Centered `44px` Global Search Navbar
- [x] 8.1 Fix `/api/cases/[id]/+server.ts` (`GET`/`PATCH`/`DELETE`) so authenticated `admin` / `DEV_BYPASS_AUTH` / mixed user IDs never return false `404` (`STAGING DOSSIER ::`) on valid PostgreSQL 18 cases.
- [x] 8.2 Replace arcade/pixel `--t-font-heading` inheritance on `.hud-case-title`, `.dossier-card-title`, `.dossier-analysis-title`, and root `:where(h1..h6)` with authoritative **Georgia Legal Serif** / clean **Inter UI**, sanitize keyboard-mash draft titles (`Untitled Case Dossier — Docket #986B5214`), remove `::` badges, and add 1-click inline **Rename** (`PATCH /api/cases/[id]`).
- [x] 8.3 Slim `YorhaSidebar.svelte` back to a `56px` icon-only rail (`--shell-sidebar-rail-w: 56px`), restore the top toggle button (`sidebar-top-toggle`) at `44px` header height, and wire top-button hover-peek (`hoverPeek` expands to `216px` on top-button hover and auto-minimizes to `56px` on `mouseleave`; click pins/unpins).
- [x] 8.4 Shrink `YorhaTopNavBar.svelte` to `44px` (`--shell-navbar-h: 44px`), mount globally in root `src/routes/+layout.svelte`, center the search bar in a 3-column CSS Grid (`1fr minmax(240px, 440px) 1fr`), and wire instant route matching + live `POST /api/search/fabric` + keyboard navigation (`/` focus, `↑↓`, `Enter`, `Escape`) + `?q=` auto-execution in `/global-search/+page.svelte`.

## Phase 9: Global Typography Purge & Royal Legal Dossier × NieR: Automata HUD Overhaul
- [x] 9.1 Purge global `nes.min.css`, single-weight `'Inter'` `@font-face` hijacking, `'Orbitron'`/`'Press Start 2P'` theme font variables, neon `#ffd700` `h1` underlines/glows, and `optimizeSpeed` kerning suppression from `sveltekit-frontend/src/app.html`; register Google Fonts `Cinzel`, `Cormorant Garamond`, and full-weight `Inter` (`300..700`) with `text-rendering: optimizeLegibility`.
- [x] 9.2 Upgrade `YorhaTopNavBar.svelte` (`46px` Royal Parchment bar with stacked `Cinzel` `YORHA LAW / LEX ET IUSTITIA`, centered architectural search box, and chamfered stone-taupe right counsel tray) and `YorhaSidebar.svelte` (`Inter` + `Cinzel` typography, zero `Consolas` UI labels).
- [x] 9.3 Upgrade `StreamingAnalysisPanel.svelte` into the Dark Prussian double-gold-filigree `+ MAIN MENU` synthesis card (`01 Case Summary` .. `04 Exhibit Audit` numbered rows, NieR telemetry wave bars, and Royal Crimson `✦ Execute Synthesis ✦` primary button).
- [x] 9.4 Upgrade `cases/[id]/+page.svelte` hero, connected architectural tab strip (`✦ TABS`), jewel-toned chamfered badges (`✦ BADGES`), double-filigree parchment cards (`✦ CARDS`), and Dark Prussian `✦ Dossier Status` Party-Status × NieR HUD widget; verify `0` `svelte-check` errors and 1080p Playwright screenshots.
