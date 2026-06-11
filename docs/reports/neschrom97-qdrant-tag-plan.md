# NESCHROM97 Qdrant Tag Plan

Generated: 2026-06-11T19:38:50.149Z

## Scope

- primary collection: codebase_chunks_768
- excluded collections: legal_documents
- read only: true

## Summary

- registry cards: 8170
- registry packets: 14956
- joined card samples: 10
- unjoined card samples: 10
- join coverage: 91.69%
- feature coverage: 91.69%
- ready-to-tag samples: 10
- needs-join-backfill samples: 10

## Payload Template

```json
{
  "collection": "codebase_chunks_768",
  "payload": {
    "card_id": "<card_id>",
    "packet_key": "<packet_key>",
    "source_ref": "<source_ref>",
    "feature_id": "<feature_id>",
    "feature_label": "<feature_label|null>",
    "directory_path": "<directory_path|null>",
    "surface": "neschrom97",
    "qdrant_tags": [
      "surface:neschrom97",
      "surface:hyperrag"
    ]
  }
}
```

## Recommended Payload Keys

- card_id
- packet_key
- source_ref
- feature_id
- directory_path
- surface:neschrom97

## Top Tag Histogram

- surface:neschrom97: 10
- surface:hyperrag: 10
- directory:src/lib/components: 3
- feature:utility: 2
- card:00077aad3e4544dd: 1
- packet:nes:scripts:f9833631: 1
- source_ref:src/lib/components/types.ts: 1
- feature:scripts: 1
- card:000daa8131cc5445: 1
- packet:nes:bits-ui:d6068edc: 1
- source_ref:src/routes/(app)/demos/bits-ui/+page.svelte: 1
- feature:bits-ui: 1
- directory:src/routes/(app)/demos/bits-ui: 1
- card:000dec1320dc083e: 1
- packet:nes:scripts/case_data/_cache/federal_employee_liability_be9c7168_json:68772ed9: 1
- source_ref:../scripts/case_data/_cache/federal_employee_liability_be9c7168.json: 1
- feature:feat:scripts/case_data/_cache/federal_employee_liability_be9c7168_json: 1
- directory:../scripts/case_data/_cache: 1
- card:0011b1119716bfde: 1
- packet:nes:utility:2202cfff: 1

## Ready Groups

### utility — src/lib/components

- count: 2
- feature_label: CaseOutcomePrediction.svelte
- packet_keys: nes:utility:2202cfff, nes:utility:72eb3ee5
- source_refs: src/lib/components/CaseOutcomePrediction.svelte, src/lib/components/LegalCorpusSearch.svelte
- tags: surface:neschrom97, surface:hyperrag, card:0011b1119716bfde, packet:nes:utility:2202cfff, source_ref:src/lib/components/CaseOutcomePrediction.svelte, feature:utility, directory:src/lib/components, card:0033039f346e5be4, packet:nes:utility:72eb3ee5, source_ref:src/lib/components/LegalCorpusSearch.svelte

### bits-ui — src/routes/(app)/demos/bits-ui

- count: 1
- feature_label: +page.svelte
- packet_keys: nes:bits-ui:d6068edc
- source_refs: src/routes/(app)/demos/bits-ui/+page.svelte
- tags: surface:neschrom97, surface:hyperrag, card:000daa8131cc5445, packet:nes:bits-ui:d6068edc, source_ref:src/routes/(app)/demos/bits-ui/+page.svelte, feature:bits-ui, directory:src/routes/(app)/demos/bits-ui

### feat:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/find/_server_ts — ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/find

- count: 1
- feature_label: +server.ts
- packet_keys: nes:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/find/_server_ts:e874a4bc
- source_refs: ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/find/+server.ts
- tags: surface:neschrom97, surface:hyperrag, card:002ba3e702fa3a8d, packet:nes:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/find/_server_ts:e874a4bc, source_ref:../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/find/+server.ts, feature:feat:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/find/_server_ts, directory:../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/find

### feat:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/benchmark/simd/llms_ — ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/benchmark/simd

- count: 1
- feature_label: LLMS.md
- packet_keys: nes:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/benchmark/simd/llms_:4b429e62
- source_refs: ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/benchmark/simd/LLMS.md
- tags: surface:neschrom97, surface:hyperrag, card:0014aa7f00261539, packet:nes:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/benchmark/simd/llms_:4b429e62, source_ref:../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/benchmark/simd/LLMS.md, feature:feat:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/benchmark/simd/llms_, directory:../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/benchmark/simd

### feat:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/optimize-memory/_ser — ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/optimize-memory

- count: 1
- feature_label: +server.ts
- packet_keys: nes:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/optimize-memory/_ser:63a9bb1f
- source_refs: ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/optimize-memory/+server.ts
- tags: surface:neschrom97, surface:hyperrag, card:001cd5a620f385ca, packet:nes:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/optimize-memory/_ser:63a9bb1f, source_ref:../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/optimize-memory/+server.ts, feature:feat:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/optimize-memory/_ser, directory:../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/optimize-memory

### feat:scripts/api-cleanup/reports/backup-2025-12-14t21-11-49-641z/yolo/llms_md — ../scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z/yolo

- count: 1
- feature_label: LLMS.md
- packet_keys: nes:scripts/api-cleanup/reports/backup-2025-12-14t21-11-49-641z/yolo/llms_md:60736998
- source_refs: ../scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z/yolo/LLMS.md
- tags: surface:neschrom97, surface:hyperrag, card:0036cdaebecec57b, packet:nes:scripts/api-cleanup/reports/backup-2025-12-14t21-11-49-641z/yolo/llms_md:60736998, source_ref:../scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z/yolo/LLMS.md, feature:feat:scripts/api-cleanup/reports/backup-2025-12-14t21-11-49-641z/yolo/llms_md, directory:../scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z/yolo

### feat:scripts/case_data/_cache/federal_employee_liability_be9c7168_json — ../scripts/case_data/_cache

- count: 1
- feature_label: federal_employee_liability_be9c7168.json
- packet_keys: nes:scripts/case_data/_cache/federal_employee_liability_be9c7168_json:68772ed9
- source_refs: ../scripts/case_data/_cache/federal_employee_liability_be9c7168.json
- tags: surface:neschrom97, surface:hyperrag, card:000dec1320dc083e, packet:nes:scripts/case_data/_cache/federal_employee_liability_be9c7168_json:68772ed9, source_ref:../scripts/case_data/_cache/federal_employee_liability_be9c7168.json, feature:feat:scripts/case_data/_cache/federal_employee_liability_be9c7168_json, directory:../scripts/case_data/_cache

### feat:scripts/tests/test-phoenix-prosecutor_mjs — ../scripts/tests

- count: 1
- feature_label: test-phoenix-prosecutor.mjs
- packet_keys: nes:scripts/tests/test-phoenix-prosecutor_mjs:4904b4d4
- source_refs: ../scripts/tests/test-phoenix-prosecutor.mjs
- tags: surface:neschrom97, surface:hyperrag, card:007a419e167b1986, packet:nes:scripts/tests/test-phoenix-prosecutor_mjs:4904b4d4, source_ref:../scripts/tests/test-phoenix-prosecutor.mjs, feature:feat:scripts/tests/test-phoenix-prosecutor_mjs, directory:../scripts/tests

### scripts — src/lib/components

- count: 1
- feature_label: types.ts
- packet_keys: nes:scripts:f9833631
- source_refs: src/lib/components/types.ts
- tags: surface:neschrom97, surface:hyperrag, card:00077aad3e4544dd, packet:nes:scripts:f9833631, source_ref:src/lib/components/types.ts, feature:scripts, directory:src/lib/components

## Ready Samples

- 00077aad3e4544dd: src/lib/components/types.ts -> scripts (nes:scripts:f9833631)
- 000daa8131cc5445: src/routes/(app)/demos/bits-ui/+page.svelte -> bits-ui (nes:bits-ui:d6068edc)
- 000dec1320dc083e: ../scripts/case_data/_cache/federal_employee_liability_be9c7168.json -> feat:scripts/case_data/_cache/federal_employee_liability_be9c7168_json (nes:scripts/case_data/_cache/federal_employee_liability_be9c7168_json:68772ed9)
- 0011b1119716bfde: src/lib/components/CaseOutcomePrediction.svelte -> utility (nes:utility:2202cfff)
- 0014aa7f00261539: ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/benchmark/simd/LLMS.md -> feat:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/benchmark/simd/llms_ (nes:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/benchmark/simd/llms_:4b429e62)
- 001cd5a620f385ca: ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/optimize-memory/+server.ts -> feat:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/optimize-memory/_ser (nes:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/optimize-memory/_ser:63a9bb1f)
- 002ba3e702fa3a8d: ../scripts/api-cleanup/reports/backup-2025-12-14T20-51-26-276Z/ai/find/+server.ts -> feat:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/find/_server_ts (nes:scripts/api-cleanup/reports/backup-2025-12-14t20-51-26-276z/ai/find/_server_ts:e874a4bc)
- 0033039f346e5be4: src/lib/components/LegalCorpusSearch.svelte -> utility (nes:utility:72eb3ee5)
- 0036cdaebecec57b: ../scripts/api-cleanup/reports/backup-2025-12-14T21-11-49-641Z/yolo/LLMS.md -> feat:scripts/api-cleanup/reports/backup-2025-12-14t21-11-49-641z/yolo/llms_md (nes:scripts/api-cleanup/reports/backup-2025-12-14t21-11-49-641z/yolo/llms_md:60736998)
- 007a419e167b1986: ../scripts/tests/test-phoenix-prosecutor.mjs -> feat:scripts/tests/test-phoenix-prosecutor_mjs (nes:scripts/tests/test-phoenix-prosecutor_mjs:4904b4d4)

## Join-Backfill Samples

- undefined: .venv/Lib/python3.9/site-packages/pip/_vendor/pygments/plugin.py -> n/a (No packet join in registry sample)
- undefined: .venv/Lib/python3.9/site-packages/pip/_vendor/rich/columns.py -> n/a (No packet join in registry sample)
- undefined: .venv/Lib/python3.9/site-packages/pip/_internal/req/req_set.py -> n/a (No packet join in registry sample)
- undefined: .venv/Lib/python3.9/site-packages/pip/_vendor/requests/api.py -> n/a (No packet join in registry sample)
- undefined: .venv/Lib/python3.9/site-packages/numpy/_core/tests/test_shape_base.py -> n/a (No packet join in registry sample)
- undefined: .venv/Lib/python3.9/site-packages/pip/_internal/commands/search.py -> n/a (No packet join in registry sample)
- undefined: .venv/Lib/python3.9/site-packages/numpy/f2py/tests/test_symbolic.py -> n/a (No packet join in registry sample)
- undefined: .venv/Lib/python3.9/site-packages/numpy/f2py/f2py2e.py -> n/a (No packet join in registry sample)
- undefined: .venv/Lib/python3.9/site-packages/pip/_internal/utils/datetime.py -> n/a (No packet join in registry sample)
- undefined: .venv/Lib/python3.9/site-packages/numpy/typing/tests/data/pass/ufuncs.py -> n/a (No packet join in registry sample)

## Next Repair Actions

- Patch Qdrant payloads for the ready-to-tag sample groups first.
- Backfill missing packet joins for unjoined registry samples before broad payload writes.
- Keep legal_documents separate from codebase_chunks_768.
- Treat feature_label as derived display metadata, not canonical identity.
