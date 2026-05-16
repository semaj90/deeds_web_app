# AGENTS.md — Deeds Web App

> Legal-AI platform: SvelteKit 2 + Svelte 5 (runes) + Bits UI v2 + Drizzle + pgvector + Qdrant + Redis + Ollama + LibTorch GPU.

## Critical constraints

- Svelte 5 runes only: no `export let`, `$:`, `on:click`, or `<slot>`; use `$state`, `$derived`, `$props`, `onclick`, and snippets.
- Bits UI uses namespace imports from `bits-ui`; prefer the `child` snippet pattern.
- Drizzle server code should come from `$lib/server/db/client`, keep `.js` import extensions, and use migrate flows rather than `drizzle-kit push` on live data.
- GET API routes should keep a stable JSON shape even on failure.
- Zod-validate every `request.json()` payload.
- Use `env.server.ts` for service URLs; do not hardcode `localhost` in app code.
- **Engram Memory (Lane -1)**: Low-trust pre-routing hints. MUST NOT store hidden thoughts, raw tensors, or model cache.
- **Port 8888**: Reserved for SeaweedFS Filer. Do NOT bind SearXNG to 8888; use port 8889 (SEARXNG_PORT=8889).

## Docs Ingestion Governance
- **Official Docs First**: Prioritize official documentation over third-party tutorials or blog posts.
- **SourceRefs Required**: Every synthesized fact or code suggestion must include valid `sourceRefs` to the local Docs Atlas.
- **External Unverified**: All external web results are marked `external_unverified` until promoted by an operator or validated against the codebase.
- **No Direct Promotion**: Do not promote web search results directly to the canonical knowledge base without verification.
- **No Hidden Reasoning**: Do not store `hiddenThoughts`, `chainOfThought`, or `kv_cache` in the Docs Atlas or browser outputs.
- **Multi-Lane Retrieval**: Retrieval should always combine `local_code` (Parent Atlas) and `official_docs` (Programming Docs Atlas).
- **External Collection**: Use `external_programming_docs_768` in Qdrant for technical documentation.
- **Trust Hierarchy**: `local_code` (Authoritative) > `official_docs` (High Trust) > `external_unverified` (Web/Low Trust).


## Commands

- `cd sveltekit-frontend && npm ci`
- `cd sveltekit-frontend && npm run dev`
- `cd sveltekit-frontend && npm run check`
- `cd sveltekit-frontend && npm run test:run`
- `cd sveltekit-frontend && npm run agents:write`

## Repo map

- `sveltekit-frontend/` is the main app root.
- `simd-bridge/` holds the native bridge code.
- `services/` holds standalone services.
- `docker/` holds compose/runtime stacks.
- `drizzle/` holds migrations and schema assets.
- `scripts/` and `docs/` contain repo-level tooling and documentation.

## Agent context

- The repo-local wiki lives in `llm/`.
- `llm/llm_timeline.md` is append-only and must never lose prior entries.
- When updating `llm/`, add a new timestamped note instead of rewriting history; keep the index and timeline in sync.
- Prefer `llm/llm.md` plus the nearest `AGENTS.md` for agentic context; treat `llm/` as the repo's `llms.txt`-style ingest hub for ACE packet injection, 4D topology lookup, and Gemma4 tool-calling.
- Do not create new directory `AGENTS.md` files just to mirror docs; use `llm/` pages for durable repo-wide context and add directory files only when a subtree already depends on them.

## Gotchas

- User IDs are mixed across tables; check schema before querying.
- SeaweedFS is the primary S3 gateway; ignore MinIO stubs.
- UnoCSS is the styling baseline; do not assume default Tailwind classes exist.

## Drizzle / SvelteKit / Contract Audit Lane (Phase 6E — 2026-05-16)

Relevant files:
- sveltekit-frontend/drizzle.config.ts
- sveltekit-frontend/drizzle/**
- sveltekit-frontend/src/lib/server/db/**
- sveltekit-frontend/src/routes/**
- sveltekit-frontend/src/lib/schema/**
- sveltekit-frontend/tests/playwright/**
- docs/reports/*contract*
- docs/graph/contract-error-map.json

Rules:
- Do not run `drizzle-kit push` against production.
- Do not mutate live DB in audit scripts.
- Do not place AGENTS.md, LLMS.md, or Markdown files inside `drizzle/meta`.
- Drizzle meta must contain only supported JSON snapshot/journal files.
- Use `db:check`, `db:generate`, and audits before migrations.
- Use Playwright for browser/network contract verification.
- Use web search only as `external_unverified` when local docs atlas misses.
- Every finding must include localSourceRefs, externalDocRefs when available, suggestedFix, validationCommand, and trustTier.

Run the full cross-layer audit before pushing schema changes, adding new API routes, or wiring new Superforms pages:

```bash
# Full 8-layer orchestrator + KAG/DAG/HMM error-fix DAG
npm run audit:contracts

# Sub-audits (can run independently)
npm run audit:drizzle-meta          # drizzle/meta/ hygiene (non-JSON files)
npm run audit:drizzle-meta:fix      # auto-move violations to drizzle/meta/archived/
npm run audit:pgvector              # pgvector extension, HNSW indexes, dimensions
npm run audit:drizzle               # Drizzle ↔ Postgres schema drift + FK type mismatches
npm run audit:forms                 # SvelteKit + Superforms v2 form contracts
npm run audit:error-dag             # KAG/DAG/HMM error-fix graph (reads prior report)
npm run services:health             # TCP health gate for all 10 dev services
npm run services:health:strict      # Exits 1 if Postgres or Redis are down
```

### Output files
| Report | Purpose |
|--------|---------|
| `docs/reports/contract-error-map-report.{json,md}` | All 8-layer findings |
| `docs/reports/drizzle-postgres-contract-report.{json,md}` | Drizzle ↔ live PG drift |
| `docs/reports/pgvector-audit-report.json` | pgvector extension + HNSW check |
| `docs/reports/sveltekit-form-contracts-report.json` | Superforms / Zod gaps |
| `docs/reports/error-fix-dag-report.{json,md}` | KAG/DAG/HMM topological fix order |
| `docs/graph/contract-error-map.json` | Graph nodes+edges for Neo4j/visualization |
| `docs/reports/dev-service-health-report.json` | Docker/WSL2 service TCP probe results |

### HMM error states (fix in this order)
1. `meta_hygiene` — drizzle/meta has non-JSON files (breaks `drizzle-kit generate`)
2. `stale_migration` — SQL on disk not in `_journal.json` or vice versa
3. `schema_mismatch` — Drizzle column type ≠ live Postgres column type (esp. `user_id uuid` vs `users.id integer`)
4. `vector_infra_missing` — pgvector extension or HNSW indexes absent
5. `env_url_mismatch` — port 5432 instead of 5434, missing SEAWEED_* vars
6. `route_contract_mismatch` — missing `fail(400, { form })`, superValidate without load()
7. `api_validation_gap` — POST/PATCH without Zod validation, legacy `zod` adapter
8. `ssr_safety_violation` — `$lib/server/` imports in `.svelte` client files

### Vector Dimension Policy (Phase 6E)
- **768**: Canonical codebase and programming-doc semantic embeddings (embeddinggemma:latest).
- **384**: Compact warden/GPU-cache and Nomic-Embed-Text embeddings.
- **Other**: Dimensions like 1536 (OpenAI) or 128 (compressed) require explicit documentation in the audit whitelist.

## Drizzle Sidecar Migration Policy (Phase 6E)

**Definition**: A sidecar migration is a numbered `.sql` file in `drizzle/` that is intentionally **not** in `drizzle/meta/_journal.json` because it:
- Uses SQL syntax Drizzle Kit cannot express (GIN trgm, HNSW, enum-only, concurrent index)
- Was applied manually at a point where regenerating the journal snapshot would break drift

**Rules**:
1. Every sidecar MUST be listed in `sveltekit-frontend/drizzle/sidecar-migrations.json` with a `reason`, `appliedAt` date, and `validationCommand`.
2. Unlisted unjournaled numbered SQL files are **WARN/FAIL** in the contract audit (`unknown_unjournaled_sql`).
3. Do NOT delete or auto-journal sidecars without operator review.
4. Do NOT add vector HNSW indexes without first reviewing `docs/reports/pgvector-index-plan.md`.
5. Keep `drizzle/meta/` limited to `_journal.json` and `NNNN_snapshot.json` only — no `.md`, `.txt`, or other files.

**Audit commands**:
```bash
npm run audit:drizzle-meta          # hygiene check (non-JSON detection)
npm run audit:drizzle-meta:fix      # auto-move violations to drizzle/meta/archived/
npm run audit:pgvector              # pgvector extension, HNSW indexes, dim validation
```
