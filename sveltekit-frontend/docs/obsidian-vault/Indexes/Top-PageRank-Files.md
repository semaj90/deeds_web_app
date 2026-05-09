---
type: "index"
title: "Top PageRank Files"
generated: "2026-05-08T22:10:35.424Z"
ai-first: true
tags: ["index","agent-readable"]
---

# Top PageRank Files

> Highest authority files in the import graph — start investigations here.

```dataview
TABLE pagerank, clusterId AS cluster, blend, isRoute, hasAuth, lineCount AS lines
FROM "Files"
WHERE pagerank > 0
SORT pagerank DESC
LIMIT 30
```