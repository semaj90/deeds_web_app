---
type: "cluster"
cluster_id: "cluster-5"
clusterId: 5
topic: "component chunks in `src/lib/components/ai` (tag: ai)"
aliases: ["cluster-5","component chunks in `src/lib/components/ai` (tag: ai)"]
memberCount: 1280
pagerank_sum: 0
pagerank_max: 0
risk: "low"
top_tags: ["ai","auth","page","component","embedding"]
llmHits: 0
summaryMode: null
confidence: "high"
last_updated_by_llm: "2026-05-08T22:10:35.424Z"
ai-first: true
contains: ["[[Files/src__lib__components__ai__simpleworkingchat]]","[[Files/src__routes___app___terminal___page]]","[[Files/src__routes___app___demos__chat-messages___page]]","[[Files/src__lib__components__aichatassistant]]","[[Files/src__lib__components__ai__enhancedaichattest]]","[[Files/src__lib__components__ai__floatingchatmodal]]","[[Files/src__lib__components__ai__airecommendation]]","[[Files/src__lib__features__evidence-command-center__evidencechatpane]]"]
same: ["[[Clusters/cluster-14]]","[[Clusters/cluster-92]]","[[Clusters/cluster-21]]","[[Clusters/cluster-72]]","[[Clusters/cluster-28]]"]
tags: ["cluster","cluster/5","topic/components","topic/sym_chat","topic/routes","topic/topic_component","topic/auth"]
---

# component chunks in `src/lib/components/ai` (tag: ai)
## For future Claude
> This cluster provides a comprehensive service layer for advanced AI capabilities, handling inference, context analysis (emotion), knowledge retrieval, and complex multi-step workflow orchestration.

**Purpose:** AI Service Layer and Workflow Orchestration
cluster:: cluster-5
cluster_id:: 5
member_count:: 8
pagerank_sum:: 0
risk:: low
top_tags:: ai, auth, page, component, embedding
## Agent hints
Use this cluster when investigating ai, auth, page.
Risk: **low** (pagerank_max=0, confidence=high).
## Main dependencies
- same:: [[Clusters/cluster-14]] (jaccard 0.60)
- same:: [[Clusters/cluster-92]] (jaccard 0.50)
- same:: [[Clusters/cluster-21]] (jaccard 0.43)
- same:: [[Clusters/cluster-72]] (jaccard 0.43)
- same:: [[Clusters/cluster-28]] (jaccard 0.40)
## Top Directories
- `src/lib/components/ai` (8)
- `src/routes/(app)/terminal` (1)
- `src/routes/(app)/demos/chat-messages` (1)
## Top Tags
- ai (8)
- auth (8)
- page (5)
- component (5)
- embedding (1)
## Members (8)
- contains:: [[Files/src__lib__components__ai__simpleworkingchat|src/lib/components/ai/SimpleWorkingChat.svelte]]
- contains:: [[Files/src__routes___app___terminal___page|src/routes/(app)/terminal/+page.svelte]]
- contains:: [[Files/src__routes___app___demos__chat-messages___page|src/routes/(app)/demos/chat-messages/+page.svelte]]
- contains:: [[Files/src__lib__components__aichatassistant|src/lib/components/AIChatAssistant.svelte]]
- contains:: [[Files/src__lib__components__ai__enhancedaichattest|src/lib/components/ai/EnhancedAIChatTest.svelte]]
- contains:: [[Files/src__lib__components__ai__floatingchatmodal|src/lib/components/ai/FloatingChatModal.svelte]]
- contains:: [[Files/src__lib__components__ai__airecommendation|src/lib/components/ai/AIRecommendation.svelte]]
- contains:: [[Files/src__lib__features__evidence-command-center__evidencechatpane|src/lib/features/evidence-command-center/EvidenceChatPane.svelte]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 5 SORT pagerank DESC LIMIT 30
```