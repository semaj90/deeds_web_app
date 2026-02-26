# Design Document: YoRHa UI Alignment & Production Readiness

## Overview

This design document outlines the architecture and implementation strategy for aligning the YoRHa Detective Interface, Evidence Board, and AI Chat components with production-ready standards. The system integrates SvelteKit 2, Drizzle ORM 0.44, Lucia v3 authentication, Bits UI v2, XState v5, and Uno.css styling to create a cohesive, maintainable detective investigation platform.

## Architecture

### High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit 2 Frontend                      │
├─────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐ │
│  │ YoRHa Command    │  │  Evidence Board  │  │  AI Chat   │ │
│  │ Center           │  │                  │  │  Interface │ │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬───┘ │
│           │                     │                     │      │
│  ┌────────▼─────────────────────▼─────────────────────▼────┐ │
│  │         Bits UI v2 Components & Uno.css Styling        │ │
│  └────────┬─────────────────────┬─────────────────────────┘ │
│           │                     │                            │
│  ┌────────▼─────────────────────▼────────────────────────┐  │
│  │  XState v5 State Machines (Chat, Board, Metrics)     │  │
│  └────────┬─────────────────────┬────────────────────────┘  │
│           │                     │                            │
│  ┌────────▼─────────────────────▼────────────────────────┐  │
│  │  Lucia v3 Authentication & Session Management        │  │
│  └────────┬─────────────────────┬────────────────────────┘  │
│           │                     │                            │
└───────────┼─────────────────────┼────────────────────────────┘
            │                     │
┌───────────▼─────────────────────▼────────────────────────────┐
│              SvelteKit 2 API Routes (+server.ts)             │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────────┐  ┌──────────────────┐  ┌────────────┐  │
│  │ /api/yorha/*     │  │ /api/evidence/*  │  │ /api/chat  │  │
│  │ (Metrics, Cases) │  │ (Nodes, Conns)   │  │ (Ollama)   │  │
│  └────────┬─────────┘  └────────┬─────────┘  └────────┬───┘  │
│           │                     │                     │       │
└───────────┼─────────────────────┼─────────────────────┼───────┘
            │                     │                     │
┌───────────▼─────────────────────▼─────────────────────▼───────┐
│         Drizzle ORM 0.44 Database Layer                       │
├───────────────────────────────────────────────────────────────┤
│                                                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐   │
│  │ Cases Table  │  │ Evidence     │  │ Connections      │   │
│  │              │  │ Nodes Table  │  │ Table            │   │
│  └──────────────┘  └──────────────┘  └──────────────────┘   │
│                                                                │
└───────────────────────────────────────────────────────────────┘
            │
┌───────────▼───────────────────────────────────────────────────┐
│  PostgreSQL Database + pgvector for Evidence Embeddings      │
└───────────────────────────────────────────────────────────────┘
            │
┌───────────▼───────────────────────────────────────────────────┐
│  External Services                                            │
├───────────────────────────────────────────────────────────────┤
│  • Ollama LLM Endpoint (getOllamaEndpoint())                 │
│  • Redis for Caching & Session Storage                       │
│  • Lucia v3 Auth Provider                                    │
└───────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. YoRHa Command Center Component

**File:** `src/routes/yorha/+page.svelte` and `src/lib/components/yorha/YoRHaCommandCenter.svelte`

**Responsibilities:**
- Display real-time system metrics (CPU, memory, GPU, network, neural activity)
- Show active cases with status indicators
- Provide navigation to other modules
- Render evidence board preview
- Launch AI chat modal

**Key Interfaces:**

```typescript
interface SystemMetrics {
  cpu_usage: number;
  memory_usage: number;
  gpu_utilization: number;
  network_latency: number;
  active_processes: number;
  security_level?: string;
  quantum_state?: string;
  neural_activity: number;
}

interface CaseItem {
  id: string;
  title: string;
  status: 'active' | 'pending' | 'open';
  priority?: 'high' | 'medium' | 'low';
  items_count?: number;
  updated_at?: string;
}

interface CommandCenterProps {
  systemData: SystemMetrics;
  cases: CaseItem[];
  onChatOpen: () => void;
  onCaseSelect: (caseId: string) => void;
}
```

**State Management:**
- Use XState v5 machine for metrics updates
- Reactive state with Svelte 5 `$state` runes
- Real-time updates via WebSocket or polling (3-second intervals)

**Styling:**
- Uno.css utility classes for layout and spacing
- Dark theme with retro/NES aesthetic
- Responsive grid layout (mobile-first)

### 2. Evidence Board Component

**File:** `src/routes/evidence-board/+page.svelte` and `src/lib/components/evidence/EvidenceBoard.svelte`

**Responsibilities:**
- Render evidence nodes on interactive canvas
- Handle drag-and-drop node positioning
- Display connections between evidence items
- Show evidence details in side panel
- Integrate AI analysis for evidence

**Key Interfaces:**

```typescript
interface EvidenceNode {
  id: string;
  caseId: string;
  type: string;
  title: string;
  description: string;
  x: number;
  y: number;
  confidence: number;
  metadata: Record<string, any>;
}

interface EvidenceConnection {
  id: string;
  caseId: string;
  fromNodeId: string;
  toNodeId: string;
  type: string;
  strength?: number;
}

interface EvidenceBoardProps {
  caseId: string;
  initialNodes: EvidenceNode[];
  initialConnections: EvidenceConnection[];
  onNodeSelect: (node: EvidenceNode) => void;
  onNodeUpdate: (nodeId: string, updates: Partial<EvidenceNode>) => void;
  onConnectionCreate: (connection: EvidenceConnection) => void;
}
```

**State Management:**
- XState v5 machine for board interactions (selection, dragging, connecting)
- Canvas rendering with SVG or HTML5 Canvas
- Debounced position updates to database

**Styling:**
- Uno.css for UI chrome (buttons, panels)
- Canvas/SVG for node visualization
- Smooth transitions for node movements

### 3. AI Chat Interface Component

**File:** `src/lib/components/ai/ContextualEvidenceChatModal.svelte`

**Responsibilities:**
- Display chat conversation history
- Handle user message input
- Stream responses from Ollama endpoint
- Provide evidence context to AI
- Manage chat session state

**Key Interfaces:**

```typescript
interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  evidence_context?: EvidenceNode[];
  thinking?: boolean;
}

interface ChatSession {
  id: string;
  userId: string;
  caseId: string;
  messages: ChatMessage[];
  created_at: Date;
  updated_at: Date;
}

interface AIChatProps {
  visible: boolean;
  caseId?: string;
  evidenceContext?: EvidenceNode[];
  onClose: () => void;
  onMessageSend?: (message: string) => void;
}
```

**State Management:**
- XState v5 machine for chat states (idle, loading, streaming, error)
- Message history stored in Drizzle ORM
- Real-time streaming from Ollama via fetch ReadableStream

**Styling:**
- Bits UI v2 Dialog component for modal
- Uno.css for message bubbles and input styling
- Smooth scroll to latest message

## Data Models

### Database Schema (Drizzle ORM)

```typescript
// Cases Table
export const cases = pgTable('cases', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  status: text('status').notNull().default('active'),
  priority: text('priority').default('medium'),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Evidence Nodes Table
export const evidenceNodes = pgTable('evidence_nodes', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  type: text('type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  x: integer('x').default(0),
  y: integer('y').default(0),
  confidence: real('confidence').default(0.5),
  metadata: jsonb('metadata'),
  embedding: vector('embedding', { dimensions: 1536 }),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Evidence Connections Table
export const evidenceConnections = pgTable('evidence_connections', {
  id: text('id').primaryKey(),
  caseId: text('case_id').notNull().references(() => cases.id),
  fromNodeId: text('from_node_id').notNull().references(() => evidenceNodes.id),
  toNodeId: text('to_node_id').notNull().references(() => evidenceNodes.id),
  type: text('type').notNull(),
  strength: real('strength').default(1.0),
  createdAt: timestamp('created_at').defaultNow(),
});

// Chat Sessions Table
export const chatSessions = pgTable('chat_sessions', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  caseId: text('case_id').references(() => cases.id),
  createdAt: timestamp('created_at').defaultNow(),
  updatedAt: timestamp('updated_at').defaultNow(),
});

// Chat Messages Table
export const chatMessages = pgTable('chat_messages', {
  id: text('id').primaryKey(),
  sessionId: text('session_id').notNull().references(() => chatSessions.id),
  role: text('role').notNull(), // 'user' | 'assistant'
  content: text('content').notNull(),
  evidenceContext: jsonb('evidence_context'),
  createdAt: timestamp('created_at').defaultNow(),
});
```

## Error Handling

### Error Boundary Strategy

1. **Component-Level Errors:**
   - Use Svelte error boundaries for component crashes
   - Display user-friendly error messages
   - Log to error tracking service

2. **API Errors:**
   - Implement retry logic with exponential backoff
   - Handle network timeouts gracefully
   - Return meaningful error responses

3. **Ollama Integration Errors:**
   - Gracefully handle missing Ollama endpoint
   - Provide fallback responses
   - Display troubleshooting suggestions

4. **Database Errors:**
   - Implement transaction rollback on failure
   - Log database errors for debugging
   - Notify user of data persistence issues

## Testing Strategy

### Unit Tests
- Test XState machines for state transitions
- Test Drizzle ORM queries with test database
- Test component rendering with Vitest + Svelte Testing Library

### Integration Tests
- Test API routes with mock database
- Test Lucia v3 authentication flow
- Test Ollama integration with mock responses

### E2E Tests
- Test complete user workflows (create case → add evidence → chat)
- Test real-time metric updates
- Test evidence board interactions

### Performance Tests
- Monitor component render times
- Track API response times
- Measure bundle size impact

## Deployment Considerations

### Environment Configuration
- `.env.production` with Ollama endpoint URL
- Database connection string for PostgreSQL
- Lucia v3 session configuration
- Error tracking service credentials

### Build Optimization
- Tree-shake unused Bits UI components
- Optimize Uno.css output
- Minify and compress assets
- Generate source maps for debugging

### Monitoring & Observability
- Track error rates and types
- Monitor API response times
- Alert on system metric anomalies
- Log user interactions for debugging

## Security Considerations

### Authentication & Authorization
- Lucia v3 session validation on all routes
- Role-based access control for case data
- Secure HTTP-only cookies for sessions

### Data Protection
- Encrypt sensitive data at rest
- Use HTTPS for all communications
- Validate and sanitize user inputs
- Implement CSRF protection

### API Security
- Rate limiting on API endpoints
- Input validation with Zod schemas
- SQL injection prevention via Drizzle ORM
- XSS protection via Svelte's built-in escaping

