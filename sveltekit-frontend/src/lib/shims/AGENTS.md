# AGENTS.md — `src/lib/shims`

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-05T00:55:33.656Z · agents.md spec · regen: npm run agents:write -->

> Directory audit: src/lib/shims

## Snapshot

- shared library directory with 11 files, 0 API handlers, 1 Drizzle refs, 1 SSR-unsafe
- Audit score: **90/100**
- 🔴 SSR-unsafe: 1
- Tags: `src` `lib` `shims` `db-schema` `zod` `ssr-unsafe`

## Files (11)

- `commonjs-shim.js`
- `dns-browser-shim.js`
- `drizzle-node-postgres.ts`
- `fs-browser-shim.js`
- `ioredis-browser-shim.js`
- `lokijs-browser-adapter.js`
- `missing-types-shim.d.ts`
- `os-browser-shim.js`

## Hypergraph cluster

This directory is part of cluster **C57** — const chunks in \`src/lib/shims\` (tag: embedding)

- **Top kinds**: const×10, function×3, type×2
- **Top tags**: `embedding` `vector` `auth` `server-module` `config`

See `docs/graph/hypergraph-clusters.md` § Cluster 57 for full digest.

## Warnings

- ⚠️ 1 SSR-unsafe globals

## Agentic tool-calling — quick ACE hits

In-process tools the Gemma4 agent can call to dig deeper into this directory:

- `graph_search({ query: "shims", topK: 8 })` — files in this dir with tags, TODOs, audit flags
- `wiki_note_lookup({ query: "lib shims", limit: 5 })` — KAG narrative + audit score
- `audit_hotspots({ limit: 10 })` — if this dir is failing gates, surfaces the broader hotspot set
- `read_file({ filePath: "src/lib/shims/<file>" })` — fetch any file's contents (sandboxed to src/)


## How to use this file

Agents (Claude Code, Cursor, Codex, Aider) automatically pick up the nearest `AGENTS.md` when editing files in this tree. The root `AGENTS.md` provides repo-wide rules; this file overlays directory-specific signals from the Redis KAG cache.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.
