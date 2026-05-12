# Codebase Atlas: Comprehensive Indexing & Viewing Guide

The **Atlas** is the multi-dimensional observation layer of the Deeds Web App. it combines static AST analysis, semantic vector clustering, and dynamic import tracing to provide a complete "map" of the system.

## 1. How to View the Atlas

### A. The Static Audit Dashboard
The primary human-readable view of the codebase's health and coverage.
- **Location**: `sveltekit-frontend/docs/graph/codebase-map.md`
- **Contents**: 20-gate audit scores (Auth, Zod, SSR safety), directory scorecards, and flag status (🔴ssr, ⬜notest).
- **Regenerate**: `npm run index:codebase:fast`

### B. Semantic Cluster Digest
The grouping of files by "topic" rather than directory structure.
- **Location**: `sveltekit-frontend/docs/graph/hypergraph-clusters.md`
- **Feature Map**: [docs/atlas-topological-clusters.md](./atlas-topological-clusters.md)
- **Contents**: 100 k-means clusters derived from 32,753 code chunks.
- **Key Regions**:
    - **UI Core** (C50, C34): N64 & Gaming components.
    - **ACE Retrieval** (C72, C73): Vector & Search logic.
    - **Legal Brain** (C21, C35): Statutes & Research.

### C. The Raw Intelligence Graph
The machine-readable foundation for all agentic tools.
- **Location**: `sveltekit-frontend/docs/graph/codebase-graph.json`
- **Contents**: Adjacency list of all file imports (static + dynamic), PageRank authority scores, and symbol exports.

---

## 2. Path Mapping & Imports

### Static Imports
The Atlas traces all standard ES module imports. Aliases are resolved via `svelte.config.js`:
- `$lib` → `src/lib`
- `$lib/server/db/client` → `src/lib/server/db/client.ts`
- `$lib/components/ui` → `src/lib/components/ui`

### Dynamic Path Mapping
Dynamic imports (e.g., `import(`./path/${var}.ts`)`) are indexed by the `analyze_imports` sub-agent tool. It utilizes the `codebase-atlas.json` in `docs/atlas-index/` to resolve runtime paths back to the static graph nodes.

---

## 3. Features & Feature-File Mapping

The system maps "Features" to files using **Karpathy Authority Scores**:
- **Search Logic**: Highly weighted towards `src/lib/server/retrieval` and `src/lib/server/ace`.
- **Legal Engine**: Centered in `src/lib/server/legal`.
- **UI System**: Rooted in `src/lib/components/ui` (Cluster 34/50).

To view recommended work items for a feature:
- Run VS Code Task: `Feature Tracking: Codebase TODO Recommendations`

---

## 4. VS Code Pipeline Routing

The Atlas is maintained and queried through a set of integrated VS Code tasks:

| Task Label | Pipeline Path | Purpose |
|------------|---------------|---------|
| **Agents Pipeline (Safe)** | `agents:write` → `enrich` → `index` | Refreshes `AGENTS.md` and repo-wide context. |
| **Retrieval Plane: Fast Refresh** | `graphify:intel:fast` | Re-scans AST and updates `codebase-graph.json`. |
| **Gemma4: Smoke Full Loop** | `smoke:trace:full` | Tests the supervisor -> sub-agent loop calls. |
| **Truth Check: All** | `scripts/truth-check-legal-corpus.ps1` | Validates consistency between Files, DB, and Vector stores. |

---

## 5. Loop Integration (Sub-Agents)
For a deep dive into how the Atlas feeds into sub-agent execution loops, refer to:
[docs/sub_agents.md](./sub_agents.md)
