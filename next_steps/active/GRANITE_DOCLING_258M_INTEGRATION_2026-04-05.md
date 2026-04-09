# Granite-Docling-258M — Document Understanding Integration Plan

**Created:** 2026-04-05
**Status:** Active — Phase 1 COMPLETE (Ollama API wired, evidence upload + ACE ingest + MCP + dedicated API endpoint)
**Priority:** High — fills the document-to-structured-text gap in our evidence pipeline

---

## What Is Granite-Docling-258M?

IBM's ultra-compact **258M parameter Vision Language Model** purpose-built for document conversion. Released September 2025, Apache 2.0 license.

| Property | Value |
|----------|-------|
| **Developer** | IBM Research |
| **Parameters** | 258M (165M Granite LLM + 93.5M SigLIP2 vision) |
| **Ollama size** | 522 MB (332 MB model + 190 MB projector) |
| **Ollama tag** | `ibm/granite-docling:258m` |
| **License** | Apache 2.0 |
| **Speed** | 0.35 sec/page on A100; ~1-2 sec/page estimated on RTX 3060 Ti |
| **Architecture** | SigLIP2-base-patch16-512 vision + Idefics3 projector + Granite 165M LLM |
| **Output format** | **DocTags** — structured markup capturing all page elements |
| **Languages** | English (primary), Japanese/Arabic/Chinese (experimental) |

### What It Does (vs. Plain OCR)

Traditional OCR (Tesseract) extracts flat text. Granite-Docling understands **document structure**:

| Capability | Tesseract OCR | Granite-Docling-258M | Benchmark |
|-----------|--------------|---------------------|-----------|
| **Plain text extraction** | Good | Better | F1: 0.84 |
| **Table structure** | None | Excellent | TEDS: 0.97 |
| **Code blocks** | Garbled | Preserved with formatting | F1: 0.988 |
| **Math equations** | Fails | LaTeX output | F1: 0.968 |
| **Charts** | Fails | Extracts data as tables | Supported |
| **Document layout** | None | Headers, footers, sections, captions | MAP: 0.27 |
| **Signatures/stamps** | None | Detected with bounding boxes | Supported |
| **Reading order** | Left-to-right only | Semantic reading order | Supported |

### DocTags Output Format

Granite-Docling outputs **DocTags** — a structured markup that captures every page element with its type, content, and spatial location:

```xml
<doctag>
  <section_header>Contract Terms</section_header>
  <text>The parties agree to the following conditions pursuant to 42 U.S.C. § 1983...</text>
  <table>
    <otsl> ... structured table data ... </otsl>
  </table>
  <formula>E = mc^2</formula>
  <code>function calculateDamages() { ... }</code>
  <caption>Figure 1: Timeline of events</caption>
</doctag>
```

This is far richer than raw text — it preserves the **semantic structure** of legal documents, which is critical for our chunking and retrieval pipeline.

---

## Why This Matters for Our Legal AI Platform

### Current Document Pipeline (Gap Analysis)

```
Evidence Upload (/api/evidence/upload)
    ↓
Stage 2: Text Extraction
    ├─ pdf-parse (basic text extraction — loses structure)
    ├─ Tesseract OCR fallback (scanned docs — flat text only)
    └─ Docling service (port 8085) — available but BASIC
        └─ Uses docling-parse (Python), NOT Granite-Docling VLM
        └─ Returns fullText + blocks, but no DocTags structure
    ↓
Stage 3: Legal Chunking (legal-chunker.ts)
    └─ Splits by ARTICLE/SECTION/§ markers
    └─ PROBLEM: If Stage 2 lost structure, chunking is degraded
    ↓
Stage 4: Embedding (embeddinggemma → Qdrant)
    └─ Garbage in, garbage out — flat OCR text → poor embeddings
```

### With Granite-Docling-258M

```
Evidence Upload (/api/evidence/upload)
    ↓
Stage 2: Granite-Docling-258M (Ollama, 522 MB)
    ├─ Input: Document page image (Sharp-rendered PDF pages)
    ├─ Output: DocTags structured markup
    ├─ Tables preserved as OTSL (structured, not flattened)
    ├─ Headers/sections identified (improves legal chunking)
    ├─ Signatures/stamps detected (forensic metadata)
    └─ Code/equations preserved (expert reports, patent docs)
    ↓
Stage 2b: LangExtract (port 8095)
    ├─ Input: Extracted structured text from Granite-Docling
    ├─ spaCy NER: Named entities (people, orgs, dates, money)
    ├─ Ollama NER: Legal entities via gemma4-legal (citations, statutes)
    ├─ Regex: Patterns (SSN, phone, email, case numbers)
    └─ Output: Enriched text + entities + practice area classification
    ↓
Stage 3: Legal Chunking (legal-chunker.ts)
    ├─ IMPROVED: DocTags section boundaries → precise chunk splits
    ├─ Tables chunked as whole units (not split mid-row)
    └─ Headers preserved as chunk metadata
    ↓
Stage 4: Embedding + Vector Storage
    ├─ embeddinggemma:latest → 768-dim vectors
    ├─ Qdrant: evidence_items collection (dense + BM42 sparse)
    ├─ pgvector: evidence_vectors table (halfvec HNSW)
    └─ Tags: DocTags element types → Qdrant payload filters
    ↓
Stage 5-6: Entity Extraction + Forensics (existing, unchanged)
    ↓
Stage 7: Retrieval (RAG + KAG + DAG)
    ├─ RAG: Qdrant vector search (IMPROVED — structured chunks)
    ├─ KAG: Neo4j graph neighbors → Qdrant pre-filter
    ├─ DAG: CouchDB topological ordering → citation chains
    ├─ Authority Chain: Multi-hop statute/case expansion
    └─ Corrective RAG: LLM query reformulation on low confidence
    ↓
Stage 8: Summarization via gemma4-legal:latest
    ↓
Stage 9: GPU Background Analysis (CUDA clustering/similarity)
```

### Integration Points (Concurrent Parallelism)

```
RabbitMQ Queues (async pipeline):
    ├─ evidence.process → triggers Granite-Docling extraction
    ├─ document.embed → triggers embedding after extraction
    ├─ vector.index → Qdrant + pgvector storage
    └─ cache.invalidate → bust stale retrieval cache

XState v5 (client orchestration):
    ├─ document-processing machine → states: uploading → extracting → chunking → embedding → done
    ├─ evidence-custody machine → tracks chain of custody through pipeline
    └─ retrieval machine → 2-stage: Fuse.js recall → Qdrant rerank

Drizzle ORM 0.44 (PostgreSQL storage):
    ├─ evidence table → stores extractedText, docTags metadata
    ├─ evidence_vectors table → pgvector halfvec(768) embeddings
    ├─ document_chunks table → legal-chunker output
    └─ analysis_cache table → JSONB for Granite-Docling results
```

---

## Implementation Plan

### Phase 1: Pull Model + Basic Wiring (1 Session) ✅ COMPLETE

| Step | Action | Files | Status |
|------|--------|-------|--------|
| 1 | `ollama pull ibm/granite-docling:258m` (522 MB) | Terminal | ✅ |
| 2 | Add `GRANITE_DOCLING_MODEL` + `GRANITE_DOCLING_ENABLED` to env.server.ts | [env.server.ts](sveltekit-frontend/src/lib/server/env.server.ts) | ✅ |
| 3 | Create `granite-docling.ts` — Ollama multimodal API wrapper | `src/lib/server/analysis/granite-docling.ts` | ✅ |
| 4 | Wire into evidence upload Stage 2 (before text extraction) | [evidence/upload/+server.ts](sveltekit-frontend/src/routes/api/evidence/upload/+server.ts) | ✅ |
| 5 | Parse DocTags output → structured sections + table data | `granite-docling.ts` | ✅ |
| 6 | Wire into ACE ingest (scanned PDF fallback) | [ace/ingest/+server.ts](sveltekit-frontend/src/routes/api/ace/ingest/+server.ts) | ✅ |
| 7 | Dedicated extraction API endpoint | `api/evidence/extract-docling/+server.ts` | ✅ |
| 8 | MCP tool integration (`transcribeAudio` via docling) | [mcp/server.ts](sveltekit-frontend/src/mcp/server.ts) | ✅ |
| 9 | Dev UI toggle (Odin dashboard) | [odin/+page.svelte](sveltekit-frontend/src/routes/(dev)/odin/+page.svelte) | ✅ |

### Phase 2: Enhanced Chunking + Tags (1 Session)

| Step | Action | Files |
|------|--------|-------|
| 1 | Update legal-chunker to use DocTags section boundaries | [legal-chunker.ts](sveltekit-frontend/src/lib/server/indexer/legal-chunker.ts) |
| 2 | Add DocTags element types as Qdrant payload tags | Qdrant upsert calls |
| 3 | Table chunks: preserve as whole units with OTSL metadata | legal-chunker.ts |
| 4 | Add `granite_docling` stage to RabbitMQ evidence.process consumer | [queue-worker.ts](sveltekit-frontend/src/lib/server/queue/) |
| 5 | Update XState document-processing machine with new state | [document-processing machine](sveltekit-frontend/src/lib/machines/) |
| 6 | Update dashboard GrpcStatusAdapter (needs stage label added) | [GrpcStatusAdapter.ts](sveltekit-frontend/src/lib/stores/dashboard/GrpcStatusAdapter.ts) |

### Phase 3: Replace Docling Service (Optional)

The current Docling service (port 8085, Docker `docling-vlm`) runs `docling-parse` (basic extraction) + YOLO + Whisper. Granite-Docling-258M via Ollama is **better at document understanding** and doesn't need a separate Docker container.

| Step | Action | Impact |
|------|--------|--------|
| 1 | Route PDF/image extraction through Ollama Granite-Docling | Replaces `docling-parse` |
| 2 | Keep YOLO in Docker service (object detection still needed) | No change |
| 3 | Keep Whisper in Docker service (audio transcription) | No change |
| 4 | Optionally retire `docling-parse` from Docker image | Saves ~200 MB container size |

**Decision**: Keep Docker service running for YOLO + Whisper, but route document understanding through Ollama Granite-Docling. This simplifies the pipeline (one fewer service dependency for documents).

---

## Ollama API Integration

### Multimodal Chat API (Document Analysis)

```typescript
// granite-docling.ts — Ollama multimodal API wrapper
import { ollamaFetch } from '$lib/server/ollama.js';

export async function extractDocumentWithGraniteDocling(
  imageBase64: string,
  instruction: string = 'Convert this page to DocTags.'
): Promise<GraniteDoclingResult> {
  const response = await ollamaFetch('/api/chat', {
    method: 'POST',
    body: JSON.stringify({
      model: 'ibm/granite-docling:258m',
      messages: [{
        role: 'user',
        content: instruction,
        images: [imageBase64]  // base64-encoded page image
      }],
      stream: false,
      options: { temperature: 0.0, num_predict: 8192 }
    })
  });
  // Parse DocTags from response.message.content
  return parseDocTags(response.message.content);
}
```

### Specialized Instructions

| Instruction | Purpose |
|------------|---------|
| `Convert this page to DocTags.` | Full page extraction |
| `<chart>` | Extract chart data as table |
| `<formula>` | Extract equations as LaTeX |
| `<code>` | Extract code blocks with formatting |
| `<otsl>` | Extract tables in OTSL format |
| `OCR the text in the region [x1, y1, x2, y2]` | Region-specific extraction |

---

## VRAM Budget (RTX 3060 Ti — 8 GB)

| Model | VRAM | Purpose | When Loaded |
|-------|------|---------|-------------|
| `gemma4-legal:latest` | 5.3 GB | Legal text LLM | Chat/synthesis/ACE |
| `embeddinggemma:latest` | 621 MB | 768-dim embeddings | Always |
| `ibm/granite-docling:258m` | ~522 MB | Document extraction | During evidence upload |
| **Total (concurrent)** | **~6.4 GB** | Embedding + Granite-Docling | Fits! |

**Key insight**: Granite-Docling (522 MB) can run **concurrently** with embeddinggemma (621 MB) within our 8 GB VRAM budget. Ollama swaps gemma4-legal out during document processing, then swaps it back for chat. This is handled automatically by Ollama's `keep_alive` model management.

For batch evidence uploads, the pipeline would be:
1. Load Granite-Docling + embeddinggemma (~1.1 GB)
2. Process all documents (extract → chunk → embed)
3. Unload Granite-Docling, load gemma4-legal for summarization
4. Generate summaries for all processed evidence

---

## Pipeline Integration Diagram

```
                    ┌─────────────────────────────────────────────┐
                    │         Evidence Upload (Stage 2)            │
                    │                                             │
   PDF/Image ──────►│  Granite-Docling-258M (Ollama, 522 MB)     │
                    │  ├─ DocTags structured output                │
                    │  ├─ Tables (OTSL), equations (LaTeX)        │
                    │  ├─ Layout: headers, sections, captions     │
                    │  └─ Signatures, stamps (bbox + type)        │
                    └──────────────┬──────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────────────┐
                    │         LangExtract (Port 8095)             │
                    │  ├─ spaCy NER (en_core_web_md)              │
                    │  ├─ Ollama NER (gemma4-legal)               │
                    │  ├─ Regex patterns (SSN, phone, citations)  │
                    │  └─ Practice area classification (14 areas) │
                    └──────────────┬──────────────────────────────┘
                                   │
        ┌──────────────────────────┼──────────────────────────┐
        │                          │                          │
┌───────▼───────┐  ┌──────────────▼──────────┐  ┌───────────▼──────────┐
│ Legal Chunker │  │ Embedding (768-dim)      │  │ YOLO Object Detection│
│ (Stage 3)     │  │ embeddinggemma:latest    │  │ yolov8n (ONNX)       │
│ ARTICLE/§     │  │ Qdrant + pgvector        │  │ Layout regions       │
│ DocTags-aware │  │ BM42 sparse + dense      │  │ Signatures, stamps   │
└───────┬───────┘  └──────────────┬──────────┘  └───────────┬──────────┘
        │                          │                          │
        └──────────────────────────┼──────────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────────────┐
                    │      Retrieval (RAG + KAG + DAG)            │
                    │                                             │
                    │  RAG: Qdrant vector search                  │
                    │       ├─ Dense: embeddinggemma cosine       │
                    │       └─ Sparse: BM42 keyword (RRF fusion)  │
                    │                                             │
                    │  KAG: Neo4j graph pre-filter                │
                    │       ├─ getCaseGraphNeighborIds()           │
                    │       └─ buildGraphShouldFilter() → Qdrant  │
                    │                                             │
                    │  DAG: CouchDB topological ordering           │
                    │       └─ Citation chain priority             │
                    │                                             │
                    │  Authority Chain: Multi-hop expansion        │
                    │       └─ Statute → Case → Statute (2 hops) │
                    │                                             │
                    │  Corrective RAG: LLM reformulation          │
                    │       └─ When top score < 0.50              │
                    └──────────────┬──────────────────────────────┘
                                   │
                    ┌──────────────▼──────────────────────────────┐
                    │  Synthesis (gemma4-legal:latest)             │
                    │  ├─ SSE streaming via /api/sse/chat          │
                    │  ├─ ACE self-eval → retry (quality < 0.6)   │
                    │  ├─ Tool calling (glossary, RAG, web search) │
                    │  └─ RabbitMQ async via synthesis.generate    │
                    └─────────────────────────────────────────────┘
```

### Concurrent Processing (RabbitMQ + XState v5)

```
RabbitMQ Queues (server-side async):
    ┌─ evidence.process ──────► Granite-Docling extraction
    │                           ├─ Promise.allSettled([
    │                           │    extractDocTags(page1),
    │                           │    extractDocTags(page2),
    │                           │    extractDocTags(page3),  // parallel per-page
    │                           │  ])
    │                           └─ Merge results → structured text
    │
    ├─ document.embed ─────────► embeddinggemma → Qdrant + pgvector
    │                           (triggered after extraction completes)
    │
    ├─ vector.index ───────────► Qdrant upsert with DocTags metadata tags
    │
    └─ cache.invalidate ───────► Bust retrieval cache for affected case

XState v5 (client-side orchestration):
    document-processing machine:
      idle → uploading → extracting(granite-docling) → chunking → embedding → indexing → done
                              ↑ NEW STATE

    evidence-custody machine:
      tracks chain-of-custody attestation through each stage

Drizzle ORM 0.44 (PostgreSQL persistence):
    evidence.extractedText ──────── raw text (existing)
    evidence.metadata.docTags ───── DocTags structured output (NEW, JSONB)
    evidence.metadata.tables ────── extracted tables (NEW, JSONB array)
    evidence.metadata.equations ─── LaTeX formulas (NEW, JSONB array)
    document_chunks.chunkType ───── 'text' | 'table' | 'code' | 'equation' (enhanced)
    document_chunks.metadata ────── DocTags element type + bbox (JSONB)
```

---

## Verification Checklist

- [ ] `ollama pull ibm/granite-docling:258m` completes (522 MB)
- [ ] `ollama run ibm/granite-docling:258m` responds to "Convert this page to DocTags" with image
- [ ] granite-docling.ts wrapper extracts structured DocTags from test PDF page
- [ ] Evidence upload pipeline calls Granite-Docling for image/PDF evidence
- [ ] DocTags stored in `evidence.metadata.docTags` (verify via DB query)
- [ ] Legal chunker uses DocTags section boundaries for improved splits
- [ ] Qdrant chunks tagged with element type (`table`, `section_header`, etc.)
- [ ] RabbitMQ evidence.process queue triggers extraction
- [ ] XState document-processing machine shows "extracting" state in UI
- [ ] Dashboard GrpcStatusAdapter shows "Granite-Docling Parsing" stage label (NOT YET WIRED � needs implementation)
- [ ] VRAM stays under 8 GB during concurrent Granite-Docling + embeddinggemma

---

## References

- [IBM Granite-Docling Announcement](https://www.ibm.com/new/announcements/granite-docling-end-to-end-document-conversion)
- [HuggingFace Model Card](https://huggingface.co/ibm-granite/granite-docling-258M)
- [Ollama Registry](https://ollama.com/ibm/granite-docling:258m)
- [InfoQ Coverage](https://www.infoq.com/news/2025/10/granite-docling-ibm/)
- [MarkTechPost Release Article](https://www.marktechpost.com/2025/09/17/ibm-ai-releases-granite-docling-258m-an-open-source-enterprise-ready-document-ai-model/)
- [Medium: Supercharge RAG 2.0 with Granite-Docling](https://medium.com/@visrow/ibm-granite-docling-super-charge-your-rag-2-0-pipeline-32ac102ffa40)
