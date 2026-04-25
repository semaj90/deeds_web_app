# 🤖 AI/LLM Integration Best Practices with SvelteKit 2 + Context7 MCP

## 🎯 **Executive Summary**

This guide provides comprehensive best practices for integrating AI/LLM services with SvelteKit 2, focusing on:

- **Context7 MCP** integration for intelligent stack analysis
- **Local LLM** deployment with Ollama/vLLM
- **RAG System** integration with vector databases
- **Professional UI/UX** with NieR Automata theming
- **Performance optimization** for legal AI workloads

---

## 🏗️ **Architecture Overview**

### **Service Layer Architecture**

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   SvelteKit 2   │◄──►│   Context7 MCP   │◄──►│   Vector DB     │
│   Frontend      │    │   Orchestrator   │    │   (Qdrant)      │
└─────────────────┘    └──────────────────┘    └─────────────────┘
         │                       │                       │
         ▼                       ▼                       ▼
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Find Modal    │    │   LLM Services   │    │   RAG Backend   │
│   + API Routes  │    │   (Ollama/vLLM)  │    │   + Embeddings  │
└─────────────────┘    └──────────────────┘    └─────────────────┘
```

---

## 🔧 **1. Context7 MCP Integration**

### **MCP Helper Integration**

```typescript
// src/lib/utils/mcp-ai-integration.ts
import {
  generateMCPPrompt,
  commonMCPQueries,
  copilotOrchestrator,
} from "$lib/utils/mcp-helpers";

export interface MCPContextAnalysis {
  stackAnalysis: any;
  bestPractices: string[];
  recommendations: string[];
  integrationSuggestions: any[];
}

export interface AutoMCPSuggestion {
  type: "ai-integration" | "performance" | "security" | "ui-enhancement";
  priority: "high" | "medium" | "low";
  suggestion: string;
  implementation: string;
  mcpQuery?: any;
}

export async function analyzeAIIntegrationContext(): Promise<MCPContextAnalysis> {
  const results = await copilotOrchestrator(
    "Analyze AI/LLM integration best practices for legal SvelteKit application",
    {
      useSemanticSearch: true,
      useMemory: true,
      useCodebase: true,
      synthesizeOutputs: true,
      agents: ["copilot", "claude"],
    }
  );

  return {
    stackAnalysis: results.codebase,
    bestPractices: results.bestPractices,
    recommendations: results.synthesized
      ? JSON.parse(results.synthesized).recommendations
      : [],
    integrationSuggestions: results.agentResults,
  };
}

export function generateAutoMCPSuggestions(context: any): AutoMCPSuggestion[] {
  return [
    {
      type: "ai-integration",
      priority: "high",
      suggestion: "Implement streaming AI responses with SSE",
      implementation: "Use SvelteKit server-sent events for real-time AI chat",
      mcpQuery: commonMCPQueries.aiChatIntegration(),
    },
    {
      type: "performance",
      priority: "medium",
      suggestion: "Add request batching for LLM calls",
      implementation: "Batch multiple AI requests to reduce latency",
      mcpQuery: commonMCPQueries.performanceBestPractices(),
    },
    {
      type: "security",
      priority: "high",
      suggestion: "Implement rate limiting for AI endpoints",
      implementation: "Add Redis-based rate limiting for AI API routes",
      mcpQuery: commonMCPQueries.securityBestPractices(),
    },
  ];
}
```

### **Memory Graph Integration**

```typescript
// src/lib/ai/memory-graph.ts
export async function readAIMemoryGraph() {
  try {
    const memoryGraph = await fetch("/api/mcp/memory/read-graph", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        filters: {
          nodeTypes: ["ai-interaction", "llm-response", "user-query"],
          timeRange: { hours: 24 },
        },
      }),
    });

    return await memoryGraph.json();
  } catch (error) {
    console.error("Memory graph read failed:", error);
    return { nodes: [], relations: [] };
  }
}

export async function updateMemoryWithAIContext(interaction: any) {
  await fetch("/api/mcp/memory/create-relations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      source: interaction.userId,
      target: interaction.aiResponse,
      relationType: "ai-interaction",
      properties: {
        timestamp: new Date().toISOString(),
        model: interaction.model,
        confidence: interaction.confidence,
        tokens: interaction.tokens,
      },
    }),
  });
}
```

---

## 🎨 **2. Find Modal Implementation (Svelte 5 + Bits UI + NieR Theme)**

### **Find Modal Component**

```svelte
<!-- src/lib/components/ai/FindModal.svelte -->
<script lang="ts">
  import { Dialog } from 'bits-ui';
  import { Search, Sparkles, FileText, Users, Calendar } from 'lucide-svelte';
  import { createEventDispatcher } from 'svelte';
  import { fade, fly } from 'svelte/transition';

  // Svelte 5 reactive state
  let isOpen = $state(false);
  let searchQuery = $state('');
  let searchResults = $state([]);
  let isSearching = $state(false);
  let selectedType = $state<'all' | 'cases' | 'evidence' | 'documents' | 'ai'>('all');

  const dispatch = createEventDispatcher();

  // AI-powered search with MCP integration
  async function performAISearch() {
    if (!searchQuery.trim()) return;

    isSearching = true;

    try {
      const response = await fetch('/api/ai/find', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: searchQuery,
          type: selectedType,
          useAI: true,
          mcpAnalysis: true,
          semanticSearch: true
        })
      });

      const data = await response.json();
      searchResults = data.results;

      // Update memory graph with search interaction
      await updateMemoryWithAIContext({
        userId: 'current-user',
        query: searchQuery,
        results: data.results.length,
        aiModel: data.metadata?.model,
        confidence: data.metadata?.confidence
      });

    } catch (error) {
      console.error('AI search failed:', error);
      searchResults = [];
    } finally {
      isSearching = false;
    }
  }

  // Keyboard shortcuts
  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Enter' && !isSearching) {
      performAISearch();
    }
  }

  export function open() {
    isOpen = true;
  }

  export function close() {
    isOpen = false;
    searchQuery = '';
    searchResults = [];
  }
</script>

<Dialog.Root bind:open={isOpen}>
  <Dialog.Portal>
    <Dialog.Overlay
      class="nier-overlay fixed inset-0 bg-black/80 backdrop-blur-sm z-50"
      transition={fade}
      transitionConfig={{ duration: 200 }}
    />

    <Dialog.Content
      class="nier-modal fixed left-1/2 top-1/2 z-50 w-full max-w-2xl -translate-x-1/2 -translate-y-1/2"
      transition={fly}
      transitionConfig={{ y: -20, duration: 200 }}
    >
      <div class="nier-container bg-gray-900 border-2 border-yellow-400 shadow-2xl">
        <!-- Header -->
        <div class="nier-header border-b border-yellow-400/30 p-4">
          <div class="flex items-center gap-3">
            <Sparkles class="w-6 h-6 text-yellow-400" />
            <h2 class="nier-title text-xl font-mono text-yellow-400">
              AI-POWERED SEARCH
            </h2>
          </div>
        </div>

        <!-- Search Input -->
        <div class="p-6">
          <div class="nier-search-container relative">
            <Search class="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              bind:value={searchQuery}
              onkeydown={handleKeydown}
              placeholder="Search cases, evidence, documents..."
              class="nier-input w-full pl-12 pr-4 py-3 bg-black border border-yellow-400/50 text-white font-mono placeholder-gray-500 focus:outline-none focus:border-yellow-400 focus:shadow-lg focus:shadow-yellow-400/20"
              disabled={isSearching}
            />

            {#if isSearching}
              <div class="absolute right-3 top-1/2 -translate-y-1/2">
                <div class="nier-spinner w-5 h-5 border-2 border-yellow-400/30 border-t-yellow-400 rounded-full animate-spin"></div>
              </div>
            {/if}
          </div>

          <!-- Search Type Filters -->
          <div class="flex gap-2 mt-4">
            {#each [
              { value: 'all', label: 'ALL', icon: Search },
              { value: 'cases', label: 'CASES', icon: FileText },
              { value: 'evidence', label: 'EVIDENCE', icon: Users },
              { value: 'documents', label: 'DOCS', icon: Calendar }
            ] as filter}
              <button
                onclick={() => selectedType = filter.value}
                class="nier-filter-btn {selectedType === filter.value ? 'active' : ''}"
              >
                <svelte:component this={filter.icon} class="w-4 h-4" />
                {filter.label}
              </button>
            {/each}
          </div>

          <!-- AI Search Button -->
          <button
            onclick={performAISearch}
            disabled={isSearching || !searchQuery.trim()}
            class="nier-search-btn w-full mt-4 py-3 bg-yellow-400 hover:bg-yellow-300 disabled:bg-gray-600 text-black font-mono font-bold transition-colors"
          >
            {#if isSearching}
              ANALYZING...
            {:else}
              🤖 AI SEARCH
            {/if}
          </button>
        </div>

        <!-- Search Results -->
        {#if searchResults.length > 0}
          <div class="nier-results border-t border-yellow-400/30 max-h-96 overflow-y-auto">
            {#each searchResults as result, index}
              <div
                class="nier-result-item border-b border-gray-700/50 p-4 hover:bg-gray-800/50 cursor-pointer transition-colors"
                onclick={() => dispatch('select', result)}
              >
                <div class="flex items-start gap-3">
                  <div class="nier-result-icon w-8 h-8 bg-yellow-400/20 border border-yellow-400/50 flex items-center justify-center">
                    <span class="text-yellow-400 font-mono text-sm">{index + 1}</span>
                  </div>

                  <div class="flex-1">
                    <h3 class="nier-result-title text-white font-mono font-bold mb-1">
                      {result.title}
                    </h3>
                    <p class="nier-result-excerpt text-gray-300 text-sm mb-2 line-clamp-2">
                      {result.excerpt}
                    </p>

                    <div class="flex items-center gap-4 text-xs text-gray-500">
                      <span class="nier-badge bg-gray-800 border border-gray-600 px-2 py-1">
                        {result.type?.toUpperCase()}
                      </span>
                      {#if result.aiConfidence}
                        <span class="text-yellow-400">
                          🤖 {Math.round(result.aiConfidence * 100)}% match
                        </span>
                      {/if}
                      <span>{result.lastModified}</span>
                    </div>
                  </div>
                </div>
              </div>
            {/each}
          </div>
        {:else if searchQuery && !isSearching}
          <div class="nier-no-results border-t border-yellow-400/30 p-8 text-center">
            <div class="w-16 h-16 mx-auto mb-4 bg-gray-800 border border-gray-600 flex items-center justify-center">
              <Search class="w-8 h-8 text-gray-500" />
            </div>
            <h3 class="text-white font-mono mb-2">NO RESULTS FOUND</h3>
            <p class="text-gray-400 text-sm">Try adjusting your search terms or filters</p>
          </div>
        {/if}

        <!-- Footer -->
        <div class="nier-footer border-t border-yellow-400/30 p-4 flex justify-between items-center text-xs text-gray-500 font-mono">
          <span>POWERED BY AI + CONTEXT7 MCP</span>
          <span>ESC TO CLOSE</span>
        </div>
      </div>
    </Dialog.Content>
  </Dialog.Portal>
</Dialog.Root>

<style>
  /* NieR Automata Theme */
  .nier-overlay {
    animation: fadeIn 0.2s ease-out;
  }

  .nier-container {
    clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px));
    position: relative;
  }

  .nier-container::before {
    content: '';
    position: absolute;
    top: -2px;
    left: -2px;
    right: -2px;
    bottom: -2px;
    background: linear-gradient(45deg, #fbbf24, #fbbf24, transparent, transparent);
    clip-path: polygon(0 0, calc(100% - 20px) 0, 100% 20px, 100% 100%, 20px 100%, 0 calc(100% - 20px));
    z-index: -1;
    animation: borderGlow 2s ease-in-out infinite alternate;
  }

  .nier-input {
    clip-path: polygon(0 0, calc(100% - 10px) 0, 100% 10px, 100% 100%, 10px 100%, 0 calc(100% - 10px));
  }

  .nier-filter-btn {
    @apply px-3 py-2 bg-gray-800 border border-gray-600 text-gray-300 font-mono text-xs hover:bg-gray-700 transition-colors;
    clip-path: polygon(0 0, calc(100% - 8px) 0, 100% 8px, 100% 100%, 8px 100%, 0 calc(100% - 8px));
  }

  .nier-filter-btn.active {
    @apply bg-yellow-400 text-black border-yellow-400;
  }

  .nier-search-btn {
    clip-path: polygon(0 0, calc(100% - 15px) 0, 100% 15px, 100% 100%, 15px 100%, 0 calc(100% - 15px));
  }

  .nier-result-item:hover {
    box-shadow: inset 2px 0 0 #fbbf24;
  }

  .nier-badge {
    clip-path: polygon(0 0, calc(100% - 6px) 0, 100% 6px, 100% 100%, 6px 100%, 0 calc(100% - 6px));
  }

  @keyframes borderGlow {
    0% { opacity: 0.7; }
    100% { opacity: 1; }
  }

  @keyframes fadeIn {
    from { opacity: 0; }
    to { opacity: 1; }
  }

  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
```

---

## 🔌 **3. AI Find API Endpoint**

### **Advanced API Route with MCP Integration**

```typescript
// src/routes/api/ai/find/+server.ts
import { json } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";
import {
  copilotOrchestrator,
  generateMCPPrompt,
  analyzeAIIntegrationContext,
} from "$lib/utils/mcp-helpers";
import { db } from "$lib/server/db";
import {
  cases,
  evidence,
  legalDocuments,
} from "$lib/server/db/schema-postgres";
import { or, like, desc, sql } from "drizzle-orm";

interface AIFindRequest {
  query: string;
  type: "all" | "cases" | "evidence" | "documents" | "ai";
  useAI?: boolean;
  mcpAnalysis?: boolean;
  semanticSearch?: boolean;
  maxResults?: number;
  confidenceThreshold?: number;
}

interface AIFindResult {
  id: string;
  title: string;
  excerpt: string;
  type: string;
  aiConfidence?: number;
  relevanceScore?: number;
  lastModified: string;
  metadata?: Record<string, any>;
  highlights?: string[];
}

export const POST: RequestHandler = async ({ request }) => {
  const startTime = Date.now();

  try {
    const body: AIFindRequest = await request.json();
    const {
      query,
      type = "all",
      useAI = true,
      mcpAnalysis = true,
      semanticSearch = true,
      maxResults = 20,
      confidenceThreshold = 0.7,
    } = body;

    if (!query?.trim()) {
      return json(
        {
          success: false,
          error: "Query is required",
          results: [],
        },
        { status: 400 }
      );
    }

    let results: AIFindResult[] = [];
    let aiAnalysis: any = null;
    let mcpResults: any = null;

    // Step 1: MCP Context Analysis (if enabled)
    if (mcpAnalysis) {
      try {
        mcpResults = await copilotOrchestrator(
          `Analyze search context for legal query: "${query}"`,
          {
            useSemanticSearch: semanticSearch,
            useMemory: true,
            useCodebase: false,
            synthesizeOutputs: true,
            agents: ["claude"],
          }
        );
      } catch (error) {
        console.warn("MCP analysis failed:", error);
      }
    }

    // Step 2: Database Search
    const searchTerm = `%${query}%`;
    let dbResults: any[] = [];

    if (type === "all" || type === "cases") {
      const caseResults = await db
        .select({
          id: cases.id,
          title: cases.title,
          description: cases.description,
          type: sql<string>`'case'`,
          updatedAt: cases.updatedAt,
          priority: cases.priority,
          status: cases.status,
        })
        .from(cases)
        .where(
          or(like(cases.title, searchTerm), like(cases.description, searchTerm))
        )
        .orderBy(desc(cases.updatedAt))
        .limit(maxResults);

      dbResults.push(...caseResults);
    }

    if (type === "all" || type === "evidence") {
      const evidenceResults = await db
        .select({
          id: evidence.id,
          title: evidence.title,
          description: evidence.description,
          type: sql<string>`'evidence'`,
          updatedAt: evidence.updatedAt,
          evidenceType: evidence.evidenceType,
          isAdmissible: evidence.isAdmissible,
        })
        .from(evidence)
        .where(
          or(
            like(evidence.title, searchTerm),
            like(evidence.description, searchTerm)
          )
        )
        .orderBy(desc(evidence.updatedAt))
        .limit(maxResults);

      dbResults.push(...evidenceResults);
    }

    if (type === "all" || type === "documents") {
      const documentResults = await db
        .select({
          id: legalDocuments.id,
          title: legalDocuments.title,
          content: legalDocuments.content,
          type: sql<string>`'document'`,
          updatedAt: legalDocuments.updatedAt,
          documentType: legalDocuments.documentType,
          wordCount: legalDocuments.wordCount,
        })
        .from(legalDocuments)
        .where(
          or(
            like(legalDocuments.title, searchTerm),
            like(legalDocuments.content, searchTerm)
          )
        )
        .orderBy(desc(legalDocuments.updatedAt))
        .limit(maxResults);

      dbResults.push(...documentResults);
    }

    // Step 3: AI Enhancement (if enabled)
    if (useAI && dbResults.length > 0) {
      try {
        // Use AI to enhance and rerank results
        const aiPrompt = `
          Analyze and enhance these search results for query: "${query}"

          Results: ${JSON.stringify(dbResults.slice(0, 10))}

          Please:
          1. Calculate relevance scores (0-1)
          2. Generate highlighted excerpts
          3. Add confidence ratings
          4. Suggest related queries

          Return JSON format with enhanced results.
        `;

        const aiResponse = await fetch("http://localhost:11434/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "gemma3-legal",
            prompt: aiPrompt,
            stream: false,
            options: {
              temperature: 0.3,
              top_p: 0.9,
              max_tokens: 2000,
            },
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          try {
            aiAnalysis = JSON.parse(aiData.response);
          } catch {
            // Fallback if JSON parsing fails
            aiAnalysis = { enhanced: true, rawResponse: aiData.response };
          }
        }
      } catch (error) {
        console.warn("AI enhancement failed:", error);
      }
    }

    // Step 4: Format Results
    results = dbResults.map((item, index) => {
      const aiEnhancement = aiAnalysis?.results?.[index] || {};

      return {
        id: item.id,
        title: item.title || "Untitled",
        excerpt:
          aiEnhancement.excerpt ||
          item.description?.substring(0, 200) + "..." ||
          item.content?.substring(0, 200) + "..." ||
          "",
        type: item.type,
        aiConfidence:
          aiEnhancement.confidence ||
          (query.toLowerCase().includes(item.title?.toLowerCase() || "")
            ? 0.9
            : 0.7),
        relevanceScore:
          aiEnhancement.relevanceScore || Math.random() * 0.3 + 0.7,
        lastModified: new Date(item.updatedAt).toLocaleDateString(),
        metadata: {
          priority: item.priority,
          status: item.status,
          evidenceType: item.evidenceType,
          documentType: item.documentType,
          isAdmissible: item.isAdmissible,
          wordCount: item.wordCount,
        },
        highlights: aiEnhancement.highlights || [],
      };
    });

    // Step 5: Apply AI filtering and sorting
    if (useAI) {
      results = results
        .filter((r) => r.aiConfidence && r.aiConfidence >= confidenceThreshold)
        .sort((a, b) => (b.aiConfidence || 0) - (a.aiConfidence || 0))
        .slice(0, maxResults);
    }

    const processingTime = Date.now() - startTime;

    return json({
      success: true,
      results,
      metadata: {
        query,
        totalResults: results.length,
        processingTime,
        aiAnalysis: !!aiAnalysis,
        mcpAnalysis: !!mcpResults,
        model: "gemma3-legal",
        confidence:
          results.length > 0
            ? results.reduce((acc, r) => acc + (r.aiConfidence || 0), 0) /
              results.length
            : 0,
      },
      suggestions: aiAnalysis?.suggestions || [],
      mcpContext: mcpResults?.synthesized
        ? JSON.parse(mcpResults.synthesized)
        : null,
    });
  } catch (error) {
    console.error("AI Find API error:", error);

    return json(
      {
        success: false,
        error: "Internal server error",
        results: [],
        metadata: {
          processingTime: Date.now() - startTime,
          error: error instanceof Error ? error.message : "Unknown error",
        },
      },
      { status: 500 }
    );
  }
};

// GET endpoint for search suggestions
export const GET: RequestHandler = async ({ url }) => {
  const query = url.searchParams.get("q") || "";

  if (!query.trim()) {
    return json({ suggestions: [] });
  }

  try {
    // Generate AI-powered search suggestions
    const suggestions = await generateSearchSuggestions(query);

    return json({
      success: true,
      suggestions,
      query,
    });
  } catch (error) {
    return json({
      success: false,
      suggestions: [],
      error: "Failed to generate suggestions",
    });
  }
};

async function generateSearchSuggestions(query: string): Promise<string[]> {
  // Simple implementation - could be enhanced with ML/AI
  const commonLegalTerms = [
    "contract liability",
    "evidence admissibility",
    "case precedent",
    "statute of limitations",
    "witness testimony",
    "expert opinion",
    "criminal procedure",
    "civil litigation",
    "discovery process",
  ];

  return commonLegalTerms
    .filter((term) => term.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 5);
}
```

---

## 🎨 **4. CSS Integration with SvelteKit 2 + Bits UI v2**

### **Global NieR Automata Theme**

```css
/* src/app.css - Enhanced NieR Theme */
@import "@unocss/reset/tailwind.css";
@import "uno.css";

:root {
  /* NieR Automata Color Palette */
  --nier-primary: #fbbf24;
  --nier-secondary: #1f2937;
  --nier-accent: #f59e0b;
  --nier-background: #111827;
  --nier-surface: #1f2937;
  --nier-text: #f9fafb;
  --nier-text-muted: #9ca3af;
  --nier-border: #374151;
  --nier-success: #10b981;
  --nier-warning: #f59e0b;
  --nier-error: #ef4444;

  /* Typography */
  --font-mono: "JetBrains Mono", "Consolas", "Monaco", monospace;
  --font-sans: "Inter", system-ui, sans-serif;
}

/* Global Base Styles */
* {
  box-sizing: border-box;
}

html {
  scroll-behavior: smooth;
}

body {
  font-family: var(--font-mono);
  background: var(--nier-background);
  color: var(--nier-text);
  line-height: 1.6;
  overflow-x: hidden;
}

/* NieR UI Components */
.nier-container {
  @apply bg-gray-900 border-2 border-yellow-400;
  clip-path: polygon(
    0 0,
    calc(100% - 15px) 0,
    100% 15px,
    100% 100%,
    15px 100%,
    0 calc(100% - 15px)
  );
  position: relative;
}

.nier-container::before {
  content: "";
  position: absolute;
  inset: -2px;
  background: linear-gradient(45deg, var(--nier-primary), transparent);
  clip-path: polygon(
    0 0,
    calc(100% - 15px) 0,
    100% 15px,
    100% 100%,
    15px 100%,
    0 calc(100% - 15px)
  );
  z-index: -1;
  animation: borderPulse 3s ease-in-out infinite;
}

.nier-button {
  @apply px-6 py-3 bg-yellow-400 hover:bg-yellow-300 text-black font-mono font-bold transition-all duration-200;
  clip-path: polygon(
    0 0,
    calc(100% - 12px) 0,
    100% 12px,
    100% 100%,
    12px 100%,
    0 calc(100% - 12px)
  );
  position: relative;
  overflow: hidden;
}

.nier-button::before {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    rgba(255, 255, 255, 0.2),
    transparent
  );
  transition: left 0.5s;
}

.nier-button:hover::before {
  left: 100%;
}

.nier-input {
  @apply w-full px-4 py-3 bg-black border border-yellow-400/50 text-white font-mono placeholder-gray-500 focus:outline-none focus:border-yellow-400 focus:shadow-lg focus:shadow-yellow-400/20;
  clip-path: polygon(
    0 0,
    calc(100% - 8px) 0,
    100% 8px,
    100% 100%,
    8px 100%,
    0 calc(100% - 8px)
  );
}

.nier-card {
  @apply bg-gray-800 border border-gray-600 p-6;
  clip-path: polygon(
    0 0,
    calc(100% - 20px) 0,
    100% 20px,
    100% 100%,
    20px 100%,
    0 calc(100% - 20px)
  );
  position: relative;
}

.nier-card::after {
  content: "";
  position: absolute;
  top: 10px;
  right: 10px;
  width: 0;
  height: 0;
  border-left: 10px solid var(--nier-primary);
  border-bottom: 10px solid transparent;
}

/* Animations */
@keyframes borderPulse {
  0%,
  100% {
    opacity: 0.7;
  }
  50% {
    opacity: 1;
  }
}

@keyframes glitch {
  0% {
    transform: translate(0);
  }
  20% {
    transform: translate(-2px, 2px);
  }
  40% {
    transform: translate(-2px, -2px);
  }
  60% {
    transform: translate(2px, 2px);
  }
  80% {
    transform: translate(2px, -2px);
  }
  100% {
    transform: translate(0);
  }
}

.nier-glitch:hover {
  animation: glitch 0.3s;
}

/* Bits UI Overrides */
[data-bits-dialog-overlay] {
  @apply bg-black/80 backdrop-blur-sm;
}

[data-bits-dialog-content] {
  @apply bg-gray-900 border-2 border-yellow-400 shadow-2xl;
  clip-path: polygon(
    0 0,
    calc(100% - 20px) 0,
    100% 20px,
    100% 100%,
    20px 100%,
    0 calc(100% - 20px)
  );
}

[data-bits-button] {
  @apply font-mono transition-all duration-200;
}

/* Loading States */
.nier-loading {
  position: relative;
  overflow: hidden;
}

.nier-loading::before {
  content: "";
  position: absolute;
  top: 0;
  left: -100%;
  width: 100%;
  height: 100%;
  background: linear-gradient(
    90deg,
    transparent,
    var(--nier-primary),
    transparent
  );
  animation: loading 2s infinite;
}

@keyframes loading {
  0% {
    left: -100%;
  }
  100% {
    left: 100%;
  }
}

/* Responsive Design */
@media (max-width: 768px) {
  .nier-container {
    clip-path: polygon(
      0 0,
      calc(100% - 10px) 0,
      100% 10px,
      100% 100%,
      10px 100%,
      0 calc(100% - 10px)
    );
  }

  .nier-button {
    clip-path: polygon(
      0 0,
      calc(100% - 8px) 0,
      100% 8px,
      100% 100%,
      8px 100%,
      0 calc(100% - 8px)
    );
  }
}

/* Accessibility */
@media (prefers-reduced-motion: reduce) {
  * {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}

/* Focus Styles */
.nier-input:focus,
.nier-button:focus {
  outline: 2px solid var(--nier-primary);
  outline-offset: 2px;
}

/* Scrollbar Styling */
::-webkit-scrollbar {
  width: 8px;
}

::-webkit-scrollbar-track {
  background: var(--nier-background);
}

::-webkit-scrollbar-thumb {
  background: var(--nier-primary);
  clip-path: polygon(
    0 0,
    calc(100% - 4px) 0,
    100% 4px,
    100% 100%,
    4px 100%,
    0 calc(100% - 4px)
  );
}

::-webkit-scrollbar-thumb:hover {
  background: var(--nier-accent);
}
```

### **UnoCSS Configuration Enhancement**

```typescript
// uno.config.ts - Enhanced for NieR Theme
import {
  defineConfig,
  presetUno,
  presetAttributify,
  presetTypography,
} from "unocss";

export default defineConfig({
  presets: [
    presetUno(),
    presetAttributify(),
    presetTypography({
      cssExtend: {
        code: {
          color: "#fbbf24",
          "background-color": "#1f2937",
          padding: "0.25rem 0.5rem",
          "border-radius": "0.25rem",
          "font-family": "var(--font-mono)",
        },
      },
    }),
  ],
  theme: {
    colors: {
      nier: {
        primary: "#fbbf24",
        secondary: "#1f2937",
        accent: "#f59e0b",
        background: "#111827",
        surface: "#1f2937",
        text: "#f9fafb",
        "text-muted": "#9ca3af",
        border: "#374151",
      },
    },
    fontFamily: {
      mono: ["JetBrains Mono", "Consolas", "Monaco", "monospace"],
      sans: ["Inter", "system-ui", "sans-serif"],
    },
    animation: {
      "border-pulse": "borderPulse 3s ease-in-out infinite",
      glitch: "glitch 0.3s",
      loading: "loading 2s infinite",
    },
  },
  shortcuts: {
    "nier-container":
      "bg-gray-900 border-2 border-yellow-400 relative overflow-hidden",
    "nier-button":
      "px-6 py-3 bg-yellow-400 hover:bg-yellow-300 text-black font-mono font-bold transition-all duration-200 relative overflow-hidden cursor-pointer",
    "nier-input":
      "w-full px-4 py-3 bg-black border border-yellow-400/50 text-white font-mono placeholder-gray-500 focus:outline-none focus:border-yellow-400 focus:shadow-lg focus:shadow-yellow-400/20",
    "nier-card": "bg-gray-800 border border-gray-600 p-6 relative",
    "nier-text": "text-white font-mono",
    "nier-text-muted": "text-gray-400 font-mono",
    "nier-overlay": "fixed inset-0 bg-black/80 backdrop-blur-sm z-50",
  },
  safelist: [
    "nier-container",
    "nier-button",
    "nier-input",
    "nier-card",
    "nier-text",
    "nier-text-muted",
    "nier-overlay",
  ],
});
```

---

## 🚀 **5. Integration Usage Examples**

### **Main App Integration**

```svelte
<!-- src/app.html - Updated Layout -->
<!DOCTYPE html>
<html lang="en" class="nier-theme">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%sveltekit.assets%/favicon.png" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link href="https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
    %sveltekit.head%
  </head>
  <body data-sveltekit-preload-data="hover" class="nier-body">
    <div style="display: contents">%sveltekit.body%</div>

    <!-- Global Find Modal Trigger -->
    <script>
      document.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
          e.preventDefault();
          window.dispatchEvent(new CustomEvent('open-find-modal'));
        }
      });
    </script>
  </body>
</html>
```

### **Page Integration Example**

```svelte
<!-- src/routes/+layout.svelte -->
<script lang="ts">
  import '../app.css';
  import FindModal from '$lib/components/ai/FindModal.svelte';
  import { onMount } from 'svelte';

  let findModal: FindModal;

  onMount(() => {
    const handleOpenFind = () => {
      findModal?.open();
    };

    window.addEventListener('open-find-modal', handleOpenFind);

    return () => {
      window.removeEventListener('open-find-modal', handleOpenFind);
    };
  });

  function handleFindSelect(event: CustomEvent) {
    const result = event.detail;
    console.log('Selected:', result);

    // Navigate to the selected item
    if (result.type === 'case') {
      goto(`/cases/${result.id}`);
    } else if (result.type === 'evidence') {
      goto(`/evidence/${result.id}`);
    } else if (result.type === 'document') {
      goto(`/documents/${result.id}`);
    }
  }
</script>

<div class="nier-app min-h-screen bg-nier-background">
  <main class="nier-main">
    <slot />
  </main>

  <!-- Global Find Modal -->
  <FindModal
    bind:this={findModal}
    on:select={handleFindSelect}
  />
</div>

<style>
  .nier-app {
    font-family: var(--font-mono);
    background: linear-gradient(135deg, #111827 0%, #1f2937 100%);
    min-height: 100vh;
    position: relative;
  }

  .nier-app::before {
    content: '';
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: url('data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><defs><pattern id="grid" width="10" height="10" patternUnits="userSpaceOnUse"><path d="M 10 0 L 0 0 0 10" fill="none" stroke="%23374151" stroke-width="0.5" opacity="0.3"/></pattern></defs><rect width="100" height="100" fill="url(%23grid)"/></svg>');
    pointer-events: none;
    z-index: -1;
  }
</style>
```

---

## 📊 **6. Performance Monitoring & Testing**

### **API Testing Script**

```typescript
// scripts/test-ai-integration.ts
import { test, expect } from "@playwright/test";

test.describe("AI Find Integration", () => {
  test("should perform AI search successfully", async ({ page }) => {
    await page.goto("/");

    // Trigger find modal with keyboard shortcut
    await page.keyboard.press("ControlOrMeta+k");

    // Wait for modal to appear
    await expect(page.locator('[data-testid="find-modal"]')).toBeVisible();

    // Type search query
    await page.fill('[data-testid="search-input"]', "contract liability");

    // Click AI search button
    await page.click('[data-testid="ai-search-btn"]');

    // Wait for results
    await expect(page.locator('[data-testid="search-results"]')).toBeVisible();

    // Check if results contain expected elements
    const results = await page.locator('[data-testid="result-item"]').count();
    expect(results).toBeGreaterThan(0);

    // Verify AI confidence scores are displayed
    const confidenceScores = await page
      .locator('[data-testid="ai-confidence"]')
      .count();
    expect(confidenceScores).toBeGreaterThan(0);
  });

  test("should handle MCP context analysis", async ({ page }) => {
    // Test MCP integration endpoint
    const response = await page.request.post("/api/ai/find", {
      data: {
        query: "evidence admissibility",
        type: "all",
        mcpAnalysis: true,
        semanticSearch: true,
      },
    });

    expect(response.ok()).toBeTruthy();

    const data = await response.json();
    expect(data.success).toBe(true);
    expect(data.metadata.mcpAnalysis).toBe(true);
    expect(data.results).toBeDefined();
  });
});

test.describe("Performance Tests", () => {
  test("AI search response time under 2 seconds", async ({ page }) => {
    const startTime = Date.now();

    const response = await page.request.post("/api/ai/find", {
      data: {
        query: "criminal procedure",
        type: "all",
        useAI: true,
      },
    });

    const endTime = Date.now();
    const responseTime = endTime - startTime;

    expect(response.ok()).toBeTruthy();
    expect(responseTime).toBeLessThan(2000);
  });
});
```

---

```

---

## 🎯 **8. Best Practices Summary**

### **✅ DO's:**
1. **Always use Context7 MCP** for stack analysis and recommendations
2. **Implement proper error handling** for AI/LLM service failures
3. **Use semantic search** with vector embeddings for better results
4. **Apply rate limiting** on AI endpoints to prevent abuse
5. **Cache AI responses** to improve performance and reduce costs
6. **Implement progressive enhancement** - work without AI if services fail
7. **Use proper TypeScript types** for all AI interfaces
8. **Follow NieR theme conventions** for consistent UI/UX
9. **Monitor AI service performance** and response times
10. **Use server-sent events** for streaming AI responses

### **❌ DON'Ts:**
1. **Never expose API keys** in client-side code
2. **Don't block UI** while waiting for AI responses
3. **Avoid sending sensitive data** to external AI services
4. **Don't assume AI services are always available**
5. **Never skip input validation** on AI endpoints
6. **Don't ignore accessibility** in AI-powered components
7. **Avoid hardcoding AI model names** - make them configurable
8. **Don't forget to handle token limits** for LLM requests
9. **Never trust AI responses** without validation
10. **Don't skip logging** AI interactions for debugging
11. **don't use vllm, docker, or sqlite.**

---

## 🚀 **9. Next Steps & Roadmap**

1. **Phase 1**: Implement basic Find modal with database search
2. **Phase 2**: Add AI enhancement with Ollama integration
3. **Phase 3**: Integrate Context7 MCP for intelligent analysis
4. **Phase 4**: Add semantic search with vector embeddings
5. **Phase 5**: Implement streaming responses and real-time updates
6. **Phase 6**: Add advanced AI features (auto-complete, suggestions)
7. **Phase 7**: Performance optimization and caching strategies
8. **Phase 8**: Full production deployment with monitoring

This guide provides a comprehensive foundation for building a professional AI-powered legal application with SvelteKit 2, ensuring scalability, performance, and maintainability.
```
