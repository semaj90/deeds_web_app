---
name: 2026 Claude Code MCP ecosystem survey
description: What's actually shipped in the Claude Code / MCP ecosystem in 2026 that maps onto this stack (Postgres+Drizzle, Qdrant, Neo4j, CouchDB, Redis, Obsidian, SvelteKit, TypeScript LSP) — and the explicit "adopt vs keep custom" call for each layer.
type: project
tags:
  - mcp
  - claude-code
  - ecosystem
  - 2026
  - survey
---

# 2026 Claude Code MCP ecosystem — what to adopt, what to keep custom

Verified by web research 2026-05-09 (`claude-code-guide` agent, 12
fetches). Each row is "is there a 2026-shipped MCP server / plugin /
skill that covers this layer?" → "what should we do?".

## Coverage matrix

| Layer | 2026 shipped? | Source | Verdict |
|-------|---------------|--------|---------|
| **Postgres** (read-only schema/query) | ✅ official | [modelcontextprotocol/servers](https://github.com/modelcontextprotocol/servers) | **Adopt** alongside our planned `db.*` tools — official covers generic SELECT/EXPLAIN, ours covers Drizzle-aware drift / JSONB envelope keys / migration-status (no overlap, useful complement) |
| **Drizzle Studio MCP** | ❌ requested ([drizzle-orm#4656](https://github.com/drizzle-team/drizzle-orm/issues/4656)) | — | **Build** (per `drizzle-inspection-mcp.md`); we are the canonical source for Drizzle-shape inspection until upstream lands |
| **Qdrant** | ✅ official v0.6.0 | [qdrant/mcp-server-qdrant](https://github.com/qdrant/mcp-server-qdrant) | **Adopt** for generic `qdrant-store` / `qdrant-find`. Keep TRACE-specific tools (`topology.search_4d`, `context.build_kv_packet`) custom because they wrap our 4D manifold + ACE blend — generic Qdrant MCP doesn't know about that |
| **Neo4j** | ✅ official, supports `NEO4J_READ_ONLY=true` | [neo4j-contrib/mcp-neo4j](https://github.com/neo4j-contrib/mcp-neo4j) | **Adopt read-only**. Mount with `NEO4J_READ_ONLY=true` so write-Cypher is hidden from the model. Replaces several custom Cypher tools we'd otherwise have to maintain |
| **CouchDB** | ✅ community | [robertoamoreno/couchdb-mcp-server](https://github.com/robertoamoreno/couchdb-mcp-server) | **Adopt for read-only views**. Audit before exposing — community-maintained; pin a commit |
| **Redis** | ✅ official | [`@modelcontextprotocol/server-redis`](https://www.npmjs.com/package/@modelcontextprotocol/server-redis) | **Adopt for cache introspection** (read-only). Block destructive verbs (DEL/FLUSHDB) via Claude Code hook |
| **Obsidian vault filesystem** | `npx -y @modelcontextprotocol/server-filesystem <vault-path>` | `@modelcontextprotocol/server-filesystem` | ✅ Official filesystem MCP server; supports read/write/list/search/metadata inside allowed directories |
| **TypeScript language intelligence** | `tsgo --native-preview` / editor LSP | `@typescript/native-preview` / editor LSP | ✅ Use TypeScript native-preview language service directly; do not mount `mcp-language-server` unless a maintained package is verified |
| **SvelteKit routes** | ⚠️ partial — Svelte MCP exists for docs, not routes | [sveltejs/ai-tools](https://github.com/sveltejs/ai-tools) | **Build** route-enumeration MCP ourselves — Svelte MCP doesn't introspect `+page.server.ts` / `+server.ts` shape |
| **"Agentic OS" CLI for codebase ingestion → plan handoff** | ❌ none shipped | — | **Build** (per [synthesis-loop plan](../../../next_steps/active/2026-05-09_gemma4-mcp-synthesis-loop.md)). The user keeps asking — there's no off-the-shelf answer in 2026. Closest references: MindStudio's "agentic OS" pattern guide (concept only) |
| **"Printing press" codebase→cards pipeline** | ❌ none shipped | — | **Keep our custom Karpathy + AGENTS.md spine** — operationally more complete than any 2026 OSS pattern |
| **Plugin Marketplace** | ✅ released | [Claude Code changelog](https://claudefa.st/blog/guide/changelog) | **Use for distribution** — Phase E of synthesis-loop plan packages TRACE as a plugin; submit to marketplace once Phase D is stable |

Package verification notes:
- `mcpvault` is not a verified dependency here; use `@modelcontextprotocol/server-filesystem` for Obsidian vault access instead.
- `mcp-language-server` is not mounted; use `tsgo --native-preview` / the normal TypeScript language service path directly unless a maintained MCP package is confirmed.

## "Adopt vs build" — the rule

**Adopt official MCP servers for generic infrastructure access.** They
get security updates, schema fixes, and version cohesion that we
otherwise have to chase ourselves. Postgres / Qdrant / Neo4j / Redis
fall into this bucket.

**Build custom MCP tools for project-specific semantics.** Anything
that wraps our manifold4 / ACE blend / Karpathy authority / SOM
topology / AGENTS.md hierarchy / pathway cards stays custom — no
official server knows about those abstractions, and the abstractions
themselves are *the value* of the system.

**Mount adopted servers read-only.** Every official server above
either supports a read-only mode (Neo4j: `NEO4J_READ_ONLY=true`,
Postgres: connection-string permissions) or can be sandboxed via a
Claude Code `PreToolUse` hook that denies write verbs.

## Recommended `.mcp.json` after Phase B/C

```jsonc
{
  "mcpServers": {
    // Custom — TRACE semantics
    "trace": {
      "command": "node",
      "args": ["sveltekit-frontend/src/mcp/trace-mcp-server.ts"],
      "env": { "TRACE_MCP_PORT": "8788" }
    },
    "gemma4-offload": {
      "command": "node",
      "args": ["sveltekit-frontend/scripts/mcp/gemma4-offload-mcp.mjs"]
    },

    // Adopted — generic infra (read-only)
    "neo4j": {
      "command": "npx",
      "args": ["-y", "@neo4j-contrib/mcp-neo4j"],
      "env": {
        "NEO4J_URL": "bolt://localhost:7687",
        "NEO4J_USERNAME": "neo4j",
        "NEO4J_PASSWORD": "${NEO4J_PASSWORD}",
        "NEO4J_READ_ONLY": "true"
      }
    },
    "qdrant": {
      "command": "uv",
      "args": ["run", "mcp-server-qdrant"],
      "env": { "QDRANT_URL": "http://localhost:6333" }
    },
    "redis-readonly": {
      "command": "node",
      "args": ["-y", "@modelcontextprotocol/server-redis", "redis://localhost:6379"]
    },
    "postgres-readonly": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-postgres",
               "postgresql://readonly_user@localhost:5434/legal_ai_db"]
    },
    "obsidian-vault": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "<vault-path>"]
    },
    "ts-lsp": {
      "command": "npx",
      "args": ["-y", "@typescript/native-preview", "tsgo", "--lsp", "./sveltekit-frontend"]
    }
  }
}
```

That's 8 MCP servers — 2 custom (TRACE semantics + Gemma4 routing),
6 adopted (read-only generic infra). Every adopted server gets
re-confirmed by a Claude Code `PreToolUse` hook that blocks any tool
whose name contains a write verb (`drop`, `delete`, `truncate`,
`update`, `insert`, `create`, `flushdb`, `set`).

## What this changes in the synthesis-loop plan

The original [synthesis-loop plan](../../../next_steps/active/2026-05-09_gemma4-mcp-synthesis-loop.md)
assumed we'd build ~10 `db.*` tools ourselves. Updated split:

| Tool | Origin |
|------|--------|
| `db.schema_overview`, `db.table_inspect`, `db.indexes`, `db.relation_map` | **Build (custom)** — Drizzle-aware shape, official Postgres MCP doesn't know `schema-postgres.ts` |
| `db.find_jsonb_keys`, `db.drift_check`, `db.migration_status` | **Build (custom)** — JSONB envelope conventions + Drizzle journal awareness, no upstream equivalent |
| Generic `SELECT … WHERE …`, `EXPLAIN <query>`, schema introspection | **Adopt official Postgres MCP** — saves us from re-implementing |
| `db.table_sample` | **Adopt official Postgres MCP** read-only access — gated by DB role permissions, not env flag |
| Generic Qdrant `qdrant-find`, `qdrant-store` | **Adopt official Qdrant MCP** |
| Custom `topology.search_4d`, `context.build_kv_packet`, `kag.expand` | **Build (custom)** — wraps manifold4 + ACE + KAG, our value-add |
| Generic Neo4j Cypher (read-only), GDS procedure list | **Adopt official Neo4j MCP** with `NEO4J_READ_ONLY=true` |
| Custom `graph.expand_neighborhood`, `graph.pagerank_top` from CodebaseFile graph | **Build (custom)** — wraps Karpathy authority blend |
| Redis `GET`, `HGETALL`, `SCAN` | **Adopt official Redis MCP** read-only |
| Obsidian vault traversal, BFS/DFS, frontmatter query | **Adopt the official filesystem MCP server** |
| TypeScript symbol lookup, find references, diagnostics | **Adopt `tsgo --lsp` via `@typescript/native-preview`** |
| SvelteKit `+page.server.ts` route map, load-fn shape inspection | **Build (custom)** — no upstream equivalent |
| AGENTS.md walk-up resolver, pathway/feature/timeline card lookup | **Build (custom)** — TRACE-specific |

Net: Phase B implementation work shrinks. We build ~6 truly custom
tools instead of ~12. The other 6 we get for free by mounting
official servers.

## Immediate operational wins

Three Claude Code 2026 features the operator should turn on now,
independent of any new MCP work:

1. **Checkpoints + Rewind** — saves code state pre-change. If a
   Gemma4 brief leads Claude Code into a bad edit, rewind both the
   conversation and the files in one shot. ([changelog](https://claudefa.st/blog/guide/changelog))
2. **Plan Mode** — explicit step-by-step approval before execution.
   Pair with the `PreToolUse` deny-list for destructive Bash; plan
   mode + hooks = the actual sandbox.
3. **Plugin Marketplace** — once Phase E packages TRACE as
   `trace-claude-plugin/`, this is the distribution channel.

## What we are *not* doing

- **No Hermes Agent integration.** Confirmed 2026: Hermes is a
  Python TUI with codebase introspection; not a planner, no GUI.
- **No SurrealDB swap-in.** BSL 1.1 + immature unified ecosystem;
  keep the Postgres/Qdrant/Neo4j split.
- **No object-storage hardwiring.** AGPLv3 commercial concerns; the
  proposed object-storage adapter speaks S3 so SeaweedFS / R2 / B2
  / S3 are all swappable.
- **No replacing custom TRACE tools with off-the-shelf MCP servers.**
  The semantic value (manifold4, ACE blend, Karpathy authority,
  AGENTS.md spine) is *in* the custom tools — replacing them would
  cost the system its identity.

## Build order (revised)

The [synthesis-loop plan's Phase B](../../../next_steps/active/2026-05-09_gemma4-mcp-synthesis-loop.md)
becomes:

1. **Mount official MCP servers** (Neo4j read-only, Qdrant, Redis
   read-only, Postgres read-only, filesystem MCP, tsgo LSP via
   `@typescript/native-preview`) in
   `.vscode/mcp.json` and `~/.claude/mcp.json`. Smoke each via
   `npx mcporter call <server>.<tool>`.
2. **Add `PreToolUse` hook** that denies write-verb tools by
   name pattern across all servers.
3. **Implement the 6 custom Drizzle-aware `db.*` tools** + 4 custom
   TRACE graph/topology tools (the irreplaceable ones).
4. **Pin `zod@^3.22`** — fixes existing `trace-mcp-server.ts`
   `tools/list` Zod crash.
5. **Add validator gates** G32 (`mcp:trace-server-tools-list`), G33
   (`mcp:db-inspection-readonly`), G37 (`mcp:adopted-servers-mounted`).
6. Proceed to Phase C (synth loop CLI) per the original plan.
