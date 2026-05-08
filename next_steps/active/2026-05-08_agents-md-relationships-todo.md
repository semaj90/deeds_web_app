# AGENTS.md Relationships — TODO Plan

> Reviewed root [`AGENTS.md`](../../AGENTS.md) (77 lines) +
> [`sveltekit-frontend/AGENTS.md`](../../sveltekit-frontend/AGENTS.md) (583 lines)
> + Postgres `agent_context_files` / `directory_context_bindings` schema.
> Goal: surface the relationships the agent already needs but the system
> can't currently retrieve.

## Current state (verified 2026-05-08)

```
agent_context_files          373 rows    (1 per AGENTS.md envelope)
directory_context_bindings  2071 rows    (walk-up resolution)
ace_context_sources            0 rows    (audit trail; populates on first ACE retrieval)
agent_context_relations         —        (does not exist yet)
```

**Binding type distribution:**
| Type | Count | Notes |
|---|---|---|
| `inherited` | 1,698 | child dir inherits parent's AGENTS.md |
| `exact` | 373 | one per AGENTS.md (self-binding) |
| `nearest-parent` | 0 | unused — covered by `inherited` walk |
| `override` | 0 | unused — no AGENTS.md is currently overriding a parent rule |

**Envelope fill rates** — this is the actual problem:

| Field | Filled | Total | Rate |
|---|---|---|---|
| `rules` | 2 | 373 | 0.5% |
| `tools` | 0 | 373 | 0% |
| `constraints` | 0 | 373 | 0% |
| `semantic_tags` | 0 | 373 | 0% |
| `qdrant_tags` | 0 | 373 | 0% |

**The 4 JSONB/array fields the parser is supposed to extract are nearly
empty.** That's why the agent can't answer "what tools are forbidden in
`src/lib/server/ace/`?" — there's no data to retrieve, even though the
text is in the markdown.

## P0 — Populate the envelope before adding relations

### 1. Fix the AGENTS.md parser
`src/lib/server/agents-md/parse-agents-md.ts` extracts: title, summary,
rules (bullets under "Rules"/"Conventions"/"Standards"), tools (bullets +
markdown table, allowed/forbidden), constraints (bullets under
"Forbidden"/"Constraints"), tags (bullets under "Semantic Tags"/"Qdrant
Tags").

The 373 generated AGENTS.md files don't use these section headers — they
use the auto-generated format from `generate-agents-md.mjs` which has
"Audit Gates", "TODO — Enhancements", "Fix Timeline", etc.

**Two fixes:**

- **a)** Extend the parser to recognize the generated sections. Map
  "Audit Gates" → `rules` (each gate becomes a rule with severity from
  the gate's tier), "TODO — Enhancements" → `constraints`, the qdrant
  tag list at the top of CLAUDE.md → `qdrant_tags`.
- **b)** Update `generate-agents-md.mjs` to also emit the canonical
  "## Rules" / "## Tools" / "## Constraints" / "## Semantic Tags"
  sections so the parser's existing logic catches them on the next
  `agents:pipeline:safe` run.

Recommendation: **(b)** — cheaper, idempotent, and means future hand-edits
in the standard format also parse.

### 2. Backfill from existing data sources
Many envelopes can be derived from data we already have:

- `qdrant_tags` ← `code_retrieval_chunks.tags` aggregated per directory
  (the dominant tags of the files inside this AGENTS.md scope)
- `semantic_tags` ← `topo_class` of files in scope (each AGENTS.md gets
  the set of topo_classes its files cover)
- `tools` ← derived from `code_retrieval_chunks.tool_terms` per directory
- `constraints` ← from `audit_violations` (G17, G8a, G8b) flagged for files
  in scope

Build `scripts/backfill-agents-md-envelope.mjs` that runs after
`agents:index` and fills these from the existing graph.

## P1 — New `agent_context_relations` table

The `agents_md_relations.sql` migration name implies a relations table
but only ships `directory_context_bindings`. Add the missing one:

```sql
-- drizzle/manual/agents_md_relations_v2.sql
CREATE TABLE IF NOT EXISTS agent_context_relations (
  id            bigserial PRIMARY KEY,
  source_key    text        NOT NULL,    -- agent_context_files.stable_key
  target_key    text        NOT NULL,    -- another stable_key OR external (file:..., topo:..., cluster:...)
  relation      text        NOT NULL,    -- see relation catalog below
  weight        real        NOT NULL DEFAULT 1.0,
  evidence      jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source_key, target_key, relation)
);
CREATE INDEX agent_context_relations_source_idx
  ON agent_context_relations (source_key, relation);
CREATE INDEX agent_context_relations_target_idx
  ON agent_context_relations (target_key, relation);
```

## Relation catalog — the 8 edge types to add

Each row below is one new relation type. Source = how the populator
script derives it. Target table = where rows land.

| # | Relation | Source → Target | Purpose | Source query |
|---|---|---|---|---|
| 1 | `PARENT_OF` | AGENTS.md → AGENTS.md | Explicit dir tree (currently implicit in `directory_path`) | `agent_context_files` self-join on `directory_path` LIKE parent + '/%' |
| 2 | `OVERRIDES` | child AGENTS.md → parent AGENTS.md | Child's rule contradicts parent's | rule text similarity + negation detection (e.g. parent says "always X", child says "never X") |
| 3 | `COVERS_TOPO_CLASS` | AGENTS.md → `topo:<class>` (taxonomy node) | Bridge to topology taxonomy | `agent_context_files JOIN code_retrieval_chunks ON file_path LIKE directory_path \|\| '/%'` GROUP BY topo_class |
| 4 | `COVERS_CLUSTER` | AGENTS.md → `cluster:<key>` (taxonomy L3) | Bridge to gpu/dir clusters | similar — through `qdrant_cluster_members` |
| 5 | `SHARES_TAGS` | AGENTS.md → AGENTS.md | Content similarity via tag overlap | `WHERE jaccard(a.qdrant_tags, b.qdrant_tags) > 0.3` (after P0 fixes the 0% fill rate) |
| 6 | `REFERENCES_TOOL` | AGENTS.md → tool name | Which MCP tools an AGENTS.md mentions | regex over `tools` JSONB array entries |
| 7 | `REFERENCES_FILE` | AGENTS.md → `file:<path>` | Files cited in rules/constraints | extract `src/...\.ts` patterns from rule text |
| 8 | `MIRRORS_KAG_NOTE` | AGENTS.md → `wiki:note:dir:<slug>` | Redis KAG note that documents the same dir | direct lookup — already 1:1 in `index-agents-md.mjs` writes |

### Edge counts (estimates after P0)

| Relation | Estimated rows |
|---|---|
| `PARENT_OF` | ~370 (one per non-root) |
| `OVERRIDES` | < 20 (rare; needs rule conflict detection) |
| `COVERS_TOPO_CLASS` | ~3,000 (373 × avg 8 classes touched) |
| `COVERS_CLUSTER` | ~5,000 (373 × avg ~13 clusters) |
| `SHARES_TAGS` | depends on Jaccard threshold; ~1,500 at 0.3 |
| `REFERENCES_TOOL` | ~150 (sparse — only certain dirs talk about tools) |
| `REFERENCES_FILE` | ~800 |
| `MIRRORS_KAG_NOTE` | 373 |
| **Total** | **~10,500 new edges** |

That's a meaningful expansion of what the agent can answer with one
Postgres query instead of multiple round-trips.

## P2 — MCP tool surface

Once relations are populated, add three MCP tools (mirrors the existing
`taxonomy.children` / `taxonomy.path` shape):

- **`agents_md.context_for_file(file_path)`** — walk-up resolution + all
  related rules/tools/constraints + topo_class + cluster_key in one call.
  Replaces the multi-query pattern in `context-assembler.ts`.
- **`agents_md.peers_for_dir(directory_path, relation)`** — list AGENTS.md
  files that share `relation` (default: `SHARES_TAGS`). Useful for
  "show me other directories with similar conventions".
- **`agents_md.coverage(topo_class)`** — list AGENTS.md files that cover
  a given topo_class. Useful for "which docs govern api-route work?".

## P3 — Neo4j mirror (optional)

The taxonomy already lives in Postgres only; same call applies here. If
the agent starts asking "how many hops between AGENTS.md A and B through
the relation graph?", mirror to Neo4j. Until then, Postgres recursive
CTEs handle it.

## Implementation order

```
P0.1 ─ generate-agents-md.mjs emits canonical sections      (1 commit)
P0.2 ─ agents:pipeline:safe re-runs → fill rates climb       (verify)
P0.3 ─ scripts/backfill-agents-md-envelope.mjs              (1 commit)
P0.4 ─ verify fill rates > 80% across all 4 envelope fields  (gate)
P1.1 ─ migration: agent_context_relations table             (1 commit)
P1.2 ─ scripts/build-agents-md-relations.mjs                (1 commit)
P1.3 ─ verify ~10,500 edges across 8 relation types         (gate)
P2.1 ─ MCP tools: context_for_file, peers_for_dir, coverage (1 commit)
P3   ─ DEFERRED — Neo4j mirror only when graph traversal pays off
```

Each P0/P1 step is < 1 hour. Whole plan is ~5 hours of focused work.

## Verification commands

```bash
# Check current fill rates (run before AND after P0)
PGPASSWORD=123456 psql -h 127.0.0.1 -p 5434 -U legal_admin -d legal_ai_db -c "
  SELECT
    count(*) FILTER (WHERE jsonb_array_length(rules) > 0)        AS with_rules,
    count(*) FILTER (WHERE jsonb_array_length(tools) > 0)        AS with_tools,
    count(*) FILTER (WHERE jsonb_array_length(constraints) > 0)  AS with_cons,
    count(*) FILTER (WHERE array_length(qdrant_tags, 1)  > 0)    AS with_tags,
    count(*) AS total
  FROM agent_context_files;
"

# After P1 lands — count relations by type
PGPASSWORD=123456 psql -h 127.0.0.1 -p 5434 -U legal_admin -d legal_ai_db -c "
  SELECT relation, count(*) FROM agent_context_relations GROUP BY relation ORDER BY 2 DESC;
"

# Sample MCP tool call (P2)
curl -sS -X POST http://127.0.0.1:8788/mcp -H "Content-Type: application/json" \
  -H "Accept: application/json, text/event-stream" \
  -d '{"jsonrpc":"2.0","id":1,"method":"tools/call",
       "params":{"name":"agents_md.context_for_file",
                 "arguments":{"file_path":"src/lib/server/ace/context-assembler.ts"}}}'
```

## Cross-references

- Schema: [`drizzle/manual/agents_md_relations.sql`](../../sveltekit-frontend/drizzle/manual/agents_md_relations.sql)
- Parser: `src/lib/server/agents-md/parse-agents-md.ts`
- Generator: `scripts/generate-agents-md.mjs` (with the 5 safeguards)
- Indexer: `scripts/index-agents-md.mjs` (Redis + Postgres mirror)
- Companion taxonomy: [`scripts/build-topology-taxonomy.mjs`](../../sveltekit-frontend/scripts/build-topology-taxonomy.mjs)
  (5,527 nodes, 62,802 edges — same shape as proposed `agent_context_relations`)

## Why now

The taxonomy lane shipped this session (5,527 nodes / 62,802 edges over
topo_class/topo_byte/cluster/file). The AGENTS.md lane has 2,444 rows
(373 files + 2,071 bindings) but **no edges between AGENTS.md files** and
**no edges to the taxonomy**. The agent can already answer "what cluster
contains this file?" and "what AGENTS.md governs this directory?" — but
not "which AGENTS.md files cover the same topo_class?" or "which sibling
AGENTS.md has overlapping conventions?".

P1 adds those capabilities for ~10,500 edges' worth of write-once,
read-many storage. P0 fixes the upstream envelope drought first so the
relations have real content to connect.
