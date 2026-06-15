# Command: parent-atlas-kanban

## Purpose
Find, merge, or create a Kanban card for a Parent Atlas feature. Enforces identity lookup before any card creation. Never creates a duplicate card if one already exists for the same `feature_id`.

## Usage
```
/parent-atlas-kanban find <feature_id_or_query>
/parent-atlas-kanban merge <feature_id> "<update text>"
/parent-atlas-kanban create <feature_id> "<problem description>"
```

Examples:
```
/parent-atlas-kanban find atlas_higher_hop_index
/parent-atlas-kanban merge atlas.tree_nodes "backfill community_id complete — 3251/3251 rows"
/parent-atlas-kanban create atlas.cold_storage "cold storage manifest verification gate"
```

## Sub-commands

### `find`
1. `kag.feature_lookup` to get canonical `feature_id`
2. `atlas.packet_search` to confirm identity
3. Scan `.opencode/kanban/` for cards with matching `feature_id`
4. Scan `reports/parent-atlas-open-lanes-todo.md` for matching entry
5. Output: found cards + their status, or "no card found"

### `merge`
Pre-flight (same as `find`). Then:
1. Confirm single canonical card exists for `feature_id`
2. Show current card content
3. Append update text with timestamp + status change
4. Write merged card back
5. `ops.record_fix_attempt` with `action: "kanban_merge"`
6. `engram.ace_packet_inject` with outcome

**Never creates a second card if one exists.** Merge into the existing card.

### `create`
Pre-flight (same as `find`). Then:
1. Verify no existing card for `feature_id` (from `find` step) — if found, redirect to `merge`
2. `atlas.packet_search` to populate identity fields
3. Gemma4 synthesis for initial `summary`, `risk`, `priority` (L6 only, bounded by packet data)
4. Write card to `.opencode/kanban/<feature_id>-<timestamp>.md`
5. Append entry to `reports/parent-atlas-open-lanes-todo.md`
6. `engram.ace_packet_inject` with `action: "kanban_create"`

## Card Format

```markdown
---
feature_id: atlas.tree_nodes
feature_label: Atlas Tree Nodes
source_ref: scripts/atlas/backfill-tree-nodes.mjs
packet_key: ace:packet:atlas:tree:001
identity_lane: schema_stub
community_id: 14
status: in_progress
priority: high
created_at: 2026-06-15T00:00:00Z
updated_at: 2026-06-15T12:00:00Z
kanban_column: doing
---

## Problem
<Gemma4 summary of the problem, bounded by retrieved packet summaries>

## Evidence
- rg: scripts/atlas/backfill-tree-nodes.mjs:45 — `INSERT INTO atlas_tree_nodes`
- packet: ace:packet:atlas:tree:001 (rerank_score: 0.91)
- graph: neighbors: [atlas_codebase_packets, atlas_topology_index]

## Do Not Do
- Do not drop the `packet_key` column
- Do not merge into atlas_codebase_packets (separate table by design)

## Validation
- `npm run atlas:lineage:verify`
- `docker exec legal-ai-postgres psql -U legal_admin -d legal_ai_db -c "SELECT COUNT(*) FROM atlas_tree_nodes"`

## Updates
- 2026-06-15 12:00Z — backfill complete: 8823/8823 nodes, 100% packet linkage [status: done]
```

## Rules
- `find` before `create` — always.
- `merge` before `create` — if card exists, always merge.
- Gemma4 writes `summary`, `risk`, `priority` only — never `feature_id`, `packet_key`, `source_ref`.
- Every card must have `validation` commands before it can move to `done`.
- Record every card action in Engram (`action: "kanban_find | kanban_merge | kanban_create"`).
