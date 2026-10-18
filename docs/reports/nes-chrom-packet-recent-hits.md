# NES/CHROM Packet Recent Hits & `task_semantic_packets` Live Schema Report

- **Generated At**: `2026-10-17T17:12:04.445Z`
- **Read-Only Transaction**: `ROLLED_BACK`
- **Writes Performed**: `false`
- **Live API Endpoint**: `GET /api/atlas/nes-chrom?sourceRef=...&featureId=...&queryHash=...`
- **CLI Query Script**: `node scripts/atlas/query-nes-chrom-recent-hits-v1.mjs`

## 1. NES/CHROM Packet & Recent Hits Summary

| Metric | Value |
|---|---|
| Matched Packets | 100 / 100 |
| Matched KAG/DAG Hits | 0 |
| `source_ref` Coverage | 100.0% |
| `feature_id` Coverage | 100.0% |
| `query_hash` Coverage | 100.0% |
| `chunk_id` Coverage | 100.0% |

### Top `source_ref` Entries

| `source_ref` | Count |
|---|---|
| `src/lib/components/shells/AGENTS.md` | 1 |
| `src/lib/components/shells/BridgeActions.svelte` | 1 |
| `src/lib/components/shells/index.ts` | 1 |
| `src/lib/components/shells/InvestigationShell.svelte` | 1 |
| `src/lib/components/shells/ResearchShell.svelte` | 1 |
| `src/lib/components/source-validation/AGENTS.md` | 1 |
| `src/lib/components/source-validation/AnswerGenerator.svelte` | 1 |
| `src/lib/components/source-validation/CitationInspector.svelte` | 1 |
| `src/lib/components/source-validation/ProvenanceGraph.svelte` | 1 |
| `src/lib/components/source-validation/SourceValidator.svelte` | 1 |

### Top `feature_id` Entries

| `feature_id` | Count |
|---|---|
| `AGENTS` | 11 |
| `index` | 6 |
| `sveltekit-frontend.Badge` | 2 |
| `sveltekit-frontend.Button` | 2 |
| `sveltekit-frontend.Card` | 2 |
| `sveltekit-frontend.CardDescription` | 2 |
| `sveltekit-frontend.CardFooter` | 2 |
| `sveltekit-frontend.CardHeader` | 2 |
| `AccessibilityPanel` | 1 |
| `AIDropdown` | 1 |

## 2. Live `task_semantic_packets` Schema Reconciliation

- **Total Live Columns**: `39`
- **`alias_id` Column**: `character varying (nullable=NO)`
- **`feature_id` Column**: `character varying (nullable=NO)`
- **`source_ref` Column**: `character varying (nullable=NO)`
- **Live Rows**: `2` (with `feature_id`: `2`, with `source_ref`: `2`, with `alias_id`: `2`)
