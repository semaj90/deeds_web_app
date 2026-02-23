# Comprehensive Stub Component Ranking Report
## AST Graph / Codebase Indexing Analysis — Production Readiness

**Generated**: Session 83 (Feb 22, 2026)
**Total Components**: 922 (.svelte files)
**Working Components**: 614 (66.6%)
**Stub Components**: 308 (33.4%)
**svelte-check**: 0 errors, 79 warnings

---

## Executive Summary

308 stub files contain identical "Page under reconstruction" placeholder markup. They were created during the Phase 99 batch repair (commit `bef1745ad5`) after the Phase 99 auto-migration tool (commit `0a2bd98929`) corrupted 83+ files.

**Key findings:**
- **0 stubs** are imported by any active route or component (100% orphaned)
- **93 stubs** have recoverable pre-corruption code in git history (commit `fa8498dc4a`)
- **215 stubs** have no recoverable code (created as empty stubs or in subdirectories added later)
- **54 stubs** are in `_archive/` (Svelte 4 / test-demo — safely deletable)

---

## Dependency Graph Analysis

### Import Status
| Status | Count | % |
|--------|-------|---|
| Imported by routes | 0 | 0% |
| Imported by other components | 0 | 0% |
| Referenced in barrel `index.ts` only | 9 | 2.9% |
| Truly orphaned (zero references) | 299 | 97.1% |

### Working Component Coverage (Already Functional)
| Domain | Working | Stubs | Coverage |
|--------|---------|-------|----------|
| ui/ | 258 | 152 | 63% |
| ai/ | 75 | 8 | 90% |
| (root) | 56 | 86 | 39% |
| yorha/ | 51 | 0 | 100% |
| evidence/ | 23 | 0 | 100% |
| legal/ | 21 | 5 | 81% |
| legal-ai/ | 19 | 0 | 100% |
| canvas/ | 13 | 0 | 100% |
| poi/ | 11 | 0 | 100% |
| dashboard/ | 10 | 0 | 100% |
| forms/ | 8 | 0 | 100% |
| codebase/ | 8 | 0 | 100% |
| cases/ | 8 | 0 | 100% |
| editor/ | 6 | 0 | 100% |

**Key insight**: Most production domains already have working components. Stubs are concentrated in `ui/` (152) and `(root)` (86) — mostly duplicate/alternative implementations.

---

## API Endpoint Cross-Reference

### Domains With Backend Ready
| Domain | API Endpoints | Stub Components | Priority |
|--------|--------------|-----------------|----------|
| **Chat/AI** | `/api/chat/*`, `/api/sse/*` (7) | AIChat, Chat, EnhancedChat, GPUAcceleratedChat, LegalAIChat, OllamaChatInterface + 22 more | HIGH |
| **Evidence** | `/api/evidence/*` (6) | EvidenceUpload, EvidenceGrid, EvidenceAnalysisForm, EvidencePanel + 19 more | HIGH |
| **Cases** | `/api/cases/*` (8) | CaseManager, CaseManagerXState, EnhancedLegalCaseManager, CaseAutomation + 4 more | HIGH |
| **RAG/Search** | `/api/rag/*`, `/api/codebase/*` (4) | EnhancedRAGInterface, RealtimeRAG, EnhancedAISearch + 8 more | MEDIUM |
| **Citations** | `/api/citations/*` (3) | CitationManager + 1 more | MEDIUM |
| **Documents** | `/api/evidence/*`, `/api/embed` (5) | DocumentDetailModal, DocumentUploadForm + 22 more | MEDIUM |
| **Persons** | `/api/persons/*` (1) | AddPoiModal | LOW |
| **Health** | `/api/health/*` (8) | PerformanceDashboard, LoggingDashboard | LOW |

---

## Tier Rankings

### TIER 1: RECOVER FROM GIT (93 files, substantial pre-corruption code)

These stubs have **real implementations** in git history at `fa8498dc4a`. Recovery = `git show` + Svelte 5 rune migration.

#### Top 30 by Code Size (lines)
| Rank | Component | Lines | Domain | API Ready | Recovery Effort |
|------|-----------|-------|--------|-----------|----------------|
| 1 | EnhancedCanvasEditor | 1368 | Visualization | N/A | HIGH (complex) |
| 2 | GPUAcceleratedChat | 1177 | AI/Chat | Yes | HIGH |
| 3 | Chat | 1092 | AI/Chat | Yes | MEDIUM |
| 4 | WebGPUProcessor | 1064 | Visualization | N/A | HIGH |
| 5 | AdvancedRichTextEditor | 982 | Editor | N/A | MEDIUM |
| 6 | RealTimeEvidenceGrid | 831 | Evidence | Yes | MEDIUM |
| 7 | Neo4jRecommendation3DViewer | 826 | Visualization | Partial | HIGH |
| 8 | DocumentDetailModal | 812 | Documents | Yes | MEDIUM |
| 9 | ReportEditor | 808 | Documents | Yes | MEDIUM |
| 10 | GraphExplorer | 790 | Visualization | Partial | HIGH |
| 11 | EnhancedLegalCaseManager | 763 | Cases | Yes | MEDIUM |
| 12 | AccessibilityPanel | 703 | UI/Core | N/A | LOW |
| 13 | EnhancedLegalAI | 661 | AI/Legal | Yes | MEDIUM |
| 14 | ai-synthesis-client | 652 | AI/Service | Yes | MEDIUM |
| 15 | CRUDDashboard | 649 | Admin | Partial | MEDIUM |
| 16 | SimpleCaseManager (legal/) | 620 | Cases | Yes | MEDIUM |
| 17 | EnhancedLegalAIDemo | 600 | AI/Demo | Yes | LOW |
| 18 | BitsDemo | 597 | UI/Demo | N/A | LOW |
| 19 | EditableCanvasSystem | 574 | Visualization | N/A | HIGH |
| 20 | OllamaChatInterface | 573 | AI/Chat | Yes | MEDIUM |
| 21 | EnhancedRAGInterface | 569 | Search/RAG | Yes | MEDIUM |
| 22 | EvidenceGrid | 534 | Evidence | Yes | MEDIUM |
| 23 | CaseManager (legal/) | 552 | Cases | Yes | MEDIUM |
| 24 | TokenUsageManager | 527 | Admin | Partial | LOW |
| 25 | LegalCaseManager | 527 | Cases | Yes | MEDIUM |
| 26 | FileUploadWithFallback | 502 | Upload | Yes | MEDIUM |
| 27 | LoggingDashboard | 500 | Dev/Admin | Partial | LOW |
| 28 | EnhancedAISearch | 491 | Search | Yes | MEDIUM |
| 29 | CaseManagerXState (legal/) | 438 | Cases | Yes | MEDIUM |
| 30 | CaseAutomation (legal/) | 402 | Cases | Yes | MEDIUM |

#### Remaining Recoverable (63 files, 50-400 lines each)
DocumentUploadForm (436), ArtifactViewer (415), AIAssistant (408), NierHeader (395), EvidenceUploader (389), TagList (385), ErrorBoundary (369), EvidenceValidationModal (377), InfiniteScrollList (352), Header (346), EvidenceUpload (337), Sidebar (327), KeyboardShortcutsPanel (310), FileUploadSection (309), KeyboardShortcuts (292), CaseInfoForm (292), Avatar (280), NierNavigation (268), AIAssistantButton (266), UserDropdown (261), UploadAreaExample (249), EvidenceUploadModal (217), AIAnalysisForm (194), EvidencePanel (153), HeadlessDemo (151), AIFabButton (147), SearchInput (146), AIChat (146), MemoryMonitor (139), NierRichTextEditor (124), LLMInference (123), Settings (122), ProgressIndicator (106), VoiceAssistant (99), LoadingSpinner (87), LLMUpload (77), EvidenceUploadBoard (73), LegalAIChat (68), FeedbackButtons (67), UploadArea (62), Typewriter (61)

---

### TIER 2: BUILD NEW (152 ui/ stubs — most are duplicate UI primitives)

These have NO recoverable git history. Most are alternative/variant implementations of components that already work.

| Subdirectory | Count | Already Have Working? | Action |
|-------------|-------|----------------------|--------|
| **ui/bits/** | 70 | Yes (bits-ui direct) | DELETE — bits-ui used directly |
| **ui/nes/** | 11 | Yes (yorha/ has 51) | DELETE — yorha/ covers this |
| **ui/gaming/** | 11 | Yes (yorha/ has 51) | DELETE — yorha/ covers this |
| **ui/modular/** | 7 | Yes (ui/ has 258 working) | DELETE — redundant |
| **ui/core/** | 7 | Yes (main ui/ components) | DELETE — redundant |
| **ui/BitsDropdown/** | 5 | Yes (bits-ui direct) | DELETE — bits-ui used directly |
| **ui/tabs-bits/** | 4 | Yes (bits-ui Tabs) | DELETE — bits-ui used directly |
| **ui/wrappers/** | 4 | Yes (main ui/) | DELETE — redundant |
| **ui/n64/** | 3 | Yes (yorha/) | DELETE — redundant |
| **ui/modern/** | 3 | Yes (main ui/) | DELETE — redundant |
| **ui/enhanced/** | 3 | Yes (main ui/) | DELETE — redundant |
| **ui/tooltip/** | 2 | Yes (Tooltip.svelte works) | DELETE — redundant |
| **ui/grid/** | 2 | No | ASSESS — may be useful |
| **ui/other (19 dirs)** | 20 | Mostly yes | DELETE — redundant |
| **Total** | **152** | | **~145 DELETE, ~7 ASSESS** |

---

### TIER 3: ARCHIVE/DELETE (54 files)

| Directory | Count | Reason |
|-----------|-------|--------|
| `_archive/svelte4/` | 25 | Svelte 4 patterns, incompatible |
| `_archive/test-demo/demo/` | 14 | Demo/experiment artifacts |
| `_archive/test-demo/dev/` | 4 | Dev utilities |
| `_archive/test-demo/examples/` | 4 | Example code |
| `_archive/test-demo/storybook/` | 5 | Storybook stories |
| `_archive/test-demo/tests/` | 2 | Test artifacts |

---

### TIER 4: ROOT-LEVEL STUBS — No Git Recovery (86 - 93 recoverable = ~0 without history)

All 86 root-level stubs HAVE git recovery. See Tier 1.

---

## Production Reintegration Priority Matrix

### P0 — IMMEDIATE (Session 83-85): Cases + Evidence Core
**Why**: These are the core legal workflow components with API backends ready.

| Component | Lines | Route Target | API |
|-----------|-------|-------------|-----|
| EvidenceGrid | 534 | /evidence | /api/evidence |
| DocumentDetailModal | 812 | /evidence-library | /api/evidence |
| EnhancedLegalCaseManager | 763 | /cases | /api/cases |
| CaseManager (legal/) | 552 | /cases | /api/cases |
| SimpleCaseManager (legal/) | 620 | /cases | /api/cases |
| EvidenceUpload | 337 | /evidence | /api/evidence |
| ReportEditor | 808 | /cases/[id] | /api/cases |
| LoadingSpinner | 87 | (global) | N/A |
| ErrorBoundary | 369 | (global) | N/A |

### P1 — SHORT-TERM (Session 86-90): Chat + Search
| Component | Lines | Route Target | API |
|-----------|-------|-------------|-----|
| Chat | 1092 | /ai-dashboard | /api/chat |
| OllamaChatInterface | 573 | /ai-dashboard | /api/chat |
| EnhancedRAGInterface | 569 | /global-search | /api/rag |
| EnhancedAISearch | 491 | /global-search | /api/rag |
| AIAssistant | 408 | /dashboard | /api/chat |
| RealTimeEvidenceGrid | 831 | /evidence | /api/evidence |

### P2 — MEDIUM-TERM (Session 91-100): Legal AI + Documents
| Component | Lines | Route Target | API |
|-----------|-------|-------------|-----|
| EnhancedLegalAI | 661 | /analysis-center | /api/rag |
| CaseManagerXState (legal/) | 438 | /cases | /api/cases |
| CaseAutomation (legal/) | 402 | /cases | /api/cases |
| DocumentUploadForm | 436 | /evidence | /api/evidence |
| FileUploadWithFallback | 502 | /evidence | /api/evidence |
| AdvancedRichTextEditor | 982 | /cases/[id] | N/A |
| EvidenceValidationModal | 377 | /evidence | /api/evidence |
| EvidenceUploadModal | 217 | /evidence | /api/evidence |

### P3 — LATER: Visualization + GPU
| Component | Lines | Notes |
|-----------|-------|-------|
| EnhancedCanvasEditor | 1368 | Complex canvas, needs WebGPU |
| GPUAcceleratedChat | 1177 | GPU inference, needs CUDA |
| WebGPUProcessor | 1064 | WebGPU pipeline |
| Neo4jRecommendation3DViewer | 826 | 3D graph, needs Neo4j |
| GraphExplorer | 790 | D3/graph visualization |

### P4 — DELETE (197 files)
- **145 ui/ subdirectory stubs** — redundant with working ui/ components
- **54 _archive/ stubs** — Svelte 4 incompatible
- Consider `git rm` + archive commit

---

## Recovery Process (Per Component)

```bash
# 1. Extract pre-corruption code from git
git show fa8498dc4a:sveltekit-frontend/src/lib/components/ComponentName.svelte > /tmp/original.svelte

# 2. Assess corruption level
# - Phase 99 patterns: import { $effect }, semicolons in objects, etc.
# - Svelte 4 patterns: export let, $:, on:click, <slot>
# - Missing deps: imports from non-existent files

# 3. Migration checklist:
# [ ] export let → $props()
# [ ] $: → $derived() / $derived.by()
# [ ] on:click → onclick
# [ ] <slot> → {#snippet children()}{/snippet} + {@render children()}
# [ ] writable() → $state()
# [ ] import from 'svelte/store' → remove
# [ ] Add interface Props {}
# [ ] Fix bits-ui v1 → v2 patterns
# [ ] Test with svelte-check

# 4. Wire to route
# Import in target +page.svelte
# Add UI toggle/tab/section
# Verify with Playwright
```

---

## Metrics Summary

| Metric | Value |
|--------|-------|
| Total stubs | 308 |
| Recoverable from git | 93 (30.2%) |
| Delete candidates | 197 (64.0%) |
| Assess/review needed | 18 (5.8%) |
| P0 immediate priority | 9 components |
| P1 short-term | 6 components |
| P2 medium-term | 8 components |
| P3 later | 5 components |
| Est. total recoverable LOC | ~28,000 lines |

---

## Appendix: Full Stub List by Directory

### Root (86 stubs)
+AddNotesSection, +CaseCard, AdvancedRichTextEditor, AIAnalysisForm, AIAssistant, AIAssistantButton, AIChat, AIFabButton, ArtifactViewer, Chat, CRUDDashboard, DemoChat, DetectiveLayout, DocumentDetailModal, DocumentUploadForm, EditableCanvasSystem, Enhanced3DSemanticProcessor, EnhancedAISearch, EnhancedCanvasEditor, EnhancedChat, EnhancedDocumentUpload, EnhancedLegalAI, EnhancedLegalAIDemo, EnhancedLegalCaseManager, EnhancedLegalChat, EnhancedLegalUploadAnalytics, EnhancedRAGInterface, ErrorHandler, EvidenceAnalysisForm, EvidenceGrid, EvidencePanel, EvidenceSidebar, EvidenceUpload, EvidenceUploadBoard, EvidenceUploader, FeedbackButtons, FileUploadSection, FileUploadWithFallback, GlobalAIAssistantButton, GlobalSidebar, GPUAcceleratedChat, GraphExplorer, Header, HeadlessDemo, IntelligentEvidenceList, KeyboardShortcutProvider, KeyboardShortcuts, KeyboardShortcutsPanel, LegalAIChat, LegalAIDashboard, LegalCaseManager, LegalTextureCanvas, LLMAssistant, LLMInference, LLMUpload, LoadingSpinner, LoggingDashboard, MemoryMonitor, MinimalLanding, MinioUpload, MonacoEditor, Neo4jRecommendation3DViewer, NierHeader, NierNavigation, NierRichTextEditor, NierThemeShowcase, OllamaChatInterface, OptimizedMinIOUpload, PerfChart, PerformanceDashboard, SearchInput, SessionInitializer, Settings, Sidebar, TagList, TokenUsageManager, Toolbar, Typewriter, UIDiagram, UnifiedIntegrationDemo, UploadArea, UploadAreaExample, UserDropdown, VoiceAssistant, WebGPUProcessor

### ui/bits/ (70 stubs)
AIAssistantTest, AIChatMessage, AIDialog, AIRecommendations, AISearchBar, Alert, AlertDescription, AnimationLibrary, AvatarDisplay, Board, Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle, ChatMessage, DialogWrapper, DocumentCard, DraggableModal, EditorCard, EmbeddingForm, EmbeddingGemmaChat, EmbeddingSearch, EnhancedBitsDemo, EnhancedModal, EnhancedRAGStudio, EvidenceAIAnalysis, EvidenceBoard, EvidenceThumbnail, FormGrid, FullStackLegalAI, GemmaEmbeddingDemo, GlyphEngineRenderer, GoldenRatioLoader, HybridLegalAnalysis3D, Input, IntelligentRenderer, KeyboardHelp, KeyboardMapping, KeyboardProvider, Label, LegalAIDashboard, LegalAIDemo, LegalPOICard, LinkButton, NESButton, NESCard, NESGamingShowcase, NESModal, Popover, ProfileContainer, ProfileHeader, SearchInput, Select, Sidebar, SidebarDemo, SPACanvasRenderer, SSRWebGPULoader, Tabs, ThemeDemo, ThemeProvider, ThemeToggle, Toolbar, Tooltip, VectorIntelligenceDemo, WebAssemblyIntegrationDemo, YoRHaHarvardButton, YoRHaHarvardCard, YoRHaSearchBar

### ui/other (82 stubs across 20+ subdirs)
BitsDropdown/ (5), core/ (7), gaming/ (11), nes/ (11), n64/ (3), modular/ (7), modern/ (3), enhanced/ (3), wrappers/ (4), tabs-bits/ (4), tooltip/ (2), grid/ (2), toast/ (1), tabs/ (1), ai/ (1), button/ (1), context-menu/ (1), data-table/ (1), date-picker/ (1), dialog/ (1), dropdown/ (1), enhanced-bits/ (1), enhanced-search/ (1), error-boundary/ (1), evidence/ (1), forms/ (1), input/ (1), layout/ (1), loading/ (1), modular-command/ (1), modular-dialog/ (1), modular-examples/ (1)

### Subdirectories (16 stubs)
ai/ (8), legal/ (5), modals/ (2), rag/ (2)

### _archive/ (54 stubs)
svelte4/ (25), test-demo/ (29)