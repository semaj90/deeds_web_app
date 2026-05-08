# Claude Code Skill: ACE Codebase Atlas Context + Agentic Error Fixing

> Use this skill on every coding/audit/fix session in `c:\Users\james\Videos\deeds-web-app\sveltekit-frontend`. It loads atlas context BEFORE you propose edits.

## Mission

Use the ACE codebase atlas to perform safe, context-aware error fixing and recommendations. Never start by guessing — always start by mapping the target file, route, component, or error into the atlas first.

## Atlas data sources (load in this order)

| Layer | Source | Read pattern |
|-------|--------|--------------|
| 1. Path-local rules | AGENTS.md hierarchy + `agent_context_files` + `agent_context_relations` | nearest-parent walk-up |
| 2. Topology | `taxonomy_nodes` / `taxonomy_edges` + Neo4j `CodebaseFile.{communityId, gpuCluster, graphAuthorityScore, graphPageRank}` | structural neighborhood |
| 3. Semantic memory | Qdrant `codebase_chunks_768` + `chunk_hit_log` (demand-weight) | ANN + recent-hit boost |
| 4. Hot ranks | Redis `gpu:karpathy:scores`, `ace:authority:top`, `ace:rank:dirty_files`, `taxonomy:path:*`, `agents:dir:*` | O(1) hash reads |
| 5. Synthesis lane | TRACE MCP `:8788` (`tools.batch_call` for parallel) | last; context packet → Gemma4/Claude |

## First action checklist

When asked to fix, audit, or enhance something:

1. **Identify target scope** — file path, route, component, cluster, topo_class, error message, or feature request.
2. **Query AGENTS.md context** — nearest AGENTS.md, parent AGENTS.md, relations from `agent_context_relations`.
3. **Query topology** — `topo_class`, `cluster:gpu:N`, graph authority score, neighboring files, imports/exports.
4. **Query retrieval memory** — Qdrant semantic hits, pg_trgm fuzzy hits, `chunk_hit_log` most-accessed chunks, KAG notes.
5. **Rerank** — graph authority + retrieval hit frequency + recency + audit risk + cluster risk + task relevance.
6. **Build a context packet** — 5-15 best knowledge cards: file summary, AGENTS.md rules, related tests, related prior fixes, likely failure mode.
7. **Only then propose or edit code.**

## Retrieval ladder

```
1. Exact file/path lookup
2. Postgres FTS / BM25-style search
3. pg_trgm fuzzy search
4. Qdrant ANN vector search
5. Neo4j graph-neighbor expansion
6. Redis hot-rank lookup
7. Karpathy GPU score (gpu:karpathy:scores)
8. Gemma4 synthesis (last resort, expensive)
```

Fuse with RRF or weighted reranking.

## Rank formula

```
rank = 0.25 × graphAuthorityScore
     + 0.20 × retrievalHitFrequency  (chunk_hit_log)
     + 0.20 × recentChangeWeight      (git diff vs ace:startup:last_sha)
     + 0.15 × auditRisk               (gate violations)
     + 0.10 × clusterRisk
     + 0.10 × semanticRelevance
```

## Karpathy GPU lane (prioritization, NOT mutation)

```bash
npm run karpathy:gpu:dirty                     # incremental on dirty files
npm run karpathy:gpu --source=hit-log --hours=24  # demand-weighted from chunk_hit_log
```

Reads top-N from Neo4j or hit-log, autoencode 768→64, attention vs risk-query probe, blend `0.4·PR + 0.3·attn + 0.3·authority`. Output goes to `gpu:karpathy:scores` (Redis hash, 24h TTL) and `next_steps/active/karpathy-gpu-recommendations.md`.

For risk-focused recommendations, use embedded query probes like:
- `"unsafe deserialization complex import graph deep call chains"`
- `"missing timeout unvalidated fetch svelte route"`
- `"hardcoded localhost env fallback production risk"`
- `"schema drift zod proto postgres mismatch"`

## Schema consolidation rule

For every new data shape, follow this ladder:

1. **Zod schema first** — runtime validator + single source of truth
2. **Postgres JSONB canonical** — store via `superValidate` + `z.parse`
3. **Postgres CHECK constraints** — only when shape is stable (not for experimental)
4. **Proto** — generate via `proto-from-zod.mjs` only when cross-language consumers appear
5. **gRPC** — only when MCP/HTTP is too slow OR Go/C++ needs direct access
6. **MCP** — LLM-facing surface (always)
7. **QUIC** — defer until HTTP/2 head-of-line blocking is measured

DO NOT prematurely create proto/gRPC/QUIC for experimental shapes.

## Error fixing policy

Never patch blindly. For each error:

1. Reproduce or locate the failing gate.
2. **Classify**: `REAL_FAIL` / `WARN` / `ALLOW`
3. Find owning AGENTS.md.
4. Find related topology cluster.
5. Find related prior fixes (`fix_attempts` table).
6. Patch the smallest surface.
7. Run targeted test (`ops.run_targeted_test` MCP tool).
8. Run affected smoke (`smoke:agents`, `smoke:trace`, etc).
9. Update `context_timeline` if the fix changes architecture.

| Class | Examples |
|-------|----------|
| **REAL_FAIL** | TS error, broken import, failed MCP tool with service running, missing table after migration, schema drift, unsafe production URL |
| **WARN** | optional CouchDB lane missing, tsgo PATH issue, GRPO artifact missing, Qdrant scroll timeout, Svelte shallow wiring |
| **ALLOW** | comments, JSDoc examples, tests, explicit audit ignore, local Ollama/TurboQuant fallback, operator-gated dev URL |

## Startup safety

Two-lane: services parallel/detached, data updates lock-protected and idempotent.

**Never auto-run on startup:**
- `db:reset`, `redis:flush`, `qdrant:recreate`, `neo4j:clear`, `agents:write:force`
- full re-embedding, schema migrations
- See `config/startup-ace-policy.json` `neverRunOnStartup`

## Visual evidence lane

```
screenshot
  → Sharp normalize
  → aHash / thumb16 / thumb64
  → Gemma4 VLM caption
  → EmbeddingGemma vector
  → Postgres screenshot_artifacts
  → Qdrant ui_screenshots_768
  → Redis visual rank
  → topology link
```

If Gemma4 VLM is occupied by TurboQuant on `:8090`, route captioning through the running llama-server instead of starting a second Ollama model.

## AGENTS.md envelope mismatch (KNOWN GAP)

Parser expects (from `parse-agents-md.ts`):
```
## Rules
## Tools
## Constraints
```

Generator emits (from `generate-agents-md.mjs`):
```
## Audit Gates
## TODO — Enhancements
## Fix Timeline
```

Until alignment lands, use **structural relations** first (`agent_context_relations`) and treat envelope fields as backfill candidates. Don't assume sparse envelope = useless AGENTS.md.

## Output format (every session)

End with:
- ✅ What passed
- 🔄 What changed
- ⏭️ What was skipped
- 📋 What remains P0/P1/P2
- 🧪 Commands to verify
- 💾 Suggested commit message

## Verification commands

```bash
cd c:/Users/james/Videos/deeds-web-app/sveltekit-frontend

# Health
node scripts/check-all-tools.mjs                 # 47-gate health
npm run typecheck:native                          # tsgo
npm run check                                     # svelte-check
npm run smoke:agents                              # AGENTS.md indexed

# Atlas refresh
npm run agents:pipeline:safe                      # AGENTS.md regen + index
npm run karpathy:gpu:dirty                        # incremental GPU rank
npm run startup:ace:dry                           # dry incremental startup

# MCP probe
curl -sS http://127.0.0.1:8788/health
node scripts/smoke-trace-mcp-tools.mjs            # 34 tools sweep

# Debug
docker exec legal-ai-redis redis-cli HGETALL gpu:karpathy:summary
docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db \
  -c "SELECT count(*) FROM agent_context_files;"
```
