# Codebase Wiring Chart — AST Route Graph

## Last Updated: February 24, 2026 (Session 93r17)

## Metrics Summary

| Metric | Count |
|--------|-------|
| App Routes (pages) | 24 |
| API Routes | 140+ |
| Layouts | 10 |
| .svelte files | 909 |
| .ts files | 1,610 |
| SSR Disabled | 10 |
| SSR Enabled | 14 |

---

## Route → Component → API Wiring

### Legend
```
[ROUTE] ──imports──> (Component)
[ROUTE] ──fetches──> {/api/endpoint}
[ROUTE] ──action───> <?/formAction>
SSR: ON | OFF        Server load: YES | NO
```

---

### Shared Layout: `(app)/+layout.svelte`
```
[LAYOUT] ──> (CaseDocumentWriter)
         ──> (CodebaseSearch)
         ──> (ErrorBoundary)
         ──> (OfflineIndicator)
         ──> notificationStore
         ──> 14 primary nav links + 7 admin links
```

---

### 1. `/dashboard` — SSR: ON | Server Load: YES
```
[dashboard]
  ├── (Button) (Card) (CardContent) (CardHeader) (CardTitle)
  ├── (WorkspacePanel) (SystemStatusPanel) (FallbackAlert)
  ├── (ProgressCard) (DocumentThumbnailTray)
  ├── (RecentActivity) (ActiveCasesWidget) (YoRHaDataViz)
  ├── (LegalDisclaimer) (AIAssistantButton) (CommandPalette)
  ├──> {GET /api/cases?limit=10}
  └──> {GET /api/dashboard/stats}
```

### 2. `/active-cases` — SSR: ON | Server Load: YES
```
[active-cases]
  ├── (CaseFilters) (CasesList) (CaseCardGrid) (CaseCard)
  ├── (CaseStats) (CaseScoringDashboard)
  ├── (SearchBar) (ErrorAlert)
  └── Data from server load (no client fetch)
```

### 3. `/cases` — SSR: ON | Server Load: YES
```
[cases]
  ├── Modal form (inline)
  ├──> <?/create>          POST new case
  └──> <?/updateStatus>    PATCH case status (bulk)
```

### 4. `/cases/[id]` — SSR: OFF | Server Load: YES
```
[cases/[id]]
  ├── +layout.svelte (sub-navigation)
  │
  ├── /overview
  │   ├── (CaseEvidenceOrganizer)
  │   ├──> {GET /api/errors/summary}
  │   └──> {GET /api/consolidation/status}
  │
  ├── /ai — SSR: OFF
  │   ├── (AIChatAssistant)
  │   └──> {GET /api/chat/stream} (SSE)
  │
  ├── /persons
  │   ├── (PersonCard) (AddPoiModal)
  │   └──> {GET /api/persons?caseId=...}
  │
  └── /board
      └── (EvidenceBoard)
```

### 5. `/evidence` — SSR: OFF (bits-ui Dialog TDZ) | Server Load: YES
```
[evidence] — LARGEST PAGE (39 components)
  ├── Forms:     (SmartDocumentForm) (EnhancedFileUpload) (EnhancedDocumentUploader)
  ├── Modals:    (EvidenceCRUDModal) (EvidenceUploadModal) (DocumentDetailModal)
  │              (ContextualEvidenceChatModal)
  ├── Upload:    (UploadZone) (EvidenceUpload) (DocumentUploadMachineIntegration)
  ├── AI:        (LegalDocumentSummarizer) (Gemma270MWebAssembly) (VisionImageAnalyzer)
  ├── Analysis:  (EvidenceConnections) (IntegrityVerification) (RelationshipInspector)
  │              (WorkflowProgress)
  ├── Views:     (YorhaEvidenceGrid) (MarkdownSceneViewer)
  ├── Maps:      (DetectiveEvidenceMap) (EvidenceComparisonOverlay)
  ├── Custody:   (EvidenceCustodyFlow) (EvidenceReportSummary)
  ├── Chat:      (EvidenceAssistant) (ContradictionReveal) (LegalAnalysisDialog)
  ├── UI:        (CaseSelector) (UploadProgress) (UploadProgressCard) (ActionPopup)
  ├──> {POST /api/evidence/search}      semantic search (debounced 500ms)
  ├──> {GET /api/evidence/:id/report}
  ├──> <?/upload>                        file upload
  └──> <?/delete>                        evidence deletion
```

### 6. `/evidence-library` — SSR: OFF (bits-ui Dialog TDZ)
```
[evidence-library]
  ├── (EvidenceCard) (EvidenceModal)
  ├── Shared evidence components
  └──> {POST /api/evidence/search}
```

### 7. `/citations` — SSR: ON | Server Load: YES
```
[citations]
  ├── (CitationManager) (CitationDetail) (CitationSearch) (CitationList)
  ├── (StatuteActionPanel) (RelatedCasesPanel) (StatuteDetail) (LinkMetadataForm)
  ├── (CitationCollections) (CollectionDetail) (CitationInspector) (CitationLibraryPage)
  ├── (CitationSaveForm) (AttachToCaseModal) (SearchBox)
  ├──> {GET /api/citations?search=...&citationType=...}
  ├──> {POST /api/glossary/search}      Knowledge Base
  ├──> {POST /api/statutes/search}      Knowledge Base
  └──> {POST /api/precedents/search}    Knowledge Base
```

### 8. `/global-search` — SSR: ON
```
[global-search]
  ├── (RAGSearchComponent) (SearchPanel) (SearchResults) (ResultDetail)
  ├── (CodebaseSearch) (ContextConfirmModal) (VectorIntelligenceDemo)
  ├── GPU: dynamic import($lib/gpu/gpu-search-reranker.js)
  ├──> {POST /api/evidence/search}      RAG+KAG+DAG
  ├──> {POST /api/rag/search}           Simple RAG
  ├──> {POST /api/statutes/search}
  ├──> {POST /api/precedents/search}
  └──> {POST /api/glossary/search}
```

### 9. `/ai-dashboard` — SSR: OFF (browser-only AI)
```
[ai-dashboard] — 20+ AI components
  ├── Chat:        (AskAI) (ClientSideAIChat) (AIChatAssistant) (AgentChat)
  │                (YorhaAIAssistant) (YoRHaAIChat) (EnhancedYoRHaAIAssistant)
  ├── Inference:   (ClientGemmaDemo) (ClientGemmaInference) (Gemma270MWebAssembly)
  ├── Advanced:    (EnhancedLegalAIChatWithSynthesis) (EnhancedAIChatTest)
  │                (ContextualChatDemo)
  ├── Response:    (StreamingResponse) (TypewriterResponse)
  ├── Panel:       (ChatMessages) (ChatPanel) (GamingAIButton)
  ├── Orchestr:    (IntelligentModelOrchestrator)
  ├── RAG:         (SourceValidator) (AnswerWithCitations) (RAGPipelineChart) (ACEContextBubble)
  ├──> {GET /api/ai/stats}
  ├──> {GET /api/ai/models}
  ├──> {POST /api/rag/search}           3-step RAG pipeline
  ├──> {POST /api/rag/validate}         Source validation
  └──> {POST /api/rag/answer}           Generate answer
```

### 10. `/persons-of-interest` — SSR: ON | Server Load: YES
```
[persons-of-interest]
  ├── (PersonCard) (POICard) (PersonList) (PersonOfInterestDetailView)
  ├── (PersonForm) (AddPoiModal) (POIEditor)
  ├── (FilterPanel) (StatsPanel)
  ├──> {PATCH /api/persons/:id}
  └──> {DELETE /api/persons/:id}
```

### 11. `/persons-of-interest/[id]` — SSR: ON | Server Load: YES
```
[persons-of-interest/[id]]
  ├── (PersonOfInterestDetailView) (AssociatesList)
  └──> {GET /api/persons-of-interest/:id/associates}
```

### 12. `/analysis-center` — SSR: ON
```
[analysis-center]
  └── Analysis panels (entity extraction, forensics)
```

### 13. `/command-center` — SSR: OFF
```
[command-center]
  ├── (CommandPalette) (SystemDashboard)
  └── Full-page command interface
```

### 14. `/terminal` — SSR: OFF
```
[terminal]
  └── Browser-only terminal emulator
```

### 15. `/system-configuration` — SSR: ON
```
[system-configuration]
  └── Settings panels
```

### 16. `/system-status` — SSR: ON
```
[system-status]
  └──> {GET /api/health/capabilities}
```

### 17. `/memory-palace` — SSR: ON
```
[memory-palace]
  └── $lib/shared/chr97-reader.js (browser-safe DataView parser)
```

### 18. `/all-routes` — SSR: ON
```
[all-routes]
  └──> {GET /api/routes/stream} (SSE)
```

### 19. `/error-brain` — SSR: ON
### 20. `/agentic-errors` — SSR: ON
### 21. `/gpu-evidence-graph` — SSR: OFF (Canvas 2D)
### 22. `/ast-topology` — SSR: OFF (D3.js DOM refs)
### 23. `/codebase-index` — SSR: OFF (window.location.reload)
### 24. `/evidence-canvas-demo` — SSR: OFF

---

## API Endpoint Cross-Reference

| Endpoint | Method | Called By | Status |
|----------|--------|-----------|--------|
| `/api/cases` | GET | dashboard | WIRED |
| `/api/dashboard/stats` | GET | dashboard | WIRED |
| `/api/evidence/search` | POST | evidence, global-search | WIRED |
| `/api/evidence/:id/report` | GET | evidence | WIRED |
| `/api/citations` | GET | citations | WIRED |
| `/api/glossary/search` | POST | citations, global-search | WIRED |
| `/api/statutes/search` | POST | citations, global-search | WIRED |
| `/api/precedents/search` | POST | citations, global-search | WIRED |
| `/api/rag/search` | POST | ai-dashboard, global-search | WIRED |
| `/api/rag/validate` | POST | ai-dashboard | WIRED |
| `/api/rag/answer` | POST | ai-dashboard | WIRED |
| `/api/ai/stats` | GET | ai-dashboard | WIRED |
| `/api/ai/models` | GET | ai-dashboard | WIRED |
| `/api/persons/:id` | PATCH/DEL | persons-of-interest | WIRED |
| `/api/chat/stream` | GET SSE | cases/[id]/ai | WIRED |
| `/api/health/capabilities` | GET | system-status, client-router | WIRED |
| `/api/errors/summary` | GET | cases/[id]/overview | WIRED |
| `/api/consolidation/status` | GET | cases/[id]/overview | WIRED |
| `/api/evidence/upload` | POST | evidence (action) | WIRED |
| `/api/evidence/realtime` | GET SSE | evidence | WIRED |
| `/api/embed` | POST | 15+ components | WIRED |
| `/api/ai/stats` | GET | ai-dashboard | WIRED |
| `/api/ai/models` | GET | ai-dashboard | WIRED |
| `/api/ai/yorha/context-chat` | POST | terminal | WIRED |

---

## Shared Component Hotspots

| Component | Routes Using It | Import Path |
|-----------|----------------|-------------|
| Button | 5+ routes | `$lib/components/ui/Button.svelte` |
| Card/CardContent/CardHeader/CardTitle | 5+ routes | `$lib/components/ui/card/` |
| Icon | 20+ routes | `$lib/components/ui/Icon.svelte` |
| SearchBar | 3+ routes | `$lib/components/SearchBar.svelte` |
| CommandPalette | 2 routes + layout | `$lib/components/ui/CommandPalette.svelte` |
| CodebaseSearch | layout + global-search | `$lib/components/CodebaseSearch.svelte` |

---

## Client-Side State Flow

```
                    ┌─────────────────────────────────┐
                    │     Client Router               │
                    │  (client-router.ts)              │
                    │                                  │
                    │  Simple query ──> LOCAL ONNX     │
                    │    WebGPU → WASM → CPU           │
                    │    gemma270m (418MB)              │
                    │                                  │
                    │  Complex query ──> SERVER         │
                    │    Ollama gemma3-legal            │
                    │    SSE via /api/sse/chat          │
                    └──────────┬───────────────────────┘
                               │
              ┌────────────────┼────────────────┐
              │                │                │
     ┌────────▼──────┐  ┌─────▼──────┐  ┌──────▼─────┐
     │  LokiJS (L0)  │  │  IndexedDB │  │  Redis     │
     │  5-10min TTL  │  │  (L1) 7d   │  │  (L3)      │
     │  Session-only │  │  Persistent │  │  Cross-req │
     └───────────────┘  └────────────┘  └────────────┘
```

---

## SSR Classification

### OFF (10 routes) — Reason
| Route | Reason |
|-------|--------|
| `/evidence` | bits-ui Dialog TDZ in Svelte 5.46.0 SSR |
| `/evidence-library` | bits-ui Dialog TDZ in Svelte 5.46.0 SSR |
| `/ai-dashboard` | 28 browser-only AI/inference components |
| `/command-center` | Browser-only command interface |
| `/terminal` | Browser-only terminal emulator |
| `/evidence-canvas-demo` | Canvas/WebGL rendering |
| `/cases/[id]/ai` | AI inference components |
| `/gpu-evidence-graph` | Canvas 2D rendering requires browser DOM |
| `/ast-topology` | D3.js force simulation with HTMLDivElement refs |
| `/codebase-index` | Uses `window.location.reload()` in module scope |

### ON (14 routes) — All others use server-side rendering