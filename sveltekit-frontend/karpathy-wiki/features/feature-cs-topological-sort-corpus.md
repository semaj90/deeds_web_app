---
id: feature:cs:topological-sort-corpus
title: Computer Science Topological Sort Corpus
status: planning
implementedAt: 2026-05-10T02:57:40Z
tags:
  - computer-science
  - topological-sort
  - algorithms
  - calibration
  - gemma4
---

# Computer Science Topological Sort Corpus

## Overview
A specialized corpus used to calibrate Gemma4's semantic understanding of algorithmic concepts, specifically **topological sort** and its applications in dependency mapping and execution ordering.

## Why it matters
Topological sort is a fundamental algorithm for our **Feature Mapping Atlas** (used for dependency ordering). Calibrating the model on this corpus ensures that the atlas generates correct "Implementation Paths" (Schema → Service → Tool).

## Key Concepts
- Directed Acyclic Graphs (DAGs)
- Kahn's Algorithm
- DFS-based Topological Sort
- Cycle Detection
- Precedence Constraints

## Calibration Strategy
1. **Retrieval Density**: Verify that `trace.graphrag_search` returns high-density hits for "topological sort" vs "dependency resolution".
2. **Semantic Fusion**: Calibrate the RRF/Relative Score Fusion parameters to prioritize algorithmic truth over shallow keyword matches.
3. **Synthesis Accuracy**: Evaluate Gemma4's ability to explain the difference between semantic similarity (dense search) and execution order (topological sort).

## Future Editing Hints
- Use the `scripts/features/record-feature-implementation.ts` to map this feature once the corpus is ingested.
- Compare Gemma4 belief vs code truth after the first calibration run.
