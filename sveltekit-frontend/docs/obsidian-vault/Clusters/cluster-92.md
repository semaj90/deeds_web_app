---
type: "cluster"
cluster_id: "cluster-92"
clusterId: 92
topic: "component chunks in `src/lib/components/evidence` (tag: embedding)"
aliases: ["cluster-92","component chunks in `src/lib/components/evidence` (tag: embedding)"]
memberCount: 940
pagerank_sum: 0
pagerank_max: 0
risk: "medium"
top_tags: ["embedding","page","component","xstate"]
llmHits: 0
summaryMode: null
confidence: "medium"
last_updated_by_llm: "2026-05-11T03:30:09.005Z"
ai-first: true
contains: ["[[Files/src__lib__components__yorha__evidence__uploadzone]]","[[Files/src__routes___app___demos__yorha__components__evidence__uploadzone]]","[[Files/src__routes___app___cases___id___evidence__upload___page]]","[[Files/src__lib__client__ui__poiphotouploader]]","[[Files/src__routes___app___evidence__upload___page]]","[[Files/src__lib__components__evidence__uploadprogresscard]]","[[Files/src__lib__components__ui__aifileupload]]","[[Files/src__lib__components__evidence__evidencebulkuploaddialog]]"]
same: ["[[Clusters/cluster-5]]","[[Clusters/cluster-28]]","[[Clusters/cluster-34]]","[[Clusters/cluster-40]]","[[Clusters/cluster-50]]"]
tags: ["cluster","cluster/92","topic/components","topic/evidence","topic/sym_upload","topic/topic_component","topic/yorha"]
---

# component chunks in `src/lib/components/evidence` (tag: embedding)
## For future Claude
> Cluster of 8 files. Top dirs: src/lib/components/evidence, src/lib/components, src/lib/components/yorha/evidence. Top tags: embedding, page, component. Risk: medium.
cluster:: cluster-92
cluster_id:: 92
member_count:: 8
pagerank_sum:: 0
risk:: medium
top_tags:: embedding, page, component, xstate
## Agent hints
Use this cluster when investigating embedding, page, component.
Risk: **medium** (pagerank_max=0, confidence=medium/low).
## Main dependencies
- same:: [[Clusters/cluster-5]] (jaccard 0.50)
- same:: [[Clusters/cluster-28]] (jaccard 0.50)
- same:: [[Clusters/cluster-34]] (jaccard 0.50)
- same:: [[Clusters/cluster-40]] (jaccard 0.50)
- same:: [[Clusters/cluster-50]] (jaccard 0.50)
## Top Directories
- `src/lib/components/evidence` (3)
- `src/lib/components` (2)
- `src/lib/components/yorha/evidence` (1)
## Top Tags
- embedding (4)
- page (3)
- component (3)
- xstate (1)
## Members (8)
- contains:: [[Files/src__lib__components__yorha__evidence__uploadzone|src/lib/components/yorha/evidence/UploadZone.svelte]]
- contains:: [[Files/src__routes___app___demos__yorha__components__evidence__uploadzone|src/routes/(app)/demos/yorha/components/evidence/UploadZone.svelte]]
- contains:: [[Files/src__routes___app___cases___id___evidence__upload___page|src/routes/(app)/cases/[id]/evidence/upload/+page.svelte]]
- contains:: [[Files/src__lib__client__ui__poiphotouploader|src/lib/client/ui/POIPhotoUploader.svelte]]
- contains:: [[Files/src__routes___app___evidence__upload___page|src/routes/(app)/evidence/upload/+page.svelte]]
- contains:: [[Files/src__lib__components__evidence__uploadprogresscard|src/lib/components/evidence/UploadProgressCard.svelte]]
- contains:: [[Files/src__lib__components__ui__aifileupload|src/lib/components/ui/AIFileUpload.svelte]]
- contains:: [[Files/src__lib__components__evidence__evidencebulkuploaddialog|src/lib/components/evidence/EvidenceBulkUploadDialog.svelte]]
## Backlinks (Dataview)
```dataview
LIST FROM "Files" WHERE clusterId = 92 SORT pagerank DESC LIMIT 30
```