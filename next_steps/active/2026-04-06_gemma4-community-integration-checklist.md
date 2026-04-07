# Gemma4 Community Integration Checklist
**Date**: 2026-04-06
**Purpose**: Cross-reference community repos released April 5-6 against our stack. Confirm integrations, borrow useful patterns, verify differentiators via Playwright screenshots before repo upload.

---

## Community Repos Found (April 5-6, 2026)

| Repo | Stars | Language | What it does |
|------|-------|----------|-------------|
| [jryhu2gh/local-rag-agent-gemma4](https://github.com/jryhu2gh/local-rag-agent-gemma4) | 0 | Python | BM25+EmbeddingGemma hybrid RAG, tool calling, chat history, RRF reranking |
| [BitcoinerRay/gemma4-ocr](https://github.com/BitcoinerRay/gemma4-ocr) | 0 | Python | PDF→poppler DPI render→`gemma4:e4b` images[] API → JSON OCR output |
| [AniruddhaPKawarase/gemma4-agent-toolkit](https://github.com/AniruddhaPKawarase/gemma4-agent-toolkit) | 0 | Python | Gemma4 Ollama tool-use, 96.2% function-call accuracy (26B on RTX 4090) |
| [WSobo/Chaperone-RAG](https://github.com/WSobo/Chaperone-RAG) | 1 | Python | LangChain + Gemma4 + PyPDF + web search autonomous agent |
| [nmarafo/local-gemma4-rag](https://github.com/nmarafo/local-gemma4-rag) | 1 | JS | WebGPU Transformers.js + Orama WASM vector DB (browser-only) |
| [pmarreck/gemma4-heretical](https://github.com/pmarreck/gemma4-heretical) | 61 | Shell | Abliterated Gemma4 31B for Ollama, chat template fix |
| [mlexpertio/gemma-rag](https://github.com/mlexpertio/gemma-rag) | 1 | Python | Basic RAG + OpenCode |

---

## Integration Status: What We Already Have ✅

These patterns confirmed by community — **our implementations match or exceed**:

### 1. Gemma4 VLM OCR — `vlm-evidence-analyzer.ts` ✅
**Community pattern** (`gemma4-ocr`):
```python
# poppler → 300 DPI render → gemma4:e4b images[] API
img = convert_from_path(pdf, dpi=300, first_page=p, last_page=p)[0]
img.thumbnail((2048, 2048))
b64 = base64.b64encode(img_bytes).decode()
response = ollama.chat(model="gemma4:e4b", messages=[{
    "role": "user",
    "images": [b64],
    "content": prompt
}])
```
**Our implementation** (`vlm-evidence-analyzer.ts` line ~176):
```typescript
model: ENV.GEMMA4_MODEL ?? 'gemma4:e4b-it-q4_K_M',  // ✅ correct model
images: [base64Image],                                 // ✅ same API
```
**Status**: ✅ Already correct. `gemma4:e4b-it-q4_K_M` installed (9.6 GB), vision confirmed working.
**Our advantage**: Triton VLM ensemble as primary, Ollama as fallback. They only have Ollama fallback.

---

### 2. EmbeddingGemma 300M for semantic search — `embeddinggemma:latest` ✅
**Community pattern** (`local-rag-agent-gemma4`): Uses `embeddinggemma-300M-qat-Q4_0.gguf` via llama.cpp server on `:8081`.

**Our implementation**: `embeddinggemma:latest` in Ollama (621 MB installed), used by all embedding endpoints.
**Status**: ✅ Same model family, our Ollama path is equivalent.

---

### 3. Hybrid RAG (BM25 + Semantic) — `retrieval-machine.ts` ✅
**Community pattern** (`local-rag-agent-gemma4`): BM25 keyword recall → EmbeddingGemma semantic rerank → Reciprocal Rank Fusion.

**Our implementation**: Fuse.js fuzzy recall → Qdrant dual-vector rerank (0.6 content + 0.4 signature). RRF is conceptually identical.
**Status**: ✅ More sophisticated than community (we add PG full-text + Qdrant payload filters).

---

### 4. Tool-Calling Agent — `autonomous-agent.ts` ✅
**Community pattern** (`gemma4-agent-toolkit`): Frozen dataclass config, Ollama tool-use API, schema compliance benchmark.
```python
config = AgentConfig(
    model="gemma4:26b",
    ollama_host="http://localhost:11434",
    temperature=0.3,
    num_ctx=32768,
    tools=("search_database", "get_weather", "create_alert", "query_logs"),
)
```
**Our implementation**: `AutonomousAgent` class (`autonomous-agent.ts`), 14 LangChain DynamicStructuredTools, `gemma4-legal:latest` LLM.
**Status**: ✅ LangChain ReAct agent is ACTIVE (re-audit Apr 7: `createReactAgent` imported and used, NOT commented out).
**Bonus**: LangGraph `SupervisorAgent` with 5 domain-specific subagents also wired at `/api/agent/investigate`.

---

### 5. Granite-Docling PDF Parsing — `vlm-evidence-analyzer.ts` / evidence pipeline ✅
**Community**: Nobody has this (0 community repos use Granite-Docling). Our differentiator.
**Our implementation**: `ibm/granite-docling:258m` installed (521 MB), `GRANITE_DOCLING_MODEL` env var, `GRANITE_DOCLING_ENABLED=true`.
**Status**: ✅ Unique advantage — layout-aware table/heading/citation preservation in legal PDFs.

---

## Gaps to Close 🔧

### G1: Audio Transcription — `whisper/transcribe/+server.ts` ✅ DONE (re-audit Apr 7)
**Community**: 0 repos have audio. We're pioneering this.
**Current state**: FULLY IMPLEMENTED — `nodejs-whisper` v0.2.9 installed, CUDA acceleration, 99 languages.
**Features**: Language detection, translate to English, word-level timestamps, JSON segment output.
**Route**: 25MB limit, 9 MIME types, 8 extensions, auth guard, Langfuse tracing.

---

### G2: LangChain ReAct Agent — `autonomous-agent.ts` ✅ DONE (re-audit Apr 7)
**Community** (`Chaperone-RAG`, `gemma4-agent-toolkit`): Full agent loops working with LangChain + Gemma4.
**Current state**: ALL ACTIVE — `createReactAgent` from `@langchain/langgraph/prebuilt` imported and used (NOT commented out).
**Installed packages**: `@langchain/ollama` v1.0.1, `@langchain/langgraph` v1.2.7, `@langchain/core` v1.0.4, `langchain` v1.0.4
**3 agent files**:
- `autonomous-agent.ts` — `ChatOllama` + `createReactAgent` + 14 `DynamicStructuredTool`s
- `subagents.ts` — 5 domain-specific ReAct agents (audio, document, case, codebase, general)
- `supervisor.ts` — LangGraph `StateGraph` with LLM intent routing + keyword fallback
**Note**: Chaperone-RAG is a community reference repo, not our code.

---

### G3: Image resize for Gemma4 variable token budgets — `resize-for-vlm.ts` ✅ DONE (re-audit Apr 7)
**Community pattern** (`gemma4-ocr`): `--max-edge 2048`, DPI 300, auto thumbnail.
**Current state**: ALREADY UPDATED — uses `GEMMA4_VLM_MAX_EDGE = 2048` (not the old `GEMMA3_VLM_SIZE = 896`).
**File**: `sveltekit-frontend/src/lib/server/image/resize-for-vlm.ts`
**VLM analyzer**: `vlm-evidence-analyzer.ts` imports `GEMMA4_VLM_MAX_EDGE` correctly.

---

### G4: Ollama keep_alive tuning for multi-model card 8GB VRAM
**Community pattern** (`gemma4-agent-toolkit`): Single model, no keep_alive concern.
**Our constraint**: RTX 3060 Ti 8GB must hold `gemma4:e4b-it-q4_K_M` (5.5 GB) + `embeddinggemma:latest` (0.5 GB) simultaneously.
**Current state**: `OLLAMA_CHAT_KEEP_ALIVE=10m`, `OLLAMA_EMBED_KEEP_ALIVE=24h` in dev script. ✅
**For LangExtract + Granite-Docling concurrent use**: `granite-docling:258m` is CPU-bound (document parsing), not VRAM. ✅ No contention.
**Status**: No code change needed — configuration already optimal.

---

## Playwright Testing: What to Screenshot for Repo Upload

Run these before committing to verify all differentiators are visually working:

### Quick screenshot test (dev server must be running on :5173)
```bash
# From workspace root
node scripts/tests/test-screenshots.mjs
```

### Full route sweep with HTML gallery
```bash
node scripts/tests/test-screenshots.mjs --all --html
```
Output: `scripts/tests/screenshots/latest/` — HTML gallery + PNG per route.

### Key routes that prove our differentiators

| Route | What it proves | Expected result |
|-------|---------------|----------------|
| `/evidence` | Evidence pipeline UI | Card grid, upload button visible |
| `/evidence/upload` | VLM analysis trigger | Upload form with file drop zone |
| `/dashboard` | Full app loads, auth bypass | Case count, recent activity |
| `/cases/test-id/ai` | LangChain agent UI | AI chat panel, tool list |
| `/cases/test-id/chat` | SSE streaming chat | Gemma4-legal chat interface |
| `/evidence/analyze` | VLM image analyze route | Analysis form visible |
| `/admin/ai-dashboard` | Model status panel | Model health cards (Ollama, Qdrant, embeddinggemma) |
| `/admin/knowledge-search` | RAG + KAG search | Knowledge graph query input |
| `/global-search` | Cross-modal search | Search bar, filter chips |
| `/persons-of-interest` | POI + VLM photo tags | POI cards with AI tags |

### Specific things to verify visually
1. **VLM status**: `/admin/ai-dashboard` should show `gemma4:e4b-it-q4_K_M` as the active VLM model
2. **Evidence pipeline**: `/evidence` should show the 8-stage processing pipeline status
3. **Audio**: Any audio upload UI should now correctly show "not available" (501) — no more fake success
4. **Granite-Docling**: Evidence upload showing "Document parsing via Granite-Docling 258M" in status

### CI/CD Playwright config
Playwright specs already have graceful skipping when Ollama/Qdrant unavailable:
```typescript
// Pattern used across AI specs — works in CI without GPU
test.beforeAll(async () => {
  const health = await fetch('http://localhost:11434/api/tags').catch(() => null);
  if (!health?.ok) test.skip();
});
```
Existing CI: `.github/workflows/sveltekit-ci.yml` — runs postgres+redis, drizzle push, playwright test, artifact upload.

---

## Repo Upload Checklist

Before pushing to GitHub, run and capture:

- [ ] `node scripts/tests/test-screenshots.mjs --all --html` → attach HTML report
- [ ] Verify `scripts/tests/screenshots/latest/` has PNGs for all 23+ routes
- [ ] `cd sveltekit-frontend && npx svelte-check --threshold error` → 0 errors
- [ ] Check no `.env.local` secrets in diff (`OPENAI_API_KEY`, `JWT_SECRET`, etc.)
- [ ] Confirm `static/ort/*.wasm` is in `.gitignore` (24+ MB WASM binaries excluded)
- [ ] Confirm `scripts/tests/screenshots/` is in `.gitignore` (or only commit `latest/report.json`)

### What to include in the PR description
```
Stack: SvelteKit 5 + Gemma4 E4B (9.6 GB, Text+Image) + EmbeddingGemma + Granite-Docling 258M
Models installed: gemma4:e4b-it-q4_K_M, gemma4-legal:latest, embeddinggemma:latest, ibm/granite-docling:258m
Differentiators over community repos:
  - Qdrant GPU vector search + pgvector dual-store (community uses in-memory)
  - Granite-Docling 258M structured PDF parsing (unique — 0 community repos)
  - KAG Neo4j knowledge graph (unique)
  - 8-stage RabbitMQ evidence pipeline with entity extraction + forensics
  - Legal GRPO fine-tuned Gemma4 (Semaj90/gemma4-e4b-legal-grpo)
  - FastMCP 9 tools + LangChain 14-tool agent
  - Full SvelteKit SSR frontend with SSE streaming chat
Audio transcription: HTTP 501 (nodejs-whisper integration pending)
Testing: Playwright 23-route screenshot suite, graceful AI service skipping
```

---

## Summary: Our Stack vs Community

| Feature | Community best | Our stack |
|---------|---------------|-----------|
| VLM OCR | `gemma4-ocr` (poppler+Ollama) | ✅ Same + Triton ensemble fallback |
| Embeddings | EmbeddingGemma 300M (llama.cpp) | ✅ Same (Ollama, 621 MB) |
| Hybrid RAG | BM25+RRF (jryhu2gh) | ✅ Fuse.js+Qdrant+PG (stronger) |
| Tool calling | 14-tool agent (toolkit) | ✅ 14 LangChain tools + LangGraph supervisor |
| PDF parsing | PyPDF / poppler | ✅ Granite-Docling 258M (unique) |
| Legal domain | ❌ None | ✅ GRPO fine-tune |
| Graph RAG | ❌ None | ✅ KAG Neo4j |
| Audio | ❌ None | ✅ nodejs-whisper CUDA + multilingual (99 langs) |
| Multi-tenant DB | ❌ None | ✅ PG 16 + Drizzle ORM |
| Frontend | ❌ CLI / Streamlit | ✅ SvelteKit 5 SSR + SSE |
| Message queue | ❌ None | ✅ RabbitMQ 7 queues |
| Playwright tests | ❌ None | ✅ 23-route screenshot suite |

**Bottom line**: The community confirms our VLM + embedding model choices are correct. Our stack is 5-6 layers deeper than anything published. All gaps (G1-G3) have been closed as of April 7 re-audit. Audio (nodejs-whisper), LangChain ReAct agent, and Gemma4 VLM resize are all implemented.
