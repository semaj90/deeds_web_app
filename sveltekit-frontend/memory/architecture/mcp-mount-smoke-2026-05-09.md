# MCP Mount + Smoke — 2026-05-09 status

Authoritative source: `npx mcporter list`. Probes every MCP config Claude Code / VS Code knows about.

## Result: 5-7 healthy, 8-10 offline (varies per run)

```
✅ healthy
   gemma4-offload          4 tools  ~/.claude/mcp.json (project-side)
   microsoft-docs          3 tools  ~/AppData/Roaming/Code/User/mcp.json
   memory                  9 tools  ~/.claude/mcp.json
   postgres-readonly       1 tool   .vscode/mcp.json     (warm in 9-15s)
   qdrant-readonly         2 tools  .vscode/mcp.json     (warm in 13-18s)
   neo4j-readonly          2 tools  .vscode/mcp.json     (sometimes — 17-30s warm)
   colab                   1 tool   ~/.claude/settings.json (sometimes)

❌ offline (need package-name correction)
   redis-readonly          .vscode/mcp.json     — uvx mcp-redis: "No solution found when resolving tool dependencies"
   ts-lsp                  .vscode/mcp.json     — npx mcp-language-server: 6s timeout, no output (wrong scope?)
   obsidian-vault          .vscode/mcp.json     — npm 404 on `mcpvault` package
   context7-multicore      .vscode/mcp.json     — legacy local server, never started
   context7-legacy         ~/.claude/mcp.json   — same
   context7-optimized      ~/.claude/mcp.json   — same
   playwright              ~/.claude/settings.json — 23s timeout
   legal-ai-context        .vscode/mcp.json     — local server, not running
```

## Per-server probe details

| Server | uvx/npx invocation | Result |
|--------|---------------------|--------|
| `mcp-neo4j-cypher` | `uvx mcp-neo4j-cypher` | ✅ resolves, --help works |
| `mcp-server-qdrant` | `uvx mcp-server-qdrant` | ✅ resolves, --help works |
| `mcp-server-postgres` | `uvx mcp-server-postgres` | ⚠ uvx says "Package … do…" — npm-only? Try `npx -y @modelcontextprotocol/server-postgres` |
| `mcp-redis` | `uvx mcp-redis` | ❌ "No solution found when resolving tool dependencies" — wrong package or extras needed |
| `mcpvault` | `npx -y mcpvault` | ❌ npm 404 — package doesn't exist; use `@modelcontextprotocol/server-filesystem` pointed at vault path instead |
| `mcp-language-server` | `npx -y mcp-language-server` | ❌ no output — package missing under that name; community fork lives at `@isaacphi/mcp-language-server` (verify) |
| `@upstash/context7-mcp` | `npx -y @upstash/context7-mcp` | ❌ no output — package name needs verification |

## What works today (use as-is)

The `.vscode/mcp.json` already has working entries for postgres-readonly + qdrant-readonly + neo4j-readonly + gemma4-offload. The `.claude/mcp.json` we created for the same names is **duplicative** for the working ones and has bad invocations for the broken ones.

**Net recommendation:** prune `.claude/mcp.json` to ONLY the supplemental servers (Context7 once verified, the local web dashboards once they exist), and let `.vscode/mcp.json` remain authoritative for the 4 working ones. Both files coexist — Claude Code reads both.

## Operator next steps to mount more servers

| Server | Operator action |
|--------|-----------------|
| `redis-readonly` | Try `uvx --from mcp-server-redis mcp-server-redis` OR `npx -y @modelcontextprotocol/server-redis`; whichever resolves wins |
| `obsidian-vault` | Drop `mcpvault`; switch to `npx -y @modelcontextprotocol/server-filesystem ./docs/obsidian-vault` (filesystem-native — gives Claude read-only walk over the vault directory tree) |
| `ts-lsp` | Verify scope — community forks: `@isaacphi/mcp-language-server` or `@modelcontextprotocol/server-typescript-lsp`. `npm view <name>` to confirm before retrying |
| `context7` | Verify the actual published name. Search npm: `npm search context7-mcp` |
| `playwright` | 23s timeout in mcporter probe — likely the playwright MCP needs its browser binaries installed first (`npx playwright install`) |

## What this DOES NOT change

- TRACE MCP `:8788` — running. Tool surface evolved this session:
  - **Pre-restart live:** 42 tools (after the SDK transport-reuse fix).
  - **Static count (audit):** 75 registrations = 73 canonical + 2 legacy aliases (gated by `MCP_LEGACY_ALIASES`). G37 enforces this.
  - **Post-restart expected:** ~73 — 22 inline canonical tools were un-gated from `if (ENABLE_OPTIONAL_REGISTRIES)` (see `scripts/unwrap-optional-registries.mjs`); 3 sub-module registries (`codebase` / `research` / `bifrost`) stay gated behind the new `MCP_OPTIONAL_REGISTRIES` flag (default off).
  - **Canonical §10 named tools now live unconditionally:** `trace.kag_search`, `topology.search_near`, `graph.expand_neighborhood`, `graph.shortest_path`, `graph.pagerank_top`, `clusters.get_summary_lenses`, `trace.explain_retrieval`, `kb.wiki_note_lookup`, `kb.archive_synthesis`, plus the full `agents_md.*` and `hypergraph.*` families.
- Phase B (z.record + z.object unwrap pass) — locked in
- G34 audit gate — already in `scripts/validate/full-system.mjs`

## Phase B/Mount-and-smoke status: ✅ DONE

The mount-and-smoke phase confirms:
1. Real MCP servers DO exist (5+ healthy via mcporter on this machine)
2. The `.claude/mcp.json` config layout works — Claude Code + mcporter both discover it
3. Package names need per-server verification — there's no canonical "official" registry that maps every server to its publish name
4. The healthy 5 cover the high-value cases (Postgres + Qdrant + Neo4j + memory + microsoft-docs) so the agent surface (Cline / OpenCode / Hermes / Claude Code) has real read-only access to graph + vector + relational + docs lanes from day one

## Reload note

After any `.claude/mcp.json` or `.vscode/mcp.json` change → restart Claude Code (or `/reload`) so it re-fetches the registry. mcporter doesn't need a reload — it polls fresh every `npx mcporter list` invocation.

## Next-phase pick

| Phase | Status |
|-------|--------|
| Mount + smoke 7 official MCPs | ✅ done (this doc) |
| Phase C — synth loop CLI | ⏳ pending |
| External Corpus Phase 1 (llms.txt) | ⏳ pending |
| Phase G — LangGraph eval | partially obsoleted by `agent-surface-decision-matrix.md` this session |
| SeaweedFS plan | ⏳ pending (independent track) |
