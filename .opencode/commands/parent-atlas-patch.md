# Command: parent-atlas-patch

## Purpose
Apply a bounded, identity-gated patch to an existing file. Runs the full L0–L11 agentic workflow. Will not proceed without confirmed Parent Atlas identity.

## Usage
```
/parent-atlas-patch <source_ref_or_query> "<what to change>"
```

Examples:
```
/parent-atlas-patch src/lib/server/ace/context-assembler.ts "add gpu reranker fallback when CUDA unavailable"
/parent-atlas-patch atlas_higher_hop_index "backfill missing bifrost_key from nes_chrom_packets"
/parent-atlas-patch scripts/atlas/backfill-higher-hop-enrichment.mjs "fix missing qdrant payload alias"
```

## Behavior

Runs the full 11-stage pipeline from `parent-atlas-agentic-workflow` skill:

**L0** — Classify intent as `refactor` or `feature`

**L1** — rg + git diff to find the file; confirm it exists on disk

**L2** — `atlas.source_refs` + `kag.feature_lookup` + `atlas.packet_search`
- **STOP and report** if `atlas.packet_search` returns 0 hits. Set `decision: "ask_permission"`.

**L3** — `engram.chat_memory_recent` to check for prior fix for this `feature_id`

**L4** — Hybrid retrieval (BM25 + dense ANN + Neo4j graph expansion)

**L5** — `turbovec.rank_chunks` rerank

**L6** — Gemma4 synthesis (summary, risk, rationale, priority)
- Gemma4 receives: retrieved summaries, rg matches, Engram record
- Gemma4 must NOT invent identity fields

**L7** — Decision:
- `patch_existing` if `packet_key` confirmed + `rerank_score > 0.65`
- `ask_permission` if risk=high or identity ambiguous

**L8** — Dry-run validation: `node --check <file>`, `npm run atlas:lineage:verify`

**L9** — `ops.propose_patch` with diff preview. **Pause for user approval.**

**L10** — After approval: `ops.run_quality_gate`

**L11** — `ops.record_fix_attempt` + `engram.ace_packet_inject`

## Output (Recommendation Object)

Prints the full `Recommendation` type (see `parent-atlas-agentic-workflow` skill) before and after patching.

## Hard Gates

| Gate | Condition | Action |
|------|-----------|--------|
| Identity gate | `packet_key` not found | `ask_permission`, stop |
| Conflict gate | Multiple packets for same file | Show list, ask user to pick |
| Risk gate | Gemma4 reports risk=high | `ask_permission`, show rationale |
| Rerank gate | `rerank_score < 0.65` | Warn user, require explicit confirmation |
| Validation gate | `node --check` fails | Stop, report syntax error |

## Rules
- Never writes without `packet_key` confirmed in L2.
- Never touches files outside `target_files`.
- Never creates new files if `feature_id` maps to an existing file.
- Always shows diff preview before applying.
- Always records outcome in Engram (even on failure).
