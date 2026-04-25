# Design Document: YoRHa Detective Screens

## Overview

The YoRHa Detective Screens provide three interconnected interfaces for legal investigation: a Command Center for case management, an Evidence Board for relationship visualization, and an AI Legal Terminal for intelligent analysis. The design prioritizes real-time data synchronization, intuitive navigation, and the noir/cyber forensic aesthetic established in the WardenNet theme.

## Architecture

### High-Level System Flow

```
Prosecutor Login (Lucia v3)
    ↓
Command Center Dashboard
    ├→ View Active Cases
    ├→ Monitor System Status
    └→ Quick Actions
    ↓
Case Selection
    ├→ Evidence Board (Visualization)
    ├→ AI Legal Terminal (Analysis)
    └→ Case Details
    ↓
Evidence Interaction
    ├→ Drag/Zoom on Board
    ├→ Query via Terminal
    └→ Update Chain-of-Custody
    ↓
Report Generation & Export
```

### Technology Stack

| Component | Technology | Purpose |
|-----------|-----------|---------|
| Frontend Framework | SvelteKit | Reactive UI with server-side rendering |
| UI Components | Bits UI + UnoCSS | Accessible, themeable components |
| Canvas Rendering | HTML5 Canvas + Native Drag-Drop | Fast Evidence Board with native browser APIs |
| Real-time Updates | SvelteKit Server-Sent Events (SSE) | Live dashboard updates |
| State Management | SvelteKit stores + Drizzle ORM | Client/server state sync |
| AI Integration | Gemma (Ollama) + Function Calling | Legal reasoning and evidence queries |
| Database | PostgreSQL + pgvector | Evidence storage and vector search |
| Search | Elasticsearch | Full-text evidence indexing |
| Styling | UnoCSS + Warden Theme CSS | Consistent noir/cyber aesthetic |

## Components and Interfaces

### 1. Command Center Dashboard (`/dashboard`)

#### Component Structure

```
CommandCenterLayout
├── Header (Navigation + User Menu)
├── StatisticsPanel
│   ├── ActiveCasesCard
│   ├── PendingEvidenceCard
│   ├── ApprovedEvidenceCard
│   └── PersonsOfInterestCard
├── ActiveCasesSection
│   ├── CaseFilterBar
│   └── CaseCardGrid
│       └── CaseCard (repeating)
│           ├── CaseTitle
│           ├── StatusBadge
│           ├── EvidenceCount
│           ├── LastUpdated
│           └── QuickActionButtons
├── SystemStatusPanel
│   ├── DatabaseStatus
│   ├── ElasticsearchStatus
│   ├── GemmaServiceStatus
│   └── StorageCapacity
└── QuickActionsPanel
    ├── TimelineAnalysisButton
    ├── EvidenceSummaryButton
    ├── SuspectConnectionsButton
    └── GenerateReportButton
```

#### Data Flow

1. **Initial Load**: Fetch active cases, statistics, and system status from `/api/dashboard/stats`
2. **Real-time Updates**: SSE connection to `/api/dashboard/stream` for live case updates
3. **Case Selection**: Click case card → navigate to `/cases/[id]` with Evidence Board pre-loaded
4. **Quick Actions**: Route to appropriate analysis screen with case context

#### API Endpoints

- `GET /api/dashboard/stats` - Returns case counts, evidence stats, system status
- `GET /api/dashboard/stream` - SSE stream for real-time updates
- `GET /api/cases` - List all cases with pagination
- `GET /api/cases/[id]` - Case details with evidence summary

### 2. Evidence Board (`/cases/[id]/board`)

#### Component Structure

```
EvidenceBoardLayout
├── Header (Case Title + Toolbar)
│   ├── ZoomControls (In/Out/Reset)
│   ├── LayoutOptions (Auto-arrange, Save Layout)
│   ├── FilterPanel (By Status, Classification, Type)
│   └── ExportButton
├── CanvasContainer (WebGL/Three.js)
│   ├── GridBackground (Blueprint pattern)
│   ├── EvidenceNodes (Draggable cards)
│   │   ├── NodeIcon/Thumbnail
│   │   ├── EvidenceID
│   │   ├── Classification Badge
│   │   └── StatusIndicator
│   ├── RelationshipLines (Crimson connections)
│   │   └── RelationshipLabel (on hover)
│   └── SelectionBox (Multi-select)
├── ContextMenu (Right-click)
│   ├── View Details
│   ├── Add Relationship
│   ├── Remove Node
│   └── Generate Summary
├── RelationshipPanel (Side panel)
│   ├── SelectedNodeInfo
│   ├── ConnectedNodesTree
│   └── RelationshipEditor
└── StatusBar (Bottom)
    ├── NodeCount
    ├── RelationshipCount
    └── LastSavedTimestamp
```

#### Canvas Rendering Strategy

- **Framework**: HTML5 Canvas with native browser APIs
- **Node Rendering**: Bone-white rectangles with crimson borders, drawn directly on canvas
- **Relationship Lines**: Crimson lines connecting nodes, drawn with canvas stroke
- **Interaction**: Native HTML5 drag-and-drop API for node movement, mouse wheel for zoom
- **Performance**: Efficient canvas redraw on state changes, no external dependencies

#### Data Flow

1. **Load Case**: Fetch evidence nodes and relationships from `/api/cases/[id]/evidence`
2. **Render Board**: Initialize Three.js scene, position nodes based on stored layout
3. **User Interaction**:
   - Drag node → update position in memory, persist on save
   - Add relationship → POST to `/api/evidence/relationships`
   - Delete node → remove from case (soft delete)
4. **Real-time Sync**: SSE updates for new evidence or relationship changes

#### API Endpoints

- `GET /api/cases/[id]/evidence` - Evidence nodes with positions and relationships
- `POST /api/evidence/relationships` - Create relationship between nodes
- `DELETE /api/evidence/relationships/[id]` - Remove relationship
- `PUT /api/cases/[id]/board/layout` - Save board layout (node positions)
- `GET /api/evidence/[id]/relationships` - Get all relationships for a node

### 3. AI Legal Terminal (`/terminal`)

#### Component Structure

```
AILegalTerminalLayout
├── Header (Terminal Title + System Info)
│   ├── ConnectionStatus
│   ├── GemmaModelInfo
│   └── CaseSelector
├── TerminalWindow (CRT-style)
│   ├── TerminalOutput (Scrollable)
│   │   ├── SystemPrompt (Initial greeting)
│   │   ├── QueryHistory (repeating)
│   │   │   ├── UserQuery (green text)
│   │   │   ├── GemmaResponse (green text)
│   │   │   ├── FunctionCallResults (indented)
│   │   │   └── Timestamp
│   │   └── CurrentCursor (blinking)
│   ├── InputLine
│   │   ├── PromptSymbol (">")
│   │   ├── InputField (monospace)
│   │   └── SubmitButton (Enter key)
│   └── ScanlineOverlay (CSS effect)
├── SidePanel (Collapsible)
│   ├── CommandReference
│   │   ├── /search - Search evidence
│   │   ├── /analyze - Analyze relationships
│   │   ├── /extract - Extract holdings/citations
│   │   ├── /report - Generate report
│   │   └── /export - Export results
│   ├── RecentQueries
│   └── SavedAnalyses
└── StatusBar (Bottom)
    ├── TokenUsage
    ├── ResponseTime
    └── CaseContext
```

#### Gemma Function-Calling Integration

**Available Functions**:

1. `search_evidence(query: string, case_id: string) → Evidence[]`
   - Full-text search via Elasticsearch
   - Vector similarity search via pgvector
   - Returns top 5 matching evidence with snippets

2. `extract_holdings(evidence_id: string) → Holding[]`
   - Parse legal holdings from evidence text
   - Return structured holdings with citations

3. `find_citations(evidence_id: string) → Citation[]`
   - Extract case citations, statutes, regulations
   - Link to external legal databases

4. `analyze_relationships(evidence_ids: string[]) → Relationship[]`
   - Analyze connections between evidence
   - Return relationship type and confidence score

5. `generate_summary(case_id: string) → CaseSummary`
   - Compile case overview with key findings
   - Include evidence summary, holdings, and investigative status

#### Query Processing Flow

```
User Query
    ↓
Route to Gemma with function-calling prompt
    ↓
Gemma determines if function call needed
    ├→ Yes: Execute function(s)
    │   ├→ search_evidence()
    │   ├→ extract_holdings()
    │   ├→ find_citations()
    │   ├→ analyze_relationships()
    │   └→ generate_summary()
    │   ↓
    │   Aggregate results
    ├→ No: Direct response
    ↓
Format response for terminal display
    ↓
Display in terminal with clickable links
    ↓
Store in query history
```

#### API Endpoints

- `POST /api/terminal/query` - Submit query to Gemma
- `GET /api/terminal/history` - Retrieve query history
- `POST /api/terminal/functions/search_evidence` - Execute search function
- `POST /api/terminal/functions/extract_holdings` - Execute extraction function
- `POST /api/terminal/functions/find_citations` - Execute citation function
- `POST /api/terminal/functions/analyze_relationships` - Execute analysis function
- `POST /api/terminal/functions/generate_summary` - Execute summary function

## Data Models

### Evidence Node (Board)

```typescript
interface EvidenceNode {
  id: string;
  caseId: string;
  evidenceId: string;
  title: string;
  classification: 'public' | 'confidential' | 'sealed';
  status: 'pending' | 'approved' | 'locked' | 'rejected';
  boardPosition: {
    x: number;
    y: number;
    z: number;
  };
  thumbnail?: string;
  type: 'document' | 'image' | 'audio' | 'video';
  createdAt: Date;
  updatedAt: Date;
}
```

### Relationship (Board)

```typescript
interface EvidenceRelationship {
  id: string;
  sourceNodeId: string;
  targetNodeId: string;
  type: 'mentions' | 'contradicts' | 'supports' | 'references' | 'timeline';
  confidence: number; // 0-1
  source: 'manual' | 'gemma' | 'user';
  metadata?: Record<string, any>;
  createdAt: Date;
}
```

### Terminal Query

```typescript
interface TerminalQuery {
  id: string;
  caseId: string;
  userId: string;
  query: string;
  response: string;
  functionCalls: FunctionCall[];
  results: any[];
  timestamp: Date;
}

interface FunctionCall {
  name: string;
  args: Record<string, any>;
  result: any;
  executionTime: number;
}
```

## Error Handling

### Command Center
- **Case Load Failure**: Display error banner with retry button
- **System Status Unavailable**: Show "Unknown" status with warning icon
- **Real-time Update Failure**: Graceful degradation, manual refresh option

### Evidence Board
- **Canvas Rendering Error**: Fallback to list view
- **Relationship Creation Failure**: Undo action, display error toast
- **Layout Save Failure**: Warn user, offer local storage fallback

### AI Terminal
- **Gemma Connection Error**: Display connection error, suggest troubleshooting
- **Function Call Timeout**: Retry with exponential backoff, max 3 attempts
- **Query Parsing Error**: Display helpful error message with query suggestions

## Audit Mode & Digital Signatures (L3 Forensic Compliance)

### Audit Levels

| Mode | Behavior | Signature | Mutability |
|------|----------|-----------|-----------|
| **L3** (Default) | Every action hashed + time-locked | ✔ Yes | ❌ Immutable |
| **L2** | Changes allowed, versions logged | ❌ No | ♻ Version history |
| **L1** | Dev/test only, minimal logging | ❌ No | ♻ Overwrites allowed |

### Digital Signature Implementation

**Signature Formula**:
```
signature = SHA256(user_id + user_email + role + timestamp + action_payload)
```

**Example**:
```
user: 3fb8c3d2-a487-4b0f-bd20-ea3213c28fd2
action: "APPROVED EVIDENCE"
hash: 2a4c81ea1b3cf453e77daaf595dab0e56c90c4e8e06e7bacaa7a6c3fba83d8f
```

### L3 Enforcement Rules

| Action | L3 Behavior |
|--------|------------|
| Delete evidence | ❌ Forbidden (must reject instead) |
| Modify metadata | ❌ Forbidden |
| Redact text | ✔ Stored as new version, original preserved |
| Change audit mode | 🔐 Signed + logged, requires confirmation |
| Export | ✔ Signed + watermark with timestamp |

### Immutable Log Storage

**Dual Storage**:
- **Loki**: Append-only chain-of-custody logs
- **PostgreSQL**: Searchable audit history with signatures

**Database Schema**:
```sql
CREATE TABLE warden_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  action TEXT NOT NULL,
  payload JSONB,
  signature TEXT NOT NULL,
  hash TEXT NOT NULL,
  timestamp TIMESTAMP DEFAULT now()
);
```

### Audit Mode UI (CRT Terminal Style)

Green neon CRT terminal display, immutable, sorted newest first:

```
[13:44:21] APPROVED EVIDENCE #D2F4 — user 3fb8c3d2 — sig 2a4c81ea...
[13:44:25] OCR EXTRACTED — pages: 12 — sig 533bc19d...
[13:44:29] 512-CHUNKED — total: 48 segments — sig 8835cc1d...
[13:45:52] EMBEDDINGS CREATED — 768D — sig dd0320cc...
```

Each log record is clickable to reveal full hash + JSON payload.

### Audit Mode Downgrade (L3 → L2)

**Requirements**:
- Super-admin or lead prosecutor only
- Password re-entry required
- 2FA-style confirmation
- Downgrade action itself is logged and signed
- Cannot downgrade below L2 in production

**API Endpoint**:
```
POST /api/settings/audit-mode
Body: { mode: 'L2', password: string, confirmationCode: string }
```

## Testing Strategy

### Command Center
- Unit tests for statistics calculation
- Integration tests for case list pagination
- E2E tests for navigation and real-time updates

### Evidence Board
- Unit tests for node positioning and layout persistence
- Canvas rendering tests (visual regression)
- Interaction tests for drag/zoom/relationship creation

### AI Terminal
- Unit tests for query parsing and function-calling logic
- Integration tests with Gemma mock
- E2E tests for full query workflows

### Cross-Screen
- Navigation flow tests
- State consistency tests across screens
- Performance tests for large case datasets (100+ evidence items)

