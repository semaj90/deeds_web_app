---
name: Gemma4 → Claude Code handoff
description: How a local Gemma4+MCP retrieval-and-synthesis pass produces a structured implementation brief that Claude Code consumes — saving ~75-90% of API tokens by keeping retrieval/discovery local.
type: project
tags:
  - claude-code
  - gemma4
  - mcp
  - synthesis
  - handoff
  - tokens
---

# Gemma4 → Claude Code handoff

The token-cheap loop. Local Gemma4 + TRACE MCP do retrieval, graph
analysis, rerank, and synthesis. Claude Code only sees the distilled
markdown brief and the file edits it has to make.

Plan + cost model: [next_steps/active/2026-05-09_gemma4-mcp-synthesis-loop.md](../../../next_steps/active/2026-05-09_gemma4-mcp-synthesis-loop.md).

## The five lanes

| Lane | Where it runs | Output | Claude tokens spent |
|------|---------------|--------|---------------------|
| 1. Retrieval | Gemma4 → `gemma4-offload` MCP → TRACE MCP tools | `scratch/synthesis-runs/<ts>/raw-retrieval.json` | 0 |
| 2. Graph analysis | Neo4j read-only Cypher + CouchDB views | `…/graph-analysis.json` | 0 |
| 3. Rerank + fallback | Gemma4 reranks; if confidence < 0.6 calls `kag.expand` or `web_search` and merges | `…/ranked-context.json` | 0 |
| 4. Synthesis | Gemma4 single-shot writes the brief | `memory/implementation-briefs/<ts>_<slug>.md` | 0 |
| 5. Implementation | Claude Code reads ONE markdown, edits files using `.claude/skills/*` | git diff + smoke output | small (~3-8 K) |

## Brief format

Every implementation brief follows this shape so Claude Code can parse
it deterministically (the synthesis prompt enforces all sections):

```markdown
# Implementation Brief — <task slug>

## Goal
One paragraph, no preamble.

## Files (all paths verified to exist)
- `src/lib/server/foo.ts:42-91` — what changes here
- `src/routes/api/bar/+server.ts:1-end` — what changes here

## Constraints
- bullet list: framework rules, do-not-touch zones, security gates
- carries forward CLAUDE.md / AGENTS.md rules that apply to these files
- explicit hashes that must remain stable (e.g. demo-scene.py G01 hash)

## MCP context used
- `trace.kag_search(query="…")` → 5 hits
- `graph.expand_neighborhood(file="src/lib/server/foo.ts", depth=1)` → 12 neighbors
- `db.table_inspect(table="evidence_items")` → 18 columns
- (any web_search citations with URLs)

## Implementation steps
1. Concrete, ordered, ≤ 7 steps
2. Each step names the file + the symbol it edits
3. No "first explore the codebase" steps — that's already done

## Smoke tests
- `npm run smoke:graphify`
- `node scripts/validate/full-system.mjs --gate=G16`
- (whichever gates apply)

## Do not touch
- explicit list of byte-frozen files (G01/G02 hashes)
- explicit list of write surfaces hooks should still block
```

## Why this saves tokens

Without the loop, Claude Code does the retrieval *itself* — running
Glob, Grep, Read, possibly multi-step Agent calls — to figure out
which 5 files matter. That's where 30-80 K tokens go on a typical
implementation cycle, most of it discarded after Claude finds the
relevant 3 files.

With the loop, that 30-80 K of discovery happens on local Gemma4
(free), and Claude Code is handed `~3 KB` of pre-resolved file paths,
constraints, and steps. Net savings ≈ 75-90 %.

## When NOT to use the loop

- **Trivial single-file edits** (rename a variable, fix a typo). The
  brief overhead exceeds the discovery cost.
- **Open-ended exploration** ("what could we do about X?"). The loop
  assumes the question already has a target file set; for design
  questions, talk to Claude Code directly.
- **Anything touching byte-frozen files** (`scene-compiler.ts`,
  `aesthetic-presets.json`, `demo-scene.py`). Those edits demand a
  full plan + human approval, not a synthesized brief.

## Roles, restated

| Tool | Role | Never does |
|------|------|-----------|
| **Gemma4** (TurboQuant :8090, Ollama fallback) | local retrieval, rerank, synthesis, drafts the brief | edit code files, run shell, call Claude API |
| **TRACE MCP** (port 8788) | the syscall boundary — every infrastructure read flows through a registered tool | expose write verbs by default |
| **`gemma4-offload` MCP** (stdio) | gives *Claude Code* a way to offload short-form generation back to Gemma4 (drafting commit messages, paraphrasing, classifying) | replace TRACE MCP for retrieval — different concern |
| **Claude Code** | implementation operator: reads brief, edits files, runs smoke, follows skills+hooks | do the retrieval/discovery itself when a brief exists |
| **`.claude/skills/*`** | reusable workflow rules loaded automatically when relevant (Bits UI, UnoCSS, Drizzle review, TRACE MCP tooling) | be a substitute for the brief — they're the *how*, the brief is the *what* |
| **`.claude/agents/*`** | task-scoped sub-agents with declared tool preferences (drizzle-inspector, sveltekit-route-auditor, topology-medic, obsidian-cartographer) | hard-restrict tools — `tools:` is a hint per Anthropic docs; use hooks for sandboxing |
| **Hooks** | hard policy gates (PreToolUse deny-list, JSONL audit) | observe-only — `PreToolUse` can also block/modify |

## Failure modes

| Failure | Symptom | Recovery |
|---------|---------|----------|
| Gemma4 fabricates a file path | brief cites `src/lib/foo.ts` that doesn't exist | Lane 4 verifies all `Files:` paths via `fs.stat` before writing the brief; missing paths cause re-rerank with stricter prompt |
| Brief is too compressed | Claude Code immediately asks "what's the schema of X?" | re-run synthesis with `--detail=high`; G34 (planned) lints brief sections |
| `gemma4-offload` MCP backend down | tool call returns `error: turboquant + ollama both down` | the script writes a partial brief noting the failure and recommends Claude Code do its own discovery this time |
| Subagent calls a write tool despite `tools:` declaration | edit lands without going through the planned MCP path | PreToolUse hook in `.claude/settings.json` is the actual sandbox — `tools:` is a hint, not a wall |
| TRACE MCP `tools/list` Zod crash | Lane 1 dies on first MCP call | pin `zod@^3.22` per [next_steps plan](../../../next_steps/active/2026-05-09_gemma4-mcp-synthesis-loop.md) Phase B; G32 (planned) catches regressions |

## Status / what's shipped

- ✅ `gemma4-offload` stdio MCP (4 tools: chat, summarize, classify, health) — commit `2970e39977`.
- ✅ Validator gates G29 (destructive-SQL pending) + G30 (MCP handshake) + G31 (MCP roundtrip) — commit `2970e39977`.
- ✅ Architecture docs for the agent-OS, Drizzle inspection MCP, store alignment — commit `6df1cd1dff`.
- ⏳ Phase A scaffolding: `.claude/skills/*` + `.claude/agents/*` + this doc (this commit).
- ⏳ Phase B-D: see [the plan](../../../next_steps/active/2026-05-09_gemma4-mcp-synthesis-loop.md).
