# No Placeholder Policy — Parent Atlas Retrieval-Before-Creation

**Status**: ENFORCED  
**Effective**: 2026-06-13  
**Scope**: All file creation requests within Parent Atlas lanes

---

## Core Rule

**File creation is FORBIDDEN until all 6 retrieval lanes report NONE.**

Do not invent placeholder files. Do not assume files exist. Do not create stubs to "fix later."

If retrieval returns no results, the file does NOT exist. Report the retrieval failure and stop.

---

## Decision Chain (Mandatory Sequence)

Execute in strict order. Stop at first HIT. Only proceed to creation if all 6 return NONE.

### Lane 1: atlas-tools_find_source_refs
```
Query atlas-tools with: source_ref="{candidate_file_path}" OR source_ref LIKE "{candidate_pattern}%"
Expected: source_ref matches in atlas_packets table
Hit: Stop, use existing packet
None: Continue to Lane 2
```

### Lane 2: trace_atlas_packet_search
```
Query trace system: find packets where file_path == "{candidate}" OR packet_key references it
Expected: Trace + Packet linkage
Hit: Stop, reference existing packet
None: Continue to Lane 3
```

### Lane 3: trace_kag_multi_lane_search
```
Query KAG knowledge layer: semantic search for "{candidate_intent}"
Expected: Existing KAG nodes covering the intent
Hit: Stop, reuse KAG context
None: Continue to Lane 4
```

### Lane 4: trace_topology_search_4d (SOM + Graph)
```
Query SOM topology + Neo4j neighborhood for directory context
Expected: SOM cells or neighboring concepts already cover this region
Hit: Stop, attach to existing topology
None: Continue to Lane 5
```

### Lane 5: trace_atlas_suggest_files
```
Query suggestions engine: "{candidate}" in suggested file list
Expected: File already in candidate pool
Hit: Stop, use existing suggestion
None: Continue to Lane 6
```

### Lane 6: rg (Fallback Text Search)
```
Shell: rg "{candidate_pattern}" src/ --type ts --type svelte --glob "*.ts" --glob "*.svelte"
Expected: Existing file matching the pattern
Hit: Stop, use existing file
None: Proceed to step 7
```

### Step 7: User Approval
```
If all 6 lanes return NONE:
  Report: "File {candidate} not found in any retrieval lane. Create? (y/n)"
  User approves: THEN create
  User declines: Stop, return failure
```

---

## Contract: Placeholder Creation

```yaml
placeholder_creation:
  default:
    policy: FORBIDDEN
  
  allowed_if:
    all_lanes_return: NONE
    atlas_packets: none
    trace_atlas_packet: none
    trace_kag_multi_lane: none
    trace_topology_search_4d: none
    trace_atlas_suggest_files: none
    rg_fallback: none
    user_approved: true
```

---

## Examples

### ✅ CORRECT: Retrieval fails, file creation denied

```
User: Create audit-concept-evidence-spine.mjs
Agent:
  → Lane 1 (atlas-tools): no hits
  → Lane 2 (trace_atlas_packet): no hits
  → Lane 3 (trace_kag): no hits
  → Lane 4 (trace_topology): no hits
  → Lane 5 (trace_atlas_suggest): no hits
  → Lane 6 (rg): no hits
  → All lanes NONE ✓
  → User approval: YES
  → CREATE audit-concept-evidence-spine.mjs
```

### ❌ WRONG: File already exists in Lane 1, but code creates placeholder anyway

```
User: Create audit-concept-evidence-spine.mjs
Agent (BROKEN):
  → Skips retrieval entirely
  → Assumes file doesn't exist
  → CREATES placeholder
  → Later: "Oh, the file already exists, never mind"
  
VIOLATES POLICY. Agent must retrieve first.
```

### ❌ WRONG: Lane 6 finds file, but code creates "v2" version anyway

```
User: Create audit-concept-evidence-spine.mjs
Agent (BROKEN):
  → Lane 6 (rg): HITS existing audit-concept-evidence-spine.mjs
  → Agent ignores hit
  → CREATES audit-concept-evidence-spine-v2.mjs
  → Duplication, inconsistency
  
VIOLATES POLICY. Stop at Lane 6 hit.
```

---

## Error Handling

If retrieval lanes timeout or fail (connection error, not "no results"):

```
Lane N query failed (timeout/error):
  → Report the failure with error message
  → Do NOT proceed to creation
  → Recommend retry or manual verification
  → Do NOT invent fallback
```

Example:
```
Lane 1 atlas-tools: TIMEOUT after 5s
  → Stop
  → Report: "atlas-tools unavailable; cannot verify source_ref uniqueness"
  → Recommend: "Restart atlas-tools or retry"
  → Do NOT proceed to Lane 2
```

---

## Structured Failure Report

When a file creation request is denied, emit:

```json
{
  "action": "file_creation_denied",
  "candidate": "scripts/atlas/audit-concept-evidence-spine.mjs",
  "reason": "retrieval_returned_none",
  "decision_chain": [
    {
      "lane": 1,
      "name": "atlas-tools_find_source_refs",
      "query": "source_ref LIKE 'scripts/atlas/audit-concept-evidence-spine%'",
      "result": "NONE",
      "duration_ms": 145
    },
    {
      "lane": 2,
      "name": "trace_atlas_packet_search",
      "query": "file_path == 'scripts/atlas/audit-concept-evidence-spine.mjs'",
      "result": "NONE",
      "duration_ms": 89
    },
    {
      "lane": 3,
      "name": "trace_kag_multi_lane_search",
      "query": "semantic 'concept evidence spine audit' OR 'evidence spine producer'",
      "result": "NONE",
      "duration_ms": 234
    },
    {
      "lane": 4,
      "name": "trace_topology_search_4d",
      "query": "SOM cell (9,12) + Neo4j SUPPORTS concept_evidence",
      "result": "NONE",
      "duration_ms": 156
    },
    {
      "lane": 5,
      "name": "trace_atlas_suggest_files",
      "query": "suggest files for 'concept evidence enrichment'",
      "result": "NONE",
      "duration_ms": 78
    },
    {
      "lane": 6,
      "name": "rg_fallback",
      "query": "rg 'audit.*concept.*evidence' src/ scripts/",
      "result": "NONE",
      "duration_ms": 312
    }
  ],
  "user_prompt": "File not found in all 6 retrieval lanes. Create audit-concept-evidence-spine.mjs? (y/n)",
  "all_lanes_complete": true,
  "ready_for_creation": true
}
```

---

## Implementation Notes

- **Sequential**: Do NOT parallelize lanes. Execute 1 → 2 → 3 → 4 → 5 → 6 in strict order.
- **Fail-fast**: Stop at first HIT. Do not continue retrieving after finding the file.
- **Timeout**: Each lane has 5s timeout. Timeout = failure, not "no results." Stop and report error.
- **User approval**: Only after ALL lanes complete with NONE can the user approve creation.
- **Audit trail**: Log the entire decision_chain to `docs/reports/file-creation-audit.jsonl` (append-only, one per line).

---

## Audit Trail

Every file creation attempt (approved or denied) goes to:

```
docs/reports/file-creation-audit.jsonl
```

Format: one JSON object per line (JSONL), appended in chronological order.

```json
{"timestamp":"2026-06-13T21:47:03Z","action":"file_creation_denied","candidate":"audit-foo.mjs","all_lanes_complete":true,"ready_for_creation":false,"reason":"user_declined"}
{"timestamp":"2026-06-13T21:48:15Z","action":"file_creation_approved","candidate":"audit-bar.mjs","all_lanes_complete":true,"user_approved":true,"created_at":"2026-06-13T21:48:16Z","file_path":"scripts/atlas/audit-bar.mjs","sha256":"abc123"}
```

---

## Testing

**Smoke test** — verify policy enforcement:

```bash
npm run opencode:skill:no-placeholder:test
```

Expected output:
- Lane 1-6 all return NONE for non-existent file
- User prompt appears
- File not created without approval
- Decision chain logged to audit trail

---

## References

- **Parent Atlas**: `docs/atlas/AGENT-TASK-PACKAGES-2026-06-13.md`
- **Decision chain origin**: Session June 13, 2026 — critical hardening to prevent placeholder file invention
- **Related**: `docs/atlas/LANE-QUICK-REFERENCE.md` (lane execution checklists)
