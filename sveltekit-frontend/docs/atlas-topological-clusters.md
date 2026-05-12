# Atlas Topological Clusters: Feature Mapping

The **Atlas Topological Map** provides a view of the Deeds codebase through the lens of semantic clusters (k-means) rather than just directory trees. This allows sub-agents to "teleport" to functionally related code regardless of its physical location.

## Primary Cluster Regions

| Region | Clusters | Core Features | Authority Dirs |
|--------|----------|---------------|----------------|
| **UI Core** | 34, 50, 41 | N64 Components, Bits-UI integration, Svelte 5 runes | `src/lib/components/ui`, `src/lib/components/yorha` |
| **ACE Retrieval** | 72, 73, 80 | Vector search, Qdrant indexing, BM42 hybrid logic | `src/lib/server/ace`, `src/lib/server/retrieval`, `src/lib/server/gpu` |
| **Legal Brain** | 21, 35, 47 | Statute parsing, Legal precedent, Citation matching | `src/lib/components/legal`, `src/lib/server/legal` |
| **Data Backbone** | 55, 95, 6 | Drizzle schemas, Postgres relations, Redis caching | `src/lib/server/db`, `src/lib/server/cache` |
| **Agentic Swarm** | 5, 69, 87 | Gemma 4 dispatch, Intent routing, Hermes Dispatcher | `src/lib/components/ai`, `src/lib/server/ai` |
| **GPU / WebGPU** | 20, 23, 36 | LibTorch kernels, WebGPU reranking, SIMD acceleration | `src/lib/webgpu`, `src/lib/server/gpu` |

---

## Detailed Cluster Index (Top 20)

| # | Feature Mapping | Predominant Tag |
|---|-----------------|-----------------|
| **50** | Gaming/N64 UI system components | `page` |
| **21** | Legal component logic & Auth guards | `auth` |
| **70** | Analytics & Codebase Indexing handlers | `embedding` |
| **35** | Legal-AI corpus UI elements | `component` |
| **5** | AI Chat & Assistant components | `ai` |
| **72** | ACE server-side vector search logic | `vector` |
| **74** | Global Type definitions (Metadata Spine) | `vector` |
| **57** | Shims and environment compatibility | `embedding` |
| **44** | LLM API route handlers | `api` |
| **25** | Redis persistence & session logic | `redis` |
| **92** | Evidence board UI components | `embedding` |
| **94** | Cache management and invalidation | `redis` |
| **82** | gRPC communication handlers | `embedding` |
| **20** | WebGPU compute kernels (SOM/K-means) | `embedding` |
| **6** | General DB client & Pool management | `embedding` |
| **23** | WebGPU Buffer & Pipeline management | `embedding` |
| **85** | Citation collection API endpoints | `api` |
| **55** | Drizzle Schema (Postgres) | `database` |
| **32** | Service layer abstractions | `api-route` |
| **48** | Database Migration files | `database` |

---

## How to use this for Navigation

When a sub-agent receives a mission, it first identifies the **Manifold Region** required for the task. 

1. **Query Cluster Map**: `npm run index:clusters:query "search logic"`
2. **Jump to Cluster**: Identify the top directory for the resulting cluster.
3. **Execute in Context**: Use the cluster-specific `AGENTS.md` for local rules.

For more information on viewing these clusters in the 4D Manifold, see:
[docs/atlas-viewing-guide.md](./atlas-viewing-guide.md)
