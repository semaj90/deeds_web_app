# Manifold4 Atlas Routing

## Overview
Manifold4 is a multi-signal retrieval routing architecture that moves beyond simple vector similarity. It combines topological positioning, semantic confidence, graph authority, and operational task distillates to provide high-precision context for agentic reasoning.

## The 4D Manifold
Every code chunk is projected into a 4D space:
- **som_x (Topological X)**: Position on the Self-Organizing Map grid.
- **som_y (Topological Y)**: Position on the SOM grid.
- **semantic_z (Confidence)**: Inverse distance to the cluster centroid.
- **activity_w (Authority)**: PageRank or usage signal.

## Retrieval Lanes
Atlas search now executes 4 parallel lanes:
1. **Lane 0 (Lexical)**: Ripgrep discovery over cluster digests, paths, and symbols.
2. **Lane 1 (Topology)**: Greedy centroid lookup for query embeddings.
3. **Lane 2 (Profile)**: Heuristic routing based on query keywords (e.g., "Redis" -> cluster 94).
4. **Lane 3 (Task)**: Retrieval of "Task Distillates" (operational playbooks) from a dedicated Qdrant collection.

## Scoring Formula (v1.0)
The final ranking is determined by a weighted fusion:
```
final_score =
    0.35 * denseScore      (Qdrant Semantic)
  + 0.15 * topologyScore   (Cluster Match)
  + 0.15 * graphAuthority  (Neo4j PageRank)
  + 0.10 * lexicalScore    (rg Cluster Hit)
  + 0.10 * taskScore       (Task Distillate Match)
  + 0.10 * aceCacheScore   (Redis ACE Hit)
  + 0.05 * recencyScore    (KAG/Wiki context)
```

## Failure Modes & Fallbacks
1. **Cluster Filter Match**: If cluster-routed search returns < 5 hits, the system automatically retries with a broader neighbor expansion.
2. **Topology Offline**: If the lookup server is down, the system falls back to `QueryProfileRouter` priors.
3. **Empty Retrieval**: If all lanes fail, ripgrep fallback executes across the entire codebase.

## Task Distillates
Task distillates provide "how-to" context alongside raw code. They include:
- **Summary**: Operational overview of the task.
- **Cluster Priors**: Most relevant clusters for the task.
- **Recommended Actions**: Step-by-step guidance for the agent.
- **Path Hints**: Key files to examine.

## Observability
The `routingExplanation` field in the response provides transparency:
- `profile`: Identified query profile.
- `lexicalClusters`: Clusters hit via ripgrep.
- `topologyClusters`: Clusters hit via vector lookup.
- `finalClusters`: Merged set used for filtering.
- `taskDistillate`: The matched operational playbook key.
