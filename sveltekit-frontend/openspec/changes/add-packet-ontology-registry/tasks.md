## AUDIT CORRECTION (2026-09-16)

**This file previously showed 0/93 done. That was false — most of it was already built, just never
reflected back into this tasks.md.** A full live audit (Postgres, Drizzle, RabbitMQ, filesystem,
`npm run` execution) was run before touching anything, per this repo's Duplication Prevention rule.
Checkboxes below are corrected with real evidence. Net new count: roughly 45/93 genuinely done,
not 0/93 — but see the two real blockers recorded at the bottom before doing more work.

## 1. Database Schema Migration

- [x] 1.1 `packet_type` Postgres enum type exists live (`SELECT typname FROM pg_type WHERE
      typname ILIKE '%packet_type%'` → `packet_type`, `_packet_type`), values exactly match spec
      (code, test, doc, prompt, tool, schema, api, spec).
- [~] 1.2 **Partially done, real gap found**: the enum type exists, but `atlas_packets.packet_type`
      column itself is `text`, not the enum type (`information_schema.columns` → `data_type: text,
      udt_name: text`). The enum was created but never applied to the column via `ALTER COLUMN ...
      TYPE packet_type`. Not blocking (text values already conform to the enum's 8 labels — see
      1.6's real distribution), but the column doesn't get Postgres-level enum enforcement.
- [x] 1.3 `packet_ontology` JSONB column exists on `atlas_packets` (verified via `\d atlas_packets`),
      with the exact default shape from the proposal (`{tags:[], examples:{}, constraints:{},
      capabilities:[]}`), plus a GIN index (`idx_atlas_packets_ontology_gin`).
- [x] 1.4 `parent_packet_key` column exists (`text`, nullable — not a `uuid FK` as task 1.4
      originally specified; `packet_key` itself is `text` throughout `atlas_packets`, so this is
      the correct type to match, not a deviation).
- [x] 1.5 `related_packets` (`text[]`, default `'{}'`) exists.
- [x] 1.6 `telemetry` JSONB column exists on `atlas_packets` with the proposal's exact default
      shape (`{failure_count, success_count, avg_latency_ms, execution_count}`).
- [x] 1.7-1.18 All 12 `tool_registry` ontology/telemetry columns confirmed live via `\d
      tool_registry`: `tool_capabilities` (jsonb), `tool_constraints` (jsonb), `tool_examples`
      (jsonb), `tool_tags` (text[]), `failure_modes` (jsonb, with a real default breakdown by
      error type), `success_count`/`failure_count` (int), `avg_latency_ms` (real),
      `timeout_count`/`schema_mismatch_count` (int), `false_positive_rate`/`rolling_success_rate_7d`
      (real). All present, matching the proposal's column list exactly.
- [x] 1.19 `tool_execution_log` table exists (`id bigserial`, `tool_id`, `query`, `success int`,
      `latency_ms`, `error_type`, `timestamp`) — exact match to spec, and properly declared in
      Drizzle (`src/lib/server/db/schema/phase10-ontology.ts::toolExecutionLog`).
- [x] 1.20 Indexes on `tool_execution_log` confirmed: `idx_tool_exec_log_tool_id`,
      `idx_tool_exec_log_timestamp`, `idx_tool_exec_log_tool_timestamp` (composite,
      tool_id+timestamp DESC — matches the spec's stated performance intent), plus a bonus
      `idx_tool_exec_log_success` not in the original spec.
- [ ] 1.21 `npm run atlas:phase10:schema:migration:dry` **currently fails** —
      `package.json`'s script path is `../scripts/atlas/phase10-schema-migration.mjs`, which
      resolves to `deeds-web-app/scripts/atlas/` (one directory too far up). No such file exists
      there or anywhere in the repo — `phase10-schema-migration.mjs` itself was never committed
      (unlike its 13 sibling `phase10-*.mjs` scripts, which all exist at
      `sveltekit-frontend/scripts/atlas/`, not `deeds-web-app/scripts/atlas/`). Live-reproduced:
      `Error: Cannot find module 'C:\...\deeds-web-app\scripts\atlas\phase10-validation-smoke.mjs'`
      (same class of failure on a different script). This particular script (the schema migration
      itself) may never have needed to exist as a standalone file if the migration was applied via
      a one-off `psql`/Drizzle-kit run instead — can't confirm either way from what's on disk.
- [x] 1.22 Migration was applied — moot as a "run this script" task since the columns already
      exist live (confirmed via 1.1-1.18 direct inspection), regardless of how the apply happened.
- [x] 1.23 Verified directly: `SELECT column_name FROM information_schema.columns WHERE
      table_name = 'atlas_packets'` (and `tool_registry`) both show all target columns present.

## 2. Materialized View for Telemetry

- [x] 2.1 `tool_execution_stats_7d` materialized view exists live, with a matching Drizzle
      declaration (`toolExecutionStatsView` in `phase10-ontology.ts`).
- [x] 2.2-2.3 View columns confirmed: `tool_id` (unique btree index), `success_count`,
      `failure_count`, `avg_latency_ms`, `timeout_count`, `schema_mismatch_count`,
      `rolling_success_rate` (spec said `rolling_success_rate_7d` for the *column name* — the view
      uses the shorter `rolling_success_rate`; the `_7d` window is expressed in the view's name
      instead, functionally equivalent, not a real gap), `last_refreshed_at`.
- [ ] 2.4 Not independently re-verified this session (view structure confirmed, but no fresh
      "create it from scratch on a clean dev DB" test was run — low priority since it already
      exists in the target environment).
- [~] 2.5 **Partially done, needs live verification**: `atlas:phase10:stats:scheduler:*` npm
      scripts exist (`--dry-run`, `--test-refresh`, `--apply`, `--install-pg-cron`) and the script
      file itself exists on disk (`sveltekit-frontend/scripts/atlas/phase10-stats-refresh-
      scheduler.mjs`) — but these scripts share the SAME broken `../` path prefix as 1.21, so `npm
      run atlas:phase10:stats:scheduler:*` currently fails the same way. Whether pg_cron is
      actually installed/scheduled live was not checked this session (blocked by the same path bug
      — would need either a path fix or a direct `node scripts/atlas/phase10-stats-refresh-
      scheduler.mjs` invocation to test).
- [ ] 2.6-2.7 Not run this session — blocked by the same path issue, and moot until Section 3's
      emission gap (below) is resolved, since there's currently no real telemetry data
      (`tool_execution_log` has 0 rows) to refresh statistics from.

## 3. RabbitMQ Telemetry Infrastructure — real gap found, not cosmetic

- [x] 3.1 `tool.telemetry` queue confirmed live via RabbitMQ management API
      (`GET /api/queues/%2F/tool.telemetry`) — exists, durable. A bonus
      `tool.telemetry.stats.refresh` queue also exists (not in the original spec, presumably for
      task 2.5's refresh trigger).
- [ ] 3.2 **NOT done — this is the real, load-bearing gap.** Nothing publishes to `tool.telemetry`.
      Confirmed via the queue's own stats: `messages: 0, consumers: 0, message_stats: {}` (empty
      `message_stats` means literally zero messages have EVER passed through this queue, not just
      "currently empty"). `selectTool()` (in `src/lib/server/ai/tool-selection.ts`/
      `tool-selection-policy.ts`/`src/lib/server/retrieval/hmm-tool-selector.ts`) does not emit to
      this queue — confirmed via grep, zero references to `tool.telemetry` in any of those files.
- [ ] 3.3 Telemetry event schema — not confirmed to exist as a standalone typed schema; the
      `toolExecutionLog` Drizzle table shape (task 1.19) implies the field set, but no dedicated
      Zod/event-envelope schema was found.
- [x] 3.4 Consumer worker exists and matches spec: `scripts/workers/tool-telemetry-consumer.mjs`
      (7,447 bytes, real file, not a stub — confirmed via `ls`). Not confirmed whether it's
      currently running as a persistent service (0 consumers on the live queue says no, right now).
- [ ] 3.5-3.6 Error handling / graceful shutdown — not verified this session (file exists, content
      not read in full).
- [x] 3.7 `npm run worker:tool-telemetry` script exists in package.json (this one does NOT have
      the `../` path bug — it correctly points to `scripts/workers/tool-telemetry-consumer.mjs`,
      relative to `sveltekit-frontend/`).
- [ ] 3.8-3.11 Not tested this session — blocked on 3.2 (nothing to test consumption of, since
      nothing is ever published).
- **Real architectural finding, not a task-completion gap**: a SEPARATE, independently-built and
  actually-live telemetry system already exists —
  `src/lib/server/telemetry/mcp-tool-telemetry.ts`'s `withMcpToolTelemetry()`, backed by
  `AcpTelemetryCollector` writing to **Redis**, not RabbitMQ/Postgres. Confirmed genuinely wired
  (not just defined) into 9 real MCP tool handlers in
  `src/lib/server/dispatch/mcp-tool-implementations.ts` (`toolIdentityRecover`,
  `toolEnvelopeValidate`, `toolMirrorSyncQdrant`, `toolMirrorSyncNeo4j`, `toolGraphExpand`,
  `toolRetrievalRerank`, `toolAnswerSynthesize`, `toolEscalationRoute`,
  `toolIdentityQuarantine`) — zero reference to RabbitMQ or `tool_execution_log` anywhere in that
  module. **This is a real two-owner situation for "tool execution telemetry"** per this repo's
  own "One Canonical Runtime Owner Per Capability" governance rule (CLAUDE.md): the RabbitMQ→
  Postgres design this OpenSpec change specifies (scaffolded, unused) vs. the Redis-based
  `AcpTelemetryCollector` path (actually live). **Not resolved unilaterally — flagged for an
  explicit ownership decision before wiring `selectTool()` to either one.**

## 4. Tool Embedding Enrichment

- [x] 4.1-4.2 `tool_registry.input_schema`/`output_schema`/`examples` columns exist and are
      populated (111 rows total, all with non-empty `input_schema`/`output_schema` per the
      table's `NOT NULL DEFAULT '{}'::jsonb` constraint — not independently verified for
      *meaningful* content vs. just the default this session).
- [x] 4.3 `scripts/atlas/phase10-tool-embeddings.mjs` exists — but is a **stub, not a real
      implementation**, found and fixed this session (2026-09-16), two real bugs: (1) imported a
      shared `../lib/db.mjs` helper that never existed anywhere in this repo (same class of bug as
      the npm path issue — fixed by switching to the direct `pg.Pool` pattern its sibling scripts
      already use); (2) queried `tool_name`, but `tool_registry`'s real column is `name` (fixed
      via `name AS tool_name`). Post-fix, `npm run atlas:phase10:tool-embeddings:regenerate:dry`
      runs cleanly against all 111 real tools (`📊 Found 111 tools`, avg context 350 chars).
- [ ] 4.4-4.9 **NOT implemented — genuinely stub code, not a path/import bug.** Lines 94-98 of the
      script (before this session's fixes, unchanged) are literal `console.log('⏳ TODO: Wire
      embedding generation to embeddinggemma:latest service')` / `'⏳ TODO: Update Qdrant
      tool_registry collection'` — `--apply` mode never calls an embedding model or writes
      anything to Qdrant or `tool_registry.embedding`. The context-building logic (task 4.3, name +
      description + schemas + examples + tags concatenation) is real and now runs correctly; the
      actual embedding generation + Qdrant upsert (tasks 4.4/4.6-4.9) does not exist. This means
      the 6/111 rows that already have embeddings (task 4.10 below) did **not** come from this
      script — their real source is unidentified, not investigated further this session (out of
      scope for a bug-fix pass; would need its own follow-up).
- [ ] 4.10 **Corrected — not "partially run."** `tool_registry.embedding` populated for only 6/111
      rows, but per the finding above, nothing in this repo's `phase10-tool-embeddings.mjs` script
      is capable of producing that population — so this isn't partial progress toward completing
      the task via that script, it's evidence of some other, unidentified process. Implementing
      the actual embedding generation (wiring `--apply` to `embeddinggemma:latest` via the
      existing `/api/embed` pattern used elsewhere in this repo, e.g.
      `src/mcp/trace-mcp-server.ts`'s `image.search_by_text` tool) is real, scoped, non-trivial new
      work — not done this session (context-budget decision, not a difficulty finding).
- [ ] 4.11-4.12 Not testable until 4.4-4.9 exist.

## 5. Schema Compatibility Filtering (Preparation)

- [ ] 5.1 `validateToolSchema` function **not found anywhere in `src/`** — not implemented.
      **Root-caused fully, 2026-09-16 (source of the mismatch identified, not just observed).**
      `tool_registry` (111 rows) holds three genuinely distinct tool categories, each with its own
      (currently sensible, not broken) capability shape:
      - **100 rows, `api:*` tool_id prefix** — SvelteKit API routes indexed by
        `scripts/atlas/phase10-api-indexing-persist.mjs`. `tool_capabilities` = HTTP methods array
        (e.g. `["POST"]`, verified: `INSERT ... tool_capabilities) VALUES (..., JSON.stringify(
        api.handlers), ...)` at that file's line 182). `tool_constraints` =
        `{complexity, rate_limit, auth_required}`. No embeddings (0/100).
      - **5 rows, `mcp:*` prefix** — generic placeholder `tool_capabilities: ["mcp-tool"]`, empty
        constraints. No embeddings (0/5).
      - **6 rows, individually named** (`rg.lexical_search`, `qdrant.dense_search`,
        `ornith.explain_code`, `trace.kag_search`, `atlas.topology_expand`,
        `neo4j.dependency_closure`) — confirmed via `count(embedding) OVER ()` to be **exactly**
        the 6 tools with any embedding at all (task 4.10's "6/111" mystery, now solved: these are
        task 4.2's "6 canonical tools," seeded early with name/summary/embedding, never backfilled
        with capabilities of *any* shape — `tool_capabilities`/`tool_constraints` are `[]`/`{}`
        on all 6).
      **Conclusion**: the original design's assumed shape
      (`supported_packet_types`/`supported_languages`/`supported_extensions`) has **zero real data
      anywhere in `tool_registry`** — not even on the 6 canonical tools it was presumably designed
      around. This isn't a data-quality bug to fix; it's an unmade design decision. Three real
      options, not decided here: (a) normalize a cross-category schema (e.g. every category maps
      into a common `supportedDomains`/`inputKinds` shape `validateToolSchema` can check
      uniformly), (b) make `validateToolSchema` category-aware (different validation logic keyed
      off `tool_id` prefix — correctly handles the real HTTP-method data for `api:*` without
      forcing a shape it doesn't have), or (c) defer Section 5 until the 6 canonical tools get real
      capability data in whatever shape is chosen, since they're the tools this section's
      "schema-aware tool discovery" framing was actually written for.

**DECIDED (2026-09-16, operator choice): normalize to one common shape (option a), then backfill
the 6 canonical tools (option c) — in that order.** Plan below, written before implementation per
instruction.

### 5a. Normalized `tool_capabilities`/`tool_constraints` shape

Additive migration, not a replace — existing keys (`auth_required`, `rate_limit`, `complexity` on
`tool_constraints`; the raw HTTP-methods array on `tool_capabilities`) are preserved as-is, new
keys are added alongside them. Zero data loss, no readers of the old shape break (none found this
session, but preserving anyway per this repo's own additive-migration convention).

```
tool_capabilities (jsonb), new keys added to the existing array-or-object value:
  Currently `tool_capabilities` is sometimes a bare array (api:* rows: ["POST"]) and sometimes
  another bare array (mcp:* rows: ["mcp-tool"]) — NOT an object, so "add keys alongside" means:
  wrap into { httpMethods: <old array if api:*>, legacyTag: <old array if mcp:*>,
  supportedPacketTypes: string[], supportedLanguages: string[], supportedExtensions: string[],
  domainTags: string[], deprecated: boolean }. supportedPacketTypes/Languages/Extensions use []
  to mean "no restriction" (wildcard), matching this repo's existing "optional filter, missing
  metadata = permissive" convention (see design.md's own "default behavior if missing metadata"
  language in task 5.5).

tool_constraints (jsonb), new keys added to the existing object:
  { ...existing keys unchanged (complexity, rate_limit, auth_required for api:* rows),
    maxLatencyMs: number | null }
```

Per-category backfill values (script: `scripts/atlas/phase10-normalize-tool-capabilities.mjs`,
`--dry-run`/`--apply`, matching sibling script conventions — direct `pg.Pool`, commander CLI):

- **100 `api:*` rows**: `httpMethods` = existing array (preserved verbatim). `supportedPacketTypes`
  = `['api']` (matches the real `packet_type='api'` these rows already carry). Languages/
  extensions/domainTags = `[]` (no per-route data exists to populate them from — honestly left
  as wildcard/empty, not guessed).
- **5 `mcp:*` rows**: `legacyTag` = existing `["mcp-tool"]` array (preserved). Everything else
  `[]`/wildcard — these rows have no per-tool metadata to classify from either; guessing would be
  worse than an honest wildcard.
- **6 canonical tools**: real, specific classification (this is the actual point of 5a — these are
  the tools Section 5's schema-aware filtering was designed around):
  | tool_id | supportedPacketTypes | domainTags |
  |---|---|---|
  | `rg.lexical_search` | `['code','test','doc']` | `['lexical-search']` |
  | `qdrant.dense_search` | `[]` (wildcard — vector search is packet-type-agnostic) | `['vector-search']` |
  | `ornith.explain_code` | `['code']` | `['llm-explain']` |
  | `trace.kag_search` | `[]` (wildcard) | `['kag','graph-rag']` |
  | `atlas.topology_expand` | `[]` (wildcard — topology is structural, not content-type-bound) | `['topology','graph']` |
  | `neo4j.dependency_closure` | `['code']` | `['graph','dependency']` |

### 5b. `validateToolSchema(query, toolRegistryRow) -> boolean`

Single function, works uniformly across all 3 categories once 5a lands (no category-specific
branching needed in the validator itself — that complexity moves into the one-time backfill, not
into every call). Location: `src/lib/server/ai/tool-schema-validator.ts` (new file, next to the
existing `tool-selection.ts`/`tool-selection-policy.ts` in the same directory). Logic: a query
carries an inferred `packetType`/`domain` (from the caller, e.g. `atlas_packets.packet_type` for
the file/query being worked on); a tool matches if its `supportedPacketTypes` is empty (wildcard)
OR contains the query's packet type. Empty-array-as-wildcard is the only rule needed — no
per-category special-casing required at call time.

- [x] 5a.1 Written: `scripts/atlas/phase10-normalize-tool-capabilities.mjs`
      (`--dry-run`/`--apply`/`--verbose`), matches sibling script conventions (direct `pg.Pool`,
      commander CLI).
- [x] 5a.2 Dry-run against live `tool_registry` (2026-09-16): correctly classified all 111 rows
      into the expected 100/5/6/0 split (api/mcp/canonical/unknown), `--verbose` output showed
      real per-row plans matching the design table exactly.
- [x] 5a.3 Applied live: `✅ Updated 111/111 rows.` Verified directly via `SELECT`:
      `gemma4.explain_code` (see rename below) got real
      `{supportedPacketTypes:["code"], domainTags:["llm-explain"], ...}`; an `api:*` row's
      original `httpMethods`/`complexity`/`rate_limit`/`auth_required` survived untouched inside
      the new shape — additive migration confirmed non-destructive.
- [x] 5b.1 Implemented: `src/lib/server/ai/tool-schema-validator.ts`, exports
      `validateToolSchema(query, toolCapabilities) -> boolean`. Wildcard-on-empty-array,
      permissive-on-missing-metadata, `deprecated` flag respected.
- [x] 5b.2 Unit tests written: `src/lib/server/ai/tool-schema-validator.spec.ts`, 12 tests —
      wildcard match, explicit match, explicit non-match, unspecified-dimension passthrough,
      missing/malformed `tool_capabilities` permissive default, `deprecated` exclusion +
      explicit opt-in, AND-not-OR across dimensions, and 3 tests against the real live shapes
      from the 5a migration (`api:*`, `ornith.explain_code`, `qdrant.dense_search`). All 12 pass.
- [x] 5b.3 `atlas:phase10:normalize-tool-capabilities:{dry,apply}` npm scripts added with correct
      paths from the start (`scripts/atlas/...`, not `../scripts/atlas/...`) — learned from
      Section 1/4's mistake. Verified live: both ran successfully (see 5a.2/5a.3).
- [ ] 5.2-5.5 (Qdrant payload filter predicates, `rankTools()` integration) — **investigated, not
      wired, deliberately stopped rather than rushed (2026-09-16).** `validateToolSchema` exists
      and is tested, but wiring it into a real call site turned out to be bigger than "add an
      import": `src/routes/api/tools/search/+server.ts` → `selectTool()` in
      `src/lib/server/retrieval/hmm-tool-selector.ts` is the real selection path, but that
      function currently works off a **hardcoded in-file metadata map** (`name`/`domains` only,
      e.g. the `ornith.explain_code` entry fixed in §5c) — it never queries
      `tool_registry.tool_capabilities` from Postgres at all in this code path. Wiring
      `validateToolSchema` in for real means adding a DB fetch of live capabilities into
      `selectTool()`'s flow, not a one-line filter call. Chose not to make that change to a live
      routing function without reading it in full first, given limited remaining session budget —
      real surgery on production tool-routing isn't the place to rush. **Concrete next step for a
      fresh session**: read `hmm-tool-selector.ts` in full, decide whether `selectTool()` should
      accept pre-fetched `tool_registry` rows (caller fetches, passes in) or fetch them itself,
      then filter candidates through `validateToolSchema` before ranking.

### 5e. §5.4 filtering-on-success path — VERIFIED LIVE, real bug found + fixed (2026-09-16, follow-up)

**Closes the one gap §5d left open.** Ran the exact next-step recipe §5d prescribed, against the
real running dev server (`npm run dev`, `DEV_BYPASS_AUTH=true`), not a standalone script:

1. Baseline: `POST /api/tools/search {"query":"find function definition for validateSession in
   auth.ts"}` → `rg.lexical_search` selected, top candidate score `0.792`.
2. `UPDATE tool_registry SET tool_capabilities = jsonb_set(tool_capabilities, '{deprecated}',
   'true') WHERE tool_id = 'rg.lexical_search'` — applied live.
3. Re-ran the identical request — **`rg.lexical_search` was still selected, byte-identical
   response.** The filter had zero effect. This was a real bug, not the DB round-trip §5d
   flagged as unverified turning out fine.

**Root cause, isolated and reproduced standalone**: `sql\`... WHERE tool_id = ANY(${toolIds})\``
— drizzle-orm's `sql` template tag does **not** bind an interpolated JS array as a single array
parameter for `ANY()`. It expands it into a comma-separated list of individual params, producing
`ANY(($1, $2))`, which is invalid Postgres syntax (`ANY()` takes one array-typed argument, not a
literal list) and throws at execution:
```
Failed query: SELECT tool_id, tool_capabilities FROM tool_registry WHERE tool_id = ANY(($1, $2))
params: rg.lexical_search,qdrant.dense_search
```
`filterDeprecatedTools`'s own fail-open catch block silently swallowed this every single call,
logging to `console.error` and returning the unfiltered list — so the feature looked wired (no
crash, sensible-looking output) while never actually filtering anything, on any query, since the
moment it was written. §5d's own "fail-open path works exactly as designed" verification was true
but incomplete: it proved the safety net worked, not that the net was ever *needed* until this
follow-up actually deprecated a real row and watched it fail to disappear.

**Fix**: replaced `ANY(${toolIds})` with `sql.join(toolIds.map((id) => sql\`${id}\`), sql\`, \`)`
+ `IN (${idList})` — binds each id as its own parameter inside a valid parenthesized list.
Verified standalone first (isolated repro script, no `$lib` deps, confirmed both the failure and
the fix against live Postgres), then in the real file, then via the dev server: same baseline
request now correctly excludes `rg.lexical_search` and falls through to `atlas.topology_expand`
(score `0.4826`, `fallback: true`). Reverted the test row
(`deprecated` → `false`) and re-ran — `rg.lexical_search` selected again, confirming both
directions of the round-trip, not just the deprecate-and-filter half.

**Current state**: `filterDeprecatedTools` is now genuinely proven end-to-end on a live DB
round-trip, both fail-open (§5d) and filter-on-success (this section), AND has a real automated
regression test: `src/lib/server/retrieval/hmm-tool-selector.deprecated-filter.spec.ts` (3 tests,
mocked `db.db.execute`, picked up automatically by `vitest.config.ts`'s `src/**/*.spec.ts` glob —
no config change needed). The test's DB mock isn't a bare stub — it inspects
`query.queryChunks` for a bare (unwrapped) array element, the exact structural fingerprint of the
`ANY(${toolIds})` bug (confirmed live via direct inspection of drizzle-orm's `sql` object shape:
the broken form leaves `["a","b"]` as a raw top-level `queryChunks` entry; the fixed
`sql.join(...)` + `IN (...)` form never does). **Self-verified as a real regression guard, not
just a green check**: temporarily reverted the source back to `ANY(${toolIds})`, re-ran the suite,
confirmed the "excludes a deprecated tool" test failed with the exact real error
(`filterDeprecatedTools error (failing open, no filtering applied)`), then restored the fix and
confirmed all 3 tests pass again — the same round-trip discipline as §5e's live-route proof, applied
to the test itself. `tool-schema-validator.spec.ts` still separately covers the standalone
validator function in isolation; this new spec covers the DB-fetch-and-map wiring around it. No
further open gap in this wiring as of 2026-09-16.

### 5d. §5.4 wiring: `selectTool()` → live `tool_registry.tool_capabilities` filter — HANDOFF

**Status: implemented, VERIFIED end-to-end as of §5e above (was partially verified, uncommitted, at
the time this section was first written). Read this fully before touching `hmm-tool-selector.ts`
again — real evidence below, not a guess.**

What changed in `src/lib/server/retrieval/hmm-tool-selector.ts` (all uncommitted, `git diff` shows
the exact change):
- New import: `validateToolSchema` from `$lib/server/ai/tool-schema-validator.js`, plus `sql` from
  `drizzle-orm`.
- New function `filterDeprecatedTools(ranked)`: fetches `tool_id, tool_capabilities` for the
  ranked candidate set via `db.db.execute(sql\`SELECT ... WHERE tool_id = ANY(${toolIds})\`)`,
  then filters through `validateToolSchema({}, capabilities)` (empty query object → only the
  `deprecated` check is active, per the vocabulary-mismatch reasoning in §5.2-5.5 above — full
  domain/packetType filtering is still deliberately NOT wired here).
- `selectTool()` now calls `rankTools()` then `await filterDeprecatedTools(rankedAll)` before
  picking the top candidate.
- **Fails open on any DB/query error** — catches, logs `console.error`, returns the unfiltered
  `ranked` array unchanged. Tool selection can never be taken down by this addition.

Two real bugs found and fixed while wiring (via live type-checker + live execution, not
speculation):
1. `db` default-exported from `$lib/server/db/client.js` is `{ db, adminDb, closeConnections }`,
   not the drizzle instance itself — code needed `db.db.execute(...)`, not `db.execute(...)`.
2. `db.db.execute()` returns `{ rows: [...] }`, not a bare array — code needed `.rows.map(...)`.

**Verification run (2026-09-16, real, not simulated)**: a standalone `tsx` script placed inside
`sveltekit-frontend/` (required — relative imports don't resolve from outside the project root)
called `selectTool('where is the function that validates a packet key defined', [], 5)` directly.
Result:
- Confirmed the fail-open path works exactly as designed: the DB call errored (`SASL:
  SCRAM-SERVER-FIRST-MESSAGE: client password must be a string` — a bare-`tsx`-outside-SvelteKit
  env-loading gap in the test harness itself, the same class of issue CLAUDE.md's own "NPX
  Execution Context" section documents; **not evidence of a bug in the app**, since this exact
  `db.db` client is already used successfully elsewhere in the real running app). The catch block
  fired, logged the error, and `selectTool()` still returned a complete, sensible real result
  (`rg.lexical_search` selected, `hmm_state: "CODE_SEARCH"`, real `ranked_tools` list including
  `trace.explain_retrieval` — the tool_id confirmed earlier this session to have zero
  `tool_registry` rows).
- **NOT verified**: the actual filtering logic on a *successful* DB call — i.e., whether a
  genuinely-`deprecated: true` tool_registry row actually gets excluded from `ranked_tools` in
  practice. This session never got a successful DB round-trip from the test harness to check that
  path. The unit tests in `tool-schema-validator.spec.ts` prove `validateToolSchema` itself handles
  `deprecated` correctly in isolation (12/12 passing), but that's not the same as proving the new
  `filterDeprecatedTools` DB-fetch-and-map wiring around it is correct end-to-end.
- Also unverified: `hmm-tool-selector.ts` has no existing test file to run through — no automated
  regression coverage for this wiring at all yet, only the manual run above and the
  now-superseded-by-this-note pre-existing type-check pass (`npx tsc --noEmit`, no errors reported
  for this file after both bug fixes).

**Concrete next step for whoever picks this up**: run `npm run dev` (or otherwise get inside real
SvelteKit env-loading), call `POST /api/tools/search` with a query that should rank a tool you can
temporarily mark `deprecated: true` in `tool_registry.tool_capabilities`, and confirm it's excluded
from the response's ranked list. Then revert the test row. That closes the one real gap left in
this wiring.

### 5c. Real-time correction: stale model reference found and fixed (2026-09-16, same session)

While reviewing 5a's canonical-tool table, found `tool_id = 'gemma4.explain_code'` referenced a
retired model name — this repo's chat/synthesis model moved from Gemma4 to **Ornith 1.5 9B on
llama-server `:8090`** (documented at length in `sveltekit-frontend/CLAUDE.md`'s "Ollama Phase-Out
+ Chat/Synthesis Model Switch" section). **Renamed, not just relabeled** — checked for real
dependencies first (`tool_execution_log` had 0 rows referencing it, confirmed safe), then:
- DB: `UPDATE tool_registry SET tool_id = 'ornith.explain_code', summary = '...via Ornith 1.5 9B
  (llama-server :8090)' WHERE tool_id = 'gemma4.explain_code'` — applied, verified live.
- Code: renamed in all 5 real references found via grep (`src/lib/server/retrieval/
  hmm-tool-selector.ts` ×4, `src/routes/api/tools/search/+server.ts`,
  `scripts/atlas/phase10-daily-graphify-enhancement.mjs`,
  `scripts/atlas/phase10-go-service-integration.mjs`, `scripts/atlas/phase9-tool-registry-index.mjs`)
  plus this session's own new `phase10-normalize-tool-capabilities.mjs` and this tasks.md.
- Checked `hmm-tool-selector.ts`'s `ornith.explain_code` entry directly — it's routing/selection
  metadata only (`name`, `domains`), no literal model-invocation code in that file to also fix.
- Not independently verified: whether any OTHER file (outside this session's grep scope) invokes a
  model for this tool's actual execution and hardcodes a Gemma4 endpoint/model-id rather than
  going through the already-centralized model resolver (`src/lib/server/ai/
  llama-server-model-resolver.ts`, per CLAUDE.md) — the 6 files fixed were every real match for
  the literal string `gemma4.explain_code`, but a differently-named call site is possible and
  wasn't searched for given context budget.

## 6. Packet Type Backfill (Priority Subset)

- [x] 6.1-6.2 `scripts/atlas/phase10-backfill-packet-type.mjs` exists (5,367 bytes, real file).
- [x] 6.3-6.5 **Confirmed actually run, with real results exceeding the original scope.** Live
      `packet_type` distribution on `atlas_packets`: `code=61466, doc=160, test=48, api=33,
      schema=11`. The default value for this column is `'code'`, so the non-code counts (252
      packets across doc/test/api/schema) prove real classification happened, not just the
      default sitting unchanged. This went beyond task 6.5's stated scope ("code+test packets
      only, defer doc/prompt/tool to Phase 10b") — doc/api/schema were also classified, prompt and
      tool were not (0 rows for those two types).
- [ ] 6.6 Spot-check of 10 rows for backfill accuracy — not done this session (the aggregate
      distribution is a real signal, but not the same as verifying per-row correctness).

## 7. Feedback Loop Integration — real gap found

- [ ] 7.1-7.2 **NOT done.** Grepped `hmm-tool-selector.ts`, `tool-selection.ts`,
      `tool-selection-policy.ts` for `rolling_success_rate`/`avg_latency_ms` — zero matches. The
      tool-selection logic does not read the telemetry stats this section's infrastructure (1.7-
      1.18, 2.1-2.3) was built to provide. The materialized view and columns exist; nothing
      consumes them yet.
- [ ] 7.3 Not done — no telemetry-to-HMM-observation wiring found (task itself says "prepare, don't
      wire yet," consistent with this being genuinely deferred, not a hidden gap).
- [ ] 7.4-7.5 Not done — no fallback logic or end-to-end test found for this path.

## 8. Integration Testing

- [ ] 8.1-8.7 **No dedicated Phase 10 ontology/telemetry test files found anywhere in the repo**
      (searched `*phase10*test*`/`*phase10*spec*` — all matches were unrelated "Phase 109",
      "Phase 108", "Phase 103/104/105/100" numbered phases, a false-positive prefix collision, not
      this Phase 10). This section is genuinely unstarted.

## 9. npm Scripts and CLI

- [x] 9.1-9.9 and then some: package.json has far more `atlas:phase10:*` scripts than the original
      9 tasks specified — schema migration, tool-embeddings, backfill, stats refresh + scheduler
      (with pg_cron install option), validation, telemetry consumer (start + test-mode),
      go-service-integration (health/index-tools/wire-telemetry/add-to-graphify/validate),
      api-indexing (+ persist, + embed variants), daily-graphify-enhancement — roughly 30 scripts
      total, well beyond the original 9-task plan. **But**: every script using the `../scripts/
      atlas/phase10-*.mjs` path (all of them except the two `scripts/workers/tool-telemetry-
      consumer.mjs` ones) is currently broken — see the path-bug finding under Section 1/1.21.
      Marking this section done for "scripts exist," not for "scripts run."

## 10. Documentation and Monitoring

- [ ] 10.1-10.8 **No dedicated Phase 10 ontology documentation found** (same false-positive-prefix
      search issue as Section 8 — no real "Phase 10 packet ontology" doc exists in `docs/`).
      `TelemetryDashboard.svelte` exists (`src/lib/components/telemetry/`) which may partially
      satisfy 10.5's "dashboard for telemetry observability," but it wasn't read this session to
      confirm it covers `success_rate`/`latency distribution` specifically, and given the Section 3
      finding it likely reads from the Redis-based `AcpTelemetryCollector` path, not
      `tool_execution_stats_7d` — worth checking before assuming it satisfies 10.5.

## Summary: one blocker fixed, one real decision still needed

1. **npm script path bug — FIXED, 2026-09-16.** All 27 `atlas:phase10:*` `../scripts/atlas/
   phase10-*.mjs` references corrected to `scripts/atlas/phase10-*.mjs` in `package.json` (one
   `sed` pass, verified `package.json` still parses as valid JSON afterward). Live-reran
   `npm run atlas:phase10:validate` post-fix — its own smoke gate (a real, pre-existing script,
   `scripts/atlas/phase10-validation-smoke.mjs`) independently confirms **6/6 gates PASS**: packet_type
   enum (8 values), atlas_packets ontology columns (5), tool_registry telemetry columns (9),
   tool_execution_log table (7 cols) + indexes (4), tool_execution_stats_7d view (8 cols) — this
   corroborates the manual audit above from an independent source. `npm run
   atlas:phase10:schema:migration:dry` still fails, but now for the *correct* reason:
   `phase10-schema-migration.mjs` genuinely does not exist anywhere in the repo (its 13 sibling
   `phase10-*.mjs` scripts do) — moot in practice since the migration it would apply is already
   live, confirmed by every column check above and by the smoke gate. Not recreating that file
   speculatively — if it's ever needed again (e.g. replaying onto a fresh DB), write it then, from
   the now-known target schema, rather than guessing its original content.
2. **Telemetry ownership ambiguity — still open, needs an explicit decision, not resolved here.**
   Two non-integrated systems own "tool execution telemetry": this change's scaffolded-but-unused
   RabbitMQ→Postgres design (`tool.telemetry` queue: 0 messages ever, 0 consumers currently
   running), vs. the separately-built, actually-live Redis-based `AcpTelemetryCollector` path
   wired into 9 real MCP tool handlers. Wiring Section 7's feedback loop to either one without
   deciding this first would create a third, even-more-fragmented owner — exactly what this
   repo's own governance rules exist to prevent.
