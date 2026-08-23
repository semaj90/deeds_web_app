# Deep AST Audit

Generated: 2026-08-23T20:46:41.534Z
Graph files: 24151

## Summary

| Gate | Description | Count |
| :--- | :--- | ---: |
| D9 | Likely orphans (0 fanIn, no dynImport ref) | 7415 |

---

## D9 — Likely orphans (0 fanIn, no dynImport ref)

> **D9 is a candidate queue, not a deletion list.**
>
> D9 no longer uses Graphify `fanIn` as a deletion signal. It uses `fanIn=0` only as a candidate source, then verifies candidates by scanning runtime imports, dynamic imports, type-only imports, and barrel re-exports. SvelteKit route entrypoints, hooks, service workers, type shims, generated declarations, stores, and barrels are excluded.
>
> Files listed here are likely unused, but still require `/audit-components` disposition before deletion or archive. Do not bulk-prune — let the skill classify the first 20-30, then archive in batches.

**7415** findings (showing first 30)

- `$lib/utils/file-reader.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.claude/hooks/posttooluse-audit.mjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.claude/hooks/pretooluse-deny.mjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.eslintrc.cjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.gemini/antigravity/scratch/check_braces.js:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.gemini/antigravity/scratch/find_returns.js:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.gemini/antigravity/scratch/test_insert.js:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.vscode/extensions/mcp-context7-assistant/src/mcpServerManager.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.vscode/patch-tasks.mjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.vscode/extensions/mcp-context7-assistant/src/mcpServerManager.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.vscode/extensions/mcp-context7-assistant/src/mcpServerManager.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `ace-pipeline-audit.mjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `audit-opencode-state.mjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `backfill-neo4j-cell-id.mjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `backfill-payload-metadata.mjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `backfill-qdrant-by-packet-key.mjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `backfill-qdrant-identity.mjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `backfill-qdrant-via-patch.mjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `check-neo4j.mjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `claude-mem/docs/context/agent-sdk-v2-examples.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `claude-mem/install/public/installer.js:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `claude-mem/openclaw/test-sse-consumer.js:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `claude-mem/plugin/scripts/bun-runner.js:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `claude-mem/plugin/scripts/context-generator.cjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `claude-mem/plugin/scripts/server-beta-service.cjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `claude-mem/plugin/scripts/statusline-counts.js:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `claude-mem/plugin/scripts/version-check.js:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `claude-mem/plugin/scripts/worker-cli.js:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `claude-mem/plugin/scripts/worker-service.cjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `claude-mem/plugin/scripts/worker-wrapper.cjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate

---

## Recommended Claude Code skills

Each skill is a multi-gate agentic pipeline that drills deeper than this AST audit. Run from Claude Code via `/<skill-name>`:

- /audit-components — verify 7415 D9 orphan candidates with 8-gate test (G0 transitive-dep, G0.5 dynamic-import, G1-G8 disposition)
- /prune-codebase — full archive flow with G6 route reachability + reverse-dependency chain
- /deep-audit — full 47-gate sweep covering G1-G47 (compounds D1-D10 with infra, security, RL pipeline)
- /graphify — refresh codebase-graph.json + glyph_atlas + cluster_summaries; D9 false-positive count drops once new fanIn data lands

**Composition pattern**:
1. `/graphify` — refresh codebase-graph.json + cluster_summaries (~5 min)
2. `npm run audit:deep-ast` — refresh D1-D10 findings (~2s)
3. `/audit-components` (D9 candidates) — 8-gate disposition (wire/rewrite/archive/defer)
4. `/wire-modules` (D10 missing-import) — fix orphan call sites
5. `/deep-audit` — 47-gate sweep including this audit's output as Tier A baseline
