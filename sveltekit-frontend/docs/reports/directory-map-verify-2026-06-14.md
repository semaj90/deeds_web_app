# Directory/Source-Ref Map Verification Report

**Generated**: 2026-06-14T23:17:18.247Z
**Status**: FAIL
**Repository**: C:\Users\james\Videos\deeds-web-app\sveltekit-frontend

## Summary

| Metric | Value |
|--------|-------|
| Total Files | 78931 |
| Path Separator Issues | 0 |
| Generated File Leakage | 23390 |
| node_modules Leakage | 70339 |
| Duplicate source_refs | 0 |

## Hard Fail Conditions (Parent Atlas Contract)

✓ path_separator_issues = 0
✓ generated_file_leakage = 23390
✓ node_modules_leakage = 70339
✓ duplicate_source_refs = 0

**RESULT**: ❌ FAIL — Fix the issues above.





### Generated File Leakage (23390)

- `.docker-build/scripts/atlas/ace-context-fusion.mjs`: Found in generated directory
- `.docker-build/scripts/atlas/append-llm-synthesis-jsonl.mjs`: Found in generated directory
- `.docker-build/scripts/atlas/atlas-answer-trace.mjs`: Found in generated directory
- `.docker-build/scripts/atlas/backfill-qdrant-source-refs.mjs`: Found in generated directory
- `.docker-build/scripts/atlas/build-manifold-autocoder.mjs`: Found in generated directory


### node_modules Leakage (70339)

- `node_modules/.svelte2tsx-language-server-files/svelte-native-jsx.d.ts`: Found in node_modules directory
- `node_modules/.svelte2tsx-language-server-files/svelte-shims-v4.d.ts`: Found in node_modules directory
- `node_modules/.vite/deps/@grpc_grpc-js.js`: Found in node_modules directory
- `node_modules/.vite/deps/@grpc_proto-loader.js`: Found in node_modules directory
- `node_modules/.vite/deps/@internationalized_date.js`: Found in node_modules directory



