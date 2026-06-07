# Parent Atlas Overlay Crosswalk Report

Generated: 2026-06-06T17:44:42.022Z | mode: read-only | db: connected

## Summary

| Metric | Value |
|--------|-------|
| atlas_feature_map sample | 500 rows |
| app registry rows | 4209 |
| root registry rows | 4209 |
| joined | 261 |
| no-join | 239 (47.8%) |
| exact source_ref joins | 1 (0.2%) |
| app-inventory-only | 0 |
| app-only (no live table) | 4208 |
| **patch recommendation** | **PATCH_DEFERRED — high no-join rate; resolve source_ref gaps in atlas_feature_map first** |

## Classification Breakdown

| Classification | Count |
|---------------|-------|
| EXACT_SOURCE_REF_JOIN | 1 |
| FEATURE_ID_JOIN | 197 |
| HEURISTIC_LABEL_JOIN | 63 |
| ROOT_CONTRACT_ONLY | 0 |
| APP_INVENTORY_ONLY | 0 |
| NO_JOIN | 239 |

## Top Missing source_refs (NO_JOIN rows)

- `.agent/workflows/error-fixing-strategy.md`
- `.cache/ace/context-packs/ace_context_local-json-hit_v1.json`
- `.cache/ace/context-packs/ace_context_smoke-context-pack_v1.json`
- `.cache/ace/top-retrieval/ace_retrieval_topn_77245b8d5bd3442aa981670b_2.json`
- `.cache/llm-synthesis/[object Promise].json`
- `.claude/settings.local.json`
- `.opencode/agents/atlas-context.md`
- `.opencode/agents/hermes-ace.md`
- `.opencode/agents/workspace-ready.md`
- `.opencode/commands/ace-fallback-ladder.md`
- `.opencode/commands/graph-export-recover.md`
- `.opencode/commands/workspace-ready.md`
- `.opencode/config-patches.json`
- `.opencode/skills/ace-recovery/SKILL.md`
- `.orphan-report.txt`
- `.port-allocation.json`
- `.scheck-latest.txt`
- `../scripts/10-layer-audit-cli.mjs`
- `../scripts/ace_batch_fix_set.py`
- `../scripts/ace_batch_fix_set_v2.py`
- `../scripts/ace-daily-todo-summary.mjs`
- `../scripts/ace-diff-sniffer.mjs`
- `../scripts/ace-startup-health.mjs`
- `../scripts/agent/log-subagent.mjs`
- `../scripts/agent/prompt-generator.mjs`
- `../scripts/agents/generate-monorepo-agents.mjs`
- `../scripts/agents/offline_passes.mjs`
- `../scripts/agent/turbovec-search-memory.mjs`
- `../scripts/aggregate-failures.js`
- `../scripts/ai/cache_startup_prompt.mjs`

## Top Missing feature_ids (NO_JOIN rows)

- `utility`

## Sample Rows (first 20)

| source_ref | classification | padJoin | appJoin |
|-----------|----------------|---------|---------|
| `.agent/workflows/agentic-error-fixing.md` | FEATURE_ID_JOIN | feature_id | — |
| `.agent/workflows/error-fixing-strategy.md` | NO_JOIN | — | — |
| `.cache/ace/context-packs/ace_context_local-json-hit_v1.json` | NO_JOIN | — | — |
| `che/ace/context-packs/ace_context_smoke-context-pack_v1.json` | NO_JOIN | — | — |
| `retrieval/ace_retrieval_topn_77245b8d5bd3442aa981670b_2.json` | NO_JOIN | — | — |
| `.cache/d9-verifier/LLMS.md` | FEATURE_ID_JOIN | feature_id | — |
| `.cache/llm-synthesis/[object Promise].json` | NO_JOIN | — | — |
| `.claude/settings.local.json` | NO_JOIN | — | — |
| `docker/bifrost/config.json` | FEATURE_ID_JOIN | source_ref | — |
| `ges/jiter-0.14.0.dist-info/sboms/jiter-python.cyclonedx.json` | FEATURE_ID_JOIN | source_ref | — |
| `/langgraph-synthesis/.venv/Lib/site-packages/js/install.json` | FEATURE_ID_JOIN | source_ref | — |
| `b/site-packages/opentelemetry/sdk/_configuration/schema.json` | EXACT_SOURCE_REF_JOIN | source_ref | feature_key |
| `packages/orjson-3.11.8.dist-info/sboms/orjson.cyclonedx.json` | FEATURE_ID_JOIN | source_ref | — |
| `sis/.venv/Lib/site-packages/plotly/labextension/package.json` | FEATURE_ID_JOIN | source_ref | — |
| `ackages/plotly/labextension/static/1.9daa5160b7fc741623bf.js` | FEATURE_ID_JOIN | source_ref | — |
| `otly/labextension/static/remoteEntry.b2077f01f9b03ba2c63d.js` | FEATURE_ID_JOIN | source_ref | — |
| `/.venv/Lib/site-packages/plotly/labextension/static/style.js` | FEATURE_ID_JOIN | source_ref | — |
| `ackages/plotly/labextension/static/third-party-licenses.json` | FEATURE_ID_JOIN | source_ref | — |
| `is/.venv/Lib/site-packages/plotly/package_data/plotly.min.js` | FEATURE_ID_JOIN | source_ref | — |
| `Lib/site-packages/plotly/package_data/templates/ggplot2.json` | FEATURE_ID_JOIN | source_ref | — |

## Patch Recommendation

PATCH_DEFERRED — high no-join rate; resolve source_ref gaps in atlas_feature_map first

After reviewing this report:
- If `PATCH_SAFE`: run `npm run atlas:parent-atlas:promote --dry-run` to preview upserts
- If `PATCH_REVIEW`: spot-check the NO_JOIN rows for broken source_refs before patching
- If `PATCH_DEFERRED`: fix source_ref population in `atlas_feature_map` first