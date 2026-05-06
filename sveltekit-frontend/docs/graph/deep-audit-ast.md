# Deep AST Audit

Generated: 2026-05-06T01:28:41.628Z
Graph files: 3417

## Summary

| Gate | Description | Count |
| :--- | :--- | ---: |
| D18 | simdjson opportunity (.mget + JSON.parse, no fast-parse) | 0 |

---

## Recommended Claude Code skills

Each skill is a multi-gate agentic pipeline that drills deeper than this AST audit. Run from Claude Code via `/<skill-name>`:

- /deep-audit — already clean; run for 47-gate health sweep across all tiers (Tier A code, Tier C infra, Tier H analytics)

**Composition pattern**:
1. `/graphify` — refresh codebase-graph.json + cluster_summaries (~5 min)
2. `npm run audit:deep-ast` — refresh D1-D10 findings (~2s)
3. `/audit-components` (D9 candidates) — 8-gate disposition (wire/rewrite/archive/defer)
4. `/wire-modules` (D10 missing-import) — fix orphan call sites
5. `/deep-audit` — 47-gate sweep including this audit's output as Tier A baseline
