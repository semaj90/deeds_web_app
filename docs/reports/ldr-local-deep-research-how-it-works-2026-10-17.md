# Local Deep Research (LDR) — How It Works
**Version**: 1.10.1 (vendored) | **Source**: `tools/agentic-research/src/local-deep-research/` | **Date**: 2026-10-17 | **Status**: READ_ONLY_ANALYSIS (nothing installed, started or run)

---

## TL;DR

LDR is a self-hosted Flask web app (`:5000`) that answers a question by looping **generate questions → search many engines in parallel → analyze → (repeat)**, then synthesizes a cited report. It stores everything in a per-user **SQLCipher** database, can index its own past research and downloaded documents into **FAISS** for reuse, and routes LLM, embedding and search traffic through an **egress policy** that decides what may leave the machine. It is a standalone product: in Parent Atlas it is a **peer research tool, not a canonical store**. Its vectors and reports must never be written into `atlas_packets`, `codebase_chunk_index`, Qdrant or Neo4j.

**Not verified here**: no LDR image or container is installed (only a stopped `legal-ai-searxng`); no research run was executed; `:8090` was down. Everything below is from reading the vendored source and docs.

---

## 1. System map

| Layer | What it is | Where (under `src/local_deep_research/`) |
|---|---|---|
| Web/API | Flask app, REST + WebSocket, session auth, CSRF | `web/`, `api/` |
| Research engine | Strategy selector, question generator, parallel search, synthesizer | `search_system.py`, `search_system_factory.py`, `advanced_search_system/` |
| LLM providers | Pluggable chat model clients | `llm/providers/implementations/` |
| Search engines | ~30 engines (web, academic, local) | `web_search_engines/engines/` |
| Citations/report | Citation handlers, report generator, exporters | `citation_handler(s)`, `report_generator.py`, `exporters/` |
| Library + RAG | Downloaded docs, collections, chunk + embed + FAISS | `library/`, `research_library/`, `embeddings/`, `vector_stores/` |
| Storage | Per-user encrypted DB, files | `database/`, `storage/` |
| Policy | Egress scope, security | `security/` |
| Side systems | News subscriptions, scheduler, metrics, benchmarks, MCP server, notifications | `news/`, `scheduler/`, `metrics/`, `benchmarks/`, `mcp/`, `notifications/` |

---

## 2. The research loop

```
query → strategy.analyze_topic()
          ├─ iteration 1: original query + LLM-generated questions
          ├─ iterations 2..N: LLM writes follow-ups from accumulated results
          │     (all questions of an iteration searched in parallel, ThreadPoolExecutor)
          ├─ cross-engine filter (default on): relevance filter / reorder / re-index
          └─ citation_handler synthesizes text with [n] citations
      → report (markdown) → exporters (PDF / LaTeX / Quarto / RIS / BibTeX)
```

| Setting / fact | Value (from source docstrings) |
|---|---|
| Default iterations | 5 (`search.iterations`) |
| Question context | most recent N results (`search.question_context_limit`) |
| Citation numbers | offset by prior count, so detailed reports keep continuous `[n]` across sections |
| Shared state | `all_links_of_system` is one list shared by reference; the single source of truth for citations |
| Detailed reports | `IntegratedReportGenerator` calls `analyze_topic()` once per subsection; earlier sections are never re-filtered |

### Strategies (`create_strategy`)

| Name(s) | Class | Purpose |
|---|---|---|
| `source-based` (default fallback) | `SourceBasedSearchStrategy` | Iterative questions → parallel search → synthesis (flow above) |
| `focused-iteration-standard` | `FocusedIterationStrategy` | Focused iterative variant |
| `news` / `news_aggregation` | `NewsAggregationStrategy` | News digests |
| `topic-organization` / `topic` | `TopicOrganizationStrategy` | Organize findings by topic |
| `langgraph-agent` (aliases `mcp`, `agentic` were removed, #4548) | `LangGraphAgentStrategy` | Agent loop using LangGraph |
| unknown name | — | logs a warning, defaults to `source-based` |

---

## 3. LLM layer

Providers in `llm/providers/implementations/`: `ollama`, `lmstudio`, `llamacpp`, `openai`, `anthropic`, `google`, `openrouter`, `xai`, `deepseek`, `ionos`, `requesty`, `orcarouter`, `custom_openai_endpoint`, `custom_anthropic_endpoint`. Selected by `LDR_LLM_PROVIDER` / `llm.provider`; model by `LDR_LLM_MODEL`.

| Provider | Egress label (`egress_exposure`) | Notes |
|---|---|---|
| `ollama` | CONTAINED (local) | Default provider; compose bundles an Ollama service |
| `llamacpp` | CONTAINED (local) | Talks to `llama-server` over OpenAI-compatible HTTP; `llm.llamacpp.url` (default `http://localhost:8080/v1`); API key optional (placeholder used) |
| `openai_endpoint` | **EXPOSING** (fail closed; `is_cloud=None`) | Generic URL-configurable endpoint; can be blocked by Private/Adaptive egress modes |

**For this stack**: use `llamacpp` (not `openai_endpoint`) so the egress policy treats `:8090` as local. `docker/ldr-llama-server.override.yml` does this.

---

## 4. Search layer

~30 engines under `web_search_engines/engines/`:

| Class | Engines |
|---|---|
| Web | SearXNG, DuckDuckGo, Brave, Tavily, Serper, SerpAPI, Google PSE, Exa, Mojeek, ScaleSERP, TinyFish, Wayback |
| Academic | arXiv, PubMed, Semantic Scholar, OpenAlex, NASA ADS, Zenodo, PubChem |
| Knowledge/news | Wikipedia, Wikinews, Guardian, Gutenberg, OpenLibrary, StackExchange, GitHub |
| Local/private | Library, Collection, Elasticsearch, Paperless, LangChain retriever |

SearXNG is the privacy default (compose bundles it, instance URL `http://searxng:8080`).

---

## 5. Library, RAG and the knowledge loop

```
research sources → download queue → text extract → document storage → collections
   → chunk → embed → FAISS index (on disk) → a collection becomes a search engine for later research
```

| Part | Fact |
|---|---|
| Vector store | FAISS only (`vector_stores/implementations/faiss_store.py`) |
| Embedding providers | `sentence_transformers`, `ollama`, `openai` (OpenAI-compatible base URL allowed) |
| Embedding settings | `embeddings.ollama.url` (default `http://localhost:11434`), `embeddings.openai.base_url`, `embeddings.require_local` |
| Semantic search over history | `ResearchHistoryIndexer` → `Document` rows → `LibraryRAGService` → FAISS; three modes (text-only, AI-only, hybrid with a three-tier merge) |

---

## 6. Storage and security

| Topic | Fact |
|---|---|
| Database | SQLAlchemy over **SQLCipher**; per-user AES-256 DB keyed from the user password |
| Auth | Required for all API endpoints since v1.0; session cookie + CSRF for state-changing calls |
| Egress scope | Adaptive (default), Unprotected, Public only, Private only, Strict; gates search engines, LLM/embedding providers and fetched URLs; hard SSRF and cloud-metadata blocking always on |
| Egress caveat | Docs mark it **experimental / defense-in-depth**, not a sole protection for highly sensitive data |
| Private runs | A private primary engine (local collection) forces local LLM and embeddings under Adaptive/Private |

---

## 7. Interfaces

| Interface | Detail |
|---|---|
| Web UI | `http://localhost:5000` (register/login first) |
| Python API | `LDRClient`, `quick_query(user, password, question)` |
| HTTP API | login → session cookie → CSRF token on state-changing calls |
| MCP server | `ldr-mcp`, **STDIO only**, 8 tools (5 research + 3 discovery); `pip install "local-deep-research[mcp]"` |
| CLI/benchmarks | `docs/cli-tools.md`, `docs/BENCHMARKING.md` |

---

## 8. Deployment (vendored compose)

| Service | Image | Role |
|---|---|---|
| `local-deep-research` | `localdeepresearch/local-deep-research:latest` | App on `:5000`; `depends_on` ollama (healthy) and searxng |
| `ollama` | `ollama/ollama` (pinned digest) | Bundled LLM host; GPU via `docker-compose.gpu.override.yml` (NVIDIA, Linux; needs nvidia-container-toolkit) |
| `searxng` | `searxng/searxng` (pinned digest) | Local meta-search |

Settings can be locked with `LDR_*` environment variables (e.g. `LDR_LLM_PROVIDER`, `LDR_LLM_MODEL`, `LDR_LLM_LLAMACPP_URL`, `LDR_EMBEDDINGS_OLLAMA_URL`).

---

## 9. Fit with Parent Atlas

| Question | Answer |
|---|---|
| Chat on `llama-server :8090` only? | Yes by configuration: `LDR_LLM_PROVIDER=llamacpp`, `LDR_LLM_LLAMACPP_URL=http://host.docker.internal:8090/v1`, `LDR_LLM_MODEL=ornith-1.5-9b`. Needs `:8090` running |
| Remove bundled Ollama? | Yes: override drops the `depends_on` and puts the service behind an unused profile (validated with `docker compose config`, not started) |
| Embeddings? | LDR needs its own. Override points at host Ollama `embeddinggemma:latest` (current lane). Go service `:8097` has no `/v1/embeddings` (404; it serves `/embed` with `{texts}`), so it is not a drop-in; an adapter would be new code needing an owner decision |
| EmbeddingGemma 2? | Different (multimodal) embedding space; would be a new representation (own id, prefix recipe, parity gate). Not chosen |
| Can LDR output enter canonical stores? | No. Treat as advisory evidence; Postgres packet truth flow and `sourceRevision` lineage apply to anything admitted |
| Duplicates? | `legal-ai` already has a TRACE `ldr_research` tool path and an `ldr-research` MCP entry; check the registered owner before wiring LDR as another research tool (one-owner rule) |

---

## 10. Gaps and unknowns

| Item | State |
|---|---|
| Live run | Not done; `:8090` down, no LDR image |
| Does `host.docker.internal` count as "local" for the egress classifier? | Unknown; test before relying on Private mode |
| GPU override content | Only the Ollama GPU reservation was read; no LDR-side CUDA use found in the compose |
| Throughput / answer quality with Ornith 1.5 | Unmeasured; no benchmark run |
| Embedding model for LDR long term | Open operator decision |

## Next Steps
- `npm`-free: start `:8090` via the VS Code task, then `docker compose -f tools/agentic-research/src/local-deep-research/docker-compose.yml -f docker/ldr-llama-server.override.yml up -d` (operator-run)
- Verify egress classification with a throwaway query before any real use
- Decide the embeddings path (Go `:8097` + adapter vs EG-GGUF vs EmbeddingGemma 2)
