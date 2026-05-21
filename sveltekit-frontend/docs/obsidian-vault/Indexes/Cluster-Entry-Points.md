---
type: "index"
title: "Cluster Entry Points"
generated: "2026-05-20T21:32:13.151Z"
ai-first: true
tags: ["index","agent-readable"]
---

# Cluster Entry Points

> Top file in each cluster (by pagerank) — minimal navigation set.

```dataview
TABLE WITHOUT ID
  cluster_id AS Cluster,
  topic AS Topic,
  risk AS Risk,
  pagerank_sum AS PageRankSum,
  member_count AS Members
FROM "Clusters"
SORT pagerank_sum DESC
LIMIT 50
```