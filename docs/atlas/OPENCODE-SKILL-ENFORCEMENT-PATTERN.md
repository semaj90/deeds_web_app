# OpenCode Skill Enforcement Pattern — No Placeholder Policy

**Date**: 2026-06-13  
**Status**: SPECIFICATION COMPLETE  
**Implementation**: Ready for OpenCode agent wiring

---

## Summary

OpenCode agent skills must enforce a **mandatory retrieval-before-creation** policy. Before any file is created:

1. Execute 6 retrieval lanes in strict sequence
2. Stop at first HIT (file exists, don't create)
3. If all lanes return NONE, prompt user for approval
4. Log every attempt (approval or denial) to `docs/reports/file-creation-audit.jsonl`

This prevents the historical failure mode: "Agent tries to create placeholder file → write tool unavailable → agent 'assumes' file exists."

---

## Retrieval Lanes

### Lane 1: atlas-tools_find_source_refs

**Tool**: `atlas-tools` MCP (trace-based)  
**Query**: Search `atlas_packets` table for matching `source_ref`  
**Pattern**: `source_ref = "{candidate_path}"` OR `source_ref LIKE "{candidate_pattern}%"`

```javascript
// Pseudocode
const hit = await atlasTools.findSourceRefs({
  sourceRef: 'scripts/atlas/audit-concept-evidence-spine.mjs',
  pattern: 'audit-concept-*'
});
if (hit.length > 0) return { lane: 1, result: 'HIT', match: hit[0] };
return { lane: 1, result: 'NONE', duration_ms };
```

**Hit** → File already indexed in Parent Atlas. Stop, reuse packet.  
**Timeout** → Report error, stop, do NOT continue.  
**NONE** → Proceed to Lane 2.

---

### Lane 2: trace_atlas_packet_search

**Tool**: `trace_atlas_packet` MCP  
**Query**: Find packets where `file_path == candidate` or referenced in packet metadata  
**Pattern**: Direct file path search in trace system

```javascript
const hit = await traceAtlasPacket.search({
  filePath: 'scripts/atlas/audit-concept-evidence-spine.mjs',
  searchType: 'exact_path'
});
if (hit.length > 0) return { lane: 2, result: 'HIT', match: hit[0] };
return { lane: 2, result: 'NONE', duration_ms };
```

**Hit** → File exists in trace system. Stop.  
**Timeout** → Report error, stop.  
**NONE** → Proceed to Lane 3.

---

### Lane 3: trace_kag_multi_lane_search

**Tool**: `trace_kag_multi_lane` MCP  
**Query**: Semantic search for the intent/feature the file would implement  
**Pattern**: Keyword + semantic query for "concept evidence spine audit" or similar

```javascript
const hit = await traceKagMultiLane.search({
  intent: 'concept evidence spine audit producer',
  intent_field: 'concept_evidence|evidence_enrichment',
  threshold: 0.65
});
if (hit.length > 0) return { lane: 3, result: 'HIT', match: hit[0] };
return { lane: 3, result: 'NONE', duration_ms };
```

**Hit** → Existing KAG nodes cover the intent. Reuse context.  
**Timeout** → Report error, stop.  
**NONE** → Proceed to Lane 4.

---

### Lane 4: trace_topology_search_4d (SOM + Neo4j Graph)

**Tool**: `trace_topology_search_4d` MCP  
**Query**: SOM cell adjacency + Neo4j neighborhood for directory + feature context  
**Pattern**: Directory-first clustering + concept-first topology

```javascript
const hit = await traceTopologySearch4d.searchNeighborhood({
  directory: 'scripts/atlas',
  conceptIds: ['concept_evidence', 'audit_producer'],
  somCell: { row: 9, col: 12 },
  depth: 2
});
if (hit.length > 0) return { lane: 4, result: 'HIT', match: hit[0] };
return { lane: 4, result: 'NONE', duration_ms };
```

**Hit** → SOM cells or Neo4j neighbors already cover this region. Attach to existing topology.  
**Timeout** → Report error, stop.  
**NONE** → Proceed to Lane 5.

---

### Lane 5: trace_atlas_suggest_files

**Tool**: `trace_atlas_suggest_files` MCP  
**Query**: Candidate pool for "audit" / "enrichment" / "producer" keywords  
**Pattern**: Suggestion engine search

```javascript
const hit = await traceAtlasSuggestFiles.suggest({
  keyword: 'audit-concept-evidence',
  domain: 'atlas|indexing',
  threshold: 0.60
});
if (hit.length > 0) return { lane: 5, result: 'HIT', match: hit[0] };
return { lane: 5, result: 'NONE', duration_ms };
```

**Hit** → File in candidate pool. Use existing suggestion.  
**Timeout** → Report error, stop.  
**NONE** → Proceed to Lane 6 (final fallback).

---

### Lane 6: rg Fallback (Text Search)

**Tool**: Shell `rg` (ripgrep)  
**Query**: Pattern match across `src/` and `scripts/` directories  
**Pattern**: Fuzzy filename + content search

```javascript
const { stdout } = await shell.exec(
  `rg "audit.*concept.*evidence|audit-concept-evidence" src/ scripts/ --type ts --type mjs --type js`,
  { timeout: 5000 }
);
if (stdout.length > 0) return { lane: 6, result: 'HIT', match: stdout.split('\n')[0] };
return { lane: 6, result: 'NONE', duration_ms };
```

**Hit** → File exists on filesystem. Use it.  
**Timeout** → Report error, stop.  
**NONE** → All lanes exhausted. Proceed to user approval.

---

## User Approval Gate (Step 7)

If all 6 lanes return NONE:

```javascript
const userInput = await prompt.ask(
  `File ${candidate} not found in any retrieval lane. Create? (y/n)`
);

if (userInput === 'y' || userInput === 'yes') {
  return {
    action: 'file_creation_approved',
    user_approved: true,
    proceed_to_create: true
  };
}

return {
  action: 'file_creation_denied',
  reason: 'user_declined',
  proceed_to_create: false
};
```

---

## Decision Chain Data Structure

Every file creation attempt produces a structured report:

```json
{
  "timestamp": "2026-06-13T21:47:03Z",
  "action": "file_creation_denied",
  "candidate": "scripts/atlas/audit-concept-evidence-spine.mjs",
  "reason": "user_declined",
  "all_lanes_complete": true,
  "ready_for_creation": true,
  "decision_chain": [
    {
      "lane": 1,
      "name": "atlas-tools_find_source_refs",
      "query": "source_ref LIKE 'scripts/atlas/audit-concept-evidence%'",
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
      "query": "semantic 'concept evidence spine audit producer'",
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
  ]
}
```

---

## Audit Trail Logging

Every attempt (approved or denied) appends ONE JSON object per line to:

```
docs/reports/file-creation-audit.jsonl
```

Format: JSONL (one object per line, no array wrapper)

```json
{"timestamp":"2026-06-13T21:47:03Z","action":"file_creation_denied","candidate":"audit-foo.mjs","all_lanes_complete":true,"ready_for_creation":false,"reason":"user_declined"}
{"timestamp":"2026-06-13T21:48:15Z","action":"file_creation_approved","candidate":"audit-bar.mjs","all_lanes_complete":true,"user_approved":true,"created_at":"2026-06-13T21:48:16Z","file_path":"scripts/atlas/audit-bar.mjs","sha256":"abc123"}
```

---

## Implementation in OpenCode

### Hook Point: Before Write Tool

Intercept every `write()` tool call in OpenCode agent. Check if:

1. **Is this a new file creation?** (path doesn't exist)
2. **Is this within Parent Atlas scope?** (path starts with `scripts/atlas/`, `docs/atlas/`, etc.)

If both true → Execute decision chain before allowing write.

### Hook Code Pattern

```javascript
// In OpenCode agent setup
const beforeWrite = async (toolCall) => {
  const { file_path } = toolCall.input;
  const fileExists = await fs.exists(file_path);
  const isAtlasScoped = file_path.match(/^(scripts\/atlas|docs\/atlas|sveltekit-frontend\/scripts\/atlas)/);

  if (!fileExists && isAtlasScoped) {
    const decision = await executeNoPlaceholderDecisionChain(file_path);
    if (!decision.proceed_to_create) {
      logAuditEntry(decision);
      throw new Error(`File creation denied: ${decision.reason}`);
    }
    logAuditEntry(decision);
  }

  return toolCall; // Proceed to write
};
```

### MCP Tool Mapping

Ensure OpenCode has all 6 retrieval lanes wired:

| Lane | MCP Tool | Config Entry |
|------|----------|--------------|
| 1 | `atlas-tools` (trace) | `mcp.trace` (existing) |
| 2 | `trace_atlas_packet` | `mcp.trace` function call |
| 3 | `trace_kag_multi_lane` | `mcp.trace` function call |
| 4 | `trace_topology_search_4d` | `mcp.trace` function call |
| 5 | `trace_atlas_suggest_files` | `mcp.trace` function call |
| 6 | `rg` (shell) | `permission.bash: "ask"` (existing) |

All are already available. The hook just orchestrates the call sequence.

---

## Testing

Run the enforcement test suite:

```bash
npm run test opencode/no-placeholder-policy.spec.ts
```

Expected: All tests pass.

```bash
npm run opencode:skill:no-placeholder:test
```

Expected: Live decision chain simulation with all 6 lanes executing.

---

## Common Patterns to Prevent

### ❌ Pattern 1: Inventing Placeholders

```javascript
// WRONG — skips retrieval
async function createAuditFile(name) {
  const filePath = `scripts/atlas/${name}.mjs`;
  await write(filePath, placeholderCode); // No retrieval! Violates policy.
}

// CORRECT — uses decision chain
async function createAuditFile(name) {
  const decision = await executeDecisionChain(filePath);
  if (!decision.proceed_to_create) {
    throw new Error(`${decision.reason}`);
  }
  await write(filePath, realCode);
}
```

### ❌ Pattern 2: Ignoring Lane Hits

```javascript
// WRONG — Lane 6 found file, but creates -v2 anyway
if (lane6Hit) {
  // Ignores hit, creates variant
  await write('audit-env-contract-v2.mjs', code);
}

// CORRECT — Stops at Lane 6 hit
if (lane6Hit) {
  return { reason: 'file_exists', stop: true };
}
```

### ❌ Pattern 3: Continuing After Error

```javascript
// WRONG — Lane 1 timeout, but continues
try {
  const lane1 = await atlasTools.find(...);
} catch (err) {
  // Ignores timeout, proceeds to Lane 2
  const lane2 = await traceAtlas.find(...);
}

// CORRECT — Stops on timeout
try {
  const lane1 = await atlasTools.find(...);
} catch (err) {
  logAuditEntry({ status: 'ERROR', error: err.message });
  throw err; // Stop decision chain
}
```

---

## Monitoring

Check audit log for violations:

```bash
# Count denials
wc -l docs/reports/file-creation-audit.jsonl

# Find all approvals
rg '"action":"file_creation_approved"' docs/reports/file-creation-audit.jsonl

# Find all denials
rg '"action":"file_creation_denied"' docs/reports/file-creation-audit.jsonl

# Find all errors/timeouts
rg '"status":"ERROR"|"status":"TIMEOUT"' docs/reports/file-creation-audit.jsonl
```

---

## References

- **Policy Definition**: `sveltekit-frontend/.opencode/skills/no-placeholder-policy.md`
- **Test Suite**: `tests/opencode/no-placeholder-policy.spec.ts`
- **OpenCode Config**: `opencode.jsonc` (instructions include policy)
- **Audit Trail**: `docs/reports/file-creation-audit.jsonl`
