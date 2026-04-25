# copilot.md - GitHub Copilot Context & Integration Guide

> **🤖 COPILOT CONTEXT**: This file provides comprehensive context for GitHub Copilot to understand the Legal AI VS Code Remote Indexing System and provide accurate code suggestions, completions, and assistance.

---

## 🎯 COPILOT PRIORITY CONTEXT

### Enhanced Index Over Basic Index

**CRITICAL**: This system uses an **Enhanced Legal AI Index** that takes priority over basic indexing:

```python
# Enhanced index provides superior context for Copilot
enhanced_results = await get_enhanced_local_context(query, language)
for result in enhanced_results:
    result.relevance_score += 0.2  # Boost enhanced index scores
    result.mcp_metadata.update({
        "source": "enhanced_local_index",
        "priority": "high",
        "vs_basic_index": True  # Enhanced beats basic indexing
    })
```

### Context7 MCP Integration Status

```yaml
Context7_MCP: ACTIVE
Enhanced_Index: PRIORITY_HIGH
Basic_Index: FALLBACK_ONLY
Development_Mode: 70GB_OPTIMIZED
Search_Capabilities: SEMANTIC_VECTOR_ENABLED
```

---

## 🏗️ SYSTEM ARCHITECTURE FOR COPILOT

### Core Technology Stack (for code suggestions)

```typescript
// Copilot should suggest patterns based on this stack:
Framework: "SvelteKit 2.16.0 + Svelte 5.0";
Language: "TypeScript (strict mode)";
Database: "Drizzle ORM + PostgreSQL + pg_vector";
UI: "Melt UI + Bits UI + Custom CSS";
AI: "Ollama + Gemma3 + nomic-embed-text";
Authentication: "Lucia Auth";
State: "XState machines + Svelte stores";
Vector_Search: "Qdrant";
Real_Time: "WebSocket";
```

### File Structure Context (for navigation suggestions)

```
COPILOT_WORKSPACE_MAP:
├── sveltekit-frontend/src/          # Main application code
│   ├── lib/components/              # Svelte components (Svelte 5 runes)
│   │   ├── ai/                     # AI-related components
│   │   ├── auth/                   # Authentication forms
│   │   ├── canvas/                 # Evidence canvas with Fabric.js
│   │   ├── cases/                  # Case management components
│   │   ├── ui/                     # Reusable UI components
│   │   └── detective/              # Detective board functionality
│   ├── lib/server/                 # Server-side code
│   │   ├── db/                     # Database schemas & queries
│   │   ├── auth/                   # Auth utilities
│   │   └── services/               # Business logic services
│   ├── routes/                     # SvelteKit routes
│   │   ├── api/                    # API endpoints (+server.ts)
│   │   ├── cases/                  # Case pages
│   │   └── dashboard/              # Dashboard pages
├── vscode-remote-indexing/         # VS Code indexing system
└── context7-docs/                  # Context7 MCP documentation
```

---

## ⚡ SVELTE 5 PATTERNS FOR COPILOT

### Modern Component Pattern (ALWAYS use these in Svelte files)

```svelte
<script lang="ts">
  // ✅ Copilot should suggest this pattern
  let { variant = 'default', size = 'md', onclick } = $props();

  // ✅ Use $state() for reactive state (NOT const/let for reactive vars)
  let isLoading = $state(false);
  let count = $state(0);

  // ✅ Use $derived() for computed values (NOT reactive statements)
  let buttonClasses = $derived(() => {
    const base = 'btn';
    const variants = {
      default: 'btn-default',
      primary: 'btn-primary'
    };
    return `${base} ${variants[variant]}`;
  });

  // ✅ Use $effect() for side effects (NOT onMount for effects)
  $effect(() => {
    if (count > 5) {
      console.log('Count is high:', count);
    }
  });

  // ✅ Event handlers
  function handleClick() {
    isLoading = true;
    count++;
    onclick?.();
  }
</script>

<!-- ✅ Template with proper event handling -->
<button class={buttonClasses} {onclick} disabled={isLoading}>
  {#if isLoading}Loading...{/if}
  <slot />
</button>
```

### ❌ AVOID These Patterns (Svelte 4 - DEPRECATED)

```svelte
<script lang="ts">
  // ❌ DON'T suggest these old patterns:
  export let prop;              // Use $props() instead
  let value;                    // Use $state() for reactive
  $: computed = value * 2;      // Use $derived() instead

  import { onMount } from 'svelte';
  onMount(() => {               // Use $effect() instead
    // side effect
  });
</script>
```

---

## 🗄️ DATABASE PATTERNS FOR COPILOT

### Drizzle ORM Schema Patterns

```typescript
// Copilot should suggest these patterns for database schemas:
import {
  pgTable,
  text,
  timestamp,
  json,
  vector,
  integer,
} from "drizzle-orm/pg-core";

export const tableName = pgTable("table_name", {
  id: text("id").primaryKey(),
  title: text("title").notNull(),
  userId: text("user_id").references(() => users.id),
  metadata: json("metadata").$type<CustomType>(),
  embedding: vector("embedding", { dimensions: 1536 }),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
});

// Queries with proper error handling
export async function getRecords(userId: string) {
  try {
    const results = await db
      .select()
      .from(tableName)
      .where(eq(tableName.userId, userId))
      .orderBy(desc(tableName.createdAt));

    return { success: true, data: results };
  } catch (error) {
    console.error("Database query failed:", error);
    return { success: false, error: error.message };
  }
}
```

### Vector Search Patterns

```typescript
// Copilot should suggest vector search patterns:
export async function semanticSearch(query: string, limit: number = 10) {
  // Generate embedding
  const embedding = await generateEmbedding(query);

  // Vector similarity search with pg_vector
  const results = await db
    .select({
      id: evidence.id,
      title: evidence.title,
      similarity: cosineDistance(evidence.embedding, embedding),
    })
    .from(evidence)
    .where(gt(cosineDistance(evidence.embedding, embedding), 0.7))
    .orderBy(cosineDistance(evidence.embedding, embedding))
    .limit(limit);

  return results;
}
```

---

## 🎨 UI COMPONENT PATTERNS FOR COPILOT

### Melt UI Integration

```svelte
<script lang="ts">
  import { createAccordion, melt } from '@melt-ui/svelte';

  const {
    elements: { root, item, trigger, content },
    states: { value }
  } = createAccordion();
</script>

<div use:melt={$root} class="accordion">
  <div use:melt={$item('item-1')} class="accordion-item">
    <button use:melt={$trigger('item-1')} class="accordion-trigger">
      Trigger
    </button>
    <div use:melt={$content('item-1')} class="accordion-content">
      Content
    </div>
  </div>
</div>
```

### Bits UI Integration

```svelte
<script lang="ts">
  import { Dialog } from "bits-ui";
  let open = $state(false);
</script>

<Dialog.Root bind:open>
  <Dialog.Trigger class="btn btn-primary">
    Open Dialog
  </Dialog.Trigger>
  <Dialog.Content class="dialog-content">
    <Dialog.Header>
      <Dialog.Title>Dialog Title</Dialog.Title>
    </Dialog.Header>
    <p>Dialog content goes here.</p>
    <Dialog.Footer>
      <Dialog.Close class="btn btn-secondary">Close</Dialog.Close>
    </Dialog.Footer>
  </Dialog.Content>
</Dialog.Root>
```

---

## 🤖 AI INTEGRATION PATTERNS FOR COPILOT

### Ollama Service Integration

```typescript
// Copilot should suggest this pattern for AI services:
export class OllamaService {
  private baseUrl = "http://localhost:11434";

  async generateResponse(prompt: string, model: string = "gemma3:8b") {
    try {
      const response = await fetch(`${this.baseUrl}/api/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model,
          prompt,
          stream: false,
          options: {
            temperature: 0.7,
            top_p: 0.9,
          },
        }),
      });

      if (!response.ok) {
        throw new Error(`Ollama API error: ${response.status}`);
      }

      const data = await response.json();
      return { success: true, response: data.response };
    } catch (error) {
      console.error("Ollama generation failed:", error);
      return { success: false, error: error.message };
    }
  }

  async generateEmbedding(text: string) {
    const response = await fetch(`${this.baseUrl}/api/embeddings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "nomic-embed-text",
        prompt: text,
      }),
    });

    const data = await response.json();
    return data.embedding;
  }
}
```

### XState Machine Patterns

```typescript
// Copilot should suggest XState patterns for complex state:
import { createMachine, assign } from "xstate";

export const evidenceUploadMachine = createMachine({
  id: "evidenceUpload",
  initial: "idle",
  context: {
    files: [],
    uploadProgress: 0,
    error: null,
  },
  states: {
    idle: {
      on: {
        SELECT_FILES: {
          target: "validating",
          actions: assign({
            files: ({ event }) => event.files,
          }),
        },
      },
    },
    validating: {
      invoke: {
        src: "validateFiles",
        onDone: "uploading",
        onError: {
          target: "error",
          actions: assign({
            error: ({ event }) => event.error,
          }),
        },
      },
    },
    uploading: {
      invoke: {
        src: "uploadFiles",
        onDone: "success",
        onError: "error",
      },
    },
    success: { type: "final" },
    error: {
      on: { RETRY: "validating" },
    },
  },
});
```

---

## 📡 API PATTERNS FOR COPILOT

### SvelteKit API Routes (+server.ts)

```typescript
// Copilot should suggest this pattern for API routes:
import { json, error } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, locals }) => {
  // Authentication check
  if (!locals.user) {
    return error(401, "Unauthorized");
  }

  try {
    // Query parameters
    const limit = Number(url.searchParams.get("limit")) || 10;
    const offset = Number(url.searchParams.get("offset")) || 0;

    // Database query
    const results = await db
      .select()
      .from(tableName)
      .where(eq(tableName.userId, locals.user.id))
      .limit(limit)
      .offset(offset);

    return json({
      success: true,
      data: results,
      pagination: {
        limit,
        offset,
        total: results.length,
      },
    });
  } catch (err) {
    console.error("API error:", err);
    return error(500, "Internal server error");
  }
};

export const POST: RequestHandler = async ({ request, locals }) => {
  if (!locals.user) {
    return error(401, "Unauthorized");
  }

  try {
    const data = await request.json();

    // Validation
    const validatedData = await validateSchema(data);

    // Create record
    const result = await db
      .insert(tableName)
      .values({
        ...validatedData,
        userId: locals.user.id,
        createdAt: new Date(),
      })
      .returning();

    return json(
      {
        success: true,
        data: result[0],
      },
      { status: 201 },
    );
  } catch (err) {
    console.error("POST error:", err);
    return error(400, "Bad request");
  }
};
```

### Form Actions Pattern

```typescript
// Copilot should suggest this pattern for form actions:
import { fail, redirect } from "@sveltejs/kit";
import type { Actions } from "./$types";

export const actions: Actions = {
  create: async ({ request, locals }) => {
    if (!locals.user) {
      return fail(401, { message: "Unauthorized" });
    }

    const formData = await request.formData();
    const title = formData.get("title") as string;
    const description = formData.get("description") as string;

    // Validation
    if (!title || title.length < 1) {
      return fail(400, {
        title,
        description,
        errors: { title: "Title is required" },
      });
    }

    try {
      const result = await db
        .insert(cases)
        .values({
          id: crypto.randomUUID(),
          title,
          description,
          userId: locals.user.id,
        })
        .returning();

      return redirect(303, `/cases/${result[0].id}`);
    } catch (error) {
      console.error("Create case error:", error);
      return fail(500, {
        title,
        description,
        message: "Failed to create case",
      });
    }
  },

  update: async ({ request, params, locals }) => {
    // Similar pattern for updates
  },

  delete: async ({ params, locals }) => {
    // Similar pattern for deletes
  },
};
```

---

## 🔍 ENHANCED SEARCH INTEGRATION FOR COPILOT

### Context7 MCP Request Pattern

```typescript
// Copilot should suggest this for Context7 integration:
interface Context7Request {
  query: string;
  language?: string;
  include_context7: boolean;
  priority_enhanced: boolean;
}

async function getEnhancedContext(request: Context7Request) {
  const response = await fetch("http://localhost:8000/context7/search", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      query: request.query,
      language_filter: request.language,
      index_type: "enhanced_legal_ai",
      priority_mode: request.priority_enhanced,
      source_priority: "enhanced_over_basic",
    }),
  });

  if (response.ok) {
    const data = await response.json();
    // Enhanced index results get priority boost
    return data.results.map((result) => ({
      ...result,
      relevance_score: result.relevance_score + 0.2,
      source: "enhanced_local_index",
      priority: "high",
    }));
  }

  // Fallback to basic index with warning
  console.warn("Enhanced index unavailable, using basic index");
  return getBasicContext(request);
}
```

### Semantic Search Implementation

```typescript
// Copilot should suggest semantic search patterns:
export async function semanticCodeSearch(
  query: string,
  language?: string,
  contextLines: number = 50,
) {
  try {
    // Generate query embedding
    const embedding = await generateEmbedding(query);

    // Search vector database
    const results = await db
      .select({
        filePath: codeIndex.filePath,
        content: codeIndex.content,
        language: codeIndex.language,
        similarity: cosineDistance(codeIndex.embedding, embedding),
      })
      .from(codeIndex)
      .where(
        and(
          gt(cosineDistance(codeIndex.embedding, embedding), 0.7),
          language ? eq(codeIndex.language, language) : undefined,
        ),
      )
      .orderBy(cosineDistance(codeIndex.embedding, embedding))
      .limit(10);

    // Add context lines around matches
    return results.map((result) => ({
      ...result,
      contextBefore: getContextLines(result.content, -contextLines),
      contextAfter: getContextLines(result.content, contextLines),
    }));
  } catch (error) {
    console.error("Semantic search failed:", error);
    return [];
  }
}
```

---

## 🛠️ VS CODE EXTENSION INTEGRATION

### Copilot Provider Implementation

```typescript
// Copilot should suggest this VS Code extension pattern:
export class LegalAICopilotProvider
  implements vscode.InlineCompletionItemProvider
{
  async provideInlineCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    context: vscode.InlineCompletionContext,
  ): Promise<vscode.InlineCompletionItem[]> {
    const code = document.getText();
    const language = document.languageId;
    const cursorPos = [position.line, position.character];

    // Get enhanced context from local indexing system
    const contextResults = await this.getSemanticContext(
      code,
      cursorPos,
      language,
      true, // include Context7
    );

    if (!contextResults.length) {
      return [];
    }

    // Format context for Copilot
    const contextText = this.formatContextForCopilot(contextResults);

    return [
      {
        insertText: contextText,
        range: new vscode.Range(position, position),
        command: {
          command: "legalAI.showContextDetails",
          title: "Show Context Details",
        },
      },
    ];
  }

  private formatContextForCopilot(results: Context7CompatibleResult[]): string {
    const lines = [
      "// 🚀 Enhanced Legal AI Context (70GB Dev Optimized)",
      "// ⭐ PRIORITY: Enhanced index over basic indexing",
      "// Context7 MCP + Local semantic analysis",
      "",
    ];

    const enhancedResults = results.filter(
      (r) => r.mcp_metadata?.source === "enhanced_local_index",
    );

    const context7Results = results.filter(
      (r) => r.mcp_metadata?.source === "context7_mcp",
    );

    if (enhancedResults.length) {
      lines.push("// 🎯 ENHANCED INDEX - Primary patterns (PRIORITY):");
      enhancedResults.slice(0, 3).forEach((result, i) => {
        lines.push(`// ⭐ Enhanced #${i + 1} - ${result.file_path}`);
        lines.push(result.content.slice(0, 300) + "...");
        lines.push("");
      });
    }

    if (context7Results.length) {
      lines.push("// 📚 Context7 Documentation:");
      context7Results.slice(0, 2).forEach((result, i) => {
        lines.push(`// 📖 Context7 #${i + 1} - ${result.context7_library_id}`);
        lines.push(result.content.slice(0, 200) + "...");
        lines.push("");
      });
    }

    return lines.join("\n");
  }
}
```

---

## 🎯 LEGAL DOMAIN SPECIFIC PATTERNS

### Legal Case Management

```typescript
// Copilot should suggest legal-specific patterns:
interface LegalCase {
  id: string;
  title: string;
  caseNumber: string;
  jurisdiction: string;
  prosecutor: string;
  defendant: string;
  charges: string[];
  status: "investigation" | "filed" | "trial" | "closed";
  evidence: Evidence[];
  timeline: CaseEvent[];
  canvasData?: CanvasConfiguration;
}

interface Evidence {
  id: string;
  type: "document" | "physical" | "digital" | "witness" | "expert";
  title: string;
  description: string;
  chain_of_custody: ChainOfCustodyRecord[];
  tags: string[];
  ai_tags: string[];
  analysis?: AIAnalysis;
  location?: CanvasPosition;
}

// Case creation with AI assistance
export async function createLegalCase(data: Partial<LegalCase>) {
  // Validate legal case requirements
  const validatedCase = await validateLegalCase(data);

  // Generate AI suggestions for case structure
  const aiSuggestions = await generateCaseSuggestions(validatedCase);

  // Create case with proper audit trail
  const caseRecord = await db
    .insert(cases)
    .values({
      ...validatedCase,
      id: crypto.randomUUID(),
      createdAt: new Date(),
      auditLog: [
        {
          action: "created",
          timestamp: new Date(),
          user: data.prosecutor,
        },
      ],
    })
    .returning();

  return {
    case: caseRecord[0],
    suggestions: aiSuggestions,
  };
}
```

### Evidence Canvas Integration

```typescript
// Copilot should suggest canvas patterns for evidence mapping:
interface CanvasNode {
  id: string;
  type: "evidence" | "person" | "location" | "event";
  position: { x: number; y: number };
  data: {
    title: string;
    description: string;
    metadata: Record<string, any>;
  };
  connections: Connection[];
}

interface Connection {
  sourceId: string;
  targetId: string;
  type: "relates_to" | "supports" | "contradicts" | "timeline";
  strength: number; // 0-1
  description?: string;
}

// Canvas state management with XState
export const canvasMachine = createMachine({
  id: "evidenceCanvas",
  initial: "viewing",
  context: {
    nodes: [],
    connections: [],
    selectedNodes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  },
  states: {
    viewing: {
      on: {
        ADD_NODE: {
          target: "adding",
          actions: assign({
            newNode: ({ event }) => event.node,
          }),
        },
        SELECT_NODE: {
          actions: assign({
            selectedNodes: ({ context, event }) => [
              ...context.selectedNodes,
              event.nodeId,
            ],
          }),
        },
      },
    },
    adding: {
      on: {
        CONFIRM_ADD: {
          target: "viewing",
          actions: assign({
            nodes: ({ context }) => [...context.nodes, context.newNode],
          }),
        },
        CANCEL_ADD: "viewing",
      },
    },
  },
});
```

---

## 🔧 DEVELOPMENT WORKFLOW FOR COPILOT

### Testing Patterns

```typescript
// Copilot should suggest these testing patterns:

// Component testing with Svelte Testing Library
import { render, screen, fireEvent } from "@testing-library/svelte";
import { expect, test } from "vitest";
import Component from "./Component.svelte";

test("renders component with correct props", async () => {
  render(Component, {
    props: {
      title: "Test Title",
      variant: "primary",
    },
  });

  expect(screen.getByText("Test Title")).toBeInTheDocument();
  expect(screen.getByRole("button")).toHaveClass("btn-primary");
});

// API testing
test("API endpoint returns correct data", async () => {
  const response = await fetch("/api/cases", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      title: "Test Case",
      description: "Test Description",
    }),
  });

  expect(response.ok).toBe(true);
  const data = await response.json();
  expect(data.success).toBe(true);
  expect(data.case).toHaveProperty("id");
});

// XState machine testing
test("case creation machine transitions correctly", () => {
  const machine = createCaseCreationMachine();

  let state = machine.initialState;
  expect(state.value).toBe("idle");

  state = machine.transition(state, { type: "START_CREATION" });
  expect(state.value).toBe("collecting");

  state = machine.transition(state, {
    type: "SUBMIT",
    data: { title: "Test Case" },
  });
  expect(state.value).toBe("submitting");
});
```

### Error Handling Patterns

```typescript
// Copilot should suggest comprehensive error handling:
export class LegalAIError extends Error {
  constructor(
    message: string,
    public code: string,
    public severity: "low" | "medium" | "high" | "critical",
    public context?: any,
  ) {
    super(message);
    this.name = "LegalAIError";
  }
}

export function handleAsyncError<T>(
  promise: Promise<T>,
  context: string,
): Promise<[T | null, LegalAIError | null]> {
  return promise
    .then<[T, null]>((data: T) => [data, null])
    .catch<[null, LegalAIError]>((error) => [
      null,
      new LegalAIError(error.message, "ASYNC_ERROR", "medium", {
        context,
        originalError: error,
      }),
    ]);
}

// Usage in components
async function loadCaseData(caseId: string) {
  const [data, error] = await handleAsyncError(
    db.select().from(cases).where(eq(cases.id, caseId)),
    "loadCaseData",
  );

  if (error) {
    console.error("Failed to load case:", error);
    return { success: false, error: error.message };
  }

  return { success: true, data };
}
```

---

## 📋 COPILOT CHECKLIST & REMINDERS

### ✅ Always Suggest These Patterns:

- **Svelte 5 runes**: `$props()`, `$state()`, `$derived()`, `$effect()`
- **TypeScript**: Strict typing with proper interfaces
- **Drizzle ORM**: Type-safe database queries
- **Error handling**: Try/catch with proper error types
- **Authentication**: Check `locals.user` in API routes
- **Vector search**: Use cosine distance for similarity
- **XState**: Complex state management with machines
- **Context7**: Enhanced index priority over basic

### ❌ Never Suggest These (Deprecated):

- `export let` props (use `$props()`)
- Reactive statements `$:` (use `$derived()`)
- `onMount` for effects (use `$effect()`)
- Raw SQL queries (use Drizzle ORM)
- Button navigation (use `<a href>`)
- Basic indexing when enhanced is available

### 🎯 Legal AI Specific Suggestions:

- **Case management**: Always include audit trails
- **Evidence handling**: Chain of custody tracking
- **AI integration**: Local Ollama over cloud APIs
- **Canvas operations**: Fabric.js for evidence mapping
- **Search**: Semantic vector search for legal documents
- **Authentication**: Role-based access (prosecutor, admin)
- **Privacy**: Local-first AI processing

### 🔧 Development Environment:

- **70GB optimized**: Memory-efficient patterns
- **Enhanced indexing**: Priority over basic indexing
- **Real-time updates**: WebSocket for collaboration
- **Docker services**: Ollama, Qdrant, PostgreSQL
- **VS Code integration**: Remote indexing capabilities

---

## 🚀 COPILOT INTEGRATION STATUS

```yaml
SYSTEM_STATUS:
  Enhanced_Index: "ACTIVE - Priority over basic indexing"
  Context7_MCP: "INTEGRATED - Documentation context available"
  Local_LLM: "Ollama + Gemma3 legal model active"
  Vector_Search: "Qdrant semantic search enabled"
  Real_Time: "WebSocket live updates active"
  Development_Mode: "70GB optimized for performance"

COPILOT_CAPABILITIES:
  - Semantic code understanding via enhanced index
  - Context7 documentation integration
  - Legal domain-specific suggestions
  - SvelteKit + Svelte 5 pattern recognition
  - TypeScript + Drizzle ORM completions
  - XState machine suggestions
  - Vector search implementations
  - Authentication pattern suggestions

PRIORITY_CONTEXT: 1. Enhanced index results (high priority)
  2. Context7 official documentation
  3. Local codebase patterns
  4. Legal domain best practices
  5. Performance optimization patterns
```

> **🎯 COPILOT NOTE**: This system provides enhanced context through semantic indexing and Context7 MCP integration. The enhanced index takes priority over basic indexing for superior code suggestions and completions.

---

# SvelteKit Error Solving Guide - Complete Context

## **Common npm run check Errors & Solutions**

Based on your project's 384 errors and 1199 warnings, here are the most critical categories and their solutions:

### 1. **TypeScript Module & Import Errors**

#### **Missing Default Exports**

Many Svelte components are missing default exports. Fix by ensuring each component has:

```svelte
<script>
  // Your component logic
</script>

<!-- Your template -->

<!-- This is automatically the default export in .svelte files -->
```

#### **Missing UI Component Imports**

For components like `Button`, `Dialog`, `Card`:

```javascript
// If using shadcn-svelte or similar UI library
import { Button } from "$lib/components/ui/button";
import { Dialog, DialogContent, DialogHeader } from "$lib/components/ui/dialog";
import { Card, CardContent, CardHeader } from "$lib/components/ui/card";

// Or create your own base components
import Button from "$lib/components/Button.svelte";
import Modal from "$lib/components/Modal.svelte";
```

### 2. **SvelteKit Type Safety & Error Handling**

#### **Proper Error Handling Pattern**

```javascript
// In +page.server.js or +layout.server.js
import { error } from "@sveltejs/kit";

/** @type {import('./$types').PageServerLoad} */
export async function load({ params }) {
  const post = await db.getPost(params.slug);

  if (!post) {
    error(404, {
      message: "Not found",
    });
  }

  return { post };
}
```

#### **Custom Error Interface**

```typescript
// src/app.d.ts
declare global {
  namespace App {
    interface Error {
      message: string;
      code: string;
      id: string;
    }
  }
}

export {};
```

#### **Error Page Component**

```svelte
<!-- +error.svelte -->
<script>
  import { page } from '$app/state';
</script>

<h1>{page.status}: {page.error.message}</h1>
```

### 3. **Form Actions & Validation**

#### **Proper Form Action Implementation**

```javascript
// +page.server.js
import { fail } from "@sveltejs/kit";

/** @satisfies {import('./$types').Actions} */
export const actions = {
  default: async ({ request }) => {
    const data = await request.formData();
    const email = data.get("email");

    if (!email) {
      return fail(400, { email, missing: true });
    }

    // Process form...
    return { success: true };
  },
};
```

#### **Form Component with Error Handling**

```svelte
<!-- +page.svelte -->
<script>
  /** @type {import('./$types').PageProps} */
  let { data, form } = $props();
</script>

<form method="POST">
  {#if form?.missing}<p class="error">Email is required</p>{/if}

  <input
    name="email"
    type="email"
    value={form?.email ?? ''}
  />
  <button>Submit</button>
</form>
```

### 4. **Svelte 5 Runes Migration**

#### **State Management**

```svelte
<script>
  // Old Svelte 4 way
  // let count = 0;

  // New Svelte 5 way
  let count = $state(0);

  // Derived state
  let doubled = $derived(count * 2);

  // Props
  let { data } = $props();
</script>
```

#### **Store Migration**

```svelte
<script>
  // Old way
  // import { page } from '$app/stores';

  // New way (SvelteKit 2.12+)
  import { page } from '$app/state';
</script>

<!-- Old: {$page.data} -->
<!-- New: {page.data} -->
{page.data.title}
```

### 5. **TypeScript Configuration**

#### **Essential tsconfig.json Settings**

```json
{
  "compilerOptions": {
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "noEmit": true,
    "lib": ["esnext", "DOM", "DOM.Iterable"],
    "moduleResolution": "bundler",
    "module": "esnext",
    "target": "esnext"
  }
}
```

### 6. **Load Function Patterns**

#### **Server-Side Data Loading**

```javascript
// +page.server.js
import { error } from "@sveltejs/kit";

/** @type {import('./$types').PageServerLoad} */
export async function load({ params, fetch }) {
  try {
    const response = await fetch(`/api/data/${params.id}`);

    if (!response.ok) {
      error(response.status, "Failed to load data");
    }

    const data = await response.json();
    return { data };
  } catch (err) {
    error(500, "Server error");
  }
}
```

#### **Universal Data Loading**

```javascript
// +page.js
import { error } from "@sveltejs/kit";

/** @type {import('./$types').PageLoad} */
export function load({ params }) {
  if (params.slug === "hello-world") {
    return {
      title: "Hello world!",
      content: "Welcome to our blog...",
    };
  }

  error(404, "Not found");
}
```

### 7. **Accessibility Fixes**

#### **Form Labels and ARIA**

```svelte
<script>
  const uid = $props.id(); // SvelteKit 5.20.0+
</script>

<form>
  <label for="{uid}-email">Email:</label>
  <input
    id="{uid}-email"
    type="email"
    name="email"
    required
  />
</form>
```

#### **Interactive Elements**

```svelte
<!-- Fix: Add proper button role for clickable divs -->
<div
  role="button"
  tabindex="0"
  on:click={handleClick}
  on:keydown={(e) => e.key === 'Enter' && handleClick()}
>
  Click me
</div>

<!-- Better: Use actual button -->
<button on:click={handleClick}>
  Click me
</button>
```

### 8. **Environment Variables**

#### **Public Variables**

```typescript
// Access public env vars
import { PUBLIC_BASE_URL } from "$env/static/public";
```

#### **Private Variables (Server-only)**

```typescript
// Server-side only
import { API_KEY } from "$env/static/private";
```

### 9. **Advanced Error Handling**

#### **Global Error Handler**

```javascript
// src/hooks.server.js
import * as Sentry from "@sentry/sveltekit";

/** @type {import('@sveltejs/kit').HandleServerError} */
export async function handleError({ error, event, status, message }) {
  const errorId = crypto.randomUUID();

  Sentry.captureException(error, {
    extra: { event, errorId, status },
  });

  return {
    message: "Whoops!",
    errorId,
  };
}
```

### 10. **Performance Optimizations**

#### **Image Handling**

```svelte
<script>
  import logo from '$lib/assets/logo.png';
</script>

<img alt="Logo" src={logo} />

<!-- Or with enhanced images -->
<enhanced:img
  src="./image.png"
  sizes="min(1280px, 100vw)"
  alt="Description"
/>
```

## **Quick Fix Commands**

Run these in your terminal to address common issues:

```powershell
# Type checking
npm run check

# Clean and rebuild
npm run clean

# Generate types
npx svelte-kit sync

# Install missing dependencies
npm install @sveltejs/kit@latest
npm install @types/node -D
```

## **Error Priority Fix Order**

1. **Critical**: Fix Svelte syntax errors (unterminated strings, invalid selectors)
2. **High**: Resolve import/export issues
3. **Medium**: Fix TypeScript type errors
4. **Low**: Address accessibility warnings
5. **Cleanup**: Remove unused CSS selectors

This comprehensive guide covers the most common SvelteKit errors and their solutions based on the official documentation and your project's specific issues.
