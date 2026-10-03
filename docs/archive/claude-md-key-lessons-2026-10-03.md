# CLAUDE.md archive — Key Lessons (Proven Patterns) (verbatim)

Archived 2026-10-03 from root CLAUDE.md (size limit). Unchanged; a condensed rules list stays in CLAUDE.md.
Source range (pre-trim line numbers): 3469-3553.

---

## Key Lessons (Proven Patterns)

- **Cross-store identity sync: verify GRANULARITY matches before trusting a shared field name as a
  join key, not just that the field exists on both sides.** A field present in two stores under
  the same name (e.g. `path`) does not mean it identifies the same UNIT of data in both. **Found
  live 2026-09-09**: `scripts/atlas/compute-leiden-neo4j.mjs`'s first Qdrant-mirroring pass joined
  Neo4j `leiden_community_id` → Qdrant `codebase_chunks_768` payloads on bare file `path` alone,
  applied it live (79,768/109,774 points patched), and only THEN a read-only census
  (`LEIDEN-QDRANT-IDENTITY-JOIN-01`) found 96.2% of paths (3,129/3,254) mapped to more than one
  Leiden community (avg 18.2, max 505 per path). Root cause: Leiden clusters at SYMBOL granularity
  in Neo4j (up to 240 separate `:Packet` nodes share one file `path`, one per type/const/function/
  table-def), while `path` in Qdrant is a coarser, file-level field — so path-only matching picked
  one arbitrary symbol's community per file and stamped it onto every chunk of that file, wrong for
  the vast majority of them. The already-applied writes had to be identified and cleared (not just
  the join fixed going forward) — see `syncLeidenToQdrant()`'s header comment for the correction
  (joins on `(path, symbol)`, which is verified collision-free — 0/7,477 pairs — but only covers
  ~12.2% of Qdrant points since most chunks don't carry a `symbol` field; correctness over coverage,
  unmatched points are left unset rather than guessed). **Rule going forward**: before writing ANY
  cross-store ID-mirroring script (a pattern this repo repeats often — PageRank/Louvain into
  Qdrant via `writeAuthorityScoresToQdrant()`, other future syncs), run a cheap cardinality check
  first: `MATCH (n:Label) WITH n.<candidateKey> AS k, count(*) AS n RETURN max(n)` (or the
  equivalent on the other store) — if `max(n) > 1`, the candidate key is not a valid per-node
  identity join, no matter how natural the shared field name looks. Do this BEFORE the first live
  apply, not after — a read-only census is nearly free; unwinding a wrong mass-write is not.
  `writeAuthorityScoresToQdrant()` itself (`src/lib/server/graph/neo4j-gds.ts`) has not been
  re-audited for the same risk — flagged, not yet checked.
- **`isMainModule` CLI guard — the standard `import.meta.url === \`file://${process.argv[1]}\`` pattern NEVER matches on Windows.** `process.argv[1]` is a raw backslash Windows path (`C:\Users\...\script.mts`); `import.meta.url` is a proper `file://` URL (`file:///C:/Users/.../script.mts`, forward slashes, triple-slash for the drive letter). Naive string concatenation never produces the real URL, so the comparison is always false — `main()` silently never runs, the process exits 0 with zero output, and it looks like the script "did nothing" rather than erroring. **Found live 2026-08-12** while testing two CLI scripts (`ace-domain-evidence-extractor.mts`, a new `parent-atlas-workstation-domain-classifier.ts`) that both exited cleanly but produced no output — confirmed via `git diff`-free direct testing, not assumed. Swept and fixed **35 files repo-wide** with this exact bug (`rg` pattern: `` import\.meta\.url\s*===\s*`file://\$\{process\.argv\[1\]\}` `` plus the equally-broken variant `process.argv[1] === import.meta.url.replace('file://', '')`, which leaves a stray leading slash + drive letter on Windows and also never matches). **Canonical fix** (matches the two files in the repo that already had it right before this sweep — `ensure-search-engine.mjs`, `agentic-recommendation-workflow.mjs`):
  ```typescript
  import { fileURLToPath } from 'node:url';
  // ...
  if (process.argv[1] === fileURLToPath(import.meta.url)) {
    main().catch(console.error);
  }
  ```
  This converts `import.meta.url` → a real Windows path via `fileURLToPath` and compares directly against `process.argv[1]` (already a plain path) — no URL construction on the argv side needed, works identically on POSIX and Windows. **Before writing a new CLI-invokable script (`npx tsx foo.mts`), copy this pattern — do not copy the broken one from an older script**, since >30 files in this repo had it before the 2026-08-12 sweep (fixed then; a script written after that date copying an even-older unfixed example would reintroduce it). Verify any new CLI entry point actually runs by checking for real output, not just a clean exit code 0 — a silently-skipped `main()` still exits 0.
- **rg search on gitignored NES/CHROM packets**: `.opencode/ndjson/`, `.opencode/cards/`, `.opencode/gemma4_candidates.ndjson`, and related packet files are gitignored but searchable via `.rgignore` at repo root (uses `!path` negation rules). Plain `rg` finds them. For explicit override: `rg --no-ignore` (ripgrep 14.x) — NOT `--uu` which was removed in rg 14. MapReduce pipeline: `npm run ndjson:mapreduce`. Outputs: 396 SOM cluster summaries, 745 adjacency edges, 2.5 KB minified ACE index in `.opencode/ndjson/`. Candidate join (0/2033) is expected until `graphify:semantic` writes codebase cards with `file:src/...` ids matching the candidate namespace.
- **Env-file discoverability rule**: keep real `.env` and `.env.local` files gitignored. Plain content search against the target env paths works for the main repo and `sveltekit-frontend` env files, while Git still ignores them. For file discovery, use `rg --files -g ".env*"` rather than plain `rg --files`. If a path falls outside the usual target files, search with explicit overrides such as `rg -n --hidden --no-ignore "DATABASE_URL|REDIS_URL|TRACE_MCP_URL" .env .env.local sveltekit-frontend/.env sveltekit-frontend/.env.local`. For repeatable presence-only audits, use `npm run env:audit` or pass a custom key set such as `npm run env:audit -- --keys DATABASE_URL,POSTGRES_URL,REDIS_URL,VALKEY_URL,QDRANT_URL,NEO4J_URI,TRACE_MCP_URL`. Prefer `.env` as the primary source and `.env.local` as the local override when tracing runtime configuration.
- **binding.cc corruption recovery**: The `PcaProjectWrapper` body and `Init` function have been corrupted multiple times by incremental edits. Recovery pattern: `git show <last-clean-commit>:simd-bridge/cpp/binding.cc | sed -n '<split_line>,<end>p' > /tmp/tail.txt && head -<split_line-1> binding.cc > /tmp/head.txt && cat /tmp/head.txt /tmp/tail.txt > binding.cc`. Last clean commit: `0abba595f3`. Split point: line 1091 (end of `AutoencoderDecodeWrapper`). Never incrementally edit the Init/PcaProject region — restore from git.
- **OpenCode skills vs instructions**: `.opencode/skills/<name>/SKILL.md` (with `name`+`description` frontmatter) = on-demand agent-requested context. `.opencode/command/<name>.md` = slash commands invoked via `/name`. `instructions` array in `opencode.jsonc` = permanent system context (every session). Do NOT put command files in `instructions` — Gemma4 reads them as tasks. Repo-state first: do not suggest installing `gemma-2b-it`, `gemma2-b-it`, Ollama defaults, or generic chatbot models unless explicitly asked. Current task is Atlas audit/linkage repair, not model selection. Skill routing table lives in `docs/ai-os/opencode-skill-routing.md` (keyword → skill mapping injected as permanent instruction).
- **TurboQuant-safe is the daily default**: `TURBO_PROFILE=turboquant-safe` + `TURBO_CTX=65536` + `-ngl 99 -fa on -cache-prompt -cache-reuse 256`. For RTX 3060 Ti 8GB with Gemma4 IQ4_XS/Q4: don't try to fit the 26B model in VRAM — use partial GPU offload with `-ngl 99` and let system RAM carry the rest. Qdrant/Postgres/Atlas retrieval keeps prompts small. Always launch via `scripts/launch-turboquant.ps1`, never bare exe. Verify context: `(Invoke-RestMethod http://127.0.0.1:8090/slots)[0].n_ctx` should be 65536.
- **Git-diff cold archive (no-delete workaround)**: To retire archive-eligible files without destroying content — `git add` → structured commit → `git tag archive/YYYY-MM-DD/<slug>` → `git rm` + prune commit. Content lives in git DAG forever; recoverable via `git show <tag>:<path>`. Score gate: only files with `superseded-score >= threshold` qualify. Canonical scorer: `scripts/atlas/score-superseded-originals.mjs`. Archive pipeline (not yet built): `scripts/atlas/archive-cold-originals.mjs`. See `docs/architecture/phase-101-completion-plan.md` Block 1.
- **Valkey bundle replaces Redis Stack**: `valkey/valkey-bundle:8` is the AGPL-free drop-in. Includes `valkey-json` (RapidJSON C++) and `valkey-search`. Swap image in docker-compose, bind `127.0.0.1:6379`. Zero ioredis code changes. `ROTORQUANT_KV_ENABLED=true` in `.env` is a dead variable — `launch-turboquant.ps1` never reads it; use `TURBO_PROFILE` instead.
- **Hybrid Omni-Worker**: Anaconda container unifies Node.js + PyTorch + TRT-LLM in one process sharing a CUDA context. Bridge is `n-api.rs` using `tch-rs` (Rust LibTorch bindings) or `cudarc` — zero-copy tensor hand-off between SvelteKit and GPU inference. LangGraph = orchestration-only planner, never writes to DB. Not yet implemented; scaffold in `docker/omni-worker/`. See `docs/architecture/phase-101-completion-plan.md` Block 6.
- **ioredis cold-start and lifecycle checks**: `legal-ai-valkey` Docker container may start *after* folderOpen pipelines fire. Default ioredis behavior reconnects forever and spams unhandled `error` events. Required client options for ANY standalone Node script under `scripts/startup/`, `scripts/index-*`, `scripts/seed-*`: `lazyConnect:true`, `maxRetriesPerRequest:1`, `enableOfflineQueue:false`, `retryStrategy:()=>null`, attach `redis.on('error',()=>{})`, then `await redis.connect()` BEFORE `await redis.ping()` (offlineQueue:false makes ping fail with "Stream isn't writeable" otherwise). **Rule**: Never reuse a closed or disconnected client across distinct script segments or different query runs. Always create a fresh client instance or use block/scope isolation (e.g., with a clean `try...finally` with `redis.quit()`) to prevent `Connection is closed` errors. Do NOT use this pattern in long-running server code — there `getRedis()` from `src/lib/server/redis.ts` is canonical.
- **Valkey/Redis Config Object Pattern (The "Redis Trick")**: In standalone Node/smoke scripts, do not parse/interpolate `REDIS_URL` strings with passwords (fails on special characters like `:` or `@`). Always configure the `ioredis` constructor with an options object: `{ host: env.REDIS_HOST, port: env.REDIS_PORT, password: env.REDIS_PASSWORD }`.
- **$derived vs $derived.by**: `$derived(() => {...})` returns a function. Use `$derived.by(() => {...})` for complex computations
- **TS imports in SvelteKit**: Use `.js` extensions not `.ts` (bundler resolves `.js` → `.ts`)
- **bits-ui Tabs SSR**: `Record<string, any>` cast passes svelte-check but causes SSR 500. Use native `$state`-based tabs
- **CouchDB client**: `put(db, docId, doc)` = 3 args; `post(db, doc)` = 2 args; no `find` method — use `allDocs` + filter
- **Qdrant filter**: `match: { value: someVar }` not `match: { value, someVar }` — shorthand fails when var name != `value`
- **ioredis v5 types**: DO NOT add `declare module 'ioredis'` augmentations — they shadow bundled types
- **amqplib**: Named/namespace imports fail with `moduleResolution: "bundler"`. Use local interfaces + dynamic `await import('amqplib')`
- **Icons**: `@lucide/svelte` REMOVED (Session 93r14). Use `import Icon from '$lib/components/ui/Icon.svelte'` + `<Icon name="kebab-name" />`. UnoCSS `i-lucide-*` CSS classes, SSR-safe. Dynamic names need safelist in `unocss.config.ts`
- **bits-ui Dialog SSR TDZ**: bits-ui v2.16.2 Dialog uses `let props = $props()` which triggers TDZ in Svelte 5.46.0 SSR. Routes rendering Dialog at SSR time need `export const ssr = false`
- **Svelte 5 `{@const}` placement**: Must be direct child of `{#if}`/`{:else if}`/`{#each}` blocks — NOT inside `<div>` or other HTML elements
- **Dev server startup**: Must use `npm run dev` (sets `DEV_BYPASS_AUTH=true` + env vars via `cross-env`), NOT `npx vite dev`
- **SvelteKit handleError**: Hides real errors behind generic message. Temporarily expose `error.message + error.stack` in return value to diagnose SSR 500s
- **Corrupted files <50 lines**: Need complete rewrites, not incremental fixes
- **IDE linter reverts**: Use Write tool (not Edit) for reliable file modifications
- **writable() → $state()**: In `.svelte` files: remove import, replace `$store` with `store`, `.set(v)` → `store = v`, `.update(fn)` → direct mutation
- **Store file naming**: Runes (`$state`/`$derived`) only work in `.svelte`/`.svelte.ts` — plain `.ts` files need `SimpleStore` class or plain TS patterns
- **Global $state SSR leak**: `.svelte.ts` singletons persist across SSR requests — use `event.locals` for per-request server state
- **XState v5 fromPromise**: `fromPromise(async (ctx: any) => { const input = ctx.input as T; })` — cast `ctx.input` internally, not in setup types
- **Drizzle citations schema**: `citations` table Drizzle schema matches actual DB (16/16 columns aligned). Use standard Drizzle queries, no `sql<T>` workaround needed
- **db client import**: `import { db } from '$lib/server/db/client'` — NO `.js` extension (despite general `.js` convention). `.js` breaks named export resolution for this file
- **SvelteKit error() in try/catch**: `throw error(404)` inside try/catch → caught → becomes 500. Move not-found checks OUTSIDE try/catch in API routes
- **Manual migrations**: When `drizzle-kit migrate` fails (pre-existing enums), use `drizzle/manual/*.sql` with `CREATE TABLE IF NOT EXISTS`
- **Drizzle GIN/HNSW indexes**: Drizzle cannot express `USING gin(col gin_trgm_ops)` or `USING hnsw(col vector_cosine_ops) WITH (m=16, ef_construction=64)`. Add these to a numbered `drizzle/0NNN_*.sql` manual SQL file alongside the Drizzle schema entry. The table definition still lists plain B-tree indexes for all other columns. Pattern: `schema-postgres.ts` defines table + B-tree indexes; migration SQL adds GIN trgm + GIN array + HNSW. See `drizzle/0013_research_summaries.sql`.
- **Cursor pagination (keyset)**: Use composite B-tree `(score DESC, id DESC)` + WHERE `(score, id) < ($cursor_score::real, $cursor_id::uuid)` — O(1) seek vs O(n) OFFSET scan. Encode cursor as `"{score}:{id}"`. Never use OFFSET for user-facing pagination.
- **pg_trgm DYM**: `CREATE EXTENSION IF NOT EXISTS pg_trgm` + `USING GIN (query gin_trgm_ops)` → `similarity(query, $input) > 0.25 ORDER BY sim DESC LIMIT N` — ~5ms on 100K rows. DYM top-100 paginated via LIMIT/OFFSET on the similarity subquery. Fuse.js handles instant client-side top-3-5 hits from the current page (no extra fetch).
- **Drizzle casing option**: `drizzle(pool, { casing: 'snake_case' })` for auto camelCase→snake_case (v0.34+, NOT currently enabled)
- **bits-ui v2 Svelte 5**: Use `child` snippet (not `asChild`), `ref` (not `el`), `forceMount` + snippet for transitions, `type="multiple"` (not `multiple={true}`)
- **Svelte 5 $props**: Don't mutate props — use callback props or `$bindable` rune. `$derived` tracks dependencies at runtime, not compile time
- **MANDATORY: Wiring audit before moving files**: NEVER move/archive files without checking ALL import consumers first. Use `grep -r 'from.*module-name'` across entire `src/`. Root layout (`+layout.svelte`) imports from `$lib/webgpu/` — would have broken every page if moved. The cartridge system (`ChatSession.svelte.ts` → `/api/cartridge/export` → `chr97-builder.ts` → `cartridge-tensor-bridge.ts`) was 70% wired but appeared phantom. Always check: (1) grep for `from.*$lib/module`, (2) check root layout, (3) check `+page.svelte` dynamic imports, (4) check barrel `index.ts` re-exports, (5) check API routes. Files in `deeds_labs/` are gitignored — permanent deletion if lost
- **Phantom vs wired detection**: A file re-exported by `index.ts` but never imported downstream IS dead. A file with phantom CHR-ROM97 comments but real LokiJS/IndexedDB/Fuse.js code is NOT dead. Check call sites, not just file names
- **Cartridge API endpoints**: `/api/cartridge/export` (POST, build+cache), `/api/cartridge/search` (POST, tensor similarity), `/api/cartridge/stats` (GET, Redis cache stats), `/api/cartridge/invalidate` (POST, evict cached cartridge)
- **Unified model (April 2026)**: `gemma4-rotorquant:latest` serves BOTH text and vision — eliminates VRAM swap on 8GB GPU. Stock `gemma4:e4b-it-q4_K_M` has NO legal fine-tuning
- **pgvector imports**: Use `import { vector } from 'drizzle-orm/pg-core'` (native), NOT `'pgvector/drizzle-orm'` (legacy experimental)
- **Docker VHDX**: Never auto-shrinks on Windows 10. After `docker rmi` / prune, must `wsl --shutdown` then `diskpart` → `compact vdisk`
- **ES2025 usable now**: `Promise.withResolvers()` (SSE streams), Iterator Helpers (`.map()/.filter()` on iterators), Set methods (`.union()/.intersection()`), `Object.groupBy()`
- **UnoCSS**: `presetUno()` soft-deprecated since v66.0.0 — `preset-wind3` (stable) or `preset-wind4` (Tailwind 4-aligned) recommended. No urgency to migrate
- **gRPC port collision**: Port 50055 claimed by both `chr97-agent-client` and `go-search-service` — one must be moved

---

