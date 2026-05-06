# Deep AST Audit

Generated: 2026-05-06T01:18:15.314Z
Graph files: 3417

## Summary

| Gate | Description | Count |
| :--- | :--- | ---: |
| D16 | await-using opportunity (try/finally + .quit/.disconnect) | 2 |

---

## D16 — await-using opportunity (try/finally + .quit/.disconnect)

**2** findings

- `scripts\tests\test-ace-graphify-retrieval.mjs:192` — await redis.quit().catch(() => {});  → consider `await using` + getDisposableRedis()
- `scripts\lib\phase89-sse-stream.mjs:199` — await redis.quit();  → consider `await using` + getDisposableRedis()

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
