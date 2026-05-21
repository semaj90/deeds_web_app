---
type: "index"
title: "Low-Confidence Summaries"
generated: "2026-05-20T21:32:13.151Z"
ai-first: true
tags: ["index","agent-readable"]
---

# Low-Confidence Summaries

> Notes the LLM was uncertain about — candidates for manual review or re-summarization.

```dataview
TABLE confidence, clusterId AS cluster, lineCount AS lines, pagerank
FROM "Files"
WHERE confidence != "high"
SORT pagerank DESC
LIMIT 50
```