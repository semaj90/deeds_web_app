---
name: parent-atlas-agentic-workflow
description: Multi-stage retrieval pipeline enforcing Parent Atlas identity before any code action. Run this before writing, patching, or recommending any change to the codebase.
---

# Parent Atlas Agentic Workflow

## Authority Model

| Store | Role | Truth |
|-------|------|-------|
| Postgres `atlas_packets` | Identity + lifecycle | **YES — canonical** |
| Qdrant `codebase_chunks_768` | Dense retrieval | Mirror only |
| Redis/Bifrost | Hot cache | Cache only |
| Neo4j | Topology + PageRank | Enrichment only |
| Engram | Agent memory | Memory only |

**Gemma4 never invents identity. Parent Atlas owns it.**

- `feature_id`, `feature_label`, `source_ref`, `packet_key`, `identity_lane` → Parent Atlas
- `summary`, `risk`, `rationale`, `priority` → Gemma4 (bounded by retrieved evidence)
- `neighbors`, `pagerank`, `betweenness`, `community_id` → Neo4j
- `embedding`, `qdrant_point_id`, dense hits → Qdrant
- Hot cache reads → Redis/Bifrost

---

## Pipeline (11 Stages — Execute in Order)

### L0 · Intent Classification
Classify the query before touching any tool:
- **refactor**: modifying existing known file — must find `source_ref` first
- **feature**: adding to existing feature — must find `feature_id` first
- **audit**: read-only scan — L1–L4 only, no patch
- **kanban**: update task board — merge into existing card, never create duplicate
- **question**: answer-only — L1–L5, synthesis only

### L1 · Local Search (Lexical)
Run in parallel. Collect `rg_matches` and `ast_matches` for evidence.

```bash
rg "symbolName|ClassName" src/ --type ts -l
git diff --name-only HEAD~5
```

Also check `AGENTS.md` in the relevant directory via `file.read_window` or `wiki.explain_page`.
Check `LLMS.md.context_for_file` and `LLMS.md.peers_for_dir` for co-edited neighbors.

### L2 · Canonical Identity Lookup
**All three must be called. Never skip.**

```
atlas.source_refs     → find source_ref by file path or partial match
kag.feature_lookup    → find feature_id, feature_label, packet_key
atlas.packet_search   → confirm: packet_key, identity_lane, community_id, qdrant_point_id
```

**If `atlas.packet_search` returns 0 hits AND rg found the file:**
Record `identity_lane: "unregistered"`, set `decision: "ask_permission"`, stop.

**If `atlas.packet_search` returns hits**, extract:
`source_ref` (canonical), `feature_id`, `feature_label`, `packet_key`, `identity_lane`, `community_id`, `qdrant_point_id`.

### L3 · Memory Lookup
Check if this problem has been solved before.

```
engram.chat_memory_recent   → query: "feature_id:{feature_id}"
kag.recall_similar_fix      → query: original user intent
```

If Engram returns a prior `status: "success"` record for this `feature_id`, summarize the prior
solution and ask the user whether to re-apply. Do not re-synthesize what Engram already knows.

### L4 · Hybrid Retrieval
Run all three lanes in parallel.

**Lexical** (BM25 / pg_trgm / JSONB):
`kag.multi_lane_search` with lanes: `["bm25", "pg_trgm", "jsonb"]`

**Dense ANN** (Qdrant):
`atlas.prefilter` (filter by community_id or feature_id) → `ace.compact_search`

**Graph / Topology** (Neo4j):
`graph.expand_neighborhood` (seed: packet_key, depth: 2)
`graph.community_for_node`
`graph.pagerank_top` (authority for the feature cluster)

### L5 · Rerank
```
turbovec.rank_chunks   → merge all L4 hits, score by relevance to original query
```

Output: ordered list of `{packet_key, source_ref, score, lane}`.
Populate evidence: `qdrant_hits`, `graph_hits`, `cache_hits`, `rerank_score`.

### L6 · Synthesis (Gemma4 — Bounded Evidence Only)
**Only call Gemma4 after L0–L5 complete.**

Provide Gemma4 with:
1. `summary` fields from top-K retrieved packets (not raw source code)
2. `rg_matches` from L1
3. Prior Engram record (if L3 found one)

Gemma4 produces ONLY:
- `summary`: 2–3 sentences on what this code does
- `risk`: what could break if patched
- `rationale`: why this file/packet is the right target
- `priority`: high | medium | low

Gemma4 must NOT produce `feature_id`, `source_ref`, or `packet_key`.

### L7 · Decision

| Decision | Condition |
|----------|-----------|
| `patch_existing` | L2 found canonical identity + `rerank_score > 0.65` |
| `merge_card` | Kanban card exists for this `feature_id` with same problem |
| `create_card` | No existing card, L3 found no prior fix, new work confirmed |
| `ask_permission` | Identity unregistered, conflicting packets, or risk = high |

Never `patch_existing` without confirmed `packet_key` from L2.
Never `create_card` if `merge_card` applies.

### L8 · Validate (Before Any Write)
Run validation commands from the Recommendation:
```bash
node --check <target_file>
npm run atlas:lineage:verify
```
If validation fails — stop, report the error, do not patch.

### L9 · Patch (If Approved)
```
ops.propose_patch   → diff-based patch against target_file using canonical source_ref
```
Patch must touch only `target_files`. Must not overwrite identity fields.
Must not create new files if `feature_id` already maps to an existing file.

### L10 · Post-Patch Gate
```
ops.run_quality_gate   → npm run test / svelte-check / atlas:lineage:verify
```

### L11 · Record Outcome
```
ops.record_fix_attempt
engram.ace_packet_inject   → store structured outcome in Engram
```

Engram payload:
```json
{
  "feature_id": "...",
  "source_ref": "...",
  "problem": "one sentence",
  "solution": "one sentence",
  "validation": ["node --check ...", "npm run atlas:lineage:verify"],
  "status": "success | failure",
  "patch_diff_hash": "sha256 of the applied diff"
}
```

---

## Recommendation Object

```typescript
type Recommendation = {
  source_id: string;
  source_ref: string;             // canonical — from atlas.packet_search
  normalized_source_ref: string;
  feature_id: string;             // from kag.feature_lookup
  feature_label: string;
  packet_key: string;             // from atlas.packet_search
  identity_lane: string;          // qdrant_chunk | schema_stub | mcp_tool_stub | unregistered
  community_id: number | null;
  tree_node_id: string | null;
  qdrant_point_id: string | null;
  kanban_card_id: string | null;
  decision: "patch_existing" | "merge_card" | "create_card" | "ask_permission";
  permission_level: "read_only" | "patch_allowed" | "manual_review";
  target_files: string[];
  evidence: {
    rg_matches: string[];
    ast_matches: string[];
    qdrant_hits: number;
    graph_hits: number;
    cache_hits: number;
    rerank_score: number;         // 0.0–1.0 from turbovec.rank_chunks
  };
  gemma4: {
    summary: string;
    risk: string;
    rationale: string;
    priority: "high" | "medium" | "low";
  };
  validation_commands: string[];
  supersedes: string[];
  merged_from: string[];
  do_not_do: string[];
}
```

---

## Hard Rules

1. **Never create placeholder code.** If `feature_id` exists, patch the existing file.
2. **Never create a new file** if the feature already has a `packet_key` mapped to any file.
3. **Never overwrite identity fields** (`feature_id`, `packet_key`, `source_ref`).
4. **Prefer merged edits** — a 5-line diff beats a new 200-line file.
5. **Gemma summaries are evidence, not identity.** They describe; they do not define.
6. **`ask_permission` is not failure.** It is the correct outcome when identity is ambiguous.
7. **Engram is the DRY gate.** If we solved this before, prove it before re-solving.
