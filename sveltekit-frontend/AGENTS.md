# AGENTS.md — `sveltekit-frontend/` (LLM directory wiki)

<!-- AGENTS-GEN v1 · do not edit below this line -->
<!-- generated: 2026-05-13T22:18:48.377Z · agents.md spec · regen: npm run agents:write -->

> SvelteKit 2 + Svelte 5 (runes) + bits-ui v2 + UnoCSS + Drizzle + pgvector + Qdrant + Redis + Ollama + LibTorch GPU.
> Per-directory AGENTS.md files are scattered throughout `src/` — agents walk UP from any file to the nearest one. **This file is the directory index** so agents (and humans) can quickly jump to a dir's KAG slug or fire the right tool call.

## Pipeline at a glance

| Stage | Command | Output |
|-------|---------|--------|
| 1. Fast AST | `npm run index:codebase:fast` | `docs/graph/codebase-graph.json` + Redis `code:index:*` + `wiki:note:dir:*` |
| 2. Semantic | `npm run codebase:index` | Qdrant `codebase_chunks_768` (~32k 768-dim vectors) |
| 3. Topology | `npm run graphify:topology` | k-means K=100 + Qdrant `som_cluster` tags + `hypergraph-clusters.json` digest |
| 4. Wiki | `npm run agents:write` | This file + ~250 per-dir AGENTS.md |
| All | `npm run graphify:full` | Stages 1-4 + smoke (10/10 pillars green) |

## Agentic tool surface (Gemma4)

These tools are wired in-process in [`src/lib/server/ai/gemma4-agent.ts`](./src/lib/server/ai/gemma4-agent.ts):

- `agents_md({ path })` — fetch the per-dir AGENTS.md for any path (this map's primary consumer)
- `graph_search({ query, topK })` — file/tag lookup via codebase-graph.json
- `wiki_note_lookup({ query, limit })` — Redis `wiki:note:dir:dir:<slug>` KAG narratives
- `audit_hotspots({ limit })` — bottom-N audit-score directories
- `read_file({ filePath })` — sandboxed src/ file fetch
- `verify_fix({ filePath })` — single-file svelte-check
- `rag_search({ query, collection, topK })` — Qdrant hybrid search
- `memory_recall({ query, topK })` — top hyperedge memory modules
- `hyperedge_stats({ minGrade, limit })` — top quality clusters

## Audit gates (this run)

| Gate | Status |
|------|--------|
| G4  Auth on API routes | 774✅ / 0❌ |
| G5  Zod on body-parsing routes | 537✅ / 0❌ |
| G15 SSR-unsafe globals | 0❌ |
| G16 Routes without tests | 3❌ |
| G20 Cyclic import pairs | 0 |

Refresh with `npm run index:codebase:fast && npm run agents:write`.

## Directory tree map

### `src/lib/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib` | 11 | — | — | `src_lib` | `agents_md({ path: "src/lib" })` |

### `src/lib/ai/` (3 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/ai` | 15 | — | — | `src_lib_ai` | `agents_md({ path: "src/lib/ai" })` |
| `src/lib/ai/e2b` | 2 | — | — | `src_lib_ai_e2b` | `agents_md({ path: "src/lib/ai/e2b" })` |
| `src/lib/ai/onnx` | 2 | — | — | `src_lib_ai_onnx` | `agents_md({ path: "src/lib/ai/onnx" })` |

### `src/lib/cache/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/cache` | 5 | — | — | `src_lib_cache` | `agents_md({ path: "src/lib/cache" })` |

### `src/lib/client/` (3 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/client` | 6 | — | — | `src_lib_client` | `agents_md({ path: "src/lib/client" })` |
| `src/lib/client/ui` | 2 | — | — | `src_lib_client_ui` | `agents_md({ path: "src/lib/client/ui" })` |

### `src/lib/collaboration/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|

### `src/lib/components/` (95 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/components` | 56 | — | — | `src_lib_components` | `agents_md({ path: "src/lib/components" })` |
| `src/lib/components/admin` | 11 | — | — | `src_lib_components_admin` | `agents_md({ path: "src/lib/components/admin" })` |
| `src/lib/components/agentic` | 2 | — | — | `src_lib_components_agentic` | `agents_md({ path: "src/lib/components/agentic" })` |
| `src/lib/components/ai` | 45 | — | — | `src_lib_components_ai` | `agents_md({ path: "src/lib/components/ai" })` |
| `src/lib/components/analysis` | 3 | — | — | `src_lib_components_analysis` | `agents_md({ path: "src/lib/components/analysis" })` |
| `src/lib/components/analytics` | 2 | — | — | `src_lib_components_analytics` | `agents_md({ path: "src/lib/components/analytics" })` |
| `src/lib/components/cache` | 3 | — | — | `src_lib_components_cache` | `agents_md({ path: "src/lib/components/cache" })` |
| `src/lib/components/canvas` | 5 | — | — | `src_lib_components_canvas` | `agents_md({ path: "src/lib/components/canvas" })` |
| `src/lib/components/case` | 3 | — | — | `src_lib_components_case` | `agents_md({ path: "src/lib/components/case" })` |
| `src/lib/components/cases` | 11 | — | — | `src_lib_components_cases` | `agents_md({ path: "src/lib/components/cases" })` |
| `src/lib/components/chat` | 4 | — | — | `src_lib_components_chat` | `agents_md({ path: "src/lib/components/chat" })` |
| `src/lib/components/citations` | 5 | — | — | `src_lib_components_citations` | `agents_md({ path: "src/lib/components/citations" })` |
| `src/lib/components/codebase` | 12 | — | — | `src_lib_components_codebase` | `agents_md({ path: "src/lib/components/codebase" })` |
| `src/lib/components/courtroom` | 2 | — | — | `src_lib_components_courtroom` | `agents_md({ path: "src/lib/components/courtroom" })` |
| `src/lib/components/dashboard` | 15 | — | — | `src_lib_components_dashboard` | `agents_md({ path: "src/lib/components/dashboard" })` |
| `src/lib/components/detective` | 6 | — | — | `src_lib_components_detective` | `agents_md({ path: "src/lib/components/detective" })` |
| `src/lib/components/editor` | 7 | — | — | `src_lib_components_editor` | `agents_md({ path: "src/lib/components/editor" })` |
| `src/lib/components/evidence` | 44 | — | — | `src_lib_components_evidence` | `agents_md({ path: "src/lib/components/evidence" })` |
| `src/lib/components/forms` | 7 | — | — | `src_lib_components_forms` | `agents_md({ path: "src/lib/components/forms" })` |
| `src/lib/components/graph` | 3 | — | — | `src_lib_components_graph` | `agents_md({ path: "src/lib/components/graph" })` |
| `src/lib/components/legal` | 33 | — | — | `src_lib_components_legal` | `agents_md({ path: "src/lib/components/legal" })` |
| `src/lib/components/legal-ai` | 18 | — | — | `src_lib_components_legal_ai` | `agents_md({ path: "src/lib/components/legal-ai" })` |
| `src/lib/components/legal-corpus` | 8 | — | — | `src_lib_components_legal_corpus` | `agents_md({ path: "src/lib/components/legal-corpus" })` |
| `src/lib/components/modals` | 2 | — | — | `src_lib_components_modals` | `agents_md({ path: "src/lib/components/modals" })` |
| `src/lib/components/monitoring` | 3 | — | — | `src_lib_components_monitoring` | `agents_md({ path: "src/lib/components/monitoring" })` |
| `src/lib/components/phase78` | 3 | — | — | `src_lib_components_phase78` | `agents_md({ path: "src/lib/components/phase78" })` |
| `src/lib/components/poi` | 10 | — | — | `src_lib_components_poi` | `agents_md({ path: "src/lib/components/poi" })` |
| `src/lib/components/rag` | 4 | — | — | `src_lib_components_rag` | `agents_md({ path: "src/lib/components/rag" })` |
| `src/lib/components/recommendations` | 2 | — | — | `src_lib_components_recommendations` | `agents_md({ path: "src/lib/components/recommendations" })` |
| `src/lib/components/shells` | 4 | — | — | `src_lib_components_shells` | `agents_md({ path: "src/lib/components/shells" })` |
| `src/lib/components/source-validation` | 4 | — | — | `src_lib_components_source_validation` | `agents_md({ path: "src/lib/components/source-validation" })` |
| `src/lib/components/ui` | 89 | — | — | `src_lib_components_ui` | `agents_md({ path: "src/lib/components/ui" })` |
| `src/lib/components/ui/alert-dialog` | 14 | — | — | `src_lib_components_ui_alert_dialog` | `agents_md({ path: "src/lib/components/ui/alert-dialog" })` |
| `src/lib/components/ui/avatar` | 5 | — | — | `src_lib_components_ui_avatar` | `agents_md({ path: "src/lib/components/ui/avatar" })` |
| `src/lib/components/ui/badge` | 3 | — | — | `src_lib_components_ui_badge` | `agents_md({ path: "src/lib/components/ui/badge" })` |
| `src/lib/components/ui/bits` | 5 | — | — | `src_lib_components_ui_bits` | `agents_md({ path: "src/lib/components/ui/bits" })` |
| `src/lib/components/ui/button` | 2 | — | — | `src_lib_components_ui_button` | `agents_md({ path: "src/lib/components/ui/button" })` |
| `src/lib/components/ui/card` | 8 | — | — | `src_lib_components_ui_card` | `agents_md({ path: "src/lib/components/ui/card" })` |
| `src/lib/components/ui/core` | 2 | — | — | `src_lib_components_ui_core` | `agents_md({ path: "src/lib/components/ui/core" })` |
| `src/lib/components/ui/dialog` | 13 | — | — | `src_lib_components_ui_dialog` | `agents_md({ path: "src/lib/components/ui/dialog" })` |
| `src/lib/components/ui/enhanced-bits` | 2 | — | — | `src_lib_components_ui_enhanced_bits` | `agents_md({ path: "src/lib/components/ui/enhanced-bits" })` |
| `src/lib/components/ui/gaming/8bit` | 2 | — | — | `src_lib_components_ui_gaming_8bit` | `agents_md({ path: "src/lib/components/ui/gaming/8bit" })` |
| `src/lib/components/ui/gaming/constants` | 2 | — | — | `src_lib_components_ui_gaming_constants` | `agents_md({ path: "src/lib/components/ui/gaming/constants" })` |
| `src/lib/components/ui/gaming/core` | 3 | — | — | `src_lib_components_ui_gaming_core` | `agents_md({ path: "src/lib/components/ui/gaming/core" })` |
| `src/lib/components/ui/gaming/effects` | 4 | — | — | `src_lib_components_ui_gaming_effects` | `agents_md({ path: "src/lib/components/ui/gaming/effects" })` |
| `src/lib/components/ui/gaming/n64` | 35 | — | — | `src_lib_components_ui_gaming_n64` | `agents_md({ path: "src/lib/components/ui/gaming/n64" })` |
| `src/lib/components/ui/gaming/types` | 2 | — | — | `src_lib_components_ui_gaming_types` | `agents_md({ path: "src/lib/components/ui/gaming/types" })` |
| `src/lib/components/ui/input` | 4 | — | — | `src_lib_components_ui_input` | `agents_md({ path: "src/lib/components/ui/input" })` |
| `src/lib/components/ui/label` | 3 | — | — | `src_lib_components_ui_label` | `agents_md({ path: "src/lib/components/ui/label" })` |
| `src/lib/components/ui/modal` | 2 | — | — | `src_lib_components_ui_modal` | `agents_md({ path: "src/lib/components/ui/modal" })` |
| `src/lib/components/ui/modular` | 2 | — | — | `src_lib_components_ui_modular` | `agents_md({ path: "src/lib/components/ui/modular" })` |
| `src/lib/components/ui/progress` | 5 | — | — | `src_lib_components_ui_progress` | `agents_md({ path: "src/lib/components/ui/progress" })` |
| `src/lib/components/ui/scrollarea` | 2 | — | — | `src_lib_components_ui_scrollarea` | `agents_md({ path: "src/lib/components/ui/scrollarea" })` |
| `src/lib/components/ui/select` | 5 | — | — | `src_lib_components_ui_select` | `agents_md({ path: "src/lib/components/ui/select" })` |
| `src/lib/components/ui/table` | 8 | — | — | `src_lib_components_ui_table` | `agents_md({ path: "src/lib/components/ui/table" })` |
| `src/lib/components/ui/tabs` | 9 | — | — | `src_lib_components_ui_tabs` | `agents_md({ path: "src/lib/components/ui/tabs" })` |
| `src/lib/components/ui/textarea` | 2 | — | — | `src_lib_components_ui_textarea` | `agents_md({ path: "src/lib/components/ui/textarea" })` |
| `src/lib/components/webgpu` | 2 | — | — | `src_lib_components_webgpu` | `agents_md({ path: "src/lib/components/webgpu" })` |
| `src/lib/components/yorha` | 21 | — | — | `src_lib_components_yorha` | `agents_md({ path: "src/lib/components/yorha" })` |
| `src/lib/components/yorha/_simulations` | 6 | — | — | `src_lib_components_yorha__simulations` | `agents_md({ path: "src/lib/components/yorha/_simulations" })` |
| `src/lib/components/yorha/cases` | 3 | — | — | `src_lib_components_yorha_cases` | `agents_md({ path: "src/lib/components/yorha/cases" })` |
| `src/lib/components/yorha/dashboard` | 5 | — | — | `src_lib_components_yorha_dashboard` | `agents_md({ path: "src/lib/components/yorha/dashboard" })` |
| `src/lib/components/yorha/evidence` | 4 | — | — | `src_lib_components_yorha_evidence` | `agents_md({ path: "src/lib/components/yorha/evidence" })` |

### `src/lib/config/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/config` | 8 | — | — | `src_lib_config` | `agents_md({ path: "src/lib/config" })` |

### `src/lib/courtroom/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/courtroom` | 4 | — | — | `src_lib_courtroom` | `agents_md({ path: "src/lib/courtroom" })` |

### `src/lib/data/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/data` | 5 | — | — | `src_lib_data` | `agents_md({ path: "src/lib/data" })` |

### `src/lib/db/` (3 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/db` | 4 | — | — | `src_lib_db` | `agents_md({ path: "src/lib/db" })` |
| `src/lib/db/queries` | 2 | — | — | `src_lib_db_queries` | `agents_md({ path: "src/lib/db/queries" })` |
| `src/lib/db/schema` | 6 | — | — | `src_lib_db_schema` | `agents_md({ path: "src/lib/db/schema" })` |

### `src/lib/env/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/env` | 2 | — | — | `src_lib_env` | `agents_md({ path: "src/lib/env" })` |

### `src/lib/features/` (2 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/features/evidence-command-center` | 5 | — | — | `src_lib_features_evidence_command_center` | `agents_md({ path: "src/lib/features/evidence-command-center" })` |

### `src/lib/gpu/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/gpu` | 17 | — | — | `src_lib_gpu` | `agents_md({ path: "src/lib/gpu" })` |

### `src/lib/graph/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|

### `src/lib/icons/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/icons/yorha` | 15 | — | — | `src_lib_icons_yorha` | `agents_md({ path: "src/lib/icons/yorha" })` |

### `src/lib/intent/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|

### `src/lib/machines/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/machines` | 11 | — | — | `src_lib_machines` | `agents_md({ path: "src/lib/machines" })` |

### `src/lib/messaging/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|

### `src/lib/models/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|

### `src/lib/phase72/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|

### `src/lib/schemas/` (2 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/schemas` | 5 | — | — | `src_lib_schemas` | `agents_md({ path: "src/lib/schemas" })` |
| `src/lib/schemas/tools` | 8 | — | — | `src_lib_schemas_tools` | `agents_md({ path: "src/lib/schemas/tools" })` |

### `src/lib/server/` (125 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/server` | 63 | — | — | `src_lib_server` | `agents_md({ path: "src/lib/server" })` |
| `src/lib/server/ace` | 41 | — | — | `src_lib_server_ace` | `agents_md({ path: "src/lib/server/ace" })` |
| `src/lib/server/admin` | 8 | — | — | `src_lib_server_admin` | `agents_md({ path: "src/lib/server/admin" })` |
| `src/lib/server/agent` | 3 | — | — | `src_lib_server_agent` | `agents_md({ path: "src/lib/server/agent" })` |
| `src/lib/server/agent/tools` | 7 | — | — | `src_lib_server_agent_tools` | `agents_md({ path: "src/lib/server/agent/tools" })` |
| `src/lib/server/agents` | 6 | — | — | `src_lib_server_agents` | `agents_md({ path: "src/lib/server/agents" })` |
| `src/lib/server/agents-md` | 3 | — | — | `src_lib_server_agents_md` | `agents_md({ path: "src/lib/server/agents-md" })` |
| `src/lib/server/agents/regen` | 3 | — | — | `src_lib_server_agents_regen` | `agents_md({ path: "src/lib/server/agents/regen" })` |
| `src/lib/server/agents/regen/loaders` | 10 | — | — | `src_lib_server_agents_regen_loaders` | `agents_md({ path: "src/lib/server/agents/regen/loaders" })` |
| `src/lib/server/agents/regen/writers` | 3 | — | — | `src_lib_server_agents_regen_writers` | `agents_md({ path: "src/lib/server/agents/regen/writers" })` |
| `src/lib/server/ai` | 61 | — | — | `src_lib_server_ai` | `agents_md({ path: "src/lib/server/ai" })` |
| `src/lib/server/ai/hermes` | 3 | — | — | `src_lib_server_ai_hermes` | `agents_md({ path: "src/lib/server/ai/hermes" })` |
| `src/lib/server/ai/hermes/skills` | 14 | — | — | `src_lib_server_ai_hermes_skills` | `agents_md({ path: "src/lib/server/ai/hermes/skills" })` |
| `src/lib/server/ai/hermes/tools` | 2 | — | — | `src_lib_server_ai_hermes_tools` | `agents_md({ path: "src/lib/server/ai/hermes/tools" })` |
| `src/lib/server/analysis` | 14 | — | — | `src_lib_server_analysis` | `agents_md({ path: "src/lib/server/analysis" })` |
| `src/lib/server/analytics` | 15 | — | — | `src_lib_server_analytics` | `agents_md({ path: "src/lib/server/analytics" })` |
| `src/lib/server/atlas` | 4 | — | — | `src_lib_server_atlas` | `agents_md({ path: "src/lib/server/atlas" })` |
| `src/lib/server/audit` | 4 | — | — | `src_lib_server_audit` | `agents_md({ path: "src/lib/server/audit" })` |
| `src/lib/server/cache` | 14 | — | — | `src_lib_server_cache` | `agents_md({ path: "src/lib/server/cache" })` |
| `src/lib/server/cartridge` | 5 | — | — | `src_lib_server_cartridge` | `agents_md({ path: "src/lib/server/cartridge" })` |
| `src/lib/server/chrrom` | 3 | — | — | `src_lib_server_chrrom` | `agents_md({ path: "src/lib/server/chrrom" })` |
| `src/lib/server/concurrency` | 3 | — | — | `src_lib_server_concurrency` | `agents_md({ path: "src/lib/server/concurrency" })` |
| `src/lib/server/config` | 6 | — | — | `src_lib_server_config` | `agents_md({ path: "src/lib/server/config" })` |
| `src/lib/server/couchdb` | 3 | — | — | `src_lib_server_couchdb` | `agents_md({ path: "src/lib/server/couchdb" })` |
| `src/lib/server/data` | 2 | — | — | `src_lib_server_data` | `agents_md({ path: "src/lib/server/data" })` |
| `src/lib/server/db` | 72 | — | — | `src_lib_server_db` | `agents_md({ path: "src/lib/server/db" })` |
| `src/lib/server/db/meta` | 2 | — | — | `src_lib_server_db_meta` | `agents_md({ path: "src/lib/server/db/meta" })` |
| `src/lib/server/db/schema` | 47 | — | — | `src_lib_server_db_schema` | `agents_md({ path: "src/lib/server/db/schema" })` |
| `src/lib/server/embedding` | 8 | — | — | `src_lib_server_embedding` | `agents_md({ path: "src/lib/server/embedding" })` |
| `src/lib/server/error-brain` | 5 | — | — | `src_lib_server_error_brain` | `agents_md({ path: "src/lib/server/error-brain" })` |
| `src/lib/server/error-brain/transport` | 6 | — | — | `src_lib_server_error_brain_transport` | `agents_md({ path: "src/lib/server/error-brain/transport" })` |
| `src/lib/server/evidence` | 10 | — | — | `src_lib_server_evidence` | `agents_md({ path: "src/lib/server/evidence" })` |
| `src/lib/server/evidence/services` | 5 | — | — | `src_lib_server_evidence_services` | `agents_md({ path: "src/lib/server/evidence/services" })` |
| `src/lib/server/features` | 8 | — | — | `src_lib_server_features` | `agents_md({ path: "src/lib/server/features" })` |
| `src/lib/server/ff1` | 2 | — | — | `src_lib_server_ff1` | `agents_md({ path: "src/lib/server/ff1" })` |
| `src/lib/server/ff1/agent` | 2 | — | — | `src_lib_server_ff1_agent` | `agents_md({ path: "src/lib/server/ff1/agent" })` |
| `src/lib/server/ff1/cli` | 2 | — | — | `src_lib_server_ff1_cli` | `agents_md({ path: "src/lib/server/ff1/cli" })` |
| `src/lib/server/glyph` | 2 | — | — | `src_lib_server_glyph` | `agents_md({ path: "src/lib/server/glyph" })` |
| `src/lib/server/gpu` | 17 | — | — | `src_lib_server_gpu` | `agents_md({ path: "src/lib/server/gpu" })` |
| `src/lib/server/graph` | 23 | — | — | `src_lib_server_graph` | `agents_md({ path: "src/lib/server/graph" })` |
| `src/lib/server/grpc` | 10 | — | — | `src_lib_server_grpc` | `agents_md({ path: "src/lib/server/grpc" })` |
| `src/lib/server/helpers` | 2 | — | — | `src_lib_server_helpers` | `agents_md({ path: "src/lib/server/helpers" })` |
| `src/lib/server/hypergraph` | 5 | — | — | `src_lib_server_hypergraph` | `agents_md({ path: "src/lib/server/hypergraph" })` |
| `src/lib/server/indexer` | 22 | — | — | `src_lib_server_indexer` | `agents_md({ path: "src/lib/server/indexer" })` |
| `src/lib/server/indexer/pipeline` | 3 | — | — | `src_lib_server_indexer_pipeline` | `agents_md({ path: "src/lib/server/indexer/pipeline" })` |
| `src/lib/server/inference` | 4 | — | — | `src_lib_server_inference` | `agents_md({ path: "src/lib/server/inference" })` |
| `src/lib/server/kb` | 9 | — | — | `src_lib_server_kb` | `agents_md({ path: "src/lib/server/kb" })` |
| `src/lib/server/langextract` | 3 | — | — | `src_lib_server_langextract` | `agents_md({ path: "src/lib/server/langextract" })` |
| `src/lib/server/legal` | 9 | — | — | `src_lib_server_legal` | `agents_md({ path: "src/lib/server/legal" })` |
| `src/lib/server/llm` | 6 | — | — | `src_lib_server_llm` | `agents_md({ path: "src/lib/server/llm" })` |
| `src/lib/server/mcp` | 5 | — | — | `src_lib_server_mcp` | `agents_md({ path: "src/lib/server/mcp" })` |
| `src/lib/server/middleware` | 4 | — | — | `src_lib_server_middleware` | `agents_md({ path: "src/lib/server/middleware" })` |
| `src/lib/server/minio` | 2 | — | — | `src_lib_server_minio` | `agents_md({ path: "src/lib/server/minio" })` |
| `src/lib/server/ml` | 8 | — | — | `src_lib_server_ml` | `agents_md({ path: "src/lib/server/ml" })` |
| `src/lib/server/observability` | 3 | — | — | `src_lib_server_observability` | `agents_md({ path: "src/lib/server/observability" })` |
| `src/lib/server/obsidian` | 2 | — | — | `src_lib_server_obsidian` | `agents_md({ path: "src/lib/server/obsidian" })` |
| `src/lib/server/ocr` | 3 | — | — | `src_lib_server_ocr` | `agents_md({ path: "src/lib/server/ocr" })` |
| `src/lib/server/pdf` | 2 | — | — | `src_lib_server_pdf` | `agents_md({ path: "src/lib/server/pdf" })` |
| `src/lib/server/pgai` | 3 | — | — | `src_lib_server_pgai` | `agents_md({ path: "src/lib/server/pgai" })` |
| `src/lib/server/phase72` | 3 | — | — | `src_lib_server_phase72` | `agents_md({ path: "src/lib/server/phase72" })` |
| `src/lib/server/queue` | 8 | — | — | `src_lib_server_queue` | `agents_md({ path: "src/lib/server/queue" })` |
| `src/lib/server/rag` | 7 | — | — | `src_lib_server_rag` | `agents_md({ path: "src/lib/server/rag" })` |
| `src/lib/server/rate-limit` | 2 | — | — | `src_lib_server_rate_limit` | `agents_md({ path: "src/lib/server/rate-limit" })` |
| `src/lib/server/reconstruction` | 5 | — | — | `src_lib_server_reconstruction` | `agents_md({ path: "src/lib/server/reconstruction" })` |
| `src/lib/server/research` | 16 | — | — | `src_lib_server_research` | `agents_md({ path: "src/lib/server/research" })` |
| `src/lib/server/retrieval` | 37 | — | — | `src_lib_server_retrieval` | `agents_md({ path: "src/lib/server/retrieval" })` |
| `src/lib/server/rg-atlas` | 9 | — | — | `src_lib_server_rg_atlas` | `agents_md({ path: "src/lib/server/rg-atlas" })` |
| `src/lib/server/search` | 13 | — | — | `src_lib_server_search` | `agents_md({ path: "src/lib/server/search" })` |
| `src/lib/server/services` | 5 | — | — | `src_lib_server_services` | `agents_md({ path: "src/lib/server/services" })` |
| `src/lib/server/services/error-analysis` | 17 | — | — | `src_lib_server_services_error_analysis` | `agents_md({ path: "src/lib/server/services/error-analysis" })` |
| `src/lib/server/services/knowledge-search` | 11 | — | — | `src_lib_server_services_knowledge_search` | `agents_md({ path: "src/lib/server/services/knowledge-search" })` |
| `src/lib/server/simulation` | 2 | — | — | `src_lib_server_simulation` | `agents_md({ path: "src/lib/server/simulation" })` |
| `src/lib/server/streaming` | 2 | — | — | `src_lib_server_streaming` | `agents_md({ path: "src/lib/server/streaming" })` |
| `src/lib/server/tensor` | 2 | — | — | `src_lib_server_tensor` | `agents_md({ path: "src/lib/server/tensor" })` |
| `src/lib/server/tools/handlers` | 8 | — | — | `src_lib_server_tools_handlers` | `agents_md({ path: "src/lib/server/tools/handlers" })` |
| `src/lib/server/types` | 11 | — | — | `src_lib_server_types` | `agents_md({ path: "src/lib/server/types" })` |
| `src/lib/server/utils` | 13 | — | — | `src_lib_server_utils` | `agents_md({ path: "src/lib/server/utils" })` |
| `src/lib/server/validation` | 2 | — | — | `src_lib_server_validation` | `agents_md({ path: "src/lib/server/validation" })` |
| `src/lib/server/vector` | 14 | — | — | `src_lib_server_vector` | `agents_md({ path: "src/lib/server/vector" })` |
| `src/lib/server/wiki` | 9 | — | — | `src_lib_server_wiki` | `agents_md({ path: "src/lib/server/wiki" })` |
| `src/lib/server/workers` | 5 | — | — | `src_lib_server_workers` | `agents_md({ path: "src/lib/server/workers" })` |

### `src/lib/services/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/services` | 5 | — | — | `src_lib_services` | `agents_md({ path: "src/lib/services" })` |

### `src/lib/shared/` (3 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/shared` | 3 | — | — | `src_lib_shared` | `agents_md({ path: "src/lib/shared" })` |

### `src/lib/shims/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/shims` | 11 | — | — | `src_lib_shims` | `agents_md({ path: "src/lib/shims" })` |

### `src/lib/stores/` (3 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/stores` | 17 | — | — | `src_lib_stores` | `agents_md({ path: "src/lib/stores" })` |
| `src/lib/stores/dashboard` | 3 | — | — | `src_lib_stores_dashboard` | `agents_md({ path: "src/lib/stores/dashboard" })` |
| `src/lib/stores/unified` | 7 | — | — | `src_lib_stores_unified` | `agents_md({ path: "src/lib/stores/unified" })` |

### `src/lib/test-utils/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|

### `src/lib/types/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/types` | 53 | — | — | `src_lib_types` | `agents_md({ path: "src/lib/types" })` |

### `src/lib/utils/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/utils` | 44 | — | — | `src_lib_utils` | `agents_md({ path: "src/lib/utils" })` |

### `src/lib/webgpu/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/webgpu` | 20 | — | — | `src_lib_webgpu` | `agents_md({ path: "src/lib/webgpu" })` |

### `src/lib/workers/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/lib/workers` | 8 | — | — | `src_lib_workers` | `agents_md({ path: "src/lib/workers" })` |

### `src/mcp/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/mcp` | 14 | — | — | `src_mcp` | `agents_md({ path: "src/mcp" })` |

### `src/mcp/tools/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/mcp/tools` | 8 | — | — | `src_mcp_tools` | `agents_md({ path: "src/mcp/tools" })` |

### `src/mcp/zod-to-json-schema-bridge/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/mcp/zod-to-json-schema-bridge` | 2 | — | — | `src_mcp_zod_to_json_schema_bridge` | `agents_md({ path: "src/mcp/zod-to-json-schema-bridge" })` |

### `src/routes/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/routes` | 6 | — | — | `src_routes` | `agents_md({ path: "src/routes" })` |

### `src/routes/(admin)/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/routes/(admin)/error-brain/components` | 3 | — | — | `src_routes__admin__error_brain_components` | `agents_md({ path: "src/routes/(admin)/error-brain/components" })` |

### `src/routes/(analysis)/` (4 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/routes/(analysis)` | 2 | — | — | `src_routes__analysis_` | `agents_md({ path: "src/routes/(analysis)" })` |
| `src/routes/(analysis)/audio-analysis/[evidenceId]` | 2 | — | — | `src_routes__analysis__audio_analysis__evidenceId_` | `agents_md({ path: "src/routes/(analysis)/audio-analysis/[evidenceId]" })` |
| `src/routes/(analysis)/document-analysis/[evidenceId]` | 2 | — | — | `src_routes__analysis__document_analysis__evidenceId_` | `agents_md({ path: "src/routes/(analysis)/document-analysis/[evidenceId]" })` |
| `src/routes/(analysis)/video-analysis/[evidenceId]` | 2 | — | — | `src_routes__analysis__video_analysis__evidenceId_` | `agents_md({ path: "src/routes/(analysis)/video-analysis/[evidenceId]" })` |

### `src/routes/(analysis)@/` (4 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/routes/(analysis)@` | 2 | — | — | `src_routes__analysis__` | `agents_md({ path: "src/routes/(analysis)@" })` |
| `src/routes/(analysis)@/audio-analysis/[evidenceId]` | 2 | — | — | `src_routes__analysis___audio_analysis__evidenceId_` | `agents_md({ path: "src/routes/(analysis)@/audio-analysis/[evidenceId]" })` |
| `src/routes/(analysis)@/document-analysis/[evidenceId]` | 2 | — | — | `src_routes__analysis___document_analysis__evidenceId_` | `agents_md({ path: "src/routes/(analysis)@/document-analysis/[evidenceId]" })` |
| `src/routes/(analysis)@/video-analysis/[evidenceId]` | 2 | — | — | `src_routes__analysis___video_analysis__evidenceId_` | `agents_md({ path: "src/routes/(analysis)@/video-analysis/[evidenceId]" })` |

### `src/routes/(app)/` (214 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/routes/(app)` | 2 | — | — | `src_routes__app_` | `agents_md({ path: "src/routes/(app)" })` |
| `src/routes/(app)/active-cases` | 2 | — | — | `src_routes__app__active_cases` | `agents_md({ path: "src/routes/(app)/active-cases" })` |
| `src/routes/(app)/admin` | 2 | — | — | `src_routes__app__admin` | `agents_md({ path: "src/routes/(app)/admin" })` |
| `src/routes/(app)/admin/ai-dashboard` | 3 | — | — | `src_routes__app__admin_ai_dashboard` | `agents_md({ path: "src/routes/(app)/admin/ai-dashboard" })` |
| `src/routes/(app)/admin/ai-dashboard/lab` | 2 | — | — | `src_routes__app__admin_ai_dashboard_lab` | `agents_md({ path: "src/routes/(app)/admin/ai-dashboard/lab" })` |
| `src/routes/(app)/admin/ai-dashboard/operator` | 2 | — | — | `src_routes__app__admin_ai_dashboard_operator` | `agents_md({ path: "src/routes/(app)/admin/ai-dashboard/operator" })` |
| `src/routes/(app)/admin/all-routes` | 4 | — | — | `src_routes__app__admin_all_routes` | `agents_md({ path: "src/routes/(app)/admin/all-routes" })` |
| `src/routes/(app)/admin/ast-topology` | 3 | — | — | `src_routes__app__admin_ast_topology` | `agents_md({ path: "src/routes/(app)/admin/ast-topology" })` |
| `src/routes/(app)/admin/cache` | 3 | — | — | `src_routes__app__admin_cache` | `agents_md({ path: "src/routes/(app)/admin/cache" })` |
| `src/routes/(app)/admin/chat-memory` | 2 | — | — | `src_routes__app__admin_chat_memory` | `agents_md({ path: "src/routes/(app)/admin/chat-memory" })` |
| `src/routes/(app)/admin/codebase-index` | 3 | — | — | `src_routes__app__admin_codebase_index` | `agents_md({ path: "src/routes/(app)/admin/codebase-index" })` |
| `src/routes/(app)/admin/codebase-index/[fileId]` | 2 | — | — | `src_routes__app__admin_codebase_index__fileId_` | `agents_md({ path: "src/routes/(app)/admin/codebase-index/[fileId]" })` |
| `src/routes/(app)/admin/codebase-viewer` | 3 | — | — | `src_routes__app__admin_codebase_viewer` | `agents_md({ path: "src/routes/(app)/admin/codebase-viewer" })` |
| `src/routes/(app)/admin/component-analysis` | 2 | — | — | `src_routes__app__admin_component_analysis` | `agents_md({ path: "src/routes/(app)/admin/component-analysis" })` |
| `src/routes/(app)/admin/dev-tools` | 3 | — | — | `src_routes__app__admin_dev_tools` | `agents_md({ path: "src/routes/(app)/admin/dev-tools" })` |
| `src/routes/(app)/admin/dev-tools/component-showcase` | 2 | — | — | `src_routes__app__admin_dev_tools_component_showcase` | `agents_md({ path: "src/routes/(app)/admin/dev-tools/component-showcase" })` |
| `src/routes/(app)/admin/document-search` | 2 | — | — | `src_routes__app__admin_document_search` | `agents_md({ path: "src/routes/(app)/admin/document-search" })` |
| `src/routes/(app)/admin/error-analysis` | 2 | — | — | `src_routes__app__admin_error_analysis` | `agents_md({ path: "src/routes/(app)/admin/error-analysis" })` |
| `src/routes/(app)/admin/error-brain` | 4 | — | — | `src_routes__app__admin_error_brain` | `agents_md({ path: "src/routes/(app)/admin/error-brain" })` |
| `src/routes/(app)/admin/gpu-evidence-graph` | 3 | — | — | `src_routes__app__admin_gpu_evidence_graph` | `agents_md({ path: "src/routes/(app)/admin/gpu-evidence-graph" })` |
| `src/routes/(app)/admin/kag-notebook` | 2 | — | — | `src_routes__app__admin_kag_notebook` | `agents_md({ path: "src/routes/(app)/admin/kag-notebook" })` |
| `src/routes/(app)/admin/knowledge-base` | 2 | — | — | `src_routes__app__admin_knowledge_base` | `agents_md({ path: "src/routes/(app)/admin/knowledge-base" })` |
| `src/routes/(app)/admin/knowledge-search` | 2 | — | — | `src_routes__app__admin_knowledge_search` | `agents_md({ path: "src/routes/(app)/admin/knowledge-search" })` |
| `src/routes/(app)/admin/library` | 2 | — | — | `src_routes__app__admin_library` | `agents_md({ path: "src/routes/(app)/admin/library" })` |
| `src/routes/(app)/admin/memory-inspector` | 2 | — | — | `src_routes__app__admin_memory_inspector` | `agents_md({ path: "src/routes/(app)/admin/memory-inspector" })` |
| `src/routes/(app)/admin/phase78/monitor` | 2 | — | — | `src_routes__app__admin_phase78_monitor` | `agents_md({ path: "src/routes/(app)/admin/phase78/monitor" })` |
| `src/routes/(app)/admin/phase78/routes/[routePath]` | 2 | — | — | `src_routes__app__admin_phase78_routes__routePath_` | `agents_md({ path: "src/routes/(app)/admin/phase78/routes/[routePath]" })` |
| `src/routes/(app)/admin/phase89` | 2 | — | — | `src_routes__app__admin_phase89` | `agents_md({ path: "src/routes/(app)/admin/phase89" })` |
| `src/routes/(app)/admin/qlora-training` | 2 | — | — | `src_routes__app__admin_qlora_training` | `agents_md({ path: "src/routes/(app)/admin/qlora-training" })` |
| `src/routes/(app)/admin/search-intelligence` | 3 | — | — | `src_routes__app__admin_search_intelligence` | `agents_md({ path: "src/routes/(app)/admin/search-intelligence" })` |
| `src/routes/(app)/admin/unified-indexing-studio` | 2 | — | — | `src_routes__app__admin_unified_indexing_studio` | `agents_md({ path: "src/routes/(app)/admin/unified-indexing-studio" })` |
| `src/routes/(app)/analysis-center` | 5 | — | — | `src_routes__app__analysis_center` | `agents_md({ path: "src/routes/(app)/analysis-center" })` |
| `src/routes/(app)/analytics` | 2 | — | — | `src_routes__app__analytics` | `agents_md({ path: "src/routes/(app)/analytics" })` |
| `src/routes/(app)/cases` | 4 | — | — | `src_routes__app__cases` | `agents_md({ path: "src/routes/(app)/cases" })` |
| `src/routes/(app)/cases/[id]` | 6 | — | — | `src_routes__app__cases__id_` | `agents_md({ path: "src/routes/(app)/cases/[id]" })` |
| `src/routes/(app)/cases/[id]/ai` | 2 | — | — | `src_routes__app__cases__id__ai` | `agents_md({ path: "src/routes/(app)/cases/[id]/ai" })` |
| `src/routes/(app)/cases/[id]/board` | 3 | — | — | `src_routes__app__cases__id__board` | `agents_md({ path: "src/routes/(app)/cases/[id]/board" })` |
| `src/routes/(app)/cases/[id]/canvas` | 3 | — | — | `src_routes__app__cases__id__canvas` | `agents_md({ path: "src/routes/(app)/cases/[id]/canvas" })` |
| `src/routes/(app)/cases/[id]/chat` | 2 | — | — | `src_routes__app__cases__id__chat` | `agents_md({ path: "src/routes/(app)/cases/[id]/chat" })` |
| `src/routes/(app)/cases/[id]/evidence` | 2 | — | — | `src_routes__app__cases__id__evidence` | `agents_md({ path: "src/routes/(app)/cases/[id]/evidence" })` |
| `src/routes/(app)/cases/[id]/evidence/upload` | 2 | — | — | `src_routes__app__cases__id__evidence_upload` | `agents_md({ path: "src/routes/(app)/cases/[id]/evidence/upload" })` |
| `src/routes/(app)/cases/[id]/notes` | 2 | — | — | `src_routes__app__cases__id__notes` | `agents_md({ path: "src/routes/(app)/cases/[id]/notes" })` |
| `src/routes/(app)/cases/[id]/overview` | 3 | — | — | `src_routes__app__cases__id__overview` | `agents_md({ path: "src/routes/(app)/cases/[id]/overview" })` |
| `src/routes/(app)/cases/[id]/persons` | 2 | — | — | `src_routes__app__cases__id__persons` | `agents_md({ path: "src/routes/(app)/cases/[id]/persons" })` |
| `src/routes/(app)/cases/[id]/reports` | 3 | — | — | `src_routes__app__cases__id__reports` | `agents_md({ path: "src/routes/(app)/cases/[id]/reports" })` |
| `src/routes/(app)/cases/new` | 3 | — | — | `src_routes__app__cases_new` | `agents_md({ path: "src/routes/(app)/cases/new" })` |
| `src/routes/(app)/chat` | 2 | — | — | `src_routes__app__chat` | `agents_md({ path: "src/routes/(app)/chat" })` |
| `src/routes/(app)/chat/[id]` | 2 | — | — | `src_routes__app__chat__id_` | `agents_md({ path: "src/routes/(app)/chat/[id]" })` |
| `src/routes/(app)/citations` | 3 | — | — | `src_routes__app__citations` | `agents_md({ path: "src/routes/(app)/citations" })` |
| `src/routes/(app)/citations/[...label]` | 2 | — | — | `src_routes__app__citations_____label_` | `agents_md({ path: "src/routes/(app)/citations/[...label]" })` |
| `src/routes/(app)/citations/law` | 2 | — | — | `src_routes__app__citations_law` | `agents_md({ path: "src/routes/(app)/citations/law" })` |
| `src/routes/(app)/citations/law/[citation]` | 2 | — | — | `src_routes__app__citations_law__citation_` | `agents_md({ path: "src/routes/(app)/citations/law/[citation]" })` |
| `src/routes/(app)/code-intel` | 2 | — | — | `src_routes__app__code_intel` | `agents_md({ path: "src/routes/(app)/code-intel" })` |
| `src/routes/(app)/code-intel/audit` | 2 | — | — | `src_routes__app__code_intel_audit` | `agents_md({ path: "src/routes/(app)/code-intel/audit" })` |
| `src/routes/(app)/code-intel/clusters` | 2 | — | — | `src_routes__app__code_intel_clusters` | `agents_md({ path: "src/routes/(app)/code-intel/clusters" })` |
| `src/routes/(app)/code-intel/memory` | 2 | — | — | `src_routes__app__code_intel_memory` | `agents_md({ path: "src/routes/(app)/code-intel/memory" })` |
| `src/routes/(app)/code-intel/retrieval` | 2 | — | — | `src_routes__app__code_intel_retrieval` | `agents_md({ path: "src/routes/(app)/code-intel/retrieval" })` |
| `src/routes/(app)/code-intel/topology` | 2 | — | — | `src_routes__app__code_intel_topology` | `agents_md({ path: "src/routes/(app)/code-intel/topology" })` |
| `src/routes/(app)/code-intel/wiki` | 2 | — | — | `src_routes__app__code_intel_wiki` | `agents_md({ path: "src/routes/(app)/code-intel/wiki" })` |
| `src/routes/(app)/codebase-graph` | 3 | — | — | `src_routes__app__codebase_graph` | `agents_md({ path: "src/routes/(app)/codebase-graph" })` |
| `src/routes/(app)/codebase-graph/fast-ast` | 2 | — | — | `src_routes__app__codebase_graph_fast_ast` | `agents_md({ path: "src/routes/(app)/codebase-graph/fast-ast" })` |
| `src/routes/(app)/command-center` | 3 | — | — | `src_routes__app__command_center` | `agents_md({ path: "src/routes/(app)/command-center" })` |
| `src/routes/(app)/command-center/codebase/clusters/[id]` | 2 | — | — | `src_routes__app__command_center_codebase_clusters__id_` | `agents_md({ path: "src/routes/(app)/command-center/codebase/clusters/[id]" })` |
| `src/routes/(app)/command-center/codebase/components/[id]` | 2 | — | — | `src_routes__app__command_center_codebase_components__id_` | `agents_md({ path: "src/routes/(app)/command-center/codebase/components/[id]" })` |
| `src/routes/(app)/command-center/codebase/errors` | 2 | — | — | `src_routes__app__command_center_codebase_errors` | `agents_md({ path: "src/routes/(app)/command-center/codebase/errors" })` |
| `src/routes/(app)/couchdb-analytics` | 5 | — | — | `src_routes__app__couchdb_analytics` | `agents_md({ path: "src/routes/(app)/couchdb-analytics" })` |
| `src/routes/(app)/dashboard` | 2 | — | — | `src_routes__app__dashboard` | `agents_md({ path: "src/routes/(app)/dashboard" })` |
| `src/routes/(app)/demos` | 2 | — | — | `src_routes__app__demos` | `agents_md({ path: "src/routes/(app)/demos" })` |
| `src/routes/(app)/demos/ace-pipeline` | 2 | — | — | `src_routes__app__demos_ace_pipeline` | `agents_md({ path: "src/routes/(app)/demos/ace-pipeline" })` |
| `src/routes/(app)/demos/agent-chat` | 2 | — | — | `src_routes__app__demos_agent_chat` | `agents_md({ path: "src/routes/(app)/demos/agent-chat" })` |
| `src/routes/(app)/demos/agentic-errors` | 3 | — | — | `src_routes__app__demos_agentic_errors` | `agents_md({ path: "src/routes/(app)/demos/agentic-errors" })` |
| `src/routes/(app)/demos/agentic-errors/analysis` | 2 | — | — | `src_routes__app__demos_agentic_errors_analysis` | `agents_md({ path: "src/routes/(app)/demos/agentic-errors/analysis" })` |
| `src/routes/(app)/demos/ai-assistant` | 2 | — | — | `src_routes__app__demos_ai_assistant` | `agents_md({ path: "src/routes/(app)/demos/ai-assistant" })` |
| `src/routes/(app)/demos/ai-chat-test` | 2 | — | — | `src_routes__app__demos_ai_chat_test` | `agents_md({ path: "src/routes/(app)/demos/ai-chat-test" })` |
| `src/routes/(app)/demos/ai-file-upload` | 2 | — | — | `src_routes__app__demos_ai_file_upload` | `agents_md({ path: "src/routes/(app)/demos/ai-file-upload" })` |
| `src/routes/(app)/demos/ask-ai` | 2 | — | — | `src_routes__app__demos_ask_ai` | `agents_md({ path: "src/routes/(app)/demos/ask-ai" })` |
| `src/routes/(app)/demos/bits-ui` | 2 | — | — | `src_routes__app__demos_bits_ui` | `agents_md({ path: "src/routes/(app)/demos/bits-ui" })` |
| `src/routes/(app)/demos/cache` | 2 | — | — | `src_routes__app__demos_cache` | `agents_md({ path: "src/routes/(app)/demos/cache" })` |
| `src/routes/(app)/demos/case-form` | 2 | — | — | `src_routes__app__demos_case_form` | `agents_md({ path: "src/routes/(app)/demos/case-form" })` |
| `src/routes/(app)/demos/celestial-icons` | 2 | — | — | `src_routes__app__demos_celestial_icons` | `agents_md({ path: "src/routes/(app)/demos/celestial-icons" })` |
| `src/routes/(app)/demos/chat-messages` | 2 | — | — | `src_routes__app__demos_chat_messages` | `agents_md({ path: "src/routes/(app)/demos/chat-messages" })` |
| `src/routes/(app)/demos/citation-tools` | 2 | — | — | `src_routes__app__demos_citation_tools` | `agents_md({ path: "src/routes/(app)/demos/citation-tools" })` |
| `src/routes/(app)/demos/client-ai-chat` | 2 | — | — | `src_routes__app__demos_client_ai_chat` | `agents_md({ path: "src/routes/(app)/demos/client-ai-chat" })` |
| `src/routes/(app)/demos/client-inference` | 2 | — | — | `src_routes__app__demos_client_inference` | `agents_md({ path: "src/routes/(app)/demos/client-inference" })` |
| `src/routes/(app)/demos/collab-canvas` | 2 | — | — | `src_routes__app__demos_collab_canvas` | `agents_md({ path: "src/routes/(app)/demos/collab-canvas" })` |
| `src/routes/(app)/demos/context-menu` | 2 | — | — | `src_routes__app__demos_context_menu` | `agents_md({ path: "src/routes/(app)/demos/context-menu" })` |
| `src/routes/(app)/demos/contextual-chat` | 2 | — | — | `src_routes__app__demos_contextual_chat` | `agents_md({ path: "src/routes/(app)/demos/contextual-chat" })` |
| `src/routes/(app)/demos/courtroom-sim` | 3 | — | — | `src_routes__app__demos_courtroom_sim` | `agents_md({ path: "src/routes/(app)/demos/courtroom-sim" })` |
| `src/routes/(app)/demos/crime-reconstruction` | 2 | — | — | `src_routes__app__demos_crime_reconstruction` | `agents_md({ path: "src/routes/(app)/demos/crime-reconstruction" })` |
| `src/routes/(app)/demos/detective-command` | 2 | — | — | `src_routes__app__demos_detective_command` | `agents_md({ path: "src/routes/(app)/demos/detective-command" })` |
| `src/routes/(app)/demos/dialog-wrapper` | 2 | — | — | `src_routes__app__demos_dialog_wrapper` | `agents_md({ path: "src/routes/(app)/demos/dialog-wrapper" })` |
| `src/routes/(app)/demos/embedding-stream` | 2 | — | — | `src_routes__app__demos_embedding_stream` | `agents_md({ path: "src/routes/(app)/demos/embedding-stream" })` |
| `src/routes/(app)/demos/enhanced-upload` | 2 | — | — | `src_routes__app__demos_enhanced_upload` | `agents_md({ path: "src/routes/(app)/demos/enhanced-upload" })` |
| `src/routes/(app)/demos/evidence-canvas` | 2 | — | — | `src_routes__app__demos_evidence_canvas` | `agents_md({ path: "src/routes/(app)/demos/evidence-canvas" })` |
| `src/routes/(app)/demos/evidence-dashboard` | 2 | — | — | `src_routes__app__demos_evidence_dashboard` | `agents_md({ path: "src/routes/(app)/demos/evidence-dashboard" })` |
| `src/routes/(app)/demos/evidence-form` | 2 | — | — | `src_routes__app__demos_evidence_form` | `agents_md({ path: "src/routes/(app)/demos/evidence-form" })` |
| `src/routes/(app)/demos/gpu-cache` | 2 | — | — | `src_routes__app__demos_gpu_cache` | `agents_md({ path: "src/routes/(app)/demos/gpu-cache" })` |
| `src/routes/(app)/demos/hover-card` | 2 | — | — | `src_routes__app__demos_hover_card` | `agents_md({ path: "src/routes/(app)/demos/hover-card" })` |
| `src/routes/(app)/demos/keyboard-shortcuts` | 2 | — | — | `src_routes__app__demos_keyboard_shortcuts` | `agents_md({ path: "src/routes/(app)/demos/keyboard-shortcuts" })` |
| `src/routes/(app)/demos/legal-layout` | 2 | — | — | `src_routes__app__demos_legal_layout` | `agents_md({ path: "src/routes/(app)/demos/legal-layout" })` |
| `src/routes/(app)/demos/legal-spellbook` | 2 | — | — | `src_routes__app__demos_legal_spellbook` | `agents_md({ path: "src/routes/(app)/demos/legal-spellbook" })` |
| `src/routes/(app)/demos/memory-palace` | 2 | — | — | `src_routes__app__demos_memory_palace` | `agents_md({ path: "src/routes/(app)/demos/memory-palace" })` |
| `src/routes/(app)/demos/modals` | 2 | — | — | `src_routes__app__demos_modals` | `agents_md({ path: "src/routes/(app)/demos/modals" })` |
| `src/routes/(app)/demos/modular-upload` | 2 | — | — | `src_routes__app__demos_modular_upload` | `agents_md({ path: "src/routes/(app)/demos/modular-upload" })` |
| `src/routes/(app)/demos/nes-graph` | 2 | — | — | `src_routes__app__demos_nes_graph` | `agents_md({ path: "src/routes/(app)/demos/nes-graph" })` |
| `src/routes/(app)/demos/nes-routes` | 2 | — | — | `src_routes__app__demos_nes_routes` | `agents_md({ path: "src/routes/(app)/demos/nes-routes" })` |
| `src/routes/(app)/demos/nes-toast` | 2 | — | — | `src_routes__app__demos_nes_toast` | `agents_md({ path: "src/routes/(app)/demos/nes-toast" })` |
| `src/routes/(app)/demos/nier-showcase` | 2 | — | — | `src_routes__app__demos_nier_showcase` | `agents_md({ path: "src/routes/(app)/demos/nier-showcase" })` |
| `src/routes/(app)/demos/notifications` | 2 | — | — | `src_routes__app__demos_notifications` | `agents_md({ path: "src/routes/(app)/demos/notifications" })` |
| `src/routes/(app)/demos/phantom-code-lab` | 2 | — | — | `src_routes__app__demos_phantom_code_lab` | `agents_md({ path: "src/routes/(app)/demos/phantom-code-lab" })` |
| `src/routes/(app)/demos/prosecutor-dashboard` | 2 | — | — | `src_routes__app__demos_prosecutor_dashboard` | `agents_md({ path: "src/routes/(app)/demos/prosecutor-dashboard" })` |
| `src/routes/(app)/demos/rich-text-editor` | 2 | — | — | `src_routes__app__demos_rich_text_editor` | `agents_md({ path: "src/routes/(app)/demos/rich-text-editor" })` |
| `src/routes/(app)/demos/scene-intent-2d` | 2 | — | — | `src_routes__app__demos_scene_intent_2d` | `agents_md({ path: "src/routes/(app)/demos/scene-intent-2d" })` |
| `src/routes/(app)/demos/search-tools` | 2 | — | — | `src_routes__app__demos_search_tools` | `agents_md({ path: "src/routes/(app)/demos/search-tools" })` |
| `src/routes/(app)/demos/source-drawer` | 2 | — | — | `src_routes__app__demos_source_drawer` | `agents_md({ path: "src/routes/(app)/demos/source-drawer" })` |
| `src/routes/(app)/demos/stats-panel` | 2 | — | — | `src_routes__app__demos_stats_panel` | `agents_md({ path: "src/routes/(app)/demos/stats-panel" })` |
| `src/routes/(app)/demos/streaming` | 2 | — | — | `src_routes__app__demos_streaming` | `agents_md({ path: "src/routes/(app)/demos/streaming" })` |
| `src/routes/(app)/demos/svelte5-components` | 2 | — | — | `src_routes__app__demos_svelte5_components` | `agents_md({ path: "src/routes/(app)/demos/svelte5-components" })` |
| `src/routes/(app)/demos/svelte5-primitives` | 2 | — | — | `src_routes__app__demos_svelte5_primitives` | `agents_md({ path: "src/routes/(app)/demos/svelte5-primitives" })` |
| `src/routes/(app)/demos/synthesis-chat` | 2 | — | — | `src_routes__app__demos_synthesis_chat` | `agents_md({ path: "src/routes/(app)/demos/synthesis-chat" })` |
| `src/routes/(app)/demos/theory-board` | 2 | — | — | `src_routes__app__demos_theory_board` | `agents_md({ path: "src/routes/(app)/demos/theory-board" })` |
| `src/routes/(app)/demos/toc-reader` | 2 | — | — | `src_routes__app__demos_toc_reader` | `agents_md({ path: "src/routes/(app)/demos/toc-reader" })` |
| `src/routes/(app)/demos/ui-components` | 2 | — | — | `src_routes__app__demos_ui_components` | `agents_md({ path: "src/routes/(app)/demos/ui-components" })` |
| `src/routes/(app)/demos/webgpu-memory-palace` | 2 | — | — | `src_routes__app__demos_webgpu_memory_palace` | `agents_md({ path: "src/routes/(app)/demos/webgpu-memory-palace" })` |
| `src/routes/(app)/demos/webgpu-showcase` | 2 | — | — | `src_routes__app__demos_webgpu_showcase` | `agents_md({ path: "src/routes/(app)/demos/webgpu-showcase" })` |
| `src/routes/(app)/demos/yorha` | 2 | — | — | `src_routes__app__demos_yorha` | `agents_md({ path: "src/routes/(app)/demos/yorha" })` |
| `src/routes/(app)/demos/yorha-assistant` | 2 | — | — | `src_routes__app__demos_yorha_assistant` | `agents_md({ path: "src/routes/(app)/demos/yorha-assistant" })` |
| `src/routes/(app)/demos/yorha-icons` | 2 | — | — | `src_routes__app__demos_yorha_icons` | `agents_md({ path: "src/routes/(app)/demos/yorha-icons" })` |
| `src/routes/(app)/demos/yorha-terminal` | 2 | — | — | `src_routes__app__demos_yorha_terminal` | `agents_md({ path: "src/routes/(app)/demos/yorha-terminal" })` |
| `src/routes/(app)/demos/yorha/components` | 21 | — | — | `src_routes__app__demos_yorha_components` | `agents_md({ path: "src/routes/(app)/demos/yorha/components" })` |
| `src/routes/(app)/demos/yorha/components/_simulations` | 6 | — | — | `src_routes__app__demos_yorha_components__simulations` | `agents_md({ path: "src/routes/(app)/demos/yorha/components/_simulations" })` |
| `src/routes/(app)/demos/yorha/components/cases` | 3 | — | — | `src_routes__app__demos_yorha_components_cases` | `agents_md({ path: "src/routes/(app)/demos/yorha/components/cases" })` |
| `src/routes/(app)/demos/yorha/components/dashboard` | 5 | — | — | `src_routes__app__demos_yorha_components_dashboard` | `agents_md({ path: "src/routes/(app)/demos/yorha/components/dashboard" })` |
| `src/routes/(app)/demos/yorha/components/evidence` | 4 | — | — | `src_routes__app__demos_yorha_components_evidence` | `agents_md({ path: "src/routes/(app)/demos/yorha/components/evidence" })` |
| `src/routes/(app)/evidence` | 6 | 1/1 auth | — | `src_routes__app__evidence` | `agents_md({ path: "src/routes/(app)/evidence" })` |
| `src/routes/(app)/evidence-library` | 2 | — | — | `src_routes__app__evidence_library` | `agents_md({ path: "src/routes/(app)/evidence-library" })` |
| `src/routes/(app)/evidence/[id]/view` | 2 | — | — | `src_routes__app__evidence__id__view` | `agents_md({ path: "src/routes/(app)/evidence/[id]/view" })` |
| `src/routes/(app)/evidence/analyze` | 2 | — | — | `src_routes__app__evidence_analyze` | `agents_md({ path: "src/routes/(app)/evidence/analyze" })` |
| `src/routes/(app)/evidence/hash` | 2 | — | — | `src_routes__app__evidence_hash` | `agents_md({ path: "src/routes/(app)/evidence/hash" })` |
| `src/routes/(app)/evidence/manage` | 2 | — | — | `src_routes__app__evidence_manage` | `agents_md({ path: "src/routes/(app)/evidence/manage" })` |
| `src/routes/(app)/evidence/realtime` | 3 | — | — | `src_routes__app__evidence_realtime` | `agents_md({ path: "src/routes/(app)/evidence/realtime" })` |
| `src/routes/(app)/evidence/upload` | 2 | — | — | `src_routes__app__evidence_upload` | `agents_md({ path: "src/routes/(app)/evidence/upload" })` |
| `src/routes/(app)/fictional-cases` | 2 | — | — | `src_routes__app__fictional_cases` | `agents_md({ path: "src/routes/(app)/fictional-cases" })` |
| `src/routes/(app)/fictional-cases/[id]` | 2 | — | — | `src_routes__app__fictional_cases__id_` | `agents_md({ path: "src/routes/(app)/fictional-cases/[id]" })` |
| `src/routes/(app)/global-search` | 2 | — | — | `src_routes__app__global_search` | `agents_md({ path: "src/routes/(app)/global-search" })` |
| `src/routes/(app)/legal-corpus` | 4 | — | — | `src_routes__app__legal_corpus` | `agents_md({ path: "src/routes/(app)/legal-corpus" })` |
| `src/routes/(app)/legal-corpus/[id]` | 3 | — | — | `src_routes__app__legal_corpus__id_` | `agents_md({ path: "src/routes/(app)/legal-corpus/[id]" })` |
| `src/routes/(app)/library` | 3 | — | — | `src_routes__app__library` | `agents_md({ path: "src/routes/(app)/library" })` |
| `src/routes/(app)/library/[documentId]` | 2 | — | — | `src_routes__app__library__documentId_` | `agents_md({ path: "src/routes/(app)/library/[documentId]" })` |
| `src/routes/(app)/library/[documentId]/node/[nodeId]` | 2 | — | — | `src_routes__app__library__documentId__node__nodeId_` | `agents_md({ path: "src/routes/(app)/library/[documentId]/node/[nodeId]" })` |
| `src/routes/(app)/library/[documentId]/reader` | 2 | — | — | `src_routes__app__library__documentId__reader` | `agents_md({ path: "src/routes/(app)/library/[documentId]/reader" })` |
| `src/routes/(app)/library/corpus` | 2 | — | — | `src_routes__app__library_corpus` | `agents_md({ path: "src/routes/(app)/library/corpus" })` |
| `src/routes/(app)/library/glossary` | 2 | — | — | `src_routes__app__library_glossary` | `agents_md({ path: "src/routes/(app)/library/glossary" })` |
| `src/routes/(app)/persons-of-interest` | 3 | — | — | `src_routes__app__persons_of_interest` | `agents_md({ path: "src/routes/(app)/persons-of-interest" })` |
| `src/routes/(app)/persons-of-interest/[id]` | 3 | — | — | `src_routes__app__persons_of_interest__id_` | `agents_md({ path: "src/routes/(app)/persons-of-interest/[id]" })` |
| `src/routes/(app)/persons-of-interest/create` | 2 | — | — | `src_routes__app__persons_of_interest_create` | `agents_md({ path: "src/routes/(app)/persons-of-interest/create" })` |
| `src/routes/(app)/rag-search` | 2 | — | — | `src_routes__app__rag_search` | `agents_md({ path: "src/routes/(app)/rag-search" })` |
| `src/routes/(app)/recommendations` | 2 | — | — | `src_routes__app__recommendations` | `agents_md({ path: "src/routes/(app)/recommendations" })` |
| `src/routes/(app)/reports/[id]` | 3 | — | — | `src_routes__app__reports__id_` | `agents_md({ path: "src/routes/(app)/reports/[id]" })` |
| `src/routes/(app)/reports/[id]/edit` | 2 | — | — | `src_routes__app__reports__id__edit` | `agents_md({ path: "src/routes/(app)/reports/[id]/edit" })` |
| `src/routes/(app)/simulation` | 2 | — | — | `src_routes__app__simulation` | `agents_md({ path: "src/routes/(app)/simulation" })` |
| `src/routes/(app)/terminal` | 3 | — | — | `src_routes__app__terminal` | `agents_md({ path: "src/routes/(app)/terminal" })` |

### `src/routes/(dev)/` (8 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/routes/(dev)/demo/bits-ui` | 2 | — | — | `src_routes__dev__demo_bits_ui` | `agents_md({ path: "src/routes/(dev)/demo/bits-ui" })` |
| `src/routes/(dev)/odin` | 2 | — | — | `src_routes__dev__odin` | `agents_md({ path: "src/routes/(dev)/odin" })` |
| `src/routes/(dev)/tts-demo` | 2 | — | — | `src_routes__dev__tts_demo` | `agents_md({ path: "src/routes/(dev)/tts-demo" })` |
| `src/routes/(dev)/voice-chat-demo` | 2 | — | — | `src_routes__dev__voice_chat_demo` | `agents_md({ path: "src/routes/(dev)/voice-chat-demo" })` |

### `src/routes/.well-known/` (4 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|

### `src/routes/api/` (672 dirs)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/routes/api/codebase-index/deep-research` | 2 | 1/1 auth | — | `src_routes_api_codebase_index_deep_research` | `agents_md({ path: "src/routes/api/codebase-index/deep-research" })` |
| `src/routes/api/rag/hyperrag` | 2 | 1/1 auth | — | `src_routes_api_rag_hyperrag` | `agents_md({ path: "src/routes/api/rag/hyperrag" })` |
| `src/routes/api/rag/search` | 2 | 1/1 auth | — | `src_routes_api_rag_search` | `agents_md({ path: "src/routes/api/rag/search" })` |

### `src/routes/login/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/routes/login` | 3 | — | — | `src_routes_login` | `agents_md({ path: "src/routes/login" })` |

### `src/routes/minio/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|

### `src/routes/register/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/routes/register` | 3 | — | — | `src_routes_register` | `agents_md({ path: "src/routes/register" })` |

### `src/shims/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|

### `src/src/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src` | 17 | — | — | `src` | `agents_md({ path: "src" })` |

### `src/stores/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|

### `src/tests/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|

### `src/types/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/types` | 23 | — | — | `src_types` | `agents_md({ path: "src/types" })` |

### `src/wasm/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/wasm` | 2 | — | — | `src_wasm` | `agents_md({ path: "src/wasm" })` |

### `src/workers/` (1 dir)

| Dir | Files | Score | Cluster | KAG slug | Quick tool call |
|-----|-------|-------|---------|----------|-----------------|
| `src/workers` | 3 | — | — | `src_workers` | `agents_md({ path: "src/workers" })` |


## How to use this file

When an agent (or human) needs to work in a directory:

1. **Look up the dir in the table above** — copy the KAG slug and quick tool call.
2. **Fire `agents_md({ path: "<dir>" })`** — the agent reads the dir's full AGENTS.md (includes cluster + KAG narrative + tool-calling hints).
3. **For deeper context, chain**: `wiki_note_lookup` → `graph_search` → `read_file`.

The per-dir AGENTS.md files live INSIDE the directories themselves (e.g. `src/lib/server/cache/AGENTS.md`), so any agent walking UP the tree from a file under work picks them up automatically.

Run `npm run agents:write` to regenerate after `npm run index:codebase:fast`.

## Further reading

- [`docs/agents-md-howto.md`](./docs/agents-md-howto.md) — full guide: 5-source join, idempotency, Bifrost L1+L2 cache integration, Qdrant tag-cluster compression, TypeScript reranker pattern, future ideas
- [`docs/ace-kag-howto.md`](./docs/ace-kag-howto.md) — KAG ingestion + ACE retrieval pipeline (this is what populates `wiki:note:dir:*`)
- [`docs/graph/codebase-map.md`](./docs/graph/codebase-map.md) — 20-gate audit dashboard (G4/G5/G15/G16/G20 coverage)
- [`docs/graph/hypergraph-clusters.md`](./docs/graph/hypergraph-clusters.md) — full per-cluster digest (topic + member files)
