# Claude.md - Comprehensive Legal AI System Context

## 🧠 Multi-Agent Orchestration & VS Code Integration

- The Context7 MCP extension now auto-registers the local agent orchestrator (Claude, CrewAI, AutoGen, RAG, etc.) as an MCP server.
- You can trigger multi-agent workflows from VS Code using the `mcp.runAgentOrchestrator` command, which prompts for approval in a Claude Code-style window.
- The orchestrator endpoint `/api/agent-orchestrate` is called, and the best output is shown in the editor.
- The orchestrator uses `runClaudeAgent` (see `src/lib/utils/mcp-helpers.ts` and `agent-orchestrator/agents/claude.js`) for Claude sub-agent logic.
- All orchestration, best practices, and TODO/code quality automation is now accessible from VS Code, CLI, and API.

### How to Use

1. Start VS Code with the Context7 MCP extension enabled.
2. Use the command palette (`Ctrl+Shift+P`) and run `MCP: Run Agent Orchestrator`.
3. Approve the prompt to launch multi-agent orchestration (Claude, CrewAI, etc.).
4. Results will be displayed in the editor window.

### Agent Orchestrator Details

- Orchestrator logic is in `agent-orchestrator/index.js`.
- Claude agent logic is in `agent-orchestrator/agents/claude.js` and registered as `runClaudeAgent`.
- The agent registry in `src/lib/utils/mcp-helpers.ts` supports dynamic agent selection and orchestration.

---

## 🎯 Context Overview for Claude & AI Assistants

This document provides comprehensive context for Claude and other AI assistants working with the Legal AI VS Code Remote Indexing System. It includes Context7 MCP integration, codebase structure, search capabilities, and all necessary information for effective AI assistance.

---

## 📋 Table of Contents

1. [System Architecture Overview](#system-architecture-overview)
2. [Context7 MCP Integration](#context7-mcp-integration)
3. [Project Structure & Codebase](#project-structure--codebase)
4. [SvelteKit Frontend Application](#sveltekit-frontend-application)
5. [Component Architecture](#component-architecture)
6. [AI Integration & Services](#ai-integration--services)
7. [Database & Schema](#database--schema)
8. [Development Patterns & Best Practices](#development-patterns--best-practices)
9. [Search Capabilities & File Context](#search-capabilities--file-context)
10. [MCP Requests & Protocol](#mcp-requests--protocol)
11. [VS Code Remote Indexing System](#vs-code-remote-indexing-system)
12. [Error Handling & Troubleshooting](#error-handling--troubleshooting)
13. [Performance Optimization](#performance-optimization)
14. [Security & Authentication](#security--authentication)

---

## 🏗️ System Architecture Overview

### Core Technology Stack

```yaml
Framework: SvelteKit 2.16.0 with Svelte 5.0 (latest runes system)
Language: TypeScript with strict type checking
Styling: Custom CSS with PostCSS, unocss, and Nier-themed UI
UI Components: Melt UI, Bits UI, shadcn-svelte
Database: Drizzle ORM with PostgreSQL + pg_vector
Vector Search: Qdrant (Docker) for semantic search
AI Integration: Ollama, local LLM support (Gemma3 legal model)
Authentication: Lucia Auth with Drizzle adapter
Real-time: WebSocket support for live updates
State Management: XState for complex state machines
Development Tools: VS Code Remote Indexing, Context7 MCP
```

### Application Purpose

**Legal AI Assistant Web Application** designed for prosecutor/legal professional use with:

- Case management with enhanced views and canvas mode
- Evidence upload, validation, and real-time grid display
- AI-powered legal analysis and chat interface
- Document generation and reporting tools
- Advanced search with vector capabilities
- Interactive evidence relationship mapping

---

## 🔗 Context7 MCP Integration

### Context7 Model Context Protocol

The system integrates with Context7 MCP (Model Context Protocol) for enhanced AI context sharing:

#### Context7 Configuration

```json
{
  "mcpServers": {
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"],
      "enabled": true,
      "autoApprove": [],
      "timeout": 60
    },
    "legal-ai-local": {
      "type": "http",
      "url": "http://localhost:8000",
      "enabled": true
    }
  }
}
```

#### Context7 Library Mappings

```typescript
const library_mappings = {
  svelte: "/sveltejs/svelte",
  sveltekit: "/sveltejs/kit",
  typescript: "/microsoft/typescript",
  drizzle: "/drizzle-team/drizzle-orm",
  postgres: "/postgres/postgres",
  qdrant: "/qdrant/qdrant",
  ollama: "/ollama/ollama",
  "legal-ai": "/legal-ai-systems/legal-ai-remote-indexing",
};
```

#### Enhanced Context Provider Integration

```typescript
interface Context7CompatibleResult {
  content: string;
  file_path: string;
  relevance_score: float;
  language: string;
  context7_library_id?: string;
  mcp_metadata: {
    source: "enhanced_local_index" | "basic_local_index" | "context7_mcp";
    priority: "high" | "medium" | "low";
    index_type?: "enhanced_legal_ai";
  };
}
```

---

## 📁 Project Structure & Codebase

### Root Directory Structure

```
C:\Users\james\Desktop\deeds-web\deeds-web-app
├── sveltekit-frontend/          # Main SvelteKit application
├── vscode-remote-indexing/      # VS Code indexing system
├── context7-docs/              # Context7 documentation
├── mcp-servers/                # MCP server configurations
├── llama.cpp/                  # Local LLM integration
├── qdrant_db/                  # Vector database storage
├── scripts/                    # Build and deployment scripts
├── docker-compose*.yml         # Docker configurations
└── markdown_files/             # Documentation and guides
```

### SvelteKit Frontend Structure

```
sveltekit-frontend/src/
├── lib/
│   ├── components/             # Svelte components
│   │   ├── ai/                # AI-related components
│   │   ├── auth/              # Authentication forms
│   │   ├── canvas/            # Evidence canvas components
│   │   ├── cases/             # Case management
│   │   ├── detective/         # Detective board functionality
│   │   ├── editor/            # Rich text editors
│   │   ├── evidence/          # Evidence handling
│   │   ├── forms/             # Form components
│   │   ├── modals/            # Modal dialogs
│   │   ├── ui/                # Reusable UI components
│   │   └── upload/            # File upload components
│   ├── services/              # Business logic services
│   ├── stores/                # Svelte stores and state
│   ├── server/                # Server-side utilities
│   │   ├── db/               # Database schemas and queries
│   │   ├── auth/             # Authentication utilities
│   │   ├── ai/               # AI service integrations
│   │   └── services/         # Backend services
│   ├── types/                 # TypeScript type definitions
│   └── utils/                 # Utility functions
└── routes/                     # SvelteKit routes
    ├── api/                   # API endpoints
    ├── cases/                 # Case management pages
    ├── evidence/              # Evidence pages
    ├── ai/                    # AI assistant pages
    └── dashboard/             # Dashboard pages
```

---

## 🎨 SvelteKit Frontend Application

### Modern Svelte 5 Patterns

#### Component Structure (New Runes System)

```svelte
<script lang="ts">
  // Use $props() instead of export let
  let { variant = 'default', size = 'md' } = $props();

  // Use $state() for reactive local state
  let isLoading = $state(false);
  let clickCount = $state(0);

  // Use $derived() for computed values
  let buttonClasses = $derived(() => {
    const base = 'inline-flex items-center justify-center rounded-md';
    const variants = {
      default: 'bg-gray-100 text-gray-900',
      primary: 'bg-blue-600 text-white hover:bg-blue-700'
    };
    return `${base} ${variants[variant]}`;
  });

  // Use $effect() for side effects
  $effect(() => {
    if (clickCount > 5) {
      console.log('Button clicked many times:', clickCount);
    }
  });
</script>
```

#### Data Loading Pattern (SSR-First)

```typescript
// +page.server.ts - Server-side data loading
export async function load({ params, locals, cookies }) {
  const user = locals.user;

  if (!user) {
    redirect(307, "/login");
  }

  // Parallel data loading
  const [cases, evidence, reports] = await Promise.all([
    db.select().from(cases).where(eq(cases.userId, user.id)),
    db.select().from(evidence).where(eq(evidence.userId, user.id)),
    db.select().from(reports).where(eq(reports.userId, user.id)),
  ]);

  return {
    cases,
    evidence,
    reports,
    user: { id: user.id, name: user.name },
  };
}
```

#### Form Actions Pattern

```typescript
// Server actions for data mutations
export const actions = {
  createCase: async ({ request, locals }) => {
    const data = await request.formData();
    const caseData = {
      title: data.get("title"),
      description: data.get("description"),
      userId: locals.user.id,
    };

    const result = await db.insert(cases).values(caseData).returning();
    return { success: true, case: result[0] };
  },
};
```

### Component Architecture

#### UI Component System

```
src/lib/components/ui/
├── button/                     # Button component with variants
├── Card/                       # Card component system
├── input/                      # Form input components
├── modal/                      # Modal dialog system
├── select/                     # Select dropdown components
├── tooltip/                    # Tooltip system
├── context-menu/              # Context menu components
├── dialog/                    # Dialog components
└── grid/                      # Grid layout components
```

#### Specialized Components

```
src/lib/components/
├── ai/                        # AI-related components
│   ├── AIButton.svelte        # AI activation button
│   ├── AIChatInterface.svelte # Main AI chat component
│   ├── EnhancedAIAssistant.svelte # Advanced AI assistant
│   └── ThinkingStyleToggle.svelte # AI reasoning mode
├── canvas/                    # Evidence canvas components
│   ├── EnhancedEvidenceCanvas.svelte # Main canvas
│   ├── EvidenceNode.svelte    # Evidence nodes
│   ├── POINode.svelte         # Person of Interest nodes
│   └── ReportNode.svelte      # Report nodes
├── detective/                 # Detective board
│   ├── DetectiveBoard.svelte  # Main investigation board
│   ├── ContextMenu.svelte     # Right-click menus
│   └── UploadZone.svelte      # Evidence upload areas
└── editor/                    # Rich text editors
    ├── LegalDocumentEditor.svelte
    ├── ReportEditor.svelte
    └── WysiwygEditor.svelte
```

---

## 🤖 AI Integration & Services

### Local LLM Integration

#### Ollama Configuration

```typescript
// src/lib/config/local-llm.ts
export const ollamaConfig = {
  baseUrl: "http://localhost:11434",
  model: "gemma3-legal:latest",
  embedModel: "nomic-embed-text",
  timeout: 30000,
  maxTokens: 4096,
};
```

#### AI Service Implementation

```typescript
// src/lib/services/ai-service.ts
export class AIService {
  async generateResponse(prompt: string, context: string[]) {
    const response = await fetch(`${ollamaConfig.baseUrl}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaConfig.model,
        prompt: `Context: ${context.join("\n")}\n\nUser: ${prompt}`,
        stream: false,
      }),
    });

    return response.json();
  }

  async generateEmbedding(text: string) {
    const response = await fetch(`${ollamaConfig.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ollamaConfig.embedModel,
        prompt: text,
      }),
    });

    return response.json();
  }
}
```

### Vector Search Integration

#### Qdrant Service

```typescript
// src/lib/server/services/qdrant-service.ts
export class QdrantService {
  private client: QdrantClient;

  constructor() {
    this.client = new QdrantClient({
      url: process.env.QDRANT_URL || "http://localhost:6333",
    });
  }

  async searchSimilar(embedding: number[], limit: number = 10) {
    const searchResult = await this.client.search("legal_vectors", {
      vector: embedding,
      limit,
      score_threshold: 0.7,
    });

    return searchResult;
  }

  async storeEmbedding(id: string, embedding: number[], metadata: any) {
    await this.client.upsert("legal_vectors", {
      points: [
        {
          id,
          vector: embedding,
          payload: metadata,
        },
      ],
    });
  }
}
```

---

## 🗄️ Database & Schema

### Drizzle ORM Schema

#### Core Tables

```typescript
// src/lib/server/db/schema.ts
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const cases = pgTable("cases", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  status: text("status").default("active"),
  userId: text("user_id").references(() => users.id),
  canvasData: json("canvas_data").$type<CanvasData>(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

export const evidence = pgTable("evidence", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  description: text("description"),
  evidenceType: text("evidence_type").notNull(),
  filePath: text("file_path"),
  fileSize: integer("file_size"),
  mimeType: text("mime_type"),
  caseId: text("case_id").references(() => cases.id),
  userId: text("user_id").references(() => users.id),
  tags: json("tags").$type<string[]>(),
  metadata: json("metadata").$type<EvidenceMetadata>(),
  aiTags: json("ai_tags").$type<string[]>(),
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at").defaultNow(),
});
```

#### Vector Extension Setup

```sql
-- Enable pg_vector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create vector index for similarity search
CREATE INDEX CONCURRENTLY IF NOT EXISTS evidence_embedding_idx
ON evidence USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);
```

### Database Connection

```typescript
// src/lib/server/db/index.ts
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);
export const db = drizzle(client);
```

---

## 🎯 Development Patterns & Best Practices

### SvelteKit Best Practices

#### Essential Patterns

```yaml
Props: Use $props() instead of export let (Svelte 5)
State: Use $state() for reactive local state
Computed: Use $derived() for computed values
Effects: Use $effect() for side effects
Navigation: Always use <a href> for navigation, never <button onclick>
Data Loading: Use load() functions for SSR data fetching
Mutations: Use form actions for data mutations
Styling: Utility-first CSS with Tailwind or custom CSS
```

#### Component Modernization Checklist

```yaml
✅ Replace export let with $props()
✅ Replace reactive statements with $derived()
✅ Replace onMount with $effect()
✅ Use form actions for server mutations
✅ Implement proper error boundaries
✅ Type all APIs with generated $types
✅ Use proper TypeScript typing
✅ Follow accessibility guidelines (WCAG)
```

### XState Integration

```typescript
// State machine for case creation
const caseCreationMachine = createMachine({
  id: "caseCreation",
  initial: "idle",
  states: {
    idle: { on: { START: "collecting" } },
    collecting: { on: { SUBMIT: "submitting" } },
    submitting: {
      on: {
        SUCCESS: "success",
        ERROR: "error",
      },
    },
    success: { type: "final" },
    error: { on: { RETRY: "submitting" } },
  },
});
```

---

## 🔍 Search Capabilities & File Context

### Enhanced Indexing System

#### File Types and Language Support

```yaml
Languages: [TypeScript, JavaScript, Python, Svelte, HTML, CSS, SQL, Markdown]
Frameworks: [SvelteKit, Drizzle ORM, Ollama, Docker, PostgreSQL]
File Types: [Source code, Documentation, Configuration, Tests, Schemas]
Special Files: [.svelte components, +page.server.ts, +layout.svelte, schema.ts]
```

#### Semantic Search Capabilities

```typescript
interface SearchQuery {
  query: string;
  language_filter?: string;
  file_types?: string[];
  limit?: number;
  min_score?: number;
  context_lines?: number;
}

interface SearchResult {
  file_path: string;
  content: string;
  similarity_score: number;
  language: string;
  function_name?: string;
  class_name?: string;
  imports: string[];
  line_number: number;
  context_before: string;
  context_after: string;
}
```

#### Enhanced Context Provider

```typescript
class EnhancedCopilotContextProvider {
  async getSemanticContext(
    code: string,
    cursor_position: [number, number],
    language: string,
    include_context7: boolean = true
  ): Promise<Context7CompatibleResult[]> {
    // 1. Analyze current code context
    const context_analysis = this.analyzer.analyze_code_context(
      code,
      language,
      cursor_position[0]
    );

    // 2. Generate intelligent queries
    const queries = this.generateIntelligentQueries(context_analysis, language);

    // 3. Search enhanced local index (PRIORITY)
    const enhanced_results = await this.getEnhancedLocalContext(
      queries.main,
      language
    );

    // 4. Get Context7 documentation if enabled
    const context7_results = include_context7
      ? await this.getContext7Documentation(
          context_analysis.libraries,
          queries.topic
        )
      : [];

    // 5. Combine and rank results with enhanced priority
    return this.combineAndRankResults(
      enhanced_results,
      context7_results,
      context_analysis
    );
  }
}
```

### File Context Patterns

#### Component Context Detection

```typescript
const language_patterns = {
  svelte: {
    component: /<(\w+)/g,
    props: /export\s+let\s+(\w+)/g,
    reactive: /\$:\s*(\w+)/g,
    import: /import.*from\s+['"]([^'"]+)['"]/g,
  },
  typescript: {
    function: /(?:export\s+)?(?:async\s+)?function\s+(\w+)/g,
    class: /(?:export\s+)?class\s+(\w+)/g,
    interface: /(?:export\s+)?interface\s+(\w+)/g,
    type: /type\s+(\w+)\s*=/g,
  },
};
```

---

## 📡 MCP Requests & Protocol

### Model Context Protocol Implementation

#### MCP Server Configuration

```json
{
  "mcpServers": {
    "legal-ai-enhanced": {
      "command": "python",
      "args": ["vscode-remote-indexing/enhanced_copilot_integration.py"],
      "env": {
        "PYTHONPATH": ".",
        "INDEX_TYPE": "enhanced_legal_ai",
        "PRIORITY_MODE": "true"
      }
    },
    "context7": {
      "command": "npx",
      "args": ["-y", "@upstash/context7-mcp"],
      "enabled": true
    }
  }
}
```

#### MCP Request Types

```typescript
interface MCPRequest {
  method: "initialize" | "shutdown" | "notification" | "request";
  params: {
    query?: string;
    context_type?: "semantic" | "structural" | "documentation";
    language?: string;
    file_path?: string;
    cursor_position?: [number, number];
    include_context7?: boolean;
    priority_enhanced?: boolean;
  };
}

interface MCPResponse {
  result: {
    contexts: Context7CompatibleResult[];
    metadata: {
      total_results: number;
      enhanced_count: number;
      context7_count: number;
      query_time_ms: number;
      cache_hit: boolean;
    };
  };
}
```

#### Enhanced vs Basic Index Priority

```python
# Enhanced index takes priority over basic indexing
async def get_enhanced_context(query: str, language: str) -> List[Context7CompatibleResult]:
    """Get context from ENHANCED local indexing server - takes priority"""
    payload = {
        "query": query,
        "limit": 20,
        "language_filter": language,
        "index_type": "enhanced_legal_ai",
        "priority_mode": True,
        "source_priority": "enhanced_over_basic"
    }

    # Try enhanced middleware first (port 8000)
    response = await session.post(f"{server_url}/context7/search", json=payload)

    if response.status == 200:
        results = response.json()["results"]
        for result in results:
            result["relevance_score"] += 0.2  # Boost enhanced scores
            result["mcp_metadata"]["source"] = "enhanced_local_index"
            result["mcp_metadata"]["priority"] = "high"
        return results
    else:
        # Fallback to basic with warning
        return await get_basic_context_with_warning(query, language)
```

---

## 🛠️ VS Code Remote Indexing System

### System Components

#### Core Services

```python
# Remote Indexing Server - Main API endpoint
class RemoteIndexingServer:
    - Language-aware code chunking
    - Semantic embedding generation
    - Real-time file monitoring
    - Vector storage with Qdrant
    - API endpoints for search and indexing

# Real-time Indexer - File system monitoring
class RealTimeIndexer:
    - File system change detection
    - Incremental index updates
    - Hot reloading of code changes
    - Conflict resolution for concurrent edits

# AI Middleware Server - Enhanced processing
class AIMiddlewareServer:
    - Advanced semantic analysis
    - Context-aware code understanding
    - Legal-specific pattern recognition
    - Enhanced similarity scoring

# System Monitor - Health and performance
class SystemMonitor:
    - Service health monitoring
    - Performance metrics collection
    - Resource usage tracking
    - Alert system for issues
```

#### Docker Service Stack

```yaml
services:
  prosecutor_ollama:
    image: ollama/ollama
    ports: ["11434:11434"]
    volumes: ["ollama_models:/root/.ollama"]
    environment:
      - OLLAMA_MODELS=/root/.ollama

  prosecutor_qdrant:
    image: qdrant/qdrant
    ports: ["6333:6333", "6334:6334"]
    volumes: ["qdrant_storage:/qdrant/storage"]

  indexing_server:
    build: ./vscode-remote-indexing
    ports: ["8000:8000"]
    depends_on: [prosecutor_ollama, prosecutor_qdrant]
    environment:
      - OLLAMA_URL=http://prosecutor_ollama:11434
      - QDRANT_URL=http://prosecutor_qdrant:6333
```

### VS Code Extension Integration

#### Semantic Search Commands

```typescript
// VS Code extension commands
const commands = {
  "legalAI.injectContext7Context": {
    keybinding: "ctrl+shift+alt+c",
    description: "Inject Context7 enhanced context at cursor",
  },
  "legalAI.semanticSearch": {
    keybinding: "ctrl+shift+f",
    description: "Semantic code search across projects",
  },
  "legalAI.indexWorkspace": {
    keybinding: "ctrl+shift+i",
    description: "Index current workspace with AI analysis",
  },
};
```

#### Enhanced Context Provider

```typescript
class VSCodeContextProvider {
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext
  ) {
    const code = document.getText();
    const language = document.languageId;
    const cursor_pos = [position.line, position.character];

    // Get enhanced context with Context7 integration
    const results = await this.contextProvider.getSemanticContext(
      code,
      cursor_pos,
      language,
      true
    );

    // Format for VS Code Copilot
    const contextText =
      await this.contextProvider.formatContextForCopilot(results);

    return [
      {
        insertText: contextText,
        range: new vscode.Range(position, position),
      },
    ];
  }
}
```

---

## ⚠️ Error Handling & Troubleshooting

### Common Issues and Solutions

#### TypeScript Errors

```yaml
Missing Dependencies:
  Error: "Cannot find module 'fuse.js'"
  Fix: npm install fuse.js @types/node

Import Errors:
  Error: "Cannot find module 'fuse'"
  Fix: import Fuse from "fuse.js"; // Correct import

Environment Variables:
  Error: "Cannot find name 'env'"
  Fix: import { env } from '$env/static/private';
```

#### Database Connection Issues

```yaml
Connection Refused:
  Error: "Connection refused"
  Fix: Ensure PostgreSQL container is running
  Command: docker ps | grep postgres

Migration Errors:
  Error: "Migration failed"
  Fix: Check database schema compatibility
  Command: npm run db:generate && npm run db:migrate

Vector Extension:
  Error: "Extension does not exist"
  Fix: CREATE EXTENSION IF NOT EXISTS vector;
```

#### AI Service Issues

```yaml
Ollama Connection:
  Error: "Failed to connect to Ollama"
  Fix: Check Ollama service status
  Command: docker-compose ps prosecutor_ollama

Model Loading:
  Error: "Model not found"
  Fix: Pull required models
  Command: ollama pull gemma3:8b && ollama pull nomic-embed-text
```

### Error Monitoring

```typescript
// Error boundary component
class ErrorBoundary extends Error {
  constructor(
    public code: string,
    public context: any,
    public severity: "low" | "medium" | "high" | "critical"
  ) {
    super();
  }
}

// Global error handler
export function handleError(error: Error, context: string) {
  console.error(`[${context}] Error:`, error);

  // Log to monitoring service
  if (error instanceof ErrorBoundary) {
    logToMonitoring({
      code: error.code,
      context: error.context,
      severity: error.severity,
      timestamp: new Date().toISOString(),
    });
  }
}
```

---

## 🚀 Performance Optimization

### Frontend Optimization

#### Code Splitting

```typescript
// Route-based code splitting
const LazyComponent = lazy(() => import("./HeavyComponent.svelte"));

// Dynamic imports for heavy features
async function loadCanvas() {
  const { EnhancedEvidenceCanvas } = await import(
    "./canvas/EnhancedEvidenceCanvas.svelte"
  );
  return EnhancedEvidenceCanvas;
}
```

#### State Management Optimization

```typescript
// Efficient derived stores
export const filteredEvidence = derived(
  [evidenceStore, searchQuery],
  ([$evidence, $query]) => {
    if (!$query) return $evidence;
    return $evidence.filter((item) =>
      item.title.toLowerCase().includes($query.toLowerCase())
    );
  }
);

// Debounced search
export function createDebouncedSearch(delay: number = 300) {
  let timeout: NodeJS.Timeout;

  return function (query: string, callback: (query: string) => void) {
    clearTimeout(timeout);
    timeout = setTimeout(() => callback(query), delay);
  };
}
```

### Backend Optimization

#### Database Query Optimization

```typescript
// Efficient queries with proper indexes
export async function getCaseWithEvidence(caseId: string) {
  const result = await db
    .select({
      case: cases,
      evidence: evidence,
    })
    .from(cases)
    .leftJoin(evidence, eq(evidence.caseId, cases.id))
    .where(eq(cases.id, caseId));

  return result;
}

// Vector search optimization
export async function semanticSearch(query: string, limit: number = 10) {
  // Generate embedding for query
  const embedding = await generateEmbedding(query);

  // Use index for fast similarity search
  const results = await db
    .select()
    .from(evidence)
    .orderBy(cosineDistance(evidence.embedding, embedding))
    .limit(limit);

  return results;
}
```

### Indexing System Optimization

#### Enhanced Indexing Performance

```python
# 70GB Development Mode Optimization
class EnhancedIndexingOptimizer:
    def __init__(self):
        self.memory_limit = "70GB"
        self.optimization_mode = "dev_performance"
        self.cache_strategy = "aggressive"

    async def optimize_for_development(self):
        """Optimize indexing for 70GB development environment"""
        # Prioritize enhanced index over basic
        # Implement intelligent caching
        # Use memory-efficient chunking
        # Enable real-time incremental updates

    async def prioritize_enhanced_index(self, query_results):
        """Ensure enhanced index results take priority"""
        enhanced_results = [r for r in query_results if r.source == "enhanced_local_index"]
        basic_results = [r for r in query_results if r.source == "basic_local_index"]

        # Boost enhanced scores and prioritize
        for result in enhanced_results:
            result.relevance_score += 0.5
            result.priority = "high"

        return enhanced_results + basic_results
```

---

## 🔐 Security & Authentication

### Authentication System

#### Lucia Auth Integration

```typescript
// src/lib/server/lucia.ts
import { lucia } from "lucia";
import { DrizzlePostgreSQLAdapter } from "@lucia-auth/adapter-drizzle";

const adapter = new DrizzlePostgreSQLAdapter(db, sessionTable, userTable);

export const auth = lucia(adapter, {
  env: dev ? "DEV" : "PROD",
  middleware: sveltekit(),
  getUserAttributes: (data) => ({
    username: data.username,
    email: data.email,
    role: data.role,
  }),
});
```

#### Session Management

```typescript
// src/hooks.server.ts
export const handle: Handle = async ({ event, resolve }) => {
  const sessionId = event.cookies.get(auth.sessionCookieName);

  if (!sessionId) {
    event.locals.user = null;
    event.locals.session = null;
    return resolve(event);
  }

  const { session, user } = await auth.validateSession(sessionId);

  if (session?.fresh) {
    const sessionCookie = auth.createSessionCookie(session.id);
    event.cookies.set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    );
  }

  if (!session) {
    const sessionCookie = auth.createBlankSessionCookie();
    event.cookies.set(
      sessionCookie.name,
      sessionCookie.value,
      sessionCookie.attributes
    );
  }

  event.locals.user = user;
  event.locals.session = session;

  return resolve(event);
};
```

### Security Best Practices

#### Data Validation

```typescript
// Input validation with Zod
const caseSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional(),
  status: z.enum(["active", "closed", "archived"]),
  evidence: z.array(z.string().uuid()).optional(),
});

export async function validateCaseData(data: unknown) {
  try {
    return caseSchema.parse(data);
  } catch (error) {
    throw new Error("Invalid case data");
  }
}
```

#### File Upload Security

```typescript
// Secure file upload with validation
export async function handleFileUpload(file: File, userId: string) {
  // Validate file type
  const allowedTypes = [
    "image/jpeg",
    "image/png",
    "application/pdf",
    "text/plain",
  ];
  if (!allowedTypes.includes(file.type)) {
    throw new Error("Invalid file type");
  }

  // Validate file size (10MB limit)
  if (file.size > 10 * 1024 * 1024) {
    throw new Error("File too large");
  }

  // Generate secure filename
  const fileId = crypto.randomUUID();
  const extension = file.name.split(".").pop();
  const secureFilename = `${fileId}.${extension}`;

  // Store file metadata
  const evidenceRecord = await db
    .insert(evidence)
    .values({
      id: fileId,
      fileName: file.name,
      filePath: secureFilename,
      fileSize: file.size,
      mimeType: file.type,
      userId,
    })
    .returning();

  return evidenceRecord[0];
}
```

---

## 📚 Quick Reference Commands

### Development Commands

```bash
# Main development workflow
npm run dev                    # Start development server
npm run check                  # Type checking
npm run lint                   # Code linting
npm run build                  # Production build
npm run preview                # Preview production build

# Database operations
npm run db:generate            # Generate migrations
npm run db:migrate             # Run migrations
npm run db:seed               # Seed database
npm run db:studio             # Open Drizzle Studio

# Docker operations
docker-compose up -d           # Start all services
docker-compose down            # Stop all services
docker-compose logs            # View logs
docker-compose ps              # Service status

# AI/Ollama operations
ollama pull gemma3:8b          # Pull Gemma3 model
ollama pull nomic-embed-text   # Pull embedding model
ollama list                    # List installed models
ollama run gemma3:8b          # Run model interactively
```

### System Health Checks

```bash
# Check service status
curl http://localhost:8000/health     # Indexing server
curl http://localhost:11434/api/tags  # Ollama models
curl http://localhost:6333/collections # Qdrant collections

# VS Code Extension Testing
code --install-extension legal-ai-copilot-integration
```

---

## 🎯 Context Summary for AI Assistants

When working with this codebase, AI assistants should be aware of:

1. **Modern SvelteKit**: Uses Svelte 5 runes ($props, $state, $derived, $effect)
2. **Enhanced Indexing Priority**: Enhanced index takes precedence over basic indexing
3. **Context7 Integration**: MCP protocol for enhanced documentation and context
4. **TypeScript First**: Strict typing throughout the application
5. **Legal Domain**: Specialized for prosecutor/legal professional workflows
6. **Local AI**: Privacy-focused with local LLM processing via Ollama
7. **Vector Search**: Semantic search capabilities with Qdrant
8. **Real-time Updates**: WebSocket integration for live collaboration
9. **Performance Optimized**: 70GB development mode with intelligent caching
10. **Security Focused**: Comprehensive authentication and validation

### For Copilot Integration

The system provides enhanced context through:

- **Semantic code analysis** with language-aware patterns
- **Real-time indexing** of workspace changes
- **Context7 documentation** integration
- **Priority ranking** of enhanced vs basic index results
- **Legal-specific** code patterns and best practices
- **Multi-source context** combining local index + official docs

This context enables more accurate and relevant code suggestions, completions, and assistance for legal AI application development.
 
 # #   =���  P r o j e c t   D i r e c t o r y   S t r u c t u r e 
 
 
 
 * * M a i n   P r o j e c t   P a t h : * *   C : \ U s e r s \ j a m e s \ D e s k t o p \ d e e d s - w e b \ d e e d s - w e b - a p p 
 
 
 
 # # #   K e y   D i r e c t o r i e s : 
 
 -   * * S v e l t e K i t   F r o n t e n d : * *   C : \ U s e r s \ j a m e s \ D e s k t o p \ d e e d s - w e b \ d e e d s - w e b - a p p \ s v e l t e k i t - f r o n t e n d 
 
 -   * * C o m p o n e n t s : * *   C : \ U s e r s \ j a m e s \ D e s k t o p \ d e e d s - w e b \ d e e d s - w e b - a p p \ s v e l t e k i t - f r o n t e n d \ s r c \ l i b \ c o m p o n e n t s 
 
 -   * * K e y b o a r d   C o m p o n e n t s : * *   C : \ U s e r s \ j a m e s \ D e s k t o p \ d e e d s - w e b \ d e e d s - w e b - a p p \ s v e l t e k i t - f r o n t e n d \ s r c \ l i b \ c o m p o n e n t s \ k e y b o a r d 
 
 -   * * V S   C o d e   C o n f i g : * *   C : \ U s e r s \ j a m e s \ D e s k t o p \ d e e d s - w e b \ d e e d s - w e b - a p p \ . v s c o d e 
 
 
 
 # # #   I m p o r t a n t   F i l e s : 
 
 -   * * K e y b o a r d S h o r t c u t s . s v e l t e : * *   C : \ U s e r s \ j a m e s \ D e s k t o p \ d e e d s - w e b \ d e e d s - w e b - a p p \ s v e l t e k i t - f r o n t e n d \ s r c \ l i b \ c o m p o n e n t s \ k e y b o a r d \ K e y b o a r d S h o r t c u t s . s v e l t e 
 
 -   * * P a c k a g e . j s o n : * *   C : \ U s e r s \ j a m e s \ D e s k t o p \ d e e d s - w e b \ d e e d s - w e b - a p p \ s v e l t e k i t - f r o n t e n d \ p a c k a g e . j s o n 
 
 -   * * T h i s   f i l e : * *   C : \ U s e r s \ j a m e s \ D e s k t o p \ d e e d s - w e b \ d e e d s - w e b - a p p \ . v s c o d e \ c l a u d e . m d 
 
 
 
 # # #   R e c e n t   F i x e s : 
 
 -   '  F i x e d   K e y b o a r d S h o r t c u t s . s v e l t e   s y n t a x   e r r o r   ( u n t e r m i n a t e d   s t r i n g   c o n s t a n t ) 
 
 -   '  F i l e   s y s t e m   o p e r a t i o n s   w o r k i n g   w i t h   a b s o l u t e   p a t h s 
 
 -   '  P o w e r S h e l l   c o m m a n d s   s u c c e s s f u l   f o r   f i l e   m o d i f i c a t i o n s 
 
 
