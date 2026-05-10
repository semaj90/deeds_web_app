# Dev / Test / Prod Split + TurboQuant Routing + Drizzle Migration Safety

> Captured 2026-05-09 AM after TurboQuant confirmed up on `:8090` (PID 40644)
> and the new fallback admin path landed in commit `520503c2d5` ("58_").
> Reads top-down — Sections A-F are independently shippable.

## State of the world (verified 2026-05-09 09:15)

| Check | Result | Source |
|---|---|---|
| PostgreSQL version | **17.9** (Debian) | `psql -tc "SELECT version();"` |
| pgvector extension | **0.8.1** | `pg_extension WHERE extname='vector'` |
| `legal_ai_db` table count | **227** | `information_schema.tables` |
| Drizzle config | superuser-aware (`DATABASE_URL_MIGRATOR` → `DATABASE_URL` fallback) | [`drizzle.config.ts`](../../sveltekit-frontend/drizzle.config.ts) |
| Drizzle `tablesFilter` | excludes 28 phase89/kg/cpg tables | same |
| TurboQuant llama-server | **alive** on `:8090` (PID 40644, kv=q8_0/q8_0, VLM loaded) | `curl :8090/health` |
| Ollama | `:11434` per env | `OLLAMA_BASE_URL` |
| Auth fallback components | **landed in 520503c2d5** | `FallbackAlert.svelte`, `AuthModal.svelte`, `auth-store.svelte.ts`, `auth-machine.ts` |
| Validator state | 25 gates, latest run **22 pass · 3 warn · 0 fail** when dev up | [validate-20260508-143415.md](../../sveltekit-frontend/logs/test-run/validate-20260508-143415.md) |
| Last 10h commits | `0b5d903deb` G18 fix · `520503c2d5` "58_" (4315 files, dual-lane CLAUDE.md + auth fallback + Karpathy pipeline doc) | `git log --since="10 hours ago"` |

**CLAUDE.md was significantly rewritten in `520503c2d5`** to formalize the dual-lane AI architecture (Embeddings = Ollama, Generation = llama-server with TurboQuant + Bitfrost). The validator and our G25 gate need to follow.

---

## Section A — Route Gemma4 agent through TurboQuant, not Ollama

**Problem captured by G25 yesterday**: `POST /api/ai/agent` returned `HTTP 503 — "client unauthorized due to authentication failure"`. The agent was hitting Ollama (`:11434`) which has no API key set; per the new dual-lane CLAUDE.md, generation should go through TurboQuant llama-server (`:8090`) with KV-cache reuse.

### Tasks

- [ ] **A1.** Read `sveltekit-frontend/src/lib/server/ai/gemma4-agent.ts` and identify which client it instantiates (`OllamaClient` vs `bifrostChat` vs `turboQuantChat`).
- [ ] **A2.** Switch agent's chat call to `bifrostChat()` — per CLAUDE.md it cascades L1 Redis → L2 Bifrost → L3 TurboQuant → Ollama fallback. That's the canonical path; never bypass.
- [ ] **A3.** Add env var precedence map to [`scripts/validate/full-system.mjs`](../../sveltekit-frontend/scripts/validate/full-system.mjs) — G25 should accept either:
  - HTTP 200 with `toolsUsed[]` shape (full Gemma4 round-trip) **OR**
  - HTTP 503 with `detail: "model unavailable"` when both TurboQuant AND Ollama are down (clean degraded — gate stays warn, not fail).
- [ ] **A4.** Add new gate **G26 — `turboquant:health`** that probes `:8090/health` directly. Tier 1 (env), non-fatal — surfaces TurboQuant up/down independent of the agent route.
- [ ] **A5.** Add new gate **G27 — `turboquant:chat-roundtrip`** that POSTs a tiny prompt to `:8090/v1/chat/completions` (OpenAI-compat endpoint per llama-server docs). Tier 2, non-fatal — proves the model actually generates.
- [ ] **A6.** Update validator gate count: 25 → 27, refresh registry table in `NEXT-SESSION-TODO.md`.

**Why bifrostChat() and not direct turboQuantChat()**: per CLAUDE.md the cascade is load-bearing. Calling TurboQuant directly bypasses L1 exact-match Redis cache (5ms hits) and L2 Bifrost semantic cache (2-5s hits), which is where 90% of cost reduction comes from. Direct calls are anti-pattern.

---

## Section B — Auth fallback verification (landed, needs wiring audit)

The fallback landed in `520503c2d5` but only the components exist. We don't yet know if any route actually mounts `<AuthModal>` when an unauthenticated request hits a protected page.

### Tasks

- [ ] **B1.** `rg "AuthModal" sveltekit-frontend/src/routes` — confirm at least one route mounts it on 401.
- [ ] **B2.** `rg "FallbackAlert" sveltekit-frontend/src/routes` — same for the dashboard fallback.
- [ ] **B3.** Verify `hooks.server.ts` returns a structured 401 (not a redirect) for `/api/*` routes when auth fails — clients need JSON to know to open the modal.
- [ ] **B4.** Add **G28 — `auth:fallback-mount-test`** to validator: hits an unauthenticated GET on `/admin/*` route, expects either (a) 200 HTML containing `data-authmodal-mount` attribute or (b) 302 to login. Anything else = misconfigured. Tier 2, non-fatal.
- [ ] **B5.** Confirm Superforms client schema for AuthModal is wired: form should `superValidate(zod(loginSchema))` server-side and re-hydrate validation messages when modal opens. Per `memory/superforms-reference.md`.

**Hard rule**: `AuthModal` must NOT block first paint. It mounts conditionally on `$state` from `auth-store.svelte.ts`, never as a top-level `+layout.svelte` import — otherwise SSR renders empty `<dialog>` markup that confuses screen readers.

---

## Section C — Data tier snapshot (confirmed, no work needed)

This section is the canonical reference — paste into onboarding docs.

```
┌──────────────────────────────────────────────────────────────────┐
│  Layer            │ Implementation                                │
├──────────────────────────────────────────────────────────────────┤
│  Forms            │ Superforms v2 + Zod (sveltekit-superforms)    │
│  Validation       │ Zod schemas (single source of truth)          │
│  ORM              │ Drizzle 0.44 (snake_case auto-mapping off)    │
│  Database         │ PostgreSQL 17.9 on :5434 (Docker)             │
│  Vector           │ pgvector 0.8.1 (HNSW, halfvec on 6 tables)    │
│  Vector store     │ Qdrant 1.15.4 (INT8 quantized, 9 collections) │
│  Cache L1         │ Redis 6379 (exact-match LLM cache, sessions)  │
│  Cache L2         │ Bifrost :3040 (semantic, Qdrant-backed)       │
│  Object store     │ MinIO :9000 (evidence files)                  │
│  Graph DB         │ Neo4j :7474 (PageRank + community + GRAG)     │
│  Generation LLM   │ TurboQuant llama-server :8090 (Gemma4 Q5_K_M) │
│  Embeddings       │ Ollama :11434 (embeddinggemma:latest)         │
│  Vision           │ Same TurboQuant binary (mmproj merged)        │
│  Async            │ RabbitMQ :5672 (10 queues, fair dispatch)     │
│  Observability    │ Langfuse :3030 (45 endpoints traced)          │
└──────────────────────────────────────────────────────────────────┘
```

**GraphRAG** = Neo4j community-detection layer ranks candidate documents
by graph centrality before reranker. Per CLAUDE.md it's the "knowledge
graph search engine" — community summaries are written to `community_summaries`
Postgres table for fast lookup. Already shipped per Hypergraph 4-lane work
(Lane A cluster_context · Lane B shared_resource · Lane C SHARES_TAGS · Lane D vault_link).

---

## Section D — Drizzle migration safety + dev/test/prod repo split

This is the biggest risk surface. CLAUDE.md §"Database Migration Safety"
already has rules but they are advisory; we need physical separation so
"oops I dropped 2,764 kg_nodes" cannot happen on prod.

### D.1 — Three-environment topology (CURRENT STATE: only :5434 exists)

```
┌────────────────────────────┬──────────┬─────────────────────────────┐
│ Environment                │ Port     │ Purpose                      │
├────────────────────────────┼──────────┼─────────────────────────────┤
│ legal_ai_db_dev (proposed) │ 5434     │ Daily dev. Drizzle push OK. │
│ legal_ai_db_test (NEW)     │ 5435     │ Migration smoke. Wiped daily│
│ legal_ai_db_prod (NEW)     │ 5436     │ Read-only from app shell.   │
│                            │          │ Migrations only via approved│
│                            │          │ SQL files (no drizzle push).│
└────────────────────────────┴──────────┴─────────────────────────────┘
```

**Why three Postgres containers and not three databases on one server**:
the failure mode we're guarding against is `drizzle-kit push` running
against the wrong URL. Different ports = different containers = port
typo gives connection refused, not silent data loss.

### D.2 — Migration test harness (the load-bearing piece)

**Goal**: never apply a migration to dev (let alone prod) until it has
been proven idempotent + non-destructive on a snapshot of dev's schema.

```
1. Dev work happens against :5434 (legal_ai_db_dev)
2. Dev runs:  npm run db:snapshot:dev
   → pg_dump --schema-only legal_ai_db_dev > snapshots/dev-<TS>.sql
3. Dev runs:  npm run db:migrate:test
   → drops legal_ai_db_test, recreates from latest dev snapshot,
     applies pending Drizzle migrations, runs invariant checks:
        a. row counts match pre-migration values
        b. no DROP TABLE / DROP COLUMN in generated SQL (use rg)
        c. all indexes present per schema-postgres.ts
   → emits report to logs/db-migrate/<TS>.md
4. Dev runs:  npm run db:migrate:dev   (only after test passes)
5. Prod migration ALWAYS goes through manual review:
   → pull /drizzle/manual/<NNNN>_<name>.sql into a PR
   → second-pair sign-off
   → applied via psql, never drizzle-kit
```

### D.3 — Tasks

- [ ] **D1.** Add `legal_ai_db_test` Postgres container to `docker-compose.yml` on port `5435`. Same image (`postgres:17-alpine` + pgvector preload).
- [ ] **D2.** Add `legal_ai_db_prod` Postgres container on `:5436` — but mark `read_only=true` for app user; only superuser (DBA) can write.
- [ ] **D3.** Add three env vars: `DATABASE_URL_DEV`, `DATABASE_URL_TEST`, `DATABASE_URL_PROD`. Existing `DATABASE_URL` continues to point at dev (back-compat).
- [ ] **D4.** Write `scripts/db/snapshot.mjs` — dumps schema + a row-count manifest for each table. Output: `snapshots/<env>/<TS>/{schema.sql,counts.json}`.
- [ ] **D5.** Write `scripts/db/migrate-test.mjs` — the harness. Drops test DB, restores from latest dev snapshot, runs `drizzle-kit migrate`, validates invariants, emits report. Refuses to run if `--target` is anything other than `test`.
- [ ] **D6.** Add new gate **G29 — `db:migration-safety`**: for each pending migration in `drizzle/`, ensure no `DROP TABLE` / `DROP COLUMN` / `TRUNCATE` outside `drizzle/manual/`. Tier 0 (offline). Fatal — drift here is what wipes prod.
- [ ] **D7.** Add npm aliases: `db:snapshot:dev`, `db:migrate:test`, `db:migrate:dev`, `db:diff` (compare two snapshots).
- [ ] **D8.** VS Code tasks: `🗄️ DB: Snapshot Dev`, `🗄️ DB: Migrate Test (safe)`, `🗄️ DB: Migrate Dev (only after test)`. The "Migrate Dev" task `dependsOn` "Migrate Test (safe)" so it cannot run alone.

### D.4 — Why NOT separate git repos

You asked about "push each to seperate repo for testing drizzle migration".
Don't do this. Three-repo split has these problems:

1. **Schema drift between repos becomes invisible.** A field added in
   prod-repo doesn't show up in dev-repo until manual sync. That's worse
   than the failure mode you're trying to solve.
2. **Drizzle config + schema-postgres.ts are single-source-of-truth files.**
   Forking them across repos defeats the type-safety guarantees they
   provide.
3. **You'd need cross-repo CI dance** to test a migration against test
   before applying to dev — adds latency for no safety gain over D.2.

The three-environment topology (D.1 + D.2) gives you all the safety
benefits (no accidental prod write, test-first migrations) without the
schema-drift footgun. **Same repo, different DBs, branch-per-env via
env vars.**

If you want repo separation for some other reason (separate CI budgets,
separate access control), that's fine — but build it on top of the
three-DB topology, not as a replacement for it.

---

## Section E — Validator updates (gates G26-G29 + label fixes)

Carries forward from Section A + Section D. Net delta: **25 → 29 gates**.

| New gate | Tier | Fatal | Tests |
|---|---|---|---|
| G26 `turboquant:health` | T1 | no | `:8090/health` returns `{status:"ok"}` |
| G27 `turboquant:chat-roundtrip` | T2 | no | `POST :8090/v1/chat/completions` returns valid OpenAI-shape response |
| G28 `auth:fallback-mount-test` | T2 | no | unauthenticated GET on protected route returns expected shape |
| G29 `db:migration-safety` | T0 | **yes** | no destructive SQL outside `drizzle/manual/` |

Also fix from Section A:
- G25 detail format: include `path=turboquant|ollama|none` so the operator can tell which backend served the response.

---

## Section F — Wiring into VS Code tasks

Append to `sveltekit-frontend/.vscode/tasks.json` (the frontend-scoped one — never touch root):

| New task | Backing command | Group |
|---|---|---|
| `🚀 Dev: TurboQuant Start` | `npm run turbo:start:detached` | build |
| `🚀 Dev: TurboQuant Health` | `curl -s http://127.0.0.1:8090/health` | test |
| `🗄️ DB: Snapshot Dev` | `npm run db:snapshot:dev` | build |
| `🗄️ DB: Migrate Test (safe)` | `npm run db:migrate:test` | build |
| `🗄️ DB: Migrate Dev (only after test)` | `dependsOn: 🗄️ DB: Migrate Test (safe)` | build |
| `🩺 Validate: Full Stack Up` | dependsOn: TurboQuant Start → Safe Start → Validate Full | test |

The `🩺 Validate: Full Stack Up` composite is the new daily-driver: TurboQuant up → SvelteKit dev up (with zombie protection) → 27-gate audit. Replaces ad-hoc startup.

---

## Section G — Drizzle migration follow-through (the fix you asked about)

> "once we figure out drizzle migrations won't drop data we push them?"

**Yes — but only after G29 is passing AND the test-DB harness (D.5) reports
green for that specific migration.** The flow:

```
1. Dev edits schema-postgres.ts
2. npm run db:snapshot:dev          → snapshots/dev/<TS>/{schema.sql,counts.json}
3. npx drizzle-kit generate         → emits drizzle/00NN_*.sql
4. cat drizzle/00NN_*.sql           → eyeball read; reject if any DROP/TRUNCATE
5. npm run validate:fast            → G29 catches drops automatically
6. npm run db:migrate:test          → restores test from snapshot, applies, validates
7. (only if 5 + 6 green) npm run db:migrate:dev
8. Prod: cherry-pick the .sql into drizzle/manual/, route through PR review
```

**Push to remote (`git push`) is independent.** You can push commits with
unmigrated schema changes — they only become destructive when someone
runs `drizzle-kit push` against the wrong URL. G29 + D.5 + the
read-only prod env (D.2) all guard that boundary.

---

## Phasing recommendation

Most-leverage-first:

1. **Section A (TurboQuant routing)** — shippable today, fixes the live
   G25 503. ~2-4 hours.
2. **Section E G26 + G27** (TurboQuant gates) — same day as A. ~1 hour.
3. **Section B (auth fallback wiring audit)** — half-day verification work.
   Likely uncovers 1-2 missing mounts.
4. **Section D.6 (G29 destructive-SQL detector)** — single afternoon.
   This is the highest-leverage safety gate; ship before D.1-D.5.
5. **Section D.1 + D.4 + D.5 (test DB + snapshot + harness)** — 1-2 days.
   Order matters: containers first (D.1), then snapshot (D.4), then
   harness (D.5).
6. **Section F (VS Code tasks)** — final wrapper, ~1 hour. Only after
   the npm scripts exist.
7. **Section D.2 (read-only prod env)** — defer until production
   deployment is real. No point until then.

---

## Hard rules (do not skip)

- ❌ **Never run `drizzle-kit push` against any URL not ending in `_dev`.**
- ❌ **Never commit a migration without G29 green AND `db:migrate:test` green.**
- ❌ **Never bypass `bifrostChat()` for generation.** Direct TurboQuant calls skip L1+L2 cache and waste GPU time.
- ❌ **Never mount `AuthModal` in `+layout.svelte`.** Conditional via `$state` only — SSR renders an empty `<dialog>` otherwise.
- ❌ **Never split this work into separate git repos.** Three-DB topology gives the safety; three-repo gives drift.
- ❌ **Don't migrate prod from a developer machine.** Prod migrations route through PR + DBA sign-off + psql, never drizzle-kit.

---

## Cross-references

- `claude.md` §"Inference Cascade (8 tiers — verified live)" — TurboQuant placement in cascade
- `claude.md` §"Database Migration Safety" — the existing advisory rules this plan codifies
- `claude.md` §"Redis L1 + Bifrost L2 Cache System" — bifrostChat() implementation
- `sveltekit-frontend/scripts/validate/full-system.mjs` — current 25-gate validator
- `sveltekit-frontend/memory/reconstruction/NEXT-SESSION-TODO.md` — gate registry to update
- `next_steps/active/2026-05-08_detective-mode-3d-reconstruction.md` — separate lane, unaffected
- `docs/KARPATHY_PIPELINE_ARCHITECTURE.md` (NEW from `520503c2d5`) — read for the dual-lane rationale
