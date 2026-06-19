# AGENTS.md — Deeds Web App

> Legal-AI platform: SvelteKit 2 + Svelte 5 (runes) + Bits UI v2 + Drizzle + pgvector + Qdrant + Redis + Ollama + LibTorch GPU.

## Response rules

- Answer directly and concisely. Do not plan aloud before answering.
- For short/simple inputs, respond immediately — do not run audits or checklists unless explicitly asked.
- Use `rg` (ripgrep) to search before opening files. Never load an entire `.md` into context.

## Search first — never read whole files

Before opening any file, search with `rg` (ripgrep):
```bash
rg -l "keyword"                    # find files containing keyword
rg "keyword" src/ --type ts        # search TypeScript files
rg --no-ignore "keyword"           # include gitignored files (NES/CHROM packets)
```
Only `Read` a file if `rg` confirms it contains what you need. Never load an entire `.md` into context to find one fact.

## Critical constraints

- Svelte 5 runes only: no `export let`, `$:`, `on:click`, or `<slot>`; use `$state`, `$derived`, `$props`, `onclick`, and snippets.
- Bits UI uses namespace imports from `bits-ui`; prefer the `child` snippet pattern.
- Drizzle server code: `$lib/server/db/client`, keep `.js` import extensions, use `migrate` not `drizzle-kit push` on live data.
- GET API routes must return stable JSON shape even on failure (same top-level keys, empty defaults).
- Zod-validate every `request.json()` payload.
- Use `env.server.ts` for service URLs; do not hardcode `localhost` in app code.
- **Port 8888**: Reserved for SeaweedFS Filer. Do NOT bind SearXNG to 8888; use 8889.
- **No hidden thoughts**: Do not persist `hiddenThoughts`, `chainOfThought`, `kv_cache`, or `tensor` to any store.

## OpenCode Skill Contract (Mandatory Addendum)
Every skill/subagent must conclude its execution by providing these structured fields:
*   **`likely_cause`**: A one-sentence summary of the root cause or primary trigger for the task.
...
## OpenCode Skill Contract (Mandatory Addendum)
Every skill/subagent must conclude its execution by providing these structured fields:
*   **`likely_cause`**: A one-sentence summary of the root cause or primary trigger for the task.
*   **`evidence`**: The specific data points, file paths, or concepts that informed the solution (e.g., `src/lib/foo.ts`, "User requested feature X").
*   **`patch_targets`**: A list of relative file paths that were modified or should be reviewed for changes.
*   **`safe_next_command`**: The recommended, non-destructive command to run next (e.g., a dry-run audit).
*   **`smoke_command`**: The final validation command to confirm the fix/feature works in a controlled environment.
*   **`report_path`**: A path where the detailed report of this skill's execution should be stored.
## 🧠 ACE/Atlas Context Editor Gate (Mandatory)

This gate is the canonical process for synthesizing a final, actionable context packet from raw retrieval hits. It ensures that the LLM receives a single, highly curated, and versioned source of truth, minimizing token waste and hallucination.

### The 5-Step Data Flow
1. **Raw Retrieval**: Initial search (e.g., `trace_kag_search`) returns raw, un-ranked hits.
2. **Filtering & Scoring**: Hits are filtered by relevance, authority, and recency, generating a preliminary score.
3. **Context Assembly**: The system uses `atlas-tools_build_agentic_rag_context` to select the top-K, most relevant chunks.
4. **Canonicalization**: The selected chunks are passed through a final scoring/reranking layer (e.g., `turbovec_turbovec_rank_chunks`) to determine the single best source of truth.
5. **Injection**: The final, compressed context is written to Redis (`ace:packet:{runId}`) for the current session's use.

### Required Data Structures
*   **`sourceRef`**: The primary identifier, linking the context to the source file/chunk.
*   **`ConceptID`**: The high-level topic or feature ID that anchors the context.
*   **`ConfidenceScore`**: A calculated score (0.0 to 1.0) representing the system's certainty in the provided context.
*   **`ContextBlob`**: The final, serialized, and token-budgeted context payload.

**Actionable Rule**: Never pass raw search results directly to the LLM. Always pass the result of the final, canonicalized context injection.

Example:
```yaml
likely_cause: The existing context building process lacked a centralized, versioned contract for defining new features and their associated data sources.
evidence: [intent:qdrant_payload_enrichment, file:scripts/atlas/build-implementation-intent-aliases.mjs]
patch_targets: ["src/lib/server/db/qdrant-sync.ts"]
safe_next_command: "npm run atlas:concept-evidence:backfill:dry"
smoke_command: "npm run atlas:concept-evidence:audit"
report_path: "docs/reports/atlas_context_build_run_{timestamp}.json"
do_not_do: ["src/lib/server/db/qdrant-sync.ts"]
```

## Repo map
- `sveltekit-frontend/` — main app root
...

## Repo map
- `sveltekit-frontend/` — main app root
...
- `services/` — standalone Go/Python services
- `docker/` — compose/runtime stacks
- `drizzle/` — migrations and schema assets
- `scripts/` — repo-level tooling
- `docs/` — architecture docs and reports

## Commands

```bash
cd sveltekit-frontend && npm ci
cd sveltekit-frontend && npm run dev
cd sveltekit-frontend && npm run check
cd sveltekit-frontend && npm run test:run
npm run audit:contracts          # full 8-layer audit
npm run audit:drizzle            # Drizzle ↔ Postgres drift
npm run services:health          # TCP health gate
```

## Engram-only mode (current)

```
ENGRAM_ONLY=true  REDIS_ENABLED=false  QDRANT_ENABLED=false
NEO4J_ENABLED=false  GRAPHIFY_STARTUP_ENABLED=false
```

Startup does NOT require Redis/Qdrant/Neo4j. Engram MCP at `:8792` is the only required memory lane.

## Gotchas

- User IDs are mixed across tables; check schema before querying.
- SeaweedFS is the primary S3 gateway; ignore MinIO stubs.
- UnoCSS is the styling baseline; do not assume default Tailwind classes exist.
- `drizzle/meta/` must contain only JSON snapshot/journal files — no `.md` or `.txt`.
- Sidecar migrations in `drizzle/` that are not in `_journal.json` must be listed in `drizzle/sidecar-migrations.json`.

## Reference docs (load on demand, not at startup)

- `docs/architecture/` — layer boundaries, retrieval lanes, trace/karpathy rules
- `docs/ai-os/` — OpenCode context window, MCP atlas, skill routing
- `memory/` — architecture references, session history
- `CLAUDE.md` — full project instructions (loaded separately)

## Retrieval Abstraction Boundary (ENFORCED)

Retrieval boundary files:
- `sveltekit-frontend/src/lib/server/search/qdrant-search.ts`
- `sveltekit-frontend/src/lib/server/retrieval/orchestrator.ts`

**Retrieval policy** (in order):
1. Filter first (payload conditions, topo_class, cluster prefilter)
2. Search compressed approximate semantic geometry (Qdrant ANN / quantized traversal)
3. Exact-rescore only the bounded candidate set when quality or telemetry requires it

**cuVS/CAGRA rule**: cuVS is an optional acceleration lane behind the same `SearchBackend<T>` interface (`search-backend.ts`). It is NOT the canonical store. Callers must never depend on Qdrant-specific client details directly — always go through `QdrantSearchBackend` or a conforming `SearchBackend` implementation.

**Canonical truth** remains: Postgres packet/ledger tables, `sourceRef` / cold-original provenance, and Parent Atlas joins. Qdrant is a mirror, not truth.

## LangGraph Boundary (ENFORCED)

LangGraph is **optional orchestration and testing only**.

**Allowed:**
- Validation workflows, planning graphs, subagent sequencing
- Gemma4 / function-tool calling, dry-run reasoning

**Not allowed — hard block:**
- Direct writes to Postgres, Qdrant, Redis, Neo4j, DuckDB, or SeaweedFS from any graph node
- Archive, move, or delete operations

Durable mutations MUST go through: promotion queue → schema gates → validation reports → bounded apply scripts.
