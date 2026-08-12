# OKF Dev Export Index

- schema_version: okf.dev.manifest.v1
- generated_at: 2026-07-30T21:13:34.337Z
- source_count: 8
- page_count: 29
- firecrawl_key_present: false
- searxng_url: http://localhost:8889

## Sources

### firecrawl - Firecrawl Docs
- kind: official_docs
- domain_class: tool
- focus_tags: llm_output, taskboard, agentic_error_fixing, canonical_api_recommendations
- page_count: 8
- acquisition_lane: plain-fetch

- https://docs.firecrawl.dev/api-reference/introduction
- https://docs.firecrawl.dev/api-reference/endpoint/crawl-post
- https://docs.firecrawl.dev/api-reference/endpoint/crawl-get
- https://docs.firecrawl.dev/api-reference/endpoint/scrape
- https://docs.firecrawl.dev/api-reference/endpoint/search
- https://docs.firecrawl.dev/features/parse
- https://docs.firecrawl.dev/features/research
- https://docs.firecrawl.dev/ai-onboarding

### qdrant - Qdrant Docs
- kind: official_docs
- domain_class: database
- focus_tags: llm_synthesis, llm_output, canonical_api_recommendations
- page_count: 7
- acquisition_lane: plain-fetch

- https://qdrant.tech/documentation/manage-data/quantization/
- https://qdrant.tech/course/essentials/day-4/rescoring-oversampling-indexing/
- https://qdrant.tech/documentation/manage-data/points/
- https://qdrant.tech/documentation/manage-data/vectors/
- https://qdrant.tech/documentation/manage-data/collections/
- https://qdrant.tech/documentation/search/hybrid-queries/
- https://api.qdrant.tech/api-reference/search/query-points

### mastra - Mastra Docs
- kind: official_docs
- domain_class: workflow
- focus_tags: llm_synthesis, kanban, taskboard, agentic_error_fixing
- page_count: 2
- acquisition_lane: plain-fetch

- https://mastra.ai/docs/workflows/overview
- https://mastra.ai/reference/workflows/workflow

### trpc - tRPC Docs
- kind: official_docs
- domain_class: tool
- focus_tags: canonical_api_recommendations, agentic_error_fixing
- page_count: 2
- acquisition_lane: plain-fetch

- https://trpc.io/docs/server/procedures
- https://trpc.io/docs/server/validators

### acp - Agent Client Protocol
- kind: official_docs
- domain_class: agent
- focus_tags: kanban, taskboard, agentic_error_fixing
- page_count: 1
- acquisition_lane: plain-fetch

- https://agentclientprotocol.com/get-started/introduction

### a2a - A2A Protocol
- kind: official_docs
- domain_class: agent
- focus_tags: kanban, taskboard, agentic_error_fixing
- page_count: 1
- acquisition_lane: plain-fetch

- https://a2a-protocol.org/latest/specification/

### opencode - OpenCode Docs
- kind: official_docs
- domain_class: tool
- focus_tags: llm_synthesis, llm_output, agentic_error_fixing, canonical_api_recommendations
- page_count: 5
- acquisition_lane: plain-fetch

- https://opencode.ai/docs/
- https://opencode.ai/docs/models/
- https://opencode.ai/docs/providers/
- https://opencode.ai/docs/tools/
- https://opencode.ai/docs/config/

### rapids - RAPIDS cuVS + cuGraph
- kind: official_docs
- domain_class: gpu
- focus_tags: canonical_api_recommendations, llm_output
- page_count: 3
- acquisition_lane: plain-fetch
- related_notes:
  - `docs/.okf/dev/rtx-louvain-parity.md`

- https://docs.rapids.ai/api/cuvs/stable/
- https://docs.rapids.ai/api/cuvs/stable/c_api/neighbors_cagra_c/
- https://docs.rapids.ai/api/cugraph/stable/api_docs/api/cugraph/cugraph.pagerank/

## Local Inventory

```md
# OKF Dev Local Source Inventory

This inventory captures repository-local material that can seed future dev coding agent corpora, QLoRA alignment sets, LangChain-style deep agent workflows, and OpenWiki-style integration work.

## Repository-local OKF / agent alignment sources

- `docs/.okf/dev/gsd.md`
- `docs/.okf/dev/manifest.json`
- `docs/phase-110-agentic-indexing/specs/phase-110-agentic-code-index/implementation-prompt.md`
- `docs/phase-110-agentic-indexing/specs/phase-110-agentic-code-index/spec.md`
- `docs/architecture/ACP-GEMMA4-MEMORY-HIERARCHY.md`
- `docs/architecture/bounded-tool-gateway-implementation.md`
- `docs/architecture/AGENTIC-ERROR-FIXING-ARCHITECTURE.md`
- `docs/architecture/phase-3-gpu-graph-adaptive-architecture.md`
- `docs/architecture/PARENT_ATLAS_RECOMMENDATION_AND_RETRIEVAL_POLICY.md`
- `docs/ai-os/opencode-context-window.md`
- `docs/ai-os/opencode-mcp-atlas.md`
- `docs/ai-os/opencode-skill-routing.md`
- `docs/.okf/dev/rtx-louvain-parity.md`
- `docs/.okf/dev/openwiki-dev-corpus-spec.md`
- `sveltekit-frontend/docs/agents_master_stack_checklist.md`
- `sveltekit-frontend/docs/agents-md-howto.md`
- `sveltekit-frontend/docs/bifrost-firecrawl-programming-reference.md`

## Dataset and training material

- `scripts/unsloth-training/COLAB_PACKAGE/training-datasets/*.jsonl`
- `scripts/unsloth-training/extracted-patterns/*.jsonl`
- `scripts/unsloth-training/COLAB_PACKAGE/TRAINING_DATA_SUMMARY.md`
- `scripts/unsloth-training/DETECTIVE_MODE_DATASET.md`
- `scripts/unsloth-training/DETECTIVE_MODE_ENHANCED.md`
- `scripts/unsloth-training/MEGA_DATASET_EXPANSION.md`
- `scripts/unsloth-training/INTEGRATION_GUIDE.md`
- `scripts/unsloth-training/INTEGRATION_READINESS.md`
- `sveltekit-frontend/data/phase18_datasets.json`
- `sveltekit-frontend/data/agent-conversations.jsonl`
- `docs/reports/qlora_examples.jsonl`
- `docs/reports/semantic-training-rows.json`
- `docs/reports/semantic-training-rows.md`
- `docs/reports/pytorch-training-pipeline.json`
- `docs/reports/pytorch-training-pipeline.md`
- `docs/stage3/semantic_facts.ndjson`
- `docs/stage3/topology_facts.ndjson`
- `docs/stage3/karpathy_cards.ndjson`
- `docs/phase-110-agentic-indexing/datasets/README.md`
- `docs/phase-110-agentic-indexing/**/datasets/*.md`
- `sveltekit-frontend/docs/audit/2026-05-14_sveltekit-route-gap-atlas.md`
- `sveltekit-frontend/docs/CANONICAL-FEATURE-ENVELOPE-WIRED.md`
- `sveltekit-frontend/docs/CANONICAL-PACKET-REGISTRY-DESIGN.md`

## Dev docs and agent docs

- `docs/architecture/*.md`
- `docs/phase-110-agentic-indexing/**/*.md`
- `docs/phase-110-agentic-indexing/**/*.json`
- `docs/reports/*agentic*.json`
- `docs/reports/*agentic*.md`
- `docs/reports/*kanban*.json`
- `docs/reports/*kanban*.md`
- `sveltekit-frontend/docs/agent*.md`
- `sveltekit-frontend/docs/todo/*.md`
- `sveltekit-frontend/docs/reports/*.md`
- `sveltekit-frontend/docs/reports/*.json`
- `sveltekit-frontend/docs/obsidian-vault/**/*.md`
- `docs/atlas-*.md`
- `docs/*agentic*.md`
- `docs/*kanban*.md`
- `docs/*qlora*.md`
- `docs/*openwiki*.md`
- `docs/*langchain*.md`
- `docs/*dataset*.md`

## Crawled or generated pages

- `docs/.okf/dev/raw/` (Firecrawl/plain-fetch normalized pages)
- `docs/.okf/dev/corpus.jsonl`
- `docs/.okf/dev/index.md`
- `docs/.okf/dev/summary.json`
- `docs/.okf/dev/*.jsonl`
- `docs/.okf/dev/*.md`

## Runtime acquisition and search boundaries

- `sveltekit-frontend/src/lib/server/ldr/web-search-client.ts` supports SearXNG search and Firecrawl extraction when `FIRECRAWL_API_KEY` is present.
- `sveltekit-frontend/src/lib/server/agent/tools/web-search.ts` uses `ENV.SEARXNG_URL` for live discovery and falls back to curated results.
- `sveltekit-frontend/src/lib/server/indexer/web-search-indexer.ts` treats web search as an indexer input, not canonical truth.
- `docker/langgraph-synthesis/app.py` currently uses SearXNG and DuckDuckGo-style fallback search, not Firecrawl.
- `docs/.okf/dev` should remain a dev corpus export target only; it must not become the authority store.

## Env wiring gap notes

- `sveltekit-frontend/.env.example` documents `SEARXNG_URL` and `FIRECRAWL_API_KEY`.
- `sveltekit-frontend/.env.local.example` documents `FIRECRAWL_API_KEY`.
- The repo search confirmed Firecrawl support in code, but a committed runtime key was not confirmed in this pass.

## HTML scan result

- No repository-local `.html` or `.htm` files were confirmed in the targeted search scope for this pass.

## Intended labels for later alignment

- `qlora_training`
- `langchain_deep_agents`
- `openwiki_integration`
- `kanban`
- `taskboard`
- `agentic_error_fixing`
- `canonical_api_recommendations`
```
