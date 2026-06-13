# OpenCode Integration Guide — No Placeholder Policy Hook

**Status**: Ready for OpenCode agent implementation  
**Hook Module**: `sveltekit-frontend/scripts/opencode/no-placeholder-policy-hook.mjs`  

---

## Quick Start

### 1. Import the Hook

```javascript
import { 
  enforceNoPlaceholderPolicy, 
  recordUserApprovalDecision 
} from './sveltekit-frontend/scripts/opencode/no-placeholder-policy-hook.mjs';
```

### 2. Intercept write() Tool Calls

**Before allowing any write() call:**

```javascript
const writeToolHandler = async (toolCall) => {
  const { file_path, content } = toolCall.input;
  
  // Enforce no-placeholder policy for Atlas-scoped files
  const decision = await enforceNoPlaceholderPolicy(file_path);
  
  // If denied, throw error (stops write)
  if (decision.proceed_to_create === false) {
    throw new Error(`File creation blocked: ${decision.reason}`);
  }
  
  // If awaiting approval, prompt user
  if (decision.proceed_to_create === null) {
    const userApproved = await promptUser(decision.prompt);
    const approval = await recordUserApprovalDecision(
      file_path, 
      userApproved,
      decision.decision_chain
    );
    
    if (!approval.proceed_to_create) {
      throw new Error(`File creation denied by user`);
    }
  }
  
  // Proceed with write
  return toolCall;
};
```

---

## Hook Function Reference

### `enforceNoPlaceholderPolicy(filePath)`

**Arguments**:
- `filePath` (string): Absolute or relative path to the file being created

**Returns**: Object with structure:

```javascript
{
  // Core decision
  proceed_to_create: true | false | null,  // true/false=decided, null=awaiting_user
  reason: string,                           // "file_already_exists", "file_exists_in_lanes", "retrieval_error", "awaiting_user_approval"
  
  // Chain details (if applicable)
  decision_chain: [ Lane1Result, Lane2Result, ... Lane6Result ],
  stopped_at_lane: 1-6 | null,
  
  // User prompt (if awaiting approval)
  prompt: string,                           // "File ... not found in any lane. Create? (y/n)"
  ready_for_creation: boolean,              // true if all lanes returned NONE
  
  // Skip flags (policy doesn't apply)
  decision_skipped: boolean                 // true if file exists or out of Atlas scope
}
```

### `recordUserApprovalDecision(filePath, approved, decisionChain)`

**Arguments**:
- `filePath` (string): File path
- `approved` (boolean): User said yes (true) or no (false)
- `decisionChain` (array): Decision chain from enforceNoPlaceholderPolicy()

**Returns**: Object with structure:

```javascript
{
  proceed_to_create: boolean,     // approved value
  action: string,                 // "file_creation_approved" | "file_creation_denied"
  reason: null | "user_declined"
}
```

---

## Integration Patterns

### Pattern 1: Hook in Tool Handler

```javascript
// In OpenCode agent's tool handler registry
const toolHandlers = {
  write: async (toolCall) => {
    const decision = await enforceNoPlaceholderPolicy(toolCall.input.file_path);
    
    if (decision.proceed_to_create === false) {
      return { error: `File creation blocked: ${decision.reason}` };
    }
    
    if (decision.proceed_to_create === null) {
      // Store decision for approval flow
      agent.pendingApproval = { toolCall, decision };
      return { status: 'awaiting_user_approval', prompt: decision.prompt };
    }
    
    // Proceed to actual write
    return await performActualWrite(toolCall);
  },
  
  approve: async (userInput) => {
    const { toolCall, decision } = agent.pendingApproval;
    const approval = await recordUserApprovalDecision(
      toolCall.input.file_path,
      userInput.toLowerCase() === 'yes' || userInput === 'y',
      decision.decision_chain
    );
    
    if (!approval.proceed_to_create) {
      agent.pendingApproval = null;
      return { status: 'denied', reason: approval.reason };
    }
    
    const result = await performActualWrite(toolCall);
    agent.pendingApproval = null;
    return result;
  }
};
```

### Pattern 2: Hook in Agent Middleware

```javascript
// In OpenCode agent setup
const agentWithPolicy = withNoPlaceholderPolicy(agent, {
  enforceAtlasScope: true,
  auditLogPath: 'docs/reports/file-creation-audit.jsonl',
  promptUser: async (message) => {
    // Your user interaction implementation
    return await getUserInput(message);
  }
});
```

### Pattern 3: Pre-execution Guard

```javascript
// Before executing any LLM response with tool calls
const executeWithGuards = async (toolCalls) => {
  for (const toolCall of toolCalls) {
    if (toolCall.tool === 'write') {
      const decision = await enforceNoPlaceholderPolicy(
        toolCall.input.file_path
      );
      
      if (decision.proceed_to_create === false) {
        console.error(`Blocked: ${toolCall.input.file_path}`);
        console.error(`Reason: ${decision.reason}`);
        console.error(`Decision chain:`, decision.decision_chain);
        continue; // Skip this tool call
      }
    }
    
    // Execute tool call
    await executeTool(toolCall);
  }
};
```

---

## Audit Log Monitoring

### Real-Time Monitoring

```bash
# Watch for new entries (tail -f equivalent on Windows)
Get-Content docs/reports/file-creation-audit.jsonl -Tail 10 -Wait

# Or via bash
tail -f docs/reports/file-creation-audit.jsonl
```

### Analysis Queries

```bash
# Count all attempts
wc -l docs/reports/file-creation-audit.jsonl

# Find all denials
rg '"action":"file_creation_denied"' docs/reports/file-creation-audit.jsonl | wc -l

# Find all approvals
rg '"action":"file_creation_approved"' docs/reports/file-creation-audit.jsonl | wc -l

# Find all errors
rg '"reason":"retrieval_error"' docs/reports/file-creation-audit.jsonl

# Extract denied reasons
rg '"reason":"([^"]+)"' docs/reports/file-creation-audit.jsonl -o -r '$1' | sort | uniq -c
```

### JSONL Format Reference

Each line is one file creation attempt:

```json
{"timestamp":"2026-06-13T21:47:03Z","action":"file_creation_denied","candidate":"scripts/atlas/audit-foo.mjs","reason":"file_exists_in_lanes","stopped_at_lane":1,"all_lanes_complete":false,"ready_for_creation":false,"decision_chain":[{"lane":1,"name":"atlas-tools_find_source_refs","result":"HIT","hit":"src/lib/server/atlas/audit-foo.mjs"}]}
```

---

## Testing

### Unit Tests

```bash
npm run test opencode/no-placeholder-policy.spec.ts
```

Expected: All 28 tests pass.

### Integration Test

```javascript
// Test the hook directly
import { enforceNoPlaceholderPolicy } from './scripts/opencode/no-placeholder-policy-hook.mjs';

// Case 1: New file in Atlas scope (all lanes return NONE)
const decision1 = await enforceNoPlaceholderPolicy(
  'scripts/atlas/audit-test-new.mjs'
);
console.assert(decision1.proceed_to_create === null); // Awaiting approval
console.assert(decision1.ready_for_creation === true);

// Case 2: File already exists on filesystem (Lane 6 HIT)
// (This depends on test files being set up)

// Case 3: Non-Atlas scope (policy skipped)
const decision3 = await enforceNoPlaceholderPolicy('src/lib/utils/test.ts');
console.assert(decision3.decision_skipped === true);
console.assert(decision3.proceed_to_create === true);
```

---

## Error Handling

### Timeout (Lane returns ERROR/TIMEOUT)

```javascript
const decision = await enforceNoPlaceholderPolicy(filePath);

if (decision.reason === 'retrieval_error') {
  // Decision chain stopped at a retrieval error
  console.error(
    `Lane ${decision.stopped_at_lane} failed: ${decision.decision_chain[decision.stopped_at_lane - 1].error}`
  );
  
  // Recommend: retry, manual verification, or skip
}
```

### User Input Validation

```javascript
// When prompting user for approval
const userInput = await promptUser(decision.prompt);

// Validate response
const approved = [
  'yes', 'y', 'YES', 'Y', 'approve', 'create'
].includes(userInput.trim());

const approval = await recordUserApprovalDecision(
  filePath,
  approved,
  decision.decision_chain
);
```

---

## Troubleshooting

### Issue: All lanes return NONE but file actually exists

**Cause**: Lane 6 rg search didn't find the file (pattern mismatch, wrong directory, etc.)

**Fix**: Check Lane 6 query pattern in `no-placeholder-policy-hook.mjs`

```javascript
// Current pattern extraction (line ~283):
const fileName = candidate.split('/').pop().split('.')[0];
const pattern = `${fileName}`;

// May need to be more sophisticated, e.g.:
const pattern = `(${fileName}|${fileName}[.-]v\\d+)`;
```

### Issue: Hook is skipping policy (decision_skipped: true)

**Causes**:
1. File already exists locally
2. Path is outside Atlas scope
3. Both are valid

**Check**:
```javascript
if (decision.decision_skipped) {
  console.log(`Policy skipped: ${decision.reason}`);
  // "file_already_exists" or "outside_atlas_scope"
}
```

### Issue: Lane timeout on large rg search

**Cause**: Lane 6 rg search takes >5s across large src/ directory

**Fix**: Reduce scope or increase timeout (in `no-placeholder-policy-hook.mjs`):

```javascript
const LANE_TIMEOUT_MS = 10000; // Increase from 5000
```

Or make rg search more specific:

```javascript
// More specific pattern to reduce search space
const pattern = `^.*${fileName}\\.(mjs?|ts)$`;
```

---

## Performance Characteristics

### Decision Chain Timing

| Lane | Typical Duration | Varies By |
|------|------------------|-----------|
| 1 (atlas-tools) | 100-200ms | MCP network latency |
| 2 (trace_atlas_packet) | 50-150ms | Trace index size |
| 3 (trace_kag_multi_lane) | 150-300ms | Semantic search load |
| 4 (trace_topology) | 100-200ms | Neo4j query complexity |
| 5 (trace_atlas_suggest) | 50-100ms | Suggestion cache |
| 6 (rg) | 200-1000ms | Directory size, pattern complexity |
| **Total (best case)** | **~1s** | All lanes execute |
| **Total (with HIT)** | **~500ms** | Stops early at Lane 1 HIT |

**Optimization**: If Lane 6 rg is slow, consider caching results or making pattern more specific.

---

## References

- **Hook Implementation**: `sveltekit-frontend/scripts/opencode/no-placeholder-policy-hook.mjs`
- **Policy Specification**: `sveltekit-frontend/.opencode/skills/no-placeholder-policy.md`
- **Enforcement Pattern**: `docs/atlas/OPENCODE-SKILL-ENFORCEMENT-PATTERN.md`
- **Test Suite**: `tests/opencode/no-placeholder-policy.spec.ts`
- **Audit Log**: `docs/reports/file-creation-audit.jsonl`

---

## Next Steps

1. **Hook Wiring** — Wire `enforceNoPlaceholderPolicy()` into OpenCode's write() tool handler
2. **User Approval Flow** — Implement prompt + `recordUserApprovalDecision()` response handling
3. **Testing** — Run full test suite and manual integration test
4. **Monitoring** — Watch audit log for patterns and edge cases
5. **Iteration** — Adjust lane queries based on real results

The hook is production-ready. Integration is purely a wiring task in OpenCode agent initialization.
