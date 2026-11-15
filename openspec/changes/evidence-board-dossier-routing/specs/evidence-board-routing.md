# OpenSpec Specification: Evidence Board Functional Zones & Routing Contract

## Functional Zone Architecture (94 Elements)

### Zone 1: Global Navigation & Veritas Crest Rail (31 Elements)
- `VE RI TAS` (Toggle sidebar button)
- Primary links: `/dashboard`, `/command-center`, `/active-cases`, `/cases`, `/persons-of-interest`, `/evidence`, `/evidence-library`, `/citations`, `/legal-corpus`, `/library`, `/library/glossary`, `/global-search`, `/analysis-center`
- Admin/Tools: `/admin/ai-dashboard`, `/terminal`, `/demos/memory-palace`, `/fictional-cases`, `/simulation`, `/demos/courtroom-sim`, `/demos`, `/admin`, `/system-configuration`, `/admin/library`, `/admin/ast-topology`, `/admin/gpu-evidence-graph`, `/admin/error-brain`, `/demos/agentic-errors`, `/admin/codebase-index`
- Rail expanders: `sidebar-top-toggle`, `expand-rail`

### Zone 2: Editorial Top Navbar (9 Elements)
- Brand: `YORHA LAW LEX ET IUSTITIA` (`/dashboard`)
- Primary Sections: `CASES` (`/cases`), `EVIDENCE` (`/evidence`), `CITATIONS` (`/citations`), `LIBRARY` (`/library`), `CORPUS` (`/analysis-center`)
- Controls: `Ctrl K` Quick Search, `AI :8090` Status indicator, `ADMIN · PG18` User Profile Dropdown

### Zone 3: Case Dossier Subnav Hub (7 Elements)
- `DOSSIER HUB` (`/cases/[id]`)
- `✦ AI COUNSEL CHAT` (`/cases/[id]/chat`)
- `OVERVIEW` (`/cases/[id]/overview`)
- `NOTES` (`/cases/[id]/notes`)
- `EVIDENCE CANVAS` (`/cases/[id]/canvas`)
- `EVIDENCE BOARD` (`/cases/[id]/board` - Active Route)
- `REPORTS` (`/cases/[id]/reports`)

### Zone 4: Evidence Board Command Bar (7 Elements)
- `3D RELIEF DEMO` (`/cases/[id]/board/relief`)
- `Switch Case [⌘K]` (Opens CaseSwitcher modal/popover)
- `AI Layout` (Auto-aligns canvas nodes via force-directed layout)
- `Chat` (Toggles contextual investigation sidebar)
- `3D / IMAGE PREFLIGHT` (`/demos/spz-renderer?mode=preflight&returnCaseId=[id]`)
- `Active Investigation` (Toggles investigation pin status)
- `Add Evidence` (Opens EvidenceUploadModal dialog)

### Zone 5: Multi-View Matrix (8 Elements)
- `INVESTIGATIVE` (Free-form node/relationship canvas)
- `FORENSIC CANVAS` (Orthographic coordinate grid)
- `DETECTIVE` (Timeline and suspect connection graph)
- `WALL` (Clustered pinning board layout)
- `LINE` (Chronological timeline stream)
- `FILE` (Document dossier filing view)
- `LIST` (Tabular evidence register)
- `Save Board` (Serializes board state to IndexedDB / Redis session cache)

### Zone 6: Evidentiary Dossier Action Bar (3 Elements)
- `✦ AI Counsel` (Opens CourtroomEvidentiaryBriefModal)
- `Export Packet` (Downloads compiled PDF/JSON evidence dossier)
- `PENDING REVIEW` (Toggles exhibit review status filter)

### Zone 7: Left Evidence Filter & Exhibit Cards (6 Elements)
- Category filters: `ALL`, `FILE`, `MEDIA`, `ANALYSIS`
- Search bar: `Search evidence...`
- Quick action: `ADD EVIDENCE`

### Zone 8: Center Canvas Toolbar & Right Evidence Inspector (23 Elements)
- Canvas manipulation: `Select/Move`, `Pan Canvas`, `Connect Nodes`, `Bounding Box`, `Add Image`, `3D Scene`, `Annotation Pen`, `Zoom Out`, `Zoom In`, `Reset View`, `Toggle Grid`, `-`, `+`, `Reset`, `Options`
- Exhibit Inspection: `View (3 entries) >` (Chain of custody modal), `RELATIONSHIPS (4)`, `NOTES`, `Refresh timeline`
- Contextual Floaters: `✦` (Ornith Screen VLM Reticle), `Open Contextual Legal AI Counsel (:8090)`
