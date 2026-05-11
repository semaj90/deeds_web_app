---
type: "index"
title: "High-Risk Files"
generated: "2026-05-11T03:30:09.005Z"
ai-first: true
tags: ["index","agent-readable"]
---

# High-Risk Files

> Files with high blast radius (pagerank > 0.05) OR low LLM confidence.

```dataview
TABLE clusterId AS cluster, pagerank, blend, confidence, lineCount AS lines
FROM "Files"
WHERE confidence = "low" OR pagerank > 0.05
SORT pagerank DESC
LIMIT 50
```