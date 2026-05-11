# Deep AST Audit

Generated: 2026-05-11T03:30:12.213Z
Graph files: 3820

## Summary

| Gate | Description | Count |
| :--- | :--- | ---: |
| D9 | Likely orphans (0 fanIn, no dynImport ref) | 174 |

---

## D9 — Likely orphans (0 fanIn, no dynImport ref)

> **D9 is a candidate queue, not a deletion list.**
>
> D9 no longer uses Graphify `fanIn` as a deletion signal. It uses `fanIn=0` only as a candidate source, then verifies candidates by scanning runtime imports, dynamic imports, type-only imports, and barrel re-exports. SvelteKit route entrypoints, hooks, service workers, type shims, generated declarations, stores, and barrels are excluded.
>
> Files listed here are likely unused, but still require `/audit-components` disposition before deletion or archive. Do not bulk-prune — let the skill classify the first 20-30, then archive in batches.

**174** findings (showing first 30)

- `src/lib/ai/base64-fp32-quantizer.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/client/db/loki-client.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/client/timeline-client.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/client-logging.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/admin/SummarizeButton.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/audio/AudioAnalysisView.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/chat/AudioUploadWidget.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/chat/ChatPromptBar.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/codebase/TagDeleteDialog.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/document/DocumentAnalysisView.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/evidence/EvidenceImageSearch.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/evidence/VlmTagModal.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/glyph/GlyphAtlasPanel.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/monitoring/CacheWarmUpControl.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/ui/ContextMenuSeparator.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/ui/gaming/constants/gaming-constants-minimal.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/ui/gaming/types/gaming-types-minimal.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/ui/IconContainer.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/ui/tooltip.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/ui/wrappers/bits/bits-overrides.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/components/video/VideoAnalysisView.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/config/pgvector-gpu-config.js:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/config/redis-config.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/data/route-groups-config.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/db/queries/route-health-archive.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/db/schema/gpuInferenceDemo.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/db/vite-error-schema.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/machines/AIAssistantMachineComponent.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/machines/audio-upload-machine.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `src/lib/machines/evidence-analysis-machine.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate

---

## Recommended Claude Code skills

Each skill is a multi-gate agentic pipeline that drills deeper than this AST audit. Run from Claude Code via `/<skill-name>`:

- /audit-components — verify 174 D9 orphan candidates with 8-gate test (G0 transitive-dep, G0.5 dynamic-import, G1-G8 disposition)
- /prune-codebase — full archive flow with G6 route reachability + reverse-dependency chain
- /deep-audit — full 47-gate sweep covering G1-G47 (compounds D1-D10 with infra, security, RL pipeline)
- /graphify — refresh codebase-graph.json + glyph_atlas + cluster_summaries; D9 false-positive count drops once new fanIn data lands

**Composition pattern**:
1. `/graphify` — refresh codebase-graph.json + cluster_summaries (~5 min)
2. `npm run audit:deep-ast` — refresh D1-D10 findings (~2s)
3. `/audit-components` (D9 candidates) — 8-gate disposition (wire/rewrite/archive/defer)
4. `/wire-modules` (D10 missing-import) — fix orphan call sites
5. `/deep-audit` — 47-gate sweep including this audit's output as Tier A baseline
