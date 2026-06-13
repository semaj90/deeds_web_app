# OpenCode Integration Example — No Placeholder Policy in Action

**Purpose**: Show exactly how the hook works in real scenarios  
**Reference Implementation**: `sveltekit-frontend/scripts/opencode/no-placeholder-policy-hook.mjs`

---

## Scenario 1: Creating a New Atlas Script (All Lanes NONE)

### User Input to OpenCode

```
Create scripts/atlas/audit-concept-evidence-spine.mjs for auditing concept evidence.
```

### Agent Flow

#### Step 1: Agent decides to create file

```javascript
// Agent receives user request and plans to create file
const filePath = 'scripts/atlas/audit-concept-evidence-spine.mjs';

// Before calling write tool, check policy
const decision = await enforceNoPlaceholderPolicy(filePath);
```

#### Step 2: Decision chain executes

```javascript
// Lane 1: atlas-tools_find_source_refs
// Query: source_ref LIKE 'scripts/atlas/audit-concept-evidence%'
// Result: NONE (no matching packet found)
// Duration: 145ms
// Status: Continue to Lane 2

// Lane 2: trace_atlas_packet_search
// Query: file_path == 'scripts/atlas/audit-concept-evidence-spine.mjs'
// Result: NONE (no packet with this path)
// Duration: 89ms
// Status: Continue to Lane 3

// Lane 3: trace_kag_multi_lane_search
// Query: semantic 'concept evidence spine audit'
// Result: NONE (no existing KAG context for this intent)
// Duration: 234ms
// Status: Continue to Lane 4

// Lane 4: trace_topology_search_4d
// Query: directory='scripts/atlas' + SOM topology
// Result: NONE (no SOM cells directly covering this intent)
// Duration: 156ms
// Status: Continue to Lane 5

// Lane 5: trace_atlas_suggest_files
// Query: suggest files for 'concept evidence audit'
// Result: NONE (file not in suggestion engine)
// Duration: 78ms
// Status: Continue to Lane 6

// Lane 6: rg_fallback
// Query: rg 'audit.*concept.*evidence' src/ scripts/
// Result: NONE (no matching file on filesystem)
// Duration: 312ms
// Status: All lanes complete, all returned NONE
```

#### Step 3: Decision object returned

```javascript
const decision = {
  proceed_to_create: null,              // Awaiting user approval
  reason: 'awaiting_user_approval',
  all_lanes_complete: true,
  all_returned_none: true,
  ready_for_creation: true,
  decision_chain: [
    { lane: 1, name: 'atlas-tools...', result: 'NONE', duration_ms: 145 },
    { lane: 2, name: 'trace_atlas_packet...', result: 'NONE', duration_ms: 89 },
    { lane: 3, name: 'trace_kag_multi_lane...', result: 'NONE', duration_ms: 234 },
    { lane: 4, name: 'trace_topology...', result: 'NONE', duration_ms: 156 },
    { lane: 5, name: 'trace_atlas_suggest...', result: 'NONE', duration_ms: 78 },
    { lane: 6, name: 'rg_fallback', result: 'NONE', duration_ms: 312 }
  ],
  prompt: 'File scripts/atlas/audit-concept-evidence-spine.mjs not found in any retrieval lane. Create? (y/n)'
};

// decision.proceed_to_create === null means awaiting approval
```

#### Step 4: Agent prompts user

```
File scripts/atlas/audit-concept-evidence-spine.mjs not found in any retrieval lane. Create? (y/n)
> yes
```

#### Step 5: User approval recorded

```javascript
const approval = await recordUserApprovalDecision(
  filePath,
  true,  // user said yes
  decision.decision_chain
);

// approval = {
//   proceed_to_create: true,
//   action: 'file_creation_approved',
//   reason: null
// }
```

#### Step 6: Audit log entry

```json
{"timestamp":"2026-06-13T21:47:03Z","action":"file_creation_approved","candidate":"scripts/atlas/audit-concept-evidence-spine.mjs","all_lanes_complete":true,"all_returned_none":true,"user_approved":true,"created_at":"2026-06-13T21:47:04Z","decision_chain":[...]}
```

#### Step 7: File created

```javascript
// Agent now calls write() with confidence
const result = await write({
  file_path: 'scripts/atlas/audit-concept-evidence-spine.mjs',
  content: generatedCode
});
```

---

## Scenario 2: File Already Exists (Lane 1 HIT)

### User Input

```
Create scripts/atlas/audit-env-contract.mjs to check environment variables.
```

### Agent Flow

#### Lane 1 executes and HITS

```javascript
// Lane 1: atlas-tools_find_source_refs
// Query: source_ref LIKE 'scripts/atlas/audit-env-contract%'
// Result: HIT
// Hit Match: "scripts/atlas/audit-env-contract.mjs"
//   (found in atlas_packets table as existing packet)
// Status: STOP (don't continue to Lanes 2-6)
```

#### Decision returned

```javascript
const decision = {
  proceed_to_create: false,
  reason: 'file_exists_in_lanes',
  stopped_at_lane: 1,
  decision_chain: [
    { 
      lane: 1, 
      name: 'atlas-tools_find_source_refs', 
      result: 'HIT',
      hit: 'scripts/atlas/audit-env-contract.mjs',
      duration_ms: 145 
    }
  ],
  all_lanes_complete: false,
  ready_for_creation: false
};
```

#### Agent response

```javascript
if (!decision.proceed_to_create) {
  console.log(`Blocked: File already exists at Lane ${decision.stopped_at_lane}`);
  console.log(`Reason: ${decision.reason}`);
  console.log(`Existing file: ${decision.decision_chain[0].hit}`);
  
  // Agent should reuse the existing packet, not create new file
  // Suggestion: "I found scripts/atlas/audit-env-contract.mjs already exists. 
  //              Let me examine its implementation and suggest improvements instead."
}
```

#### Audit log entry

```json
{"timestamp":"2026-06-13T21:47:12Z","action":"file_creation_denied","candidate":"scripts/atlas/audit-env-contract.mjs","reason":"file_exists_in_lanes","stopped_at_lane":1,"all_lanes_complete":false,"ready_for_creation":false,"decision_chain":[{"lane":1,"name":"atlas-tools_find_source_refs","result":"HIT","hit":"scripts/atlas/audit-env-contract.mjs","duration_ms":145}]}
```

---

## Scenario 3: Lane 6 Finds File on Filesystem

### User Input

```
Create scripts/atlas/audit-higher-hop-enrichment.mjs for measuring supernode pressure.
```

### Agent Flow

#### Lanes 1-5 return NONE

```javascript
// Lane 1, 2, 3, 4, 5 all execute and return NONE
// (file not in atlas_packets, trace system, KAG, topology, or suggestions)
// Continue to Lane 6
```

#### Lane 6 rg search finds file

```javascript
// Lane 6: rg_fallback
// Query: rg 'audit.*higher.*hop|audit-higher-hop' src/ scripts/
// Result: HIT
// Hit Match: "scripts/atlas/audit-higher-hop-enrichment.mjs:1:#!/usr/bin/env node"
//   (found on filesystem via rg)
// Status: STOP (file exists on disk, don't create)
```

#### Decision returned

```javascript
const decision = {
  proceed_to_create: false,
  reason: 'file_exists_in_lanes',
  stopped_at_lane: 6,
  decision_chain: [
    { lane: 1, name: 'atlas-tools...', result: 'NONE', duration_ms: 145 },
    { lane: 2, name: 'trace_atlas_packet...', result: 'NONE', duration_ms: 89 },
    { lane: 3, name: 'trace_kag_multi_lane...', result: 'NONE', duration_ms: 234 },
    { lane: 4, name: 'trace_topology...', result: 'NONE', duration_ms: 156 },
    { lane: 5, name: 'trace_atlas_suggest...', result: 'NONE', duration_ms: 78 },
    {
      lane: 6,
      name: 'rg_fallback',
      result: 'HIT',
      hit: 'scripts/atlas/audit-higher-hop-enrichment.mjs:1:#!/usr/bin/env node',
      duration_ms: 312
    }
  ],
  all_lanes_complete: true,
  ready_for_creation: false
};
```

#### Agent response

```javascript
// Lane 6 HIT means file exists on filesystem
// Don't create new file, reuse existing

console.log(`File already exists at Lane ${decision.stopped_at_lane} (filesystem)`);
console.log(`Path: ${decision.decision_chain[5].hit}`);

// Agent can now:
// 1. Read the existing file
// 2. Suggest improvements
// 3. Add missing functionality
// Instead of creating a duplicate
```

---

## Scenario 4: Timeout at Lane 4 (Neo4j unavailable)

### User Input

```
Create scripts/atlas/seed-neo4j-used-concept-edges.mjs to seed Neo4j relationships.
```

### Agent Flow

#### Lanes 1-3 execute OK

```javascript
// Lane 1: 145ms, NONE
// Lane 2: 89ms, NONE
// Lane 3: 234ms, NONE
// All good, continue
```

#### Lane 4 times out

```javascript
// Lane 4: trace_topology_search_4d
// Query: directory='scripts/atlas' + SOM topology
// Status: TIMEOUT (Neo4j not responding)
// Duration: 5001ms (exceeded 5s timeout)
// Error: "Neo4j connection refused"
// Status: STOP (don't continue to Lanes 5-6)
```

#### Decision returned

```javascript
const decision = {
  proceed_to_create: false,
  reason: 'retrieval_error',
  stopped_at_lane: 4,
  decision_chain: [
    { lane: 1, name: 'atlas-tools...', result: 'NONE', duration_ms: 145 },
    { lane: 2, name: 'trace_atlas_packet...', result: 'NONE', duration_ms: 89 },
    { lane: 3, name: 'trace_kag_multi_lane...', result: 'NONE', duration_ms: 234 },
    {
      lane: 4,
      name: 'trace_topology_search_4d',
      status: 'TIMEOUT',
      error: 'Neo4j connection refused',
      duration_ms: 5001
    }
  ],
  all_lanes_complete: false,
  ready_for_creation: false
};
```

#### Agent response

```javascript
if (decision.reason === 'retrieval_error') {
  const failedLane = decision.decision_chain[decision.stopped_at_lane - 1];
  console.error(`Retrieval error at Lane ${decision.stopped_at_lane}:`);
  console.error(`Service: ${failedLane.name}`);
  console.error(`Error: ${failedLane.error}`);
  console.error(`\nRecommendations:`);
  console.error(`1. Check if Neo4j is running`);
  console.error(`2. Verify Neo4j credentials in .env`);
  console.error(`3. Retry the request after service recovery`);
  
  // Do NOT create file when retrieval fails
  // File creation is blocked until all lanes are accessible
}
```

#### Audit log entry

```json
{"timestamp":"2026-06-13T21:47:20Z","action":"file_creation_denied","candidate":"scripts/atlas/seed-neo4j-used-concept-edges.mjs","reason":"retrieval_error","stopped_at_lane":4,"all_lanes_complete":false,"ready_for_creation":false,"decision_chain":[...{"lane":4,"name":"trace_topology_search_4d","status":"TIMEOUT","error":"Neo4j connection refused","duration_ms":5001}]}
```

---

## Scenario 5: User Declines Approval

### User Input

```
Create scripts/atlas/test-placeholder.mjs as a temporary test file.
```

### Agent Flow

#### Lanes 1-6 all return NONE

```javascript
// All lanes execute, all return NONE
const decision = {
  proceed_to_create: null,
  ready_for_creation: true,
  prompt: 'File scripts/atlas/test-placeholder.mjs not found in any retrieval lane. Create? (y/n)'
};
```

#### User prompt

```
File scripts/atlas/test-placeholder.mjs not found in any retrieval lane. Create? (y/n)
> no
```

#### User decline recorded

```javascript
const approval = await recordUserApprovalDecision(
  filePath,
  false,  // user said no
  decision.decision_chain
);

// approval = {
//   proceed_to_create: false,
//   action: 'file_creation_denied',
//   reason: 'user_declined'
// }
```

#### Audit log entry

```json
{"timestamp":"2026-06-13T21:47:30Z","action":"file_creation_denied","candidate":"scripts/atlas/test-placeholder.mjs","all_lanes_complete":true,"all_returned_none":true,"user_approved":false,"reason":"user_declined","decision_chain":[...]}
```

#### Agent response

```javascript
console.log(`File creation declined by user`);
console.log(`No file created.`);

// Agent can suggest alternatives:
// "I found no existing implementation. Some alternatives:
//  1. Review related files first (existing audit scripts)
//  2. Create a proper feature, not a temporary file
//  3. Ask if you'd like me to generate a complete implementation instead"
```

---

## Scenario 6: Non-Atlas Scope (Policy Skipped)

### User Input

```
Create src/lib/utils/test-helper.ts for unit testing.
```

### Agent Flow

#### Policy check

```javascript
const decision = await enforceNoPlaceholderPolicy(
  'src/lib/utils/test-helper.ts'
);

// Check: Is this in Atlas scope?
const isAtlasScoped = ATLAS_SCOPES.some(
  scope => 'src/lib/utils/test-helper.ts'.includes(scope)
);
// Result: false (not in scripts/atlas, docs/atlas, or sveltekit-frontend/scripts/atlas)

// Decision: Policy does NOT apply
```

#### Decision returned

```javascript
const decision = {
  proceed_to_create: true,           // File creation ALLOWED
  reason: 'outside_atlas_scope',      // Policy skipped
  decision_skipped: true
};
```

#### Agent behavior

```javascript
if (decision.decision_skipped) {
  console.log(`Policy skipped: ${decision.reason}`);
  console.log(`File creation allowed without retrieval check`);
  
  // Agent can proceed directly to write() without policy enforcement
}
```

#### Audit log entry

```json
{"timestamp":"2026-06-13T21:47:40Z","action":"non_atlas_scoped","candidate":"src/lib/utils/test-helper.ts","proceed_to_create":true,"reason":"outside_atlas_scope"}
```

---

## Audit Log Analysis

### Sample 30-second window (6 attempts)

```json
{"timestamp":"2026-06-13T21:47:03Z","action":"file_creation_approved","candidate":"scripts/atlas/audit-concept-evidence-spine.mjs","all_lanes_complete":true,"all_returned_none":true,"user_approved":true,"created_at":"2026-06-13T21:47:04Z","decision_chain":[...]}
{"timestamp":"2026-06-13T21:47:12Z","action":"file_creation_denied","candidate":"scripts/atlas/audit-env-contract.mjs","reason":"file_exists_in_lanes","stopped_at_lane":1,"all_lanes_complete":false,"ready_for_creation":false,"decision_chain":[...]}
{"timestamp":"2026-06-13T21:47:18Z","action":"file_creation_denied","candidate":"scripts/atlas/audit-higher-hop-enrichment.mjs","reason":"file_exists_in_lanes","stopped_at_lane":6,"all_lanes_complete":true,"ready_for_creation":false,"decision_chain":[...]}
{"timestamp":"2026-06-13T21:47:20Z","action":"file_creation_denied","candidate":"scripts/atlas/seed-neo4j-used-concept-edges.mjs","reason":"retrieval_error","stopped_at_lane":4,"all_lanes_complete":false,"ready_for_creation":false,"decision_chain":[...]}
{"timestamp":"2026-06-13T21:47:30Z","action":"file_creation_denied","candidate":"scripts/atlas/test-placeholder.mjs","all_lanes_complete":true,"all_returned_none":true,"user_approved":false,"reason":"user_declined","decision_chain":[...]}
{"timestamp":"2026-06-13T21:47:40Z","action":"non_atlas_scoped","candidate":"src/lib/utils/test-helper.ts","proceed_to_create":true,"reason":"outside_atlas_scope"}
```

### Statistics from this window

```
Total attempts:     6
Approved:           1 (16.7%)
Denied (exists):    2 (33.3%)
Denied (error):     1 (16.7%)
Denied (user):      1 (16.7%)
Skipped (out of scope): 1 (16.7%)

Average decision time: 750ms
Slowest: Lane 6 rg search (312ms)
Fastest: Lane 1 atlas-tools (145ms)
```

---

## Key Takeaways

1. **Fail-Fast**: Agent stops immediately when file is found (Lane 1 HIT = ~150ms total time)
2. **User Approval Only When Needed**: All lanes NONE → user prompt (no artificial blocking)
3. **Transparent**: Audit log shows every decision, stopping point, and reason
4. **Robust**: Timeout at any lane stops chain, reports error, blocks creation
5. **Flexible**: Non-Atlas files bypass policy, allowing normal file creation outside Parent Atlas

The policy works **with** the agent, not against it. It prevents mistakes without blocking legitimate file creation.
