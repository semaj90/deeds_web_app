# AGENTS.md — `src`

## Audit Gates — General

> Auto-mapped from CLAUDE.md §"Unified Audit Gate System". Last enriched: 2026-05-11
> Run each check from the **sveltekit-frontend/** root.

### Tier A — Code Connectivity

**G1** Static ESM imports
```bash
rg "from.*MODULE" src/ --type ts --type svelte
```

**G2** Dynamic ESM imports
```bash
rg "import(.*MODULE" src/ --type ts --type svelte
```

### Tier C — Infrastructure

**G17** No hardcoded localhost — use ENV.* getters
```bash
rg "localhost|127\.0\.0\.1" src/lib/server/ --type ts  # expect 0 outside env.server.ts
```


## TODO — Enhancements from ACE Analysis

> Generated from Redis ACE hits (code:graph:node:* + hotspot data). Regenerate: `node scripts/enrich-agents-md.mjs`.

- [ ] **G17** Audit for remaining hardcoded `localhost` / `127.0.0.1` — replace with `ENV.*` getters

## Fix Timeline

> Recent commits touching this directory — newest first. Used by agents to correlate errors with fixes.

| Commit | Timestamp | Subject |
|--------|-----------|---------|
| `06fcc5de8d` | 2026-05-11T10:23 | feat(autoencoder): D1-D4 wire-in — weights loader, 768→64 encode chain, backfill, centroids, Stage A0 prefilter |
| `290a4719f4` | 2026-05-11T10:17 | feat(evidence-board): M3+M7+M8+M9 — bulk ANALYZE, RAG findings, AUTO-MAP, YoRHa tokens |
| `834c0f8ff8` | 2026-05-11T10:05 | fix(server): misc server-side fixups — SeaweedFS health, karpathy-hook metadata, retrieval types |
| `30efceeca2` | 2026-05-11T10:01 | feat(schema): rg-atlas tables + schema-search barrel |
| `034a9571c2` | 2026-05-11T10:01 | feat(evidence-board): M2+M5+M6 — UploadZone drop, Notebook panel, collaboration sync |
| `649272c5b6` | 2026-05-11T09:51 | feat(mcp): register kb.rg_atlas_search tool (rg_atlas_tools.ts helper) |

<!-- /AGENTS-ENRICH -->



<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-12T03:12:15.164Z · agents.md spec · regen: npm run agents:write -->

> Directory: src

## Snapshot

- 17 file(s), 0 handler(s)
- Audit score: _(no GPU audit)_
- no audit signals


## Files (17)

- `ambient-legacy.d.ts`
- `app.d.ts`
- `auth-store.svelte.ts`
- `custom-modules.d.ts`
- `env.d.ts`
- `global.d.ts`
- `hooks.client.ts`
- `hooks.server.ts`

## Tools

> MCP tools the Gemma4 agent should reach for inside this directory.
- kag.multi_lane_search
- graph.expand_neighborhood
- topology.same_som_cluster
- clusters.get_members
- context.build_kv_packet
- taxonomy.children

## Retrieval / Rerank Hints

> Used by ACE context-assembler and Gemma4 agent for pre-retrieval path mapping and post-retrieval chunk scoring.

- **Cluster**: _(not yet indexed — run `graphify:batch` to assign)_
- **Paired tests**: 1/17 files have paired tests

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "src", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "src", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
