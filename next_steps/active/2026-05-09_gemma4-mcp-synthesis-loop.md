# Plan — Gemma4 ⇄ MCP ⇄ Claude Code synthesis loop

**Date**: 2026-05-09
**Status**: design (no code yet — scaffolding only after this plan is approved)
**Owner**: solo
**Related**: [claude-code-agent-os.md](../../sveltekit-frontend/docs/architecture/claude-code-agent-os.md), [drizzle-inspection-mcp.md](../../sveltekit-frontend/docs/architecture/drizzle-inspection-mcp.md), [obsidian-neo4j-couchdb-alignment.md](../../sveltekit-frontend/docs/architecture/obsidian-neo4j-couchdb-alignment.md)

## Goal

Build a token-cheap retrieval+synthesis loop that runs **locally on
Gemma4 + TRACE MCP**, produces a structured implementation brief as
markdown, and hands it to **Claude Code** for the actual file edits.
Claude Code only sees the distilled brief, not the raw retrieval —
that's where the token savings come from.

```
┌───────────────────────────────────────────────────────────────────┐
│ User question / TODO                                             │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│ Lane 1 — Local retrieval pass (Gemma4 + MCP, no Claude tokens)   │
│                                                                   │
│   Gemma4 ──► gemma4-offload MCP ──► trace.kag_search             │
│              (stdio)                trace.wiki_note_lookup        │
│                                     graph.expand_neighborhood     │
│                                     graph.pagerank_top            │
│                                     db.schema_overview / inspect  │
│                                     ts.symbol_lookup / route_map  │
│                                                                   │
│   ↳ writes raw retrieval JSON to                                 │
│     scratch/synthesis-runs/<ts>/raw-retrieval.json               │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│ Lane 2 — Graph analysis pass (Neo4j + CouchDB MapReduce)         │
│                                                                   │
│   raw-retrieval.json ──► neo4j read-only Cypher                  │
│                          (paths, communities, authority blend)    │
│                       ──► couchdb view: graph_recommendations    │
│                          + couchdb:pagerank_scores               │
│                                                                   │
│   ↳ writes graph-analysis.json (paths, clusters, authority)      │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│ Lane 3 — Rerank + KAG / web_search fallback                      │
│                                                                   │
│   Gemma4 reranks raw + graph by relevance.                       │
│   If confidence low (< 0.6 ACE blend score):                     │
│     ─► call kag.expand or web_search MCP tool                    │
│     ─► merge new evidence, rerank again                          │
│                                                                   │
│   ↳ writes ranked-context.json (top 10-15 chunks + citations)    │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│ Lane 4 — Synthesis (Gemma4 single shot)                          │
│                                                                   │
│   Input:  ranked-context.json + AGENTS.md hierarchy              │
│   Output: memory/implementation-briefs/<ts>_<slug>.md            │
│                                                                   │
│   Brief format: Goal / Files / Constraints / Steps / Smoke /     │
│                 Do-not-touch / MCP context used                  │
└────────────────────────────┬──────────────────────────────────────┘
                             │
                             ▼
┌───────────────────────────────────────────────────────────────────┐
│ Lane 5 — Claude Code implementation                              │
│                                                                   │
│   /implement memory/implementation-briefs/<ts>_<slug>.md         │
│     ─► Claude Code reads ONE markdown file (small token spend)   │
│     ─► uses .claude/skills/* (bits-ui, uno, drizzle, trace)      │
│     ─► uses .claude/agents/* (drizzle-inspector etc.) for sub-   │
│         tasks if needed                                           │
│     ─► hooks/PreToolUse blocks destructive actions                │
│     ─► writes diff, runs smoke, archives result                   │
└───────────────────────────────────────────────────────────────────┘
```

## Web research findings (verified 2026-05-09)

These shape the plan; cited so future-me can re-verify.

| Topic | Verified fact | Source |
|-------|---------------|--------|
| **Skills** | `.claude/skills/<name>/SKILL.md` with YAML frontmatter (`description`, `disable-model-invocation`, `allowed-tools`); auto-discovered from project / personal / plugin scope; invoked by name match against description or `/skill-name`. | [code.claude.com/docs/en/skills](https://code.claude.com/docs/en/skills.md) |
| **Subagents** | `.claude/agents/<name>.md`. `tools:` field accepts space-separated names INCLUDING `mcp__server__tool` patterns. **Important**: `tools:` declares *preferences* — it does not hard-restrict access. Use hooks for hard restriction. | [code.claude.com/docs/en/subagents](https://code.claude.com/docs/en/subagents.md) |
| **Hooks** | 30+ events (`SessionStart`, `UserPromptSubmit`, `PreToolUse`, `PostToolUse`, `SubagentStop`, `FileChanged`, `PreCompact`, …). Config in `.claude/settings.json`. Matchers are regex-capable. **Only `PreToolUse` can block/modify** via `permissionDecision: allow|deny|ask` + optional `updatedInput`. `PostToolUse` exit-code-2 also blocks. | [code.claude.com/docs/en/hooks](https://code.claude.com/docs/en/hooks.md) |
| **Plugins** | Manifest at `<plugin>/.claude-plugin/plugin.json`. Bundles skills/agents/hooks/MCP. MCP servers declared in `.mcp.json`. Install via `/plugin install` or `--plugin-dir`. | [code.claude.com/docs/en/plugins](https://code.claude.com/docs/en/plugins.md) |
| **MCP TS SDK** | Stable v1.29.0 (`@modelcontextprotocol/sdk`), v2 pre-alpha. Tool registration requires Zod schemas; compatible with `zod@^3.22`. **The trace-mcp-server `tools/list` Zod crash is a version-mismatch bug** — pin zod to ^3.22 to fix. | [github.com/modelcontextprotocol/typescript-sdk](https://github.com/modelcontextprotocol/typescript-sdk) |
| **mcporter** | Real, maintained CLI. `npx mcporter list` auto-discovers Claude Code/Cursor/etc. configs and prints registered tools. `npx mcporter call <tool> <args>` executes from shell — useful for smoke-testing TRACE MCP without Claude. | [mcporter.sh](https://mcporter.sh/) |
| **Hermes Agent (Nous)** | Real, but **not** what we need. It's a Python TUI agent with codebase introspection (LOC counting via pygount). Not a design tool, not a SvelteKit-aware planner, no GUI. | [hermes-agent.nousresearch.com](https://hermes-agent.nousresearch.com/) |
| **Closer matches for "ingest codebase, emit plans" UI** | **Open WebUI** (agent orchestration + tool use), **AnythingLLM** (RAG over codebase), **LM Studio** / **Jan** (model hosting + chat). None of them replace Claude Code as the *implementation* layer; treat them as alternative front-ends for the *retrieval+synthesis* lane. | (verified by claude-code-guide agent) |
| **Figma Claude plugin** | Official, uses Code Connect, works with Claude Code CLI (not just desktop). Code-to-Canvas (Feb 2026) goes the other way too. | [claude.com/plugins/figma](https://claude.com/plugins/figma) |

## Verdict on Hermes Agent / desktop-WebUI route

**Don't pin the loop to Hermes Agent.** It's a TUI codebase-introspection
toy, not a planner. The user-facing question — "can a desktop webui
ingest the codebase and hand plans to Claude Code?" — is yes, but the
right front-end is **Open WebUI** (already common in this stack) or
**AnythingLLM** (RAG-first), pointed at the same TRACE MCP server +
gemma4-offload MCP. Either of them just becomes Lane 1's UI; Lanes 2-5
are unchanged.

For now: skip the desktop-WebUI dependency. Drive the loop from Claude
Code's CLI itself (it can call MCP tools), keeping the toolchain inside
one process. Revisit Open WebUI integration only if the multi-tab
chat/branching workflow becomes a bottleneck.

## Build order

### Phase A — scaffolding (this commit, no behavior change)

1. ✅ Already shipped: `gemma4-offload` stdio MCP (chat/summarize/classify/health), G29/G30/G31 validator gates.
2. ✅ Already shipped: `claude-code-agent-os.md`, `drizzle-inspection-mcp.md`, `obsidian-neo4j-couchdb-alignment.md`.
3. **This commit**: scaffold `.claude/skills/{trace-mcp-tooling,bits-ui-svelte5,uno-css-design-system,drizzle-schema-review}/SKILL.md` + `.claude/agents/{drizzle-inspector,sveltekit-route-auditor,topology-medic,obsidian-cartographer}.md` + `gemma4-to-claude-code-handoff.md`.

### Phase B — adopt official MCP + minimal custom (revised 2026-05-09)

**Replaces the original "build all `db.*` tools ourselves" plan** —
see [mcp-ecosystem-survey-2026.md](../../sveltekit-frontend/docs/architecture/mcp-ecosystem-survey-2026.md)
for the full adopt-vs-build matrix. Net: build 6 custom tools
instead of 12; mount 6 official servers for the rest.

4. **Mount official MCP servers** (read-only) in `.vscode/mcp.json` + `~/.claude/mcp.json`:
   - `neo4j` (`neo4j-contrib/mcp-neo4j` with `NEO4J_READ_ONLY=true`)
   - `qdrant` (`qdrant/mcp-server-qdrant`)
   - `postgres-readonly` (`@modelcontextprotocol/server-postgres` with read-only DB role)
   - `redis-readonly` (`redis/mcp-redis` with `READ_ONLY=true`)
   - `obsidian-vault` (`mcpvault` — filesystem-native, no Obsidian.app required)
   - `ts-lsp` (`@isaacphi/mcp-language-server`)
   Smoke each via `npx mcporter call <server>.<tool> ...`.
5. **Add `PreToolUse` hook** (`.claude/settings.json`) that denies any tool whose name contains a write verb (`drop`, `delete`, `truncate`, `update`, `insert`, `create`, `flushdb`, `set`) regardless of which server it came from. This is the actual sandbox; subagent `tools:` is just a hint.
6. **Implement the 6 truly-custom `db.*` tools** in `src/mcp/db-inspection-tools.ts` (Drizzle-aware shape that the official Postgres MCP doesn't know): `db.schema_overview`, `db.table_inspect`, `db.indexes`, `db.relation_map`, `db.find_jsonb_keys`, `db.drift_check`, `db.migration_status`. (`db.table_sample` — adopt official Postgres MCP read access instead, gated by DB role.)
7. **Pin `zod` to `^3.22`** in `package.json` — fixes the `trace-mcp-server.ts` `tools/list` Zod crash blocking Lane 1.
8. **Validator gates**:
   - `G32 mcp:trace-server-tools-list` — asserts our TRACE MCP `tools/list` returns ≥30 tools cleanly.
   - `G33 mcp:db-inspection-readonly` — asserts no `db.*` tool we ship exposes a write verb in its inputSchema.
   - `G37 mcp:adopted-servers-mounted` — asserts each official server in `.vscode/mcp.json` resolves on `tools/list` without error.

### Phase C — synthesis loop CLI

8. New script `scripts/synth/run-loop.mjs`:
   - takes a query/TODO string,
   - drives Lanes 1-4 via the gemma4-offload MCP (calling sub-tools through TRACE MCP),
   - emits `memory/implementation-briefs/<ts>_<slug>.md`.
9. New script `scripts/synth/handoff-to-claude.mjs`:
   - opens the brief in Claude Code via `claude code --prompt-file <path>` (or copies to clipboard if CLI hook unavailable),
   - records the handoff in `context_timeline` as `event_type='synthesis_handoff'`.

### Phase D — hardening

10. PreToolUse hook in `.claude/settings.json` blocking the destructive Bash list from [claude-code-agent-os.md](../../sveltekit-frontend/docs/architecture/claude-code-agent-os.md).
11. PostToolUse hook appending JSONL audit to `memory/runs/claude-code/<YYYY-MM-DD>.jsonl`.
12. UserPromptSubmit hook injecting the port map + active next_steps headers.
13. `trace.alignment_check` MCP tool that bundles G29+G30+G31+`tools/list` probe into one JSON answer for any agent.

### Phase E — packaging (defer)

14. Wrap the whole `.claude/{skills,agents,hooks}` + `gemma4-offload-mcp.mjs` into a `trace-claude-plugin/` with `.claude-plugin/plugin.json`. Only after Phase D is stable.

## Cost model

| Step | Tokens spent on Claude API | Tokens spent on local Gemma4 |
|------|---------------------------|------------------------------|
| Lane 1 retrieval | 0 | ~2-4 K (multi-tool calls) |
| Lane 2 graph analysis | 0 | ~1 K (rerank prompt) |
| Lane 3 rerank + KAG | 0 | ~2 K |
| Lane 4 synthesis | 0 | ~3-5 K (writes brief) |
| Lane 5 Claude Code reads brief + implements | **~3-8 K** (one .md + targeted edits) | 0 |

Without the loop, Lane 5 alone would spend 30-80 K because Claude Code
would re-discover everything Lanes 1-3 already found. **Net savings:
≈75-90 % per implementation cycle.**

## Risks + mitigations

| Risk | Mitigation |
|------|-----------|
| Brief is too compressed → Claude Code asks follow-up questions, eating savings | Lane 4 prompt mandates "files: with line ranges" + "constraints: explicit list"; G34 (planned) lints briefs for required sections |
| Gemma4 hallucinates a file path that doesn't exist | Every retrieved chunk in Lane 3 carries a `pg_id` / `file_path`; Lane 4 prompt says "cite only paths that appeared in `files[]` of the input"; pre-flight script verifies paths exist before writing brief |
| Subagent `tools:` field doesn't actually restrict (per docs) — agent could call write tools anyway | Use hooks (PreToolUse) for hard restriction. The `tools:` declaration is a hint to the agent's planner, not a sandbox. |
| TRACE MCP `tools/list` Zod crash blocks the loop | Phase B step 5 — pin `zod@^3.22`; G32 catches regressions |
| `synth/run-loop.mjs` hangs because TurboQuant is down | gemma4-offload MCP already cascades to Ollama; loop should also write a partial brief on backend failure rather than hang |

## Open questions (decide before Phase C)

1. **Brief storage**: `memory/implementation-briefs/` (vault) vs `next_steps/auto/` (next-steps lane)? Leaning vault — briefs are derivative, not authoritative TODOs.
2. **Handoff trigger**: explicit (`/synth-handoff <slug>`) vs auto-open (Claude Code launches when brief is written)? Leaning explicit so the human reviews the brief first.
3. **Confidence threshold for KAG fallback**: 0.6 is a guess. Wire it to ACE telemetry once Phase C runs a few cycles, then tune.
4. **Open WebUI front-end**: defer or build now? Defer — ship the CLI loop first, evaluate UX, then decide.

## Token-cost FAQ (added 2026-05-09 turn 4)

> "Do these MCP servers take Claude tokens?"

**Adopting an MCP server is free.** The server is a local stdio child
process spawned by Claude Code. It consumes local CPU/RAM, not Claude
API tokens.

**Calling a tool exposed by that server is not free.** Each tool call's
input arguments and output payload flow into Claude's context window,
which costs tokens proportional to the payload size. A `tools/list`
that returns 30 tool descriptions is ~1-2 K tokens. A
`db.table_inspect` returning a 5 KB JSON shape is ~1.5 K tokens.

**Three ways to keep that cost bounded:**

1. **Route discovery through Gemma4-offload first.** Lane 3 of the
   synthesis loop reranks locally before any Claude tokens are spent.
2. **Use Claude Code's `tools:` field in subagents** to scope which
   tools each agent even *sees* — fewer descriptions in context.
3. **Trim outputs at the tool layer.** TRACE MCP tools should default
   to compact JSON (no whitespace, no redundant field labels) and cap
   array results — that's why we wrote `db.find_jsonb_keys` to return
   keys + types + frequencies, not values.

> "If I run Hermes / Open WebUI / AnythingLLM as the front-end and
> point it at TRACE MCP, do *those* calls cost Claude tokens?"

**No.** Those front-ends call Gemma4 (or whatever local model they're
configured for) via Ollama / TurboQuant. The local model produces the
tool calls. The Claude API never enters that loop. Tokens are only
spent when the resulting markdown brief is handed off to Claude Code
for implementation.

## Empirical adopted-MCP smoke (2026-05-09 first run)

`scripts/smoke/smoke-adopted-mcp.mjs` probes each `enabled: false`
server in `.vscode/mcp.json`. First run on this machine:

| Server | Result | Notes |
|--------|--------|-------|
| `postgres-readonly` | ✅ 1 tool, 6.2 s | `@modelcontextprotocol/server-postgres` installed and listed cleanly |
| `neo4j-readonly` | ❌ timeout | `uvx mcp-neo4j-cypher@latest` — package name needs verification |
| `qdrant-readonly` | ❌ timeout | `uvx mcp-server-qdrant` — same; uv not in PATH or wrong package name |
| `redis-readonly` | ❌ exit 1 | `uvx mcp-redis` — "requirements unsatisfiable"; correct invocation TBD |
| `obsidian-vault` | ❌ npm install failed | `mcpvault` — possibly wrong npm name |
| `ts-lsp` | ❌ npm install failed | `@isaacphi/mcp-language-server` — possibly wrong scope |

**Don't enable any of the failed five blindly.** Phase B step 4 needs
a follow-up pass to find each server's actual current invocation
(check the GitHub README of each one before flipping `enabled: true`).
The probe is the regression test — re-run after each correction:

```bash
node sveltekit-frontend/scripts/smoke/smoke-adopted-mcp.mjs
```

## Phase F (proposed) — centroid-gap external-doc analysis

Brought in this turn from the operator question:
"can we take GPU Karpathy codebase indexing and attempt to take cluster
centroids into features and look for gaps from analysis using all
language documentations to GitHub repos / Reddit posts?"

**Sketch (defer until Phase B-D stable):**

```
1. Read GPU k-means centroids from Qdrant `codebase_chunks_768`
   (k=20, already built by `graphify:full`)

2. For each centroid:
   a. Pull top-20 nearest chunks (members of cluster i)
   b. Local Gemma4 names the cluster's "feature concept"
      ("auth middleware", "vector indexing", "scene compiler", …)
   c. Output: {cluster_id, feature_label, member_files[], confidence}

3. For each feature_label:
   a. Fetch external evidence (in priority order):
      - TS LSP / npm registry (via official MCP) — what does the canonical
        package for this concept look like?
      - GitHub code search (via official GitHub MCP) — top-N repos with
        same concept; extract their public API surface
      - Reddit / HN via existing web-research-crawler (rate-limited) —
        what gotchas / patterns are people discussing?
      - llms.txt of the canonical docs site if it exists
   b. Local Gemma4 distills external evidence into a "what's expected"
      schema (~10 concept-keys per feature)

4. Compare expected vs actual:
   a. For each expected concept-key, grep our cluster's member files
   b. Output gap report:
      {feature: 'auth middleware',
       missing: ['rate_limit', 'csrf_token_rotation'],
       unexpected: ['custom_session_format'],
       confidence: 0.82}

5. Rank gaps by:
   - severity (security > perf > ergonomic)
   - cluster authority (PageRank * member count)
   - external consensus (how many sources agreed it's expected)

6. Synthesis pass writes:
   memory/implementation-briefs/<ts>_centroid-gap-<cluster_id>.md
   with: gap, citations, suggested fix sketch, do-not-touch list

7. Hand off to Claude Code via the existing synthesis-loop Lane 5.
```

**Cost model:** Lane 1-6 all run on local Gemma4 + adopted MCP servers
(~zero Claude tokens). Lane 7 is the only Claude-paid step, and it's
~3-8 K per gap fix. With 20 clusters and an average of 1-2 gaps each,
that's ~40 briefs = ~200-300 K tokens to fully audit the codebase
against external best practice. Cheap.

**Hard rules:**
- Reddit / HN scraping must respect rate limits + robots.txt
  (existing `web-research-crawler.ts` already does this).
- External evidence is *never* canonical; it's input to Gemma4's
  reranker, not a source of truth.
- Gap reports never auto-edit code. They produce briefs; human +
  Claude Code decide what to do.

**Effort:** ~2 days end-to-end. Build order:
1. New script `scripts/centroid-gap-analysis.mjs` — Lanes 1-2
2. Reuse `web-research-crawler.ts` + `kag.fetch_doc` MCP tool — Lane 3
3. Local Gemma4 reranker prompt — Lane 4-5
4. Synthesis brief writer — Lane 6 (already exists per Phase C)
5. Plug into existing handoff — Lane 7 (already exists)

This is genuinely additive — no existing pipeline changes.

## Smoke commands (will exist after Phase C)

```bash
# end-to-end loop test, dry-run (no Claude Code handoff)
node scripts/synth/run-loop.mjs --query "wire browser context lane" --dry-run

# inspect last brief
ls -t memory/implementation-briefs/ | head -1 | xargs -I{} cat memory/implementation-briefs/{}

# round-trip via mcporter (no Claude in the loop at all)
npx mcporter call gemma4-offload.gemma4_summarize text:"..." target_words:80
npx mcporter call trace.kag_search query:"reranker topology"
```
