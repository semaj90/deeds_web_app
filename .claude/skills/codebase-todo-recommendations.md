# Claude Code Skill: Codebase TODO Recommendations

You are working in:

`C:\Users\james\Videos\deeds-web-app\sveltekit-frontend`

## Mission

Surface the highest-leverage engineering targets in this codebase by fusing
every signal the indexing stack already produces, then have the current
llama-server-backed Gemma4 chat surface rerank the top entries into an
actionable TODO list.

This skill is the read-side companion to the indexing pipeline. It does NOT
mutate code, run heavy GPU passes, or trigger destructive operations — it
ONLY reads from Redis / Postgres / Qdrant / Neo4j / docs and produces a
single ranked recommendation document.

## When to invoke

- User asks "what should I work on" / "what needs attention"
- Before starting a refactor session — surface highest-leverage targets
- After a `graphify:gds` or `karpathy:gpu` run — see the new ranking
- When the agent timeline synthesis suggests a topic — drill into specific files
- As the read-side of the agentic error-fixing loop (TODOs feed into
  next_actions.md → operator-gated patch attempts)

## Architecture (signals fused)

| Signal | Source | Refresh command | Weight |
|---|---|---|---|
| `graphAuthorityScore` | Redis `ace:authority:top` (200 entries, 6h TTL) | `npm run graphify:gds` | 0.40 |
| Karpathy GPU blend (PR + attention + authority) | Redis `gpu:karpathy:scores` (24h TTL) | `npm run karpathy:gpu` | 0.35 |
| Cross-attention vs centroid | Redis `gpu:karpathy:scores` | `npm run karpathy:gpu` | 0.15 |
| Recently changed files | Redis `ace:rank:dirty_files` (set) | `npm run startup:ace` | 0.10 boost |
| AGENTS.md rule density | Postgres `agent_context_files.rules` JSONB | `npm run agents:pipeline:safe` | filter |
| Engram bigram (query-conditioned) | Redis `ace:engram:bigram:<hash>` (1h TTL) | implicit on retrieval | bias |
| Cluster summary lenses | MCP `clusters.get_summary_lenses` | live `:8788` | context |
| Gemma4 rerank | OpenAI-compatible chat via `llama-server.exe` (`gemma4-legal-iq4xs-direct.gguf`) | live `http://127.0.0.1:8090/v1` | final |

The fused score is computed by `scripts/skills/codebase-todo-aggregator.mjs`:

```
blend = 0.40*authority + 0.35*(karpBlend/4) + 0.15*attention + 0.10*isDirty
```

Then top-15 candidates are sent to the current llama-server-backed Gemma4
chat surface with directory-level AGENTS.md rule density and a 30-line excerpt
of the latest agent timeline synthesis. Gemma4 returns 5-7 prioritized bullets
— that's the human-facing TODO list.

## Invocation

### From the npm CLI

```bash
# Default: top-25, write to next_steps/active/codebase-todo-recommendations.md
npm run skill:codebase-todo

# Dry-run (no Redis/file writes, no Gemma4 call)
npm run skill:codebase-todo:dry

# Stream markdown to stdout (Claude Code skill consumption)
npm run skill:codebase-todo:stdout

# Query-biased (engram bigram lookup biases the ranking)
node scripts/skills/codebase-todo-aggregator.mjs --query "fix authentication bug"
```

### From a Claude Code conversation

When the user invokes this skill, run the script with `--stdout` and ingest
the resulting markdown as your context for the rest of the conversation:

```bash
cd sveltekit-frontend && node scripts/skills/codebase-todo-aggregator.mjs --stdout
```

The output starts with `# Codebase TODO Recommendations` and includes:

1. **Gemma4 Synthesis** — 5-7 prioritized TODO bullets
2. **Ranked Targets** — top-N table with blend / PR / authority / attention / dirty
3. **Strictest AGENTS.md directories** — where the most rules live (where care matters most)
4. **Provenance** — exact Redis key counts, doc lengths, refresh commands

## Pre-flight

Before invoking, verify:

```bash
# All four data signals present (any missing will degrade the ranking)
npm run atlas:bitfrost-semantic-cache:audit                      # expect healthy
npm run atlas:redis-centroid:mirror:dry                         # expect client reachability
npm run atlas:bitfrost-semantic-cache:warm                      # expect cache family coverage
ls docs/agent_timeline_synthesis.md                              # expect present
```

If any are 0 / missing, suggest the relevant refresh command from the table above.

## Workflow integration

```
User asks "what should I work on?"
  ↓
Skill invokes: node scripts/skills/codebase-todo-aggregator.mjs --stdout
  ↓
Aggregator pulls Redis + Postgres + docs in parallel  (≤200ms typical)
  ↓
Score fusion + sort → top-25
  ↓
Gemma4 chat rerank pass over top-15 with AGENTS.md rule context  (≤8s)
  ↓
Markdown returned to Claude Code conversation
  ↓
Claude Code uses it as the planning frame for the session
```

## Output contract

Document is always written to:
- `next_steps/active/codebase-todo-recommendations.md` (canonical)
- Redis `ace:todo:latest` (24h TTL JSON for downstream tools)

The first paragraph is **always** a Gemma4-synthesized prioritized list.
The rest is provenance + raw rankings.

## Refresh command reference

| When | Run |
|---|---|
| Authority cache expired (TTL -2 on `ace:authority:top`) | `npm run graphify:gds` |
| Karpathy scores stale (>24h) | `npm run karpathy:gpu` (or `:dirty` for incremental) |
| Timeline synthesis stale | `npm run agents:synthesis` |
| AGENTS.md mirror out of sync | `npm run agents:pipeline:safe` |
| Dirty file set empty after a session | `npm run startup:ace` |

## Constraints

- **Read-only**: never patches code, never triggers destructive ops
- **Deterministic blend**: same Redis state → same ranking (Gemma4 chat reranking is
  the only stochastic component; pin temperature=0.3)
- **Degraded mode**: missing signals lower confidence but never block — empty
  `ace:authority:top` just zeros that 0.40 weight; the remaining signals still
  produce a usable list
- **No new Postgres writes**: this skill consumes; the aggregator never
  inserts/updates/deletes
- **MCP optional**: skill works without `:8788` available; live MCP queries
  are enrichment only

## Directory-First Lookups (added 2026-05-08)

Before generating recommendations, prefer directory-scoped reads over the global top-N:

```
memory/atlas/codebase-atlas.dirs.json    918 directory cards, ranked 0..1
memory/atlas/codebase-atlas.top.json     top-50 ranked subset
memory/atlas/codebase-atlas.latest.md    human-readable summary

Redis  ace:atlas:dirs                    same as dirs.json (24h TTL)
Redis  ace:atlas:dir:{slug}              one card per directory (24h TTL)
       slug = dir.replace(/[\/()]/g, '_')
```

Each directory card carries: `d`, `a` (AGENTS), `p` (parent AGENTS), `n` (file count),
`clusters[]`, `topo[]`, `tools[]`, `tags[]`, `pr`, `auth`, `avgAuth`, `kgpu` (Karpathy blend),
`hits`, `dirty`, `rank`, `top[]` (top 5 files inside).

When a target file is mentioned:
1. **Normalize** the path (strip `src/` and `sveltekit-frontend/` prefixes).
2. **Find its directory card** — `redis GET ace:atlas:dir:{slug}` is O(1).
3. **Walk up** to parent AGENTS via card `p` field if more rules needed.
4. **Read related clusters** from card `clusters[]` for cross-cutting context.
5. **Then** call live MCP/Postgres/Qdrant only for detail the card doesn't cover.

Prefer directory-scoped recommendations over a flat global list — they keep the
agent grounded in the local conventions instead of drifting to the global top-25.

Refresh:
```bash
npm run atlas:index           # rebuild file + dir cards (~7s)
npm run atlas:index:dry       # preview without writing
```
