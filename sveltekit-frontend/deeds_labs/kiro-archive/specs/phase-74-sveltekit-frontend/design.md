# Phase 74: SvelteKit Frontend Design Document

## Overview

A SvelteKit 2 + Svelte 5 frontend application providing intelligent code error fixing through AST analysis (tsmorph), agentic auto-suggestions with web search, and RAG-powered codebase context. Integrates with Phase 73 Unified Reasoning Engine for clustering and re-ranking.

**Tech Stack:**
- SvelteKit 2 + Svelte 5 (runes)
- uno.css (utility-first styling)
- drizzle-orm 0.44 (type-safe ORM)
- tsmorph (AST analysis)
- Monaco Editor (code editing)

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    SvelteKit 2 Frontend                         │
├─────────────────────────────────────────────────────────────────┤
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐          │
│  │ CodeEditor   │  │ ErrorPanel   │  │ Suggestions  │          │
│  │ (Monaco)     │  │ (Real-time)  │  │ (Agentic)    │          │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘          │
│         │                 │                 │                   │
│  ┌──────▼─────────────────▼─────────────────▼───────┐          │
│  │              AST Analysis Engine (tsmorph)        │          │
│  └──────────────────────┬───────────────────────────┘          │
│                         │                                       │
│  ┌──────────────────────▼───────────────────────────┐          │
│  │           Server Routes (+server.ts)              │          │
│  │  /api/analyze  /api/suggest  /api/search         │          │
│  └──────────────────────┬───────────────────────────┘          │
├─────────────────────────┼───────────────────────────────────────┤
│                         │                                       │
│  ┌──────────────────────▼───────────────────────────┐          │
│  │              Drizzle ORM (SQLite/Postgres)        │          │
│  │  analyses | suggestions | codebase_index         │          │
│  └──────────────────────────────────────────────────┘          │
└─────────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────────┐
│                 Phase 73 Backend Services                       │
├─────────────────────────────────────────────────────────────────┤
│  FastAPI Bridge → CUDA Clustering → Go Re-ranker → Redis Cache  │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Code Editor Component
```svelte
<!-- src/lib/components/CodeEditor.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import * as monaco from 'monaco-editor';

  let { code = $bindable(''), language = 'typescript', onAnalyze } = $props();
  let editor: monaco.editor.IStandaloneCodeEditor;
  let container: HTMLDivElement;

  onMount(() => {
    editor = monaco.editor.create(container, {
      value: code,
      language,
      theme: 'vs-dark',
      automaticLayout: true
    });

    editor.onDidChangeModelContent(() => {
      code = editor.getValue();
      onAnalyze?.(code);
    });
  });
</script>

<div bind:this={container} class="h-full w-full"></div>
```

### 2. AST Analysis Service
```typescript
// src/lib/services/ast-analyzer.ts
import { Project, SourceFile, SyntaxKind } from 'ts-morph';

export interface ASTAnalysisResult {
  errors: ASTError[];
  functions: FunctionInfo[];
  variables: VariableInfo[];
  types: TypeInfo[];
}

export interface ASTError {
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning' | 'info';
  code: string;
}

export class ASTAnalyzer {
  private project: Project;

  constructor() {
    this.project = new Project({ useInMemoryFileSystem: true });
  }

  analyze(code: string, filename = 'temp.ts'): ASTAnalysisResult {
    const sourceFile = this.project.createSourceFile(filename, code, { overwrite: true });

    return {
      errors: this.extractErrors(sourceFile),
      functions: this.extractFunctions(sourceFile),
      variables: this.extractVariables(sourceFile),
      types: this.extractTypes(sourceFile)
    };
  }

  private extractErrors(sourceFile: SourceFile): ASTError[] {
    const diagnostics = sourceFile.getPreEmitDiagnostics();
    return diagnostics.map(d => ({
      line: d.getLineNumber() ?? 0,
      column: d.getStart() ?? 0,
      message: d.getMessageText().toString(),
      severity: this.mapSeverity(d.getCategory()),
      code: d.getCode().toString()
    }));
  }
}
```

### 3. Suggestion Engine
```typescript
// src/lib/services/suggestion-engine.ts
export interface Suggestion {
  id: string;
  title: string;
  description: string;
  code: string;
  confidence: number;
  cluster: ClusterInfo;
  sources: string[];
}

export interface ClusterInfo {
  id: number;
  label: string;
  color: string;
  icon: string;
}

export class SuggestionEngine {
  async getSuggestions(error: ASTError, context: CodebaseContext): Promise<Suggestion[]> {
    // 1. Get RAG context from codebase
    const ragContext = await this.retrieveContext(error, context);

    // 2. Call Phase 73 backend for clustering
    const clustered = await this.clusterSuggestions(ragContext);

    // 3. Optionally search web for external solutions
    const webResults = await this.searchWeb(error.message);

    // 4. Merge and rank suggestions
    return this.rankSuggestions([...clustered, ...webResults]);
  }
}
```

### 4. Cluster Badge Component
```svelte
<!-- src/lib/components/ClusterBadge.svelte -->
<script lang="ts">
  import type { ClusterInfo } from '$lib/services/suggestion-engine';

  let { cluster } = $props<{ cluster: ClusterInfo }>();

  const colorMap: Record<string, string> = {
    'syntax': 'bg-red-500',
    'type': 'bg-blue-500',
    'semantic': 'bg-purple-500',
    'style': 'bg-green-500',
    'performance': 'bg-orange-500'
  };
</script>

<span
  class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium text-white {colorMap[cluster.label] ?? 'bg-gray-500'}"
  title={cluster.label}
>
  <span class="i-{cluster.icon}"></span>
  {cluster.label}
</span>
```

### 5. Web Search Integration
```typescript
// src/lib/services/web-search.ts
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  source: string;
}

export class WebSearchService {
  private cache = new Map<string, { results: SearchResult[], timestamp: number }>();
  private cacheTTL = 24 * 60 * 60 * 1000; // 24 hours

  async search(query: string): Promise<SearchResult[]> {
    const cached = this.cache.get(query);
    if (cached && Date.now() - cached.timestamp < this.cacheTTL) {
      return cached.results;
    }

    const results = await this.fetchResults(query);
    this.cache.set(query, { results, timestamp: Date.now() });
    return results;
  }
}
```

## Data Models

### Drizzle Schema
```typescript
// src/lib/db/schema.ts
import { sqliteTable, text, integer, real } from 'drizzle-orm/sqlite-core';

export const analyses = sqliteTable('analyses', {
  id: text('id').primaryKey(),
  code: text('code').notNull(),
  language: text('language').notNull(),
  errorCount: integer('error_count').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).notNull()
});

export const suggestions = sqliteTable('suggestions', {
  id: text('id').primaryKey(),
  analysisId: text('analysis_id').references(() => analyses.id),
  title: text('title').notNull(),
  description: text('description'),
  code: text('code').notNull(),
  confidence: real('confidence').notNull(),
  clusterId: integer('cluster_id'),
  clusterLabel: text('cluster_label'),
  applied: integer('applied', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).notNull()
});

export const codebaseIndex = sqliteTable('codebase_index', {
  id: text('id').primaryKey(),
  filePath: text('file_path').notNull(),
  content: text('content').notNull(),
  embedding: text('embedding'), // JSON array of floats
  lastIndexed: integer('last_indexed', { mode: 'timestamp' }).notNull()
});

export const userPreferences = sqliteTable('user_preferences', {
  id: text('id').primaryKey(),
  theme: text('theme').default('dark'),
  autoSuggest: integer('auto_suggest', { mode: 'boolean' }).default(true),
  webSearchEnabled: integer('web_search_enabled', { mode: 'boolean' }).default(true)
});
```

## API Routes

### Analysis Endpoint
```typescript
// src/routes/api/analyze/+server.ts
import { json } from '@sveltejs/kit';
import { ASTAnalyzer } from '$lib/services/ast-analyzer';
import { db } from '$lib/db';
import { analyses } from '$lib/db/schema';
import { nanoid } from 'nanoid';

export async function POST({ request }) {
  const { code, language } = await request.json();

  const analyzer = new ASTAnalyzer();
  const result = analyzer.analyze(code);

  const id = nanoid();
  await db.insert(analyses).values({
    id,
    code,
    language,
    errorCount: result.errors.length,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  return json({ id, ...result });
}
```

### Suggestion Endpoint
```typescript
// src/routes/api/suggest/+server.ts
import { json } from '@sveltejs/kit';
import { SuggestionEngine } from '$lib/services/suggestion-engine';

export async function POST({ request }) {
  const { error, codebaseContext } = await request.json();

  const engine = new SuggestionEngine();
  const suggestions = await engine.getSuggestions(error, codebaseContext);

  return json({ suggestions });
}
```

### Phase 73 Integration
```typescript
// src/routes/api/search/unified/+server.ts
import { json } from '@sveltejs/kit';
import { PHASE73_API_URL } from '$env/static/private';

export async function POST({ request }) {
  const { query, filters } = await request.json();

  // Call Phase 73 unified search endpoint
  const response = await fetch(`${PHASE73_API_URL}/api/search/unified`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, filters })
  });

  if (!response.ok) {
    return json({ error: 'Backend unavailable' }, { status: 503 });
  }

  const data = await response.json();
  return json(data);
}
```

## Error Handling

### Error Types
```typescript
// src/lib/errors.ts
export class AnalysisError extends Error {
  constructor(message: string, public code: string, public line?: number) {
    super(message);
    this.name = 'AnalysisError';
  }
}

export class SuggestionError extends Error {
  constructor(message: string, public source: 'rag' | 'web' | 'backend') {
    super(message);
    this.name = 'SuggestionError';
  }
}

export class BackendError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = 'BackendError';
  }
}
```

### Error Boundary
```svelte
<!-- src/lib/components/ErrorBoundary.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';

  let { children } = $props();
  let error = $state<Error | null>(null);

  function handleError(e: ErrorEvent) {
    error = e.error;
  }

  onMount(() => {
    window.addEventListener('error', handleError);
    return () => window.removeEventListener('error', handleError);
  });
</script>

{#if error}
  <div class="p-4 bg-red-100 border border-red-400 rounded">
    <h3 class="font-bold text-red-700">Something went wrong</h3>
    <p class="text-red-600">{error.message}</p>
    <button onclick={() => error = null} class="mt-2 px-4 py-2 bg-red-500 text-white rounded">
      Retry
    </button>
  </div>
{:else}
  {@render children()}
{/if}
```

## Testing Strategy

### Unit Tests
- AST analyzer parsing accuracy
- Suggestion ranking algorithm
- Cache TTL behavior
- Drizzle ORM operations

### Integration Tests
- API route responses
- Phase 73 backend communication
- Web search integration

### E2E Tests
- Code editing → analysis → suggestion flow
- Suggestion application and undo
- Theme switching and preferences

## uno.css Configuration
```typescript
// uno.config.ts
import { defineConfig, presetUno, presetIcons } from 'unocss';

export default defineConfig({
  presets: [
    presetUno(),
    presetIcons({
      scale: 1.2,
      cdn: 'https://esm.sh/'
    })
  ],
  theme: {
    colors: {
      primary: '#6366f1',
      secondary: '#8b5cf6',
      error: '#ef4444',
      warning: '#f59e0b',
      success: '#10b981'
    }
  },
  shortcuts: {
    'btn': 'px-4 py-2 rounded font-medium transition-colors',
    'btn-primary': 'btn bg-primary text-white hover:bg-primary/90',
    'card': 'p-4 bg-white dark:bg-gray-800 rounded-lg shadow'
  }
});
```

## File Structure
```
sveltekit-frontend/
├── src/
│   ├── lib/
│   │   ├── components/
│   │   │   ├── CodeEditor.svelte
│   │   │   ├── ErrorPanel.svelte
│   │   │   ├── SuggestionList.svelte
│   │   │   ├── ClusterBadge.svelte
│   │   │   ├── DiffViewer.svelte
│   │   │   └── ErrorBoundary.svelte
│   │   ├── services/
│   │   │   ├── ast-analyzer.ts
│   │   │   ├── suggestion-engine.ts
│   │   │   ├── web-search.ts
│   │   │   └── phase73-client.ts
│   │   ├── db/
│   │   │   ├── index.ts
│   │   │   └── schema.ts
│   │   └── errors.ts
│   ├── routes/
│   │   ├── +page.svelte
│   │   ├── +layout.svelte
│   │   └── api/
│   │       ├── analyze/+server.ts
│   │       ├── suggest/+server.ts
│   │       └── search/unified/+server.ts
│   └── app.html
├── drizzle/
│   └── migrations/
├── uno.config.ts
├── svelte.config.js
├── vite.config.ts
└── package.json
```
