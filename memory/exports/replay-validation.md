# Atlas Replay Validation

Generated: 2026-08-27T03:39:40.740Z
Sample: 200 packets | Threshold: 95%

## Result: ✅ PASS

| Metric | Value |
|--------|-------|
| Replay rate | 99.0% (198/200) |
| sourceRefHash | 99.0% |
| feature_id | 100.0% |
| cluster_id (optional_reserved) | 0.0% |
| Qdrant found | 5/101 with qdrant_point_id |
| Qdrant aligned | 2 aligned, 3 misaligned |

## Check Details

- **sourceRefHash**: 198 pass / 2 fail — mandatory
- **feature_id**: 200 pass / 0 fail — mandatory
- **cluster_id**: 0 pass / 200 fail — optional_reserved — GPU cluster bridge not yet implemented
- **Qdrant lookup**: 5 found / 96 missing (of 101 eligible; 99 task-refs skipped)
- **feature_id alignment**: 2 aligned / 3 misaligned

## Failures (first 20)

- id=packet:0004f849be72 `tests/sprint5-6-monitoring.spec.ts` → `qdrant_not_found`
- id=packet:0006ca4a45e3 `logs/trace-mcp/launch-2026-06-25t22-12-53-881z.out` → `qdrant_not_found`
- id=packet:0008d535a1f6 `llama-cpp-turboquant-gemma4/tools/completion/completion.cpp` → `qdrant_not_found`
- id=packet:0009951ee430 `.tmp/parent_atlas_packets/0056213574662f41.json` → `qdrant_not_found`
- id=packet:0009a56456fc `.venv_turbovec/lib/site-packages/pip/_vendor/rich/terminal_theme.py` → `qdrant_not_found`
- id=packet:000b1b923bf4 `logs/task-output/pipeline-test/startup-2026-05-13t00-19-01-475z.json` → `qdrant_not_found`
- id=packet:000b2df0cfdf `tests/phase76-acp-tools.property.test.ts` → `qdrant_not_found`
- id=packet:000db15dc8ef `src/lib/utils/keyboard-shortcuts.svelte.ts` → `feature_id_mismatch`
- id=packet:000f10a13a57 `crates/turbovec-napi/target/release/deps/libryu-555024bdb0a51304.rlib` → `qdrant_not_found`
- id=packet:000f50f509c8 `simd-bridge/rust/hmm-repair/target/debug/.fingerprint/serde_json-f2f0d07b853d9365/llms.md` → `qdrant_not_found`
- id=packet:000f704e5207 `.python311/share/terminfo/b/bq300-8rv` → `qdrant_not_found`
- id=packet:000fde9311af `src/routes/api/ai/bifrost/+server.ts` → `qdrant_not_found`
- id=packet:001007058f4a `scripts/atlas/generate-concept-temperature-report.mjs` → `qdrant_not_found`
- id=packet:0011712c94d1 `scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/workers/jobs/clean-server/llms.md` → `qdrant_not_found`
- id=packet:0011a232d0b8 `.venv_turbovec/lib/site-packages/numpy/_core/include/numpy/npy_os.h` → `qdrant_not_found`
- id=packet:001789105fcc `logs/task-output/pipeline-test/startup-2026-06-13t15-21-32-591z.json` → `qdrant_not_found`
- id=packet:0017ebe58f96 `scripts/run-migration.mjs` → `qdrant_not_found`
- id=packet:00191bed434b `crates/turbovec-napi/target/debug/.fingerprint/npyz-0bb0c4b019944695/dep-lib-npyz` → `qdrant_not_found`
- id=packet:001c3fdaad12 `simd-bridge/cpp/build-x64-cuda-cublas/cmakefiles/checkcuda/zero_check.vcxproj.filters` → `qdrant_not_found`
- id=packet:001d358f9d1f `llama-cpp-turboquant-gemma4/ggml/src/ggml-cpu/hbm.cpp` → `qdrant_not_found`
