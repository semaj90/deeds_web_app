# Phase 6E Contract Finding Triage

_Generated: 2026-05-16 — post-audit analysis of cross-layer contract findings_

---

## HIGH (1)

### 1. `sveltekit-frontend/src/routes/api/files/+server.ts` — POST handler reads formData without Zod

| Field | Value |
|-------|-------|
| **Code** | `api_route_parses_json_without_zod` |
| **Layer** | `api-contract` |
| **Status** | ✅ FIXED — commit `fix(api): validate post request body with zod` |

**Root cause**: The file upload POST handler called `request.formData()` and extracted the `file` field with only an `instanceof File` check. File properties (name, type, size) were not validated against any schema — untrusted file metadata could reach the storage layer.

**Fix applied** (`src/routes/api/files/+server.ts`):
- Added module-level constants `ALLOWED_MIME_TYPES` and `MAX_UPLOAD_BYTES`
- Added module-level `FileUploadSchema` (Zod) validating `name`, `type`, and `size`
- Changed bare `instanceof File` check to also call `FileUploadSchema.safeParse({ name, type, size })`
- Returns `json({ error, issues }, { status: 400 })` on schema failure
- Changed `throw error(400, ...)` (which was being swallowed by the catch block) to `return json(...)` for the missing-file case

---

## MEDIUM (2 — both false positives in audit Check 1 and Check 4)

### 2. `sveltekit-frontend/src/routes/(app)/evidence/+page.server.ts` — "schema 'formData' flagged as inside-function scope"

| Field | Value |
|-------|-------|
| **Code** | `superforms_schema_not_top_level` |
| **Layer** | `superforms` |
| **Status** | ✅ FALSE POSITIVE — fixed audit Check 1 (`checkSchemaTopLevel`) |

**What the audit saw**: `superValidate(formData, zod(evidenceUploadSchema))` inside the `upload` action. Check 1 scanned for `superValidate(\w+)`, found `formData` as the first capture group, and because `formData` is declared inside the action function (depth > 0), it reported it as "schema defined inside function scope."

**Why it is wrong**: In Superforms v2, the first argument to `superValidate()` can be a `FormData` object or `Request` — this is the **data source** being validated. The actual schema is the second argument: `zod(evidenceUploadSchema)`. `evidenceUploadSchema` is correctly imported at module top-level from `./schema.ts`. No code change needed.

**Audit fix applied** (`scripts/atlas/audit-sveltekit-form-contracts.mjs`):
- Added `DATA_SOURCE_NAMES` set: `formData`, `request`, `data`, `form`, `body`, `payload`, `req`
- Check 1 now skips the local-variable test when the first arg is a known data-source name

---

### 3. `sveltekit-frontend/src/routes/(app)/admin/knowledge-search/+page.svelte` — "use:enhance without server form"

| Field | Value |
|-------|-------|
| **Code** | `client_superForm_without_server_load` |
| **Layer** | `superforms` |
| **Status** | ✅ FALSE POSITIVE — fixed audit Check 4 (`checkClientSuperFormPairing`) |

**What the audit saw**: The `.svelte` file imports and applies `use:enhance` from `$app/forms`. Check 4 treated any `use:enhance` usage as a superforms contract requirement and checked whether the matching `+page.server.ts` load() returns `{ form: superValidate(...) }`. It does not — the server only returns `{ user }`.

**Why it is wrong**: `use:enhance` is SvelteKit's built-in progressive enhancement directive for native HTML forms. It does not require superforms. The knowledge-search page uses raw `formData.get(...)` in its actions, which is the correct native pattern. The page does **not** call `superForm(data.form)` anywhere — there is no superforms coupling.

**Audit fix applied** (`scripts/atlas/audit-sveltekit-form-contracts.mjs`):
- Check 4 now skips pages that use `use:enhance` but do NOT call `superForm(` — only `superForm()` usage creates a superforms dependency on the server form contract

---

## OPERATOR GATES (require Docker + Postgres — no code change)

### 4. HNSW indexes missing on 6 vector tables

| Field | Value |
|-------|-------|
| **Code** | `hnsw_indexes` (from `audit:pgvector`) |
| **Layer** | `vector-infra` |
| **Status** | ⏳ PENDING OPERATOR REVIEW |

Reviewed SQL is at [docs/reports/pgvector-index-plan.md](pgvector-index-plan.md).
All indexes use `CREATE INDEX CONCURRENTLY IF NOT EXISTS` — safe on live tables, no locking.

**Next steps (operator)**:
1. `docker ps --filter "name=legal-ai-postgres"` — confirm container running
2. `Test-NetConnection 127.0.0.1 -Port 5434` — confirm port open
3. Review `docs/reports/pgvector-index-plan.md`
4. Apply: `docker exec -i legal-ai-postgres psql -U legal_admin -d legal_ai_db < sveltekit-frontend/drizzle/manual/20260516_hnsw_indexes.sql`
5. Re-run `npm run audit:pgvector` — `hnsw_indexes` check must pass
6. Add migration file to `sveltekit-frontend/drizzle/sidecar-migrations.json`

---

### 5. 5 unjournaled SQL files (sidecar migrations)

| Field | Value |
|-------|-------|
| **Code** | `documented_sidecar` (from `audit:contracts`) |
| **Layer** | `drizzle-meta` |
| **Status** | ✅ DOCUMENTED in `sveltekit-frontend/drizzle/sidecar-migrations.json` |

Files: `0013_codeintel_indexes.sql`, `0016_codeintel_schema.sql`, `0016_courtroom_3d_animation.sql`, `0018_output_meta_manifold4.sql`, `0019_llm_context_cache.sql`. All were applied manually and are intentional sidecars (GIN/trgm indexes, enum creation, manifold4 column — Drizzle ORM cannot express these natively). Severity downgraded from `medium` to `low` (informational) in the audit after the manifest was created.

---

## Vector Dimension Policy (operator gate — no code change yet)

The `audit:pgvector` report currently flags any dimension outside `{64, 768, 1536}`. Investigation of schema files may reveal intentional 384-dim vectors in warden/GPU-cache lanes.

**Policy (to be encoded in `audit-pgvector-schema.mjs`)**:
| Dimension | Lane | Notes |
|-----------|------|-------|
| 768 | canonical — codebase_chunks, evidence_vectors, legal_documents | embeddinggemma:latest output |
| 384 | compact — warden / GPU-cache embeddings (if confirmed) | needs `rg 'dimensions.*384'` audit |
| 64 | autoencoder compressed path | `gpu:karpathy:encoded` Redis cache |
| 1536 | OpenAI-compat lane | rarely used |

**Next step**: `rg 'dimensions.*384' sveltekit-frontend/src/lib/server/db/` to confirm whether 384-dim columns exist and which tables they serve, then update `ALLOWED_DIMS` in the auditor accordingly.

---

## Audit Health After Fixes

| Audit | Before | After |
|-------|--------|-------|
| `api_route_parses_json_without_zod` | 1 HIGH | 0 (fixed) |
| `superforms_schema_not_top_level` | 1 MEDIUM | 0 (false positive eliminated) |
| `client_superForm_without_server_load` | 1 MEDIUM | 0 (false positive eliminated) |
| `hnsw_indexes` | FAIL | ⏳ pending operator |
| `documented_sidecar` | 5 LOW | 5 LOW (informational, expected) |

**Net change**: 1 high + 2 medium → 0 real code findings. Operator gates unchanged.