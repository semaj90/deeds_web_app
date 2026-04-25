# Phase 8: Context7 AI-Aware UI, Custom Reranker, and Predictive Prefetching

## Custom Reranker (LangChainJS Alternative)

Instead of basic top-K ANN, build a reranker function with your own scoring logic:

```ts
function rerank(annResults, currentContext, userIntent) {
  return annResults
    .map((result) => {
      let score = result.originalScore || 0;
      if (result.intent === userIntent) score += 2;
      if (result.timeOfDay === currentContext.timeOfDay) score += 1;
      if (result.position === currentContext.focusedElement) score += 1;
      return { ...result, rerankScore: score };
    })
    .sort((a, b) => b.rerankScore - a.rerankScore);
}
```

You can augment this with Neo4j query context (e.g., past paths user took).

## Rebuild UI with ECMAScript Components + JSON

Build your layout engine from JSON → UI tree → WebGL buffer + CSS offset compiler.
Example JSON UI node:

```json
{
  "type": "button",
  "id": "toolbar-save",
  "matrix": [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 100, 50, 0, 1],
  "styles": { "color": "green", "hover": "darkgreen" },
  "events": ["click", "hover"]
}
```

Your compiler parses JSON, outputs dynamic CSS using UnoCSS + PostCSS + CSSNano, pushes transforms to gl.bufferData() on GPU, and hooks into XState for state transitions.

## Predictive Prefetching via Service Worker + LLM

Have a background AI prefetcher that runs based on user intent signals:

```ts
if (userIntent === "open_settings") {
  sw.prefetch("/api/ui/buffers/settings");
  sw.prefetch("/assets/css/settings.css");
}
```

Train the AI assistant to predict layout switches and UI paths, using RAG + embeddings + graph traversal (Neo4j paths + Redis sessions).

## Real-Time Matrix LOD + AI-Aware Rendering

Use LOD caching per component:

```ts
{
  "btn-save": {
    "low": [...],
    "mid": [...],
    "high": [...]
  }
}
```

Trigger glsl-cubic-filter blending in shader between LODs based on viewport focus, AI assistant suggestion, and GPU load. This allows fluid, zero-jank UIs with progressive reveal.

## Summary Best Practices for Your Vision

| Area            | Best Practice                                                     |
| --------------- | ----------------------------------------------------------------- |
| JSON UI Parsing | Use flat JSON + matrix offsets; compile with CSSNano + PostCSS    |
| GPU Buffers     | LOD matrix caching; use WebGL2 VAOs and gl-matrix                 |
| AI Awareness    | Ollama + Web Worker embedding + custom reranker                   |
| Threading       | Web Workers for embed + parser; Service Worker for layout caching |
| User Tracking   | IntersectionObserver, YOLOv8, OpenCV.js, pointer events           |
| RAG Pipeline    | PGVector for ANN, reranker scores, Neo4j context enrichment       |
| Prefetching     | Predictive fetch of layouts/assets via Service Worker             |
| CSS             | UnoCSS atomic; reduce duplication via preset configs              |

## Context7 MCP Integration Best Practices

- Use the copilotOrchestrator function to orchestrate multi-agent, memory, and codebase-aware tasks.
- Validate all MCP tool requests with validateMCPRequest before execution.
- Generate prompts for agents and tools using generateMCPPrompt for consistent context injection.
- Log errors and synthesize outputs for all critical flows (set logErrors and synthesizeOutputs options).
- For enhanced reranker, useMemory and useReadGraph to enrich context with Neo4j paths and session memory.
- For UI compiler and buffer loader, use directoryPath and context options to scope operations to the current workspace and user session.
- Integrate with SvelteKit 2 and XState for state-driven UI and workflow orchestration.
- Use semantic search and multi-agent options for advanced recommendations and predictive prefetching.
- Always check for errors and log them to a todo log if relevance or context is lost.

## Error Handling & Todo Logging

- On any MCP orchestration error, append a log entry to a .md file in the workspace (e.g., TODO_PHASE8_ERRORS.md).
- Use the logErrors option in copilotOrchestrator to automatically track and report errors.
- For lost relevance or missing context, trigger a todo log entry for developer review.

## Full Starter Scaffold Includes

- 🧠 Ollama + embed worker + PGVector insert/query
- 🧱 JSON → UI compiler (ECMAScript components + CSSNano/PostCSS/UnoCSS)
- 🖼 Matrix → GPU WebGL2 LOD buffer loader
- 🕸 Reranker logic with Neo4j + Redis
- 🎯 YOLO/OpenCV.js user intent tracking
- 🔁 Service Worker that prefetches layouts and assets
- 🧵 Multithreaded fetch/embedding
- `/api/ui/buffers/:id` with matrix stream support
- Docker with RabbitMQ + PGVector + Redis + Neo4j
- GitHub-ready SvelteKit 2 starter

---

### Context7 MCP Orchestration & Error Handling Best Practices

- Use `copilotOrchestrator` for orchestrating multi-agent flows, memory/context enrichment, and semantic/codebase search.
- Validate and synthesize tool requests with `generateMCPPrompt` and `validateMCPRequest` for robust error handling.
- Log errors and lost context to a dedicated .md or error tracking system for production readiness.
- Integrate MCP helpers for dynamic context switching (codebase, changed files, graph, semantic search).
- Scaffold UI and backend modules to support predictive prefetching, reranking, and real-time matrix rendering.
- Document all orchestration flows and error handling logic for maintainability and onboarding.
