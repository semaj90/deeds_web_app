# Active Demos — Complete List

**Date**: February 28, 2026
**Total Demos**: 12 route-based demos + 1 index page

---

## 🎮 Demo Routes

### 1. ACE Pipeline Demo
**Route:** `/demos/ace-pipeline`
**Component:** `ACEContextBubble.svelte` + `RAGPipelineChart.svelte`

**Features:**
- Augmented Contextual Engineering visualization
- RAG+KAG+DAG flow diagram
- Context bubble cards showing:
  - Confidence score (0-1)
  - Source (server-ollama, local-onnx)
  - RAG hits, KAG neighbors, codebase hits
  - Top similarity score
  - Embedding model used
  - Citations with document IDs
  - Cache hit status (idb, redis, lokijs)
  - Router decision breakdown
  - Conversation turn count

**Use case:** Debug and visualize the 7-stage AI context assembly pipeline

---

### 2. GPU Cache Demo
**Route:** `/demos/gpu-cache`
**Component:** `GPUCacheIntegrationDemo.svelte`

**Features:**
- NES-style CHR-ROM cartridge system
- WebGPU compute pipeline integration
- Glyph cache visualization
- 127:1 compression ratio
- 7-bit ASCII encoding
- Cache hit/miss metrics
- Bank switching animation

**Use case:** Demonstrate GPU-accelerated caching with Nintendo-inspired memory management

---

### 3. NES Elements Showcase
**Route:** `/demos/nes-elements`
**Component:** `NESElementsShowcase.svelte`

**Features:**
- Retro 8-bit UI components
- NES palette (54 colors)
- Pixel-perfect fonts
- CRT scanline effects
- Sprite-based buttons
- Background tile patterns
- Audio visualization (NES APU-style)
- CHR-ROM pattern viewer

**Use case:** Showcase the complete NES-inspired design system

---

### 4. Vector Intelligence Demo
**Route:** `/demos/vector-search`
**Component:** `VectorIntelligenceDemo.svelte`

**Features:**
- pgvector semantic search interface
- 768-dim embedding visualization
- Advanced filtering (date range, evidence type, similarity threshold)
- Sorting options (relevance, date, type)
- Batch operations (bulk tag, bulk delete)
- Real-time search debouncing
- Similarity score distribution chart
- Document preview cards

**Use case:** Test and demonstrate pgvector + Qdrant hybrid search capabilities

---

### 5. Knowledge Graph Demo
**Route:** `/demos/knowledge-graph`
**Component:** `ProvenanceGraph.svelte`

**Features:**
- D3.js force-directed graph visualization
- Entity nodes (person, organization, location, object, date, amount)
- Relationship edges (disputes, governed_by, authored, analyzes, implements, references, challenges, covers, evidence_for, contradicts, consulted, relevant_to)
- Interactive dragging
- Zoom/pan controls
- Color-coded entity types
- Relationship strength indicators
- RAG source validation integration

**Use case:** Visualize KAG (Knowledge-Augmented Generation) entity relationships

---

### 6. Case Scoring Dashboard
**Route:** `/demos/case-scoring`
**Component:** `CaseScoringDashboard.svelte`

**Features:**
- AI-powered case risk assessment
- Dynamic risk factors (evidence strength, legal precedents, timeline consistency, witness credibility, procedural compliance, opposing counsel strength)
- Confidence metrics (0-100%)
- Priority filtering (critical, high, medium, low)
- Risk level visualization (high/medium/low color coding)
- Real-time score updates
- Factor weight adjustment sliders
- Historical score trends

**Use case:** Demonstrate AI case outcome prediction and risk scoring

---

### 7. Legal Document Summarizer
**Route:** `/demos/document-summarizer`
**Component:** `LegalDocumentSummarizer.svelte`

**Features:**
- AI-powered multi-document type support:
  - Contracts
  - Court Judgments
  - Legal Briefs
  - Statutes/Regulations
- Quality metrics:
  - Compression ratio (original vs summary word count)
  - Key terms extracted
  - Entity detection count
  - Confidence score
- Adjustable summary length (brief, standard, detailed)
- Side-by-side original vs summary view
- Export options (markdown, JSON, plain text)

**Use case:** Test Ollama gemma3-legal summarization pipeline

---

### 8. RAG Document Grid
**Route:** `/demos/rag-documents`
**Component:** `RagDocumentGrid.svelte`

**Features:**
- Multi-document card grid layout
- Search bar with debounced filtering
- View toggle (grid vs list)
- File size formatting (KB, MB, GB)
- Document type badges (contract, evidence, brief, statute, case)
- Upload date sorting
- Relevance score display
- Quick actions (view, download, delete)
- Bulk selection mode
- Pagination controls

**Use case:** Showcase RAG pipeline document management UI

---

### 9. Retro Recommendations Demo
**Route:** `/demos/retro-recommendations`
**Component:** `RetroRecommendationModal.svelte`

**Features:**
- NES-style recommendation modal
- Topic modeling integration (k-means clustering)
- Multi-modal ranking (5 signals):
  1. Vector similarity (0.35 weight)
  2. Tag overlap (0.20 weight)
  3. Topic affinity (0.20 weight)
  4. Graph centrality (0.15 weight)
  5. User profile (0.10 weight)
- User interaction history tracking (view, click, save, share, dismiss)
- 7-day exponential decay
- Silhouette coefficient quality metrics
- Clustered recommendation cards
- "More like this" suggestions

**Use case:** Demo the 8-phase topic modeling + recommendation engine (Session 93r28b)

---

### 10. Cache Performance Demo
**Route:** `/demos/cache`
**Component:** `CacheDemo.svelte`

**Features:**
- 3-tier cache visualization:
  - L0: LokiJS (in-memory, 5-10min TTL)
  - L1: IndexedDB (persistent, 7-day TTL)
  - L2: Redis (server, configurable TTL)
- Hit/miss metrics by tier
- Latency comparison chart
- Cache size monitoring
- TTL countdown timers
- Eviction policy display
- Manual invalidation controls
- Real-time cache stats

**Use case:** Demonstrate client→server cache hierarchy performance

---

### 11. Bits UI Components Demo
**Route:** `/demos/bits-ui`
**Component:** `BitsUIDemo.svelte`

**Features:**
- bits-ui v2.16.2 component showcase:
  - Dialog (with Portal + Overlay + transitions)
  - Accordion (single + multiple selection)
  - Select (single + multi-select)
  - Checkbox (indeterminate states)
  - ScrollArea (horizontal + vertical)
  - Tabs (keyboard navigation)
  - Popover (positioning modes)
  - Tooltip (delay + offset)
  - RadioGroup
  - Switch
- All examples use Svelte 5 runes syntax
- Live code examples
- API documentation inline
- Accessibility features highlighted

**Use case:** Reference implementation for bits-ui v2 Svelte 5 patterns

---

### 12. Icons Showcase
**Route:** `/demos/icons`
**Component:** `Icon.svelte` wrapper demo

**Features:**
- UnoCSS `i-lucide-*` icon classes
- 128 safelist icons displayed
- Dynamic icon size controls (16px, 24px, 32px, 48px)
- Color customization
- Search/filter icons by name
- Copy class name to clipboard
- SSR-safe (pure CSS, zero JS)
- All Lucide icon set (800+ icons via @iconify-json/lucide)

**Use case:** Browse and test the icon system migration from @lucide/svelte → UnoCSS

---

## 📊 Demo Categories

| Category | Demos | Focus |
|----------|-------|-------|
| **AI/ML** | ACE Pipeline, Case Scoring, Document Summarizer, Retro Recommendations | LLM, embeddings, topic modeling |
| **Visualization** | Knowledge Graph, NES Elements, Vector Search | D3.js, force layout, semantic search |
| **Infrastructure** | GPU Cache, Cache Performance | WebGPU, multi-tier caching |
| **RAG Pipeline** | RAG Documents, Vector Intelligence | pgvector, Qdrant, document management |
| **UI Components** | Bits UI, Icons, NES Elements | Svelte 5, bits-ui v2, UnoCSS |

---

## 🚀 Demo Index Page

**Route:** `/demos`
**File:** `src/routes/(app)/demos/+page.svelte`

**Features:**
- Grid of all 12 demo cards
- Category filtering
- Search by demo name
- Quick navigation links
- Demo descriptions
- Technology badges (Svelte 5, WebGPU, bits-ui, D3.js, etc.)

---

## 🔧 Dev Tools Page

**Route:** `/admin/dev-tools`
**File:** `src/routes/(app)/admin/dev-tools/+page.svelte`

**Features:**
- Developer tooling dashboard
- Cache performance monitoring
- GPU metrics (WebGPU adapter info, compute limits, benchmarks)
- API endpoint registry (/api/docs)
- Database query analyzer
- Error brain integration
- System health checks

---

## 📝 Notes

### Demo Wiring Status
- ✅ All 12 demos fully wired and working
- ✅ All use Svelte 5 runes syntax
- ✅ All wrapped components exist and are active
- ✅ 0 svelte-check errors
- ✅ SSR-safe (except gpu-cache which needs browser env)

### Technology Stack
- **Frontend**: Svelte 5 + bits-ui v2.16.2 + UnoCSS
- **3D/Graphics**: D3.js (knowledge graph), WebGPU (gpu-cache), WebGL (fallback)
- **AI**: Ollama gemma3-legal + embeddinggemma
- **Caching**: LokiJS + IndexedDB + Redis
- **Vector**: pgvector + Qdrant dual storage
- **Icons**: UnoCSS presetIcons + @iconify-json/lucide

### Adding New Demos

To add a new demo:
1. Create route: `src/routes/(app)/demos/[demo-name]/+page.svelte`
2. Import component: `import DemoComponent from '$lib/components/.../DemoComponent.svelte'`
3. Add metadata (title, description)
4. Update demo index page
5. Add to CODEBASE_WIRING_CHART.md

---

**Last Updated:** 2026-02-28 (Session 93r28i continuation)