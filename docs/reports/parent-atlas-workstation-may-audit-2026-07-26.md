# Parent Atlas Workstation May Audit

Generated: 2026-07-26

## Purpose

Find the most likely markdown file(s) the user remembered as something like:

- "parent atlas workstation ... 5-12"
- "parent atlas workstation ... 5-20"
- a next-step plan tied to Parent Atlas workstation work

This report separates:

1. exact Parent Atlas workstation files
2. May 12 / May 20 adjacent planning files
3. the best candidate to use as the next-step plan now

## Files audited

### Exact or near-exact Parent Atlas workstation files

- `parent-atlas-workstation-todo.md`
- `docs/reports/PARENT_ATLAS_WORKSTATION_TODO_0_100.md`
- `docs/reports/parent-atlas-workstation-status.md`
- `docs/reports/parent-atlas-workstation-openspec-task-board.md`
- `docs/reports/parent-atlas-workstation-deep-audit.md`
- `next_steps/active/PARENT_ATLAS_WORKSTATION_PHASE133_134.md`

### May 20 adjacent files

- `docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md`
- `llm/next_steps_2026-05-20.md`
- `docs/session-notes/TODO-2026-05-20-production-feature-map.md`
- `docs/session-notes/5_20__stubstodo list.md`

### May 12 adjacent files

- `docs/audit/2026-05-12_native-bridge-verification.md`

## Findings

### 1. No exact filename match was found

There is no main-repo markdown file whose filename directly combines:

- `parent atlas`
- `workstation`
- and `5-12` or `5-20`

So the remembered file is most likely:

- a Parent Atlas workstation file plus a separate May 20 planning file, or
- a May 20 master todo that overlapped with Parent Atlas work

### 2. `MASTER-FEATURE-TODO-2026-05-20.md` is not the Parent Atlas workstation plan

`docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md` is the canonical active checklist for the 2026-05-20 execution plan, but its center of gravity is:

- Karpathy GPU finish-line work
- graphify / atlas / Bifrost / TRACE alignment
- productization and runtime hardening

It is useful context, but it is not the cleanest "Parent Atlas workstation" source.

### 3. `llm/next_steps_2026-05-20.md` is even broader

`llm/next_steps_2026-05-20.md` is a general roadmap summary for the repo on 2026-05-20. It discusses:

- repo state
- MCP issues
- suggested product focus areas

It is not a Parent Atlas workstation-specific plan.

### 4. The strongest older-style workstation plan is `parent-atlas-workstation-todo.md`

`parent-atlas-workstation-todo.md` is the most direct workstation-oriented planning file in the repo root. It contains:

- Layer 1 canonical identity completion
- export stack phases
- Layer 2 compiler output expansion
- Layer 3 metrics and topology
- Layer 4 runtime and training

This reads like the closest match to a remembered "Parent Atlas workstation" planning note.

### 5. The strongest current canonical workstation plan is `PARENT_ATLAS_WORKSTATION_TODO_0_100.md`

`docs/reports/PARENT_ATLAS_WORKSTATION_TODO_0_100.md` is the clearest current next-step plan. It is better than the older todo because it is:

- more recent
- proof-state based
- explicitly organized as a promotion roadmap
- aligned to current blockers

Its current blockers are:

- full-corpus graph snapshot materialization and replay
- persisted live NetworkX/GDS parity
- bounded graph traversal
- retrieval registry enforcement across all lanes
- closed-loop agentic repair with rollback proof
- authority promotion blocked

### 6. `PARENT_ATLAS_WORKSTATION_PHASE133_134.md` is a targeted wiring plan, not the master roadmap

`next_steps/active/PARENT_ATLAS_WORKSTATION_PHASE133_134.md` is specifically about:

- LangGraph persistence
- OpenTelemetry bootstrap
- NetworkX backend acceleration validation
- GPU topology lane wiring
- browser synthesis separation

It is useful when the task is runtime wiring or instrumentation, but it is narrower than the full workstation roadmap.

### 7. `parent-atlas-workstation-status.md` is a live status snapshot, not a planning file

`docs/reports/parent-atlas-workstation-status.md` is best used as:

- current lane status
- current table/row counts
- next commands to run

It is operational evidence, not a strategic plan.

### 8. `parent-atlas-workstation-openspec-task-board.md` is the best bridge between roadmap and execution state

`docs/reports/parent-atlas-workstation-openspec-task-board.md` translates the workstation into:

- state-based phase tracking
- blockers
- immediate next steps

It is the most execution-friendly companion to `PARENT_ATLAS_WORKSTATION_TODO_0_100.md`.

### 9. `parent-atlas-workstation-deep-audit.md` is a contract/readiness audit, not the missing May file

`docs/reports/parent-atlas-workstation-deep-audit.md` scores the workstation at `88 / 100` and focuses on:

- 384 vs 768 vector contract alignment
- retrieval semantics
- Qdrant defaults
- PageRank authority contract cleanup

It is important, but it is an audit artifact, not the remembered May 12 / May 20 workstation todo.

### 10. `5_20__stubstodo list.md` is May 20 adjacent but not Parent Atlas workstation-specific

`docs/session-notes/5_20__stubstodo list.md` covers:

- stubbed methods
- E2E feature mapping
- policy/env gates
- GraphRAG hybrid GPU/CPU sidecar work

It overlaps with Atlas/runtime concerns, but it is not the Parent Atlas workstation planning file.

## Best-match ranking

### Best current canonical next-step plan

1. `docs/reports/PARENT_ATLAS_WORKSTATION_TODO_0_100.md`

Why:

- best current Parent Atlas workstation roadmap
- explicit blockers
- aligned to July 2026 reality

### Best older workstation planning note

2. `parent-atlas-workstation-todo.md`

Why:

- strongest workstation-style todo document
- likely closest in tone to the file being remembered

### Best May 20 overlapping execution file

3. `docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md`

Why:

- actual 2026-05-20 master checklist
- overlaps with Atlas/Karpathy/TRACE/Bifrost work
- but not a workstation-specific Parent Atlas doc

### Best broad May 20 summary

4. `llm/next_steps_2026-05-20.md`

Why:

- useful period snapshot
- not specific enough to be the workstation plan

### Best stateful execution companion

5. `docs/reports/parent-atlas-workstation-openspec-task-board.md`

Why:

- converts workstation scope into current state, blockers, and phase exits
- strongest companion if the user wants to execute against gates instead of reading a broad roadmap

## Recommended next-step source of truth

Use this order:

1. `docs/reports/PARENT_ATLAS_WORKSTATION_TODO_0_100.md`
2. `parent-atlas-workstation-todo.md`
3. `next_steps/active/PARENT_ATLAS_WORKSTATION_PHASE133_134.md`
4. `docs/reports/parent-atlas-workstation-openspec-task-board.md`
5. `docs/reports/parent-atlas-workstation-status.md`

Interpretation:

- use `PARENT_ATLAS_WORKSTATION_TODO_0_100.md` as the active roadmap
- use `parent-atlas-workstation-todo.md` as the older detailed buildout plan
- use `PARENT_ATLAS_WORKSTATION_PHASE133_134.md` for LangGraph / OTel / GPU topology wiring
- use `parent-atlas-workstation-openspec-task-board.md` for phase state, blockers, and immediate execution order
- use `parent-atlas-workstation-status.md` for current live status and immediate commands

## Suggested next session plan

If the goal is to continue Parent Atlas workstation work, the next sequence should be:

1. Finish full-corpus graph snapshot materialization.
2. Prove persisted NetworkX vs Neo4j GDS parity on the same snapshot.
3. Replace legacy multihop with bounded snapshot-scoped traversal.
4. Enforce retrieval registry coverage across all online lanes.
5. Keep authority promotion blocked until those proofs exist.

## File conclusion

Most likely remembered file:

- `parent-atlas-workstation-todo.md`

Best file to use now:

- `docs/reports/PARENT_ATLAS_WORKSTATION_TODO_0_100.md`

Best file to execute from right now:

- `docs/reports/parent-atlas-workstation-openspec-task-board.md`

## Graph Tool Lanes and OpenCode audit

### Scope

This section audits the May 20 master feature todo against the current repo state for:

- Graph Tool Lanes
- OpenCode agent skills
- current runtime wiring

### Findings

#### 1. `MASTER-FEATURE-TODO-2026-05-20.md` is internally contradictory for the graph lanes

`docs/reports/sessions/MASTER-FEATURE-TODO-2026-05-20.md` marks the following lanes as both unfinished and complete:

- `attention_rank_files`
- `som_topology_stats`
- `language_distribution`
- `playbook_lookup_by_language`

The file first shows them unchecked under `Knowledge Graph Tool Lanes`, then later shows `Phase KG-6` complete for the same tools. That means the document is not reliable as a current execution-state tracker for this area.

#### 2. Current audit code still classifies all four graph lanes as contract-only, not production-callable

`sveltekit-frontend/scripts/mega-audit/build-chunk2-report.mjs` currently labels all four tools:

- `status: 'contract-only'`
- `production: false`
- `callable: false`

That is the strongest current repo-native evidence for these exact tool IDs.

#### 3. Current OpenCode API surface is not a finished graph-lane productization layer

`sveltekit-frontend/src/routes/api/opencode/+server.ts` still uses:

- `/api/tools/rpc-search` as the main retrieval call
- a `Mock tool list`
- hard-coded `narrowedTools`

So the endpoint is not exposing these graph lanes as real bound tools end to end.

#### 4. The OpenCode dispatch router is largely stubbed

`sveltekit-frontend/src/lib/server/opencode/dispatch-router.ts` defines lane routing for:

- `search_rg`
- `query_qdrant`
- `search_codebase`
- `plan`
- `auto`

But each route currently returns a queued placeholder with `// STUB` comments rather than real execution. This means the current dispatch layer does not prove production wiring for the May 20 graph-lane plan.

#### 5. The OpenCode Atlas bridge still contains placeholder retrieval behavior

`sveltekit-frontend/src/lib/server/opencode-atlas-bridge.ts` includes:

- a placeholder embedding via `new Array(768).fill(0.1)`
- fallback-heavy tier code for Redis, SOM, KMeans, Neo4j, and Postgres

This is useful scaffolding, but it is not proof that the May 20 graph-lane integration is complete.

#### 6. One topology-heavy endpoint is live, but it is not the same thing as the four May 20 tool lanes

`sveltekit-frontend/src/routes/api/research/topological-encyclopedia/+server.ts` is a real endpoint using:

- `generateSingleEmbedding`
- `autoencoderEncode2Layer`
- `readLatestQdrantClusterTags`

So there is live topology/retrieval work in the repo, but it is exposed as a research endpoint rather than the four graph tool lanes named in the May 20 todo.

#### 7. The older Hermes path has drifted out of the live tree

The repo still contains references to `/api/ai/hermes-run`:

- `sveltekit-frontend/scripts/smoke-attention-rank.mjs`
- `sveltekit-frontend/src/lib/server/atlas/route-feature-map.ts`

But `src/routes/api/ai/hermes-run/+server.ts` does not exist in the current tree. That suggests migration drift between:

- older Hermes-era docs/tests/maps
- current OpenCode/agent runtime surfaces

#### 8. Current bounded agent tools do exist, but not under the May 20 graph-lane names

The current registered agent tools found in live source include examples like:

- `packet.search`
- `topology.status`
- `startup.briefing`

So there is a real tool gateway and tool registry, but the exact May 20 lane names were not found as current registered runtime tools in the main live server paths inspected.

### End-to-end interpretation

The May 20 todo is best treated as historical intent for this area, not current truth.

What appears true today:

- the repo has active topology and retrieval building blocks
- the repo has a bounded tool gateway and small live tool registry
- the repo has newer OpenCode surfaces

What does not appear proven today:

- end-to-end callable registration of `attention_rank_files`
- end-to-end callable registration of `som_topology_stats`
- end-to-end callable registration of `language_distribution`
- end-to-end callable registration of `playbook_lookup_by_language`
- a completed migration from Hermes-era paths into the current OpenCode runtime

### Recommended next review target

If the next phase is to productize Graph Tool Lanes and OpenCode agent skills, the most important execution gap to close is:

1. choose the canonical current runtime boundary
2. remove or archive Hermes-era dead references
3. register the intended graph tools in the live tool registry
4. wire them through the current JSON-RPC or API gateway
5. replace mock and stub dispatch behavior with verified execution
6. add a smoke path that targets a route and tool IDs that actually exist

## Alignment audit after PageRank and GDS scope expansion

### Scope covered

This pass checked current repo evidence for:

- PageRank and Neo4j GDS authority
- feature labeling and `feature_id`
- `tree_node_id`
- semantic and lexical retrieval
- tree-sitter / AST structure
- msgpack packet transport
- PyTorch, XGBoost, KMeans, SOM, and autoencoder training
- multi-hop traversal and graph reranking
- dense search RPC / HyperRAG
- ACP and A2A surfaces
- Mastra workflows
- Paperclip references

### What is clearly live in code

#### 1. Trace MCP has real graph and topology tools

`sveltekit-frontend/src/mcp/trace-mcp-server.ts` exposes live MCP tools including:

- `graph.pagerank_top`
- `topology.search_near`

The PageRank tool reads from Redis cache `couchdb:pagerank_scores` when possible and otherwise queries Neo4j `graphPageRank`. This is real runtime code, not just documentation.

#### 2. Retrieval semantics now have an explicit 768-to-384 contract

`sveltekit-frontend/src/lib/server/vector/retrieval-semantics.ts` defines:

- source collection: `codebase_chunks_768`
- hybrid retrieval collection: `codebase_chunks_384_hybrid`
- retrieval dimension: `384`
- contract id: `embeddinggemma-prefix384-v1`

That means semantic retrieval dimensionality is explicitly versioned in code.

#### 3. PageRank authority has a typed contract

`sveltekit-frontend/src/lib/server/topology/pagerank-contract.ts` is real schema code for:

- `atlas.pagerank-authority.v1`
- `neo4j-gds` implementation metadata
- `pagerankRaw`
- `pagerankL1`
- `authorityPercentile`
- `buildPageRankAuthorityBatch`

So PageRank authority is not only conceptual anymore; it has a canonical contract boundary.

#### 4. SOM topology prefilter is implemented as a retrieval primitive

`sveltekit-frontend/src/lib/server/retrieval/som-topology-prefilter.ts` contains a real 20x20 SOM prefilter path:

- validates 768-dim query embeddings
- uses Redis cache key `som:centroids:20x20`
- computes BMU and neighborhood cells
- emits Qdrant SOM tag filters

This is a real retrieval-stage primitive, not only a notebook-side idea.

#### 5. Attention reranking exists as a live post-retrieval module

`sveltekit-frontend/src/lib/server/retrieval/attention-reranker.ts` is live code that:

- calls `computeAttentionBatch`
- runs after RRF fusion
- supports Karpathy blend `0.4 * pageRank + 0.3 * attention + 0.3 * authority`

That confirms the repo has an implemented graph-aware reranking module, even if productization remains incomplete.

#### 6. XGBoost reranking is wired with sidecar and fallback paths

Two current surfaces show real XGBoost integration:

- `sveltekit-frontend/src/routes/api/atlas/search/+server.ts`
- `sveltekit-frontend/src/lib/server/retrieval/canonical-rerank-executor.ts`

They use:

- `XGBOOST_SIDECAR_URL`
- health checks against the sidecar
- `xgboost-sidecar`
- `xgboost-fallback`

So reranking is not purely aspirational; the repo has a real sidecar-aware path.

#### 7. Msgpack packet transport is implemented and identity-checked

`sveltekit-frontend/src/lib/server/acp/ace-packet-swap.ts` verifies msgpack round-trip survival for:

- `packet_key`
- `title_id`
- `feature_id`
- summary hash

It also explicitly treats the dag-hit cache as L1 and Postgres as L2. That is current transport proof code, not a note.

#### 8. `tree_node_id` is a real canonical identity lane

Current repo evidence for `tree_node_id` is broad and concrete:

- `scripts/atlas/ast-treesitter-facts.mjs`
- `scripts/atlas/audit-tree-nodes.mjs`
- `scripts/atlas/audit-topology-completion-gaps.mjs`
- multiple typed schema files under `src/lib/server/db/schema`

This is clearly part of the active identity and topology model, not a stale field name.

#### 9. ACP and A2A are present as live surfaces

Current code shows:

- route inventory for `/api/acp/execute` and `/api/acp/tools`
- active ACP packet transport audits
- A2A streaming in `src/routes/api/ai/agent/+server.ts`

The A2A route emits:

- `task_status`
- `task_artifact`
- metadata with `source: 'a2a-stream'`

So ACP and A2A are current runtime boundaries, not just roadmap text.

#### 10. Mastra durable workflow metadata exists

`sveltekit-frontend/src/lib/server/okf/mastra-okf-loader.ts` and `mastra-workflows.okf.yaml` define:

- `MastraOkfLoader`
- workflow discovery
- `error-repair-durable`

This is real workflow-schema infrastructure.

### What is implemented but still only partial proof

#### 11. OpenCode remains behind the rest of the retrieval stack

Compared with the stronger MCP, ACP, reranker, and topology modules, OpenCode still trails:

- `/api/opencode` is still mock-heavy
- dispatch routing is still stubbed
- the Atlas bridge still contains placeholder embedding logic

So the repo is stronger in lower-level retrieval and topology primitives than in the current OpenCode orchestration surface.

#### 12. Full-corpus PageRank parity is still not proven by the current task-board state

Even though PageRank contracts and live tools exist, the current workstation boards still say:

- full immutable graph snapshot remains a blocker
- persisted live NetworkX/GDS parity is `NOT_RUN`
- bounded traversal is `NOT_IMPLEMENTED`

That means there is important code in place, but the workstation promotion gates are still correctly blocked.

#### 13. Multi-hop traversal still looks more planned than fully promoted

The roadmap and task board continue to call out bounded traversal as missing or not yet promoted. The current codebase has graph and topology helpers, but this audit did not find proof that the old multihop path has been fully replaced by a snapshot-scoped canonical traversal boundary.

### What looks stale, drifting, or unproven

#### 14. Paperclip is not a current runtime lane in this audit

This pass only found `paperclip` in document-index references such as:

- `docs/documents-atlas-index.md`
- `docs/documents-atlas-index.json`

It did not surface as a current server runtime boundary in the live paths inspected.

#### 15. The original May 20 Graph Tool Lane names still do not line up with the stronger current modules

The repo now has real code for:

- Trace MCP graph tools
- SOM prefilter
- attention reranking
- XGBoost reranking
- msgpack packet transport
- ACP/A2A surfaces

But those advances are not reflected cleanly through the original May 20 tool names and OpenCode lane wiring. The stronger implementation seems to have accumulated in adjacent systems, while the old named lane plan drifted.

### Current-state interpretation

The workstation has moved beyond pure planning in several key areas:

- typed PageRank authority contracts
- retrieval semantics contracts
- topology prefiltering
- attention reranking
- XGBoost sidecar reranking
- msgpack packet transport proof
- ACP and A2A runtime surfaces
- Mastra workflow metadata

But the promotion-critical gaps remain:

- full immutable snapshot proof
- same-snapshot NetworkX vs Neo4j GDS parity
- bounded traversal as the canonical graph path
- end-to-end OpenCode lane productization
- removal of stale Hermes-era and May 20 lane drift

### Best execution framing now

The next alignment work should not start from the old May 20 lane checklist alone.

It should start from this split:

1. keep the already-real retrieval and topology primitives
2. prove snapshot and parity gates
3. promote bounded traversal
4. collapse OpenCode, ACP, and MCP exposure onto one canonical tool-registration story
5. archive or rewrite stale Hermes and Paperclip-adjacent planning references where they no longer reflect live runtime truth

## Env discoverability note

The current repo intentionally ignores `.env` and `.env.local` patterns in Git:

- `.gitignore` includes `.env*`
- `.gitignore` includes `sveltekit-frontend/.env*`

Plain content search against the target env paths now works for the main repo and `sveltekit-frontend` env files, while Git still ignores them.

For env file discovery, use:

```powershell
rg --files -g ".env*"
```

For env audits outside the usual target paths, use search overrides instead of relaxing Git ignore rules:

```powershell
rg -n --hidden --no-ignore "DATABASE_URL|REDIS_URL|TRACE_MCP_URL" .env .env.local sveltekit-frontend/.env sveltekit-frontend/.env.local
```

Or discover env files first with:

```powershell
rg --files -g ".env*"
```

Interpretation:

- keep real secret env files ignored
- make them operationally discoverable through explicit `rg` override patterns
- do not rely on plain `rg -n` when auditing runtime configuration
