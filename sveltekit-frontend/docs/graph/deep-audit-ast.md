# Deep AST Audit

Generated: 2026-05-27T19:52:45.338Z
Graph files: 34743

## Summary

| Gate | Description | Count |
| :--- | :--- | ---: |
| D9 | Likely orphans (0 fanIn, no dynImport ref) | 12829 |

---

## D9 — Likely orphans (0 fanIn, no dynImport ref)

> **D9 is a candidate queue, not a deletion list.**
>
> D9 no longer uses Graphify `fanIn` as a deletion signal. It uses `fanIn=0` only as a candidate source, then verifies candidates by scanning runtime imports, dynamic imports, type-only imports, and barrel re-exports. SvelteKit route entrypoints, hooks, service workers, type shims, generated declarations, stores, and barrels are excluded.
>
> Files listed here are likely unused, but still require `/audit-components` disposition before deletion or archive. Do not bulk-prune — let the skill classify the first 20-30, then archive in batches.

**12829** findings (showing first 30)

- `$lib/utils/file-reader.ts:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.claude/hooks/posttooluse-audit.mjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.claude/hooks/pretooluse-deny.mjs:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/AdvancedRichTextEditor.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AgentOrchestrator.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIChatInput.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIChatInterface.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIChatMessage.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIProcessingDashboard.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/AIServiceStatus.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/ChatInterface.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/cognitive/NeuralPerformanceDashboard.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/CudaSearch.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/Enhanced3DLegalAIInterface.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedAIAssistant.simple.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedAIAssistant.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedContextualChat.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedMCPIntegration.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EnhancedVectorSearch.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/EvidenceTimelineCard.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/FindModal.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/GamingAIInterface.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/GPUStreamingChat.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/IntegratedAIChat.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/IntelligentWebAnalysisDemo.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/LegalAIPipelineDemo.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/LLMProviderSelector.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/MultiAgentAnalysisCard.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/MultiLLMOrchestrator.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate
- `.svelte-error-fixes-backup/sveltekit-frontend/src/lib/components/ai/NESTextureStreamer.svelte:1` — 0 refs across static/dynamic/type/barrel/path scans; classification=true-orphan-candidate

---

## Recommended Claude Code skills

Each skill is a multi-gate agentic pipeline that drills deeper than this AST audit. Run from Claude Code via `/<skill-name>`:

- /audit-components — verify 12829 D9 orphan candidates with 8-gate test (G0 transitive-dep, G0.5 dynamic-import, G1-G8 disposition)
- /prune-codebase — full archive flow with G6 route reachability + reverse-dependency chain
- /deep-audit — full 47-gate sweep covering G1-G47 (compounds D1-D10 with infra, security, RL pipeline)
- /graphify — refresh codebase-graph.json + glyph_atlas + cluster_summaries; D9 false-positive count drops once new fanIn data lands

**Composition pattern**:
1. `/graphify` — refresh codebase-graph.json + cluster_summaries (~5 min)
2. `npm run audit:deep-ast` — refresh D1-D10 findings (~2s)
3. `/audit-components` (D9 candidates) — 8-gate disposition (wire/rewrite/archive/defer)
4. `/wire-modules` (D10 missing-import) — fix orphan call sites
5. `/deep-audit` — 47-gate sweep including this audit's output as Tier A baseline
