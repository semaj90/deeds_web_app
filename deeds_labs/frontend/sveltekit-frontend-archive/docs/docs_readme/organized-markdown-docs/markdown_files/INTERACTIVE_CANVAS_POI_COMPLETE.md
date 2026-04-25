# 🎯 Interactive Canvas POI System - Complete Implementation Guide

## 📖 Overview

This document describes the complete implementation of the Interactive, AI-Augmented Case Management Canvas with Person of Interest (POI) management. The system provides a spatial workspace where legal professionals can create, connect, and analyze reports, evidence, and persons of interest using advanced AI capabilities.

## 🏗️ Architecture Overview

### Core Technologies
- **Frontend**: SvelteKit + TypeScript + shadcn-svelte UI
- **Backend**: SvelteKit API routes + PostgreSQL + Drizzle ORM
- **AI**: Local Ollama (Gemma3-Legal model) + vector embeddings
- **Real-time**: Redis for caching and pub/sub
- **Offline**: Loki.js for client-side persistence
- **Canvas**: Fabric.js for interactive workspace
- **Editor**: HugerTE/Slate.js for rich text editing

### Key Components

1. **Interactive Canvas** (`/cases/[id]/canvas`)
   - Spatial workspace with drag-and-drop functionality
   - Right-click context menus for creating new items
   - Grid background and zoom/pan capabilities

2. **Node Types**
   - **ReportNode**: Rich text editor with AI summarization
   - **EvidenceNode**: File viewer with annotation capabilities
   - **POINode**: Structured profile editor (Who/What/Why/How)

3. **AI Integration**
   - Universal summarization service
   - Context-aware prompts for different content types
   - Local LLM processing via Ollama

4. **Data Management**
   - Real-time autosave every 5 seconds
   - Offline-first with sync capabilities
   - Version control and conflict resolution

## 🚀 Implementation Details

### 1. POI System

#### POI Class (`src/lib/logic/POI.ts`)
```typescript
export class POI {
  id: string;
  name: Writable<string>;
  profileData: Writable<POIProfile>; // Who, What, Why, How
  posX: Writable<number>;
  posY: Writable<number>;
  relationship: Writable<string>; // suspect, witness, victim, etc.
  threatLevel: Writable<string>;
  status: Writable<string>;
  isDirty: boolean;
}
```

#### POI Component (`src/lib/components/canvas/POINode.svelte`)
- Draggable card interface
- Form for editing profile data
- Context menu with actions
- Visual indicators for threat level and status

#### Database Schema
```sql
CREATE TABLE persons_of_interest (
  id UUID PRIMARY KEY,
  case_id UUID REFERENCES cases(id),
  name VARCHAR(256) NOT NULL,
  profile_data JSONB DEFAULT '{"who":"","what":"","why":"","how":""}',
  pos_x DECIMAL(10,2) DEFAULT 100,
  pos_y DECIMAL(10,2) DEFAULT 100,
  relationship VARCHAR(100),
  threat_level VARCHAR(20) DEFAULT 'low',
  status VARCHAR(20) DEFAULT 'active',
  -- ... timestamps, etc.
);
```

### 2. AI Summarization System

#### AI Service (`src/lib/services/aiService.ts`)
```typescript
export const aiService = {
  summarize: (request: SummarizeRequest) => Promise<string>,
  summarizeReport: (content, reportId, caseId) => Promise<string>,
  summarizeEvidence: (evidence, evidenceId, caseId) => Promise<string>,
  summarizePOI: (poiData, poiId, caseId) => Promise<string>
};
```

#### API Endpoint (`src/routes/api/ai/summarize/+server.ts`)
```typescript
export const POST: RequestHandler = async ({ request }) => {
  const { content, type, model } = await request.json();
  
  // Call local Ollama instance
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      model: 'gemma3-legal',
      prompt: buildPrompt(content, type),
      stream: false
    })
  });
  
  return json({ summary: data.response });
};
```

### 3. Canvas Interaction System

#### Context Menus
- **Canvas Right-click**: Add new reports, evidence, or POIs
- **POI Submenu**: Create specific types (suspect, witness, co-conspirator)
- **Node Right-click**: Edit, summarize, or delete items

#### Draggable System (`src/lib/actions/draggable.ts`)
```typescript
export const draggable: Action<HTMLElement, DragOptions> = (node, options) => {
  // Mouse event handlers for drag functionality
  // Updates position in real-time
  // Dispatches custom events for state management
};
```

### 4. State Management

#### CaseService (`src/lib/services/caseService.ts`)
```typescript
export class CaseService {
  reports: Writable<Report[]>;
  evidence: Writable<Evidence[]>;
  pois: Writable<POI[]>;
  
  // Auto-save dirty items every 5 seconds
  startAutosave();
  
  // Create new entities
  createReport(data) => Report;
  createEvidence(data) => Evidence;
  createPOI(data) => POI;
}
```

#### Data Flow
1. User interacts with node (edit, drag, etc.)
2. Node updates its internal state and sets `isDirty = true`
3. CaseService detects dirty items via derived stores
4. Auto-save triggers API calls to persist changes
5. Redis publishes updates for real-time collaboration

## 🎮 User Workflows

### Creating a Person of Interest
1. Right-click on empty canvas area
2. Select "Add Person of Interest" → Choose type
3. New POI node appears at click location
4. Click "Edit" to fill in profile information
5. Save automatically persists to database

### AI Summarization
1. Click sparkles (✨) button on any node
2. AI analyzes content based on node type
3. Summary appears in modal dialog
4. Can copy summary or view original content

### Interactive Canvas Navigation
1. Drag nodes to organize spatially
2. Use toolbar to create new items
3. Status bar shows current item counts
4. Auto-save indicator shows sync status

## 🔧 API Endpoints

### POI Management
- `GET /api/cases/[caseId]/pois` - List POIs for case
- `POST /api/cases/[caseId]/pois` - Create new POI
- `PUT /api/pois/[id]` - Update POI
- `DELETE /api/pois/[id]` - Delete POI

### AI Services
- `POST /api/ai/summarize` - Generate AI summary

### Reports & Evidence
- `PUT /api/reports/[id]` - Update report
- `PUT /api/evidence/[id]` - Update evidence

## 🎨 UI/UX Features

### Visual Design
- **Purple theme** for POI nodes (distinguishes from reports/evidence)
- **Threat level badges** (red=high, yellow=medium, green=low)
- **Status indicators** (active, inactive, arrested, cleared)
- **Dragging animations** with rotation and shadow effects

### Accessibility
- Keyboard navigation support
- ARIA labels for screen readers
- High contrast color schemes
- Tooltip explanations for all actions

### Responsive Design
- Canvas adapts to viewport size
- Toolbar collapses on smaller screens
- Touch-friendly drag interactions

## 🔄 Advanced Features

### Real-time Collaboration
- Redis pub/sub for live updates
- Conflict resolution with operational transforms
- User presence indicators

### Offline Support
- Loki.js stores data locally
- Queue changes when offline
- Sync when connection restored

### Export Capabilities
- PDF generation from canvas state
- Report exports with embedded POI data
- Case summary with AI insights

## 🧪 Testing

Run the comprehensive test suite:
```bash
node test-canvas-poi-system.mjs
```

This validates:
- Server connectivity
- Database schema
- AI service integration
- Component file existence
- Canvas page rendering
- TypeScript compilation

## 🚀 Deployment

### Development
```bash
npm install
npm run dev
```

### Production
```bash
npm run build
npm run preview
```

### Docker
```bash
docker-compose up -d postgres redis
npm run db:migrate
npm start
```

## 📱 Mobile Support

The system is designed mobile-first:
- Touch-friendly drag interactions
- Responsive canvas layout
- Optimized for tablet use
- Progressive Web App capabilities

## 🔐 Security

- Session-based authentication
- CSRF protection
- SQL injection prevention via Drizzle ORM
- File upload validation
- Rate limiting on AI endpoints

## 📈 Performance

- Lazy loading of canvas nodes
- Debounced auto-save
- Vector search indexing
- Redis caching layer
- Optimistic UI updates

## 🎯 Next Steps

1. **Connection System**: Visual lines between related nodes
2. **Timeline View**: Chronological case progression
3. **Advanced Search**: Semantic search across all content
4. **Collaboration**: Multi-user editing with presence
5. **Mobile App**: Native iOS/Android with Tauri

---

## 🤝 Contributing

This system is built with extensibility in mind. Each component is modular and can be enhanced independently. The TypeScript interfaces provide clear contracts for extending functionality.

**Key Extension Points:**
- Add new node types by extending the base classes
- Create custom AI analysis workflows
- Implement additional visualization modes
- Add new export formats
- Extend the context menu system

The architecture supports both incremental improvements and major feature additions while maintaining backward compatibility.
