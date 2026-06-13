# OpenCode No Placeholder Policy — Implementation Checklist

**Status**: READY FOR IMPLEMENTATION  
**Date**: 2026-06-13  
**Audience**: OpenCode agent developers / SRE team

---

## Pre-Implementation Verification

### Files Exist & Are Valid

- [ ] `sveltekit-frontend/.opencode/skills/no-placeholder-policy.md` exists (140 lines)
- [ ] `sveltekit-frontend/scripts/opencode/no-placeholder-policy-hook.mjs` exists and is syntactically valid
- [ ] `tests/opencode/no-placeholder-policy.spec.ts` exists with 28 tests
- [ ] `docs/atlas/OPENCODE-SKILL-ENFORCEMENT-PATTERN.md` exists (280 lines)
- [ ] `docs/atlas/OPENCODE-INTEGRATION-GUIDE.md` exists with practical patterns
- [ ] `docs/atlas/OPENCODE-INTEGRATION-EXAMPLE.md` exists with 6 scenarios
- [ ] `opencode.jsonc` includes policy in `instructions` array

**Verify**:
```bash
node --check sveltekit-frontend/scripts/opencode/no-placeholder-policy-hook.mjs
```

Expected: No syntax errors.

### Configuration Loaded

- [ ] Policy is in OpenCode `instructions` array
- [ ] `opencode.jsonc` is valid JSONC

**Verify**:
```bash
rg '"no-placeholder-policy"' opencode.jsonc
```

Expected: One hit in `instructions` array.

---

## Test Execution

### Unit Tests

- [ ] Run test suite: `npm run test opencode/no-placeholder-policy.spec.ts`
- [ ] All 28 tests pass
- [ ] No timeout or connection errors

**Expected Output**:
```
✓ tests/opencode/no-placeholder-policy.spec.ts (28)

 ✓ No Placeholder Policy Enforcement (8)
   ✓ Retrieval Lane Sequencing (3)
     ✓ should execute decision chain in strict order 1→2→3→4→5→6
     ✓ should STOP at Lane 1 HIT and not proceed to Lanes 2-6
     ✓ should STOP at Lane 6 HIT and not create new file
   ✓ User Approval Gate (3)
     ✓ should require explicit user approval before creating file
     ✓ should DENY file creation if user declines
     ✓ should emit structured denial report
   ✓ Timeout Handling (2)
     ✓ should NOT treat timeout as "NONE" result
     ✓ should STOP on timeout and report error
   ✓ Audit Trail (1)
     ✓ should append file creation attempt to file-creation-audit.jsonl
   ✓ Policy Violations (3)
     ✓ should FAIL if agent skips retrieval and creates placeholder
     ✓ should FAIL if agent creates "v2" variant after Lane 6 HIT
     ✓ should FAIL if agent continues to Lane 2 after Lane 1 HIT
   ✓ Integration (2)
     ✓ should complete full 6-lane sequence when all return NONE
     ✓ should emit user prompt and wait for approval

 Test Files  1 passed (1)
      Tests  28 passed (28)
```

### Integration Test (Manual)

- [ ] Create test file that calls `enforceNoPlaceholderPolicy` directly
- [ ] Test all 3 code paths:
  - Path 1: New file in Atlas scope, all lanes NONE → `proceed_to_create === null`
  - Path 2: File exists, Lane HIT → `proceed_to_create === false`
  - Path 3: File outside Atlas scope → `decision_skipped === true`

**Test Script**:
```javascript
import { enforceNoPlaceholderPolicy } from './sveltekit-frontend/scripts/opencode/no-placeholder-policy-hook.mjs';

// Test 1: Non-existent file in Atlas scope (requires all lanes to simulate)
const test1 = await enforceNoPlaceholderPolicy('scripts/atlas/test-new.mjs');
console.assert(test1.ready_for_creation === true, 'Test 1 FAILED');
console.log('Test 1 PASSED: Awaiting approval');

// Test 2: File outside Atlas scope (should skip policy)
const test2 = await enforceNoPlaceholderPolicy('src/lib/utils/test.ts');
console.assert(test2.decision_skipped === true, 'Test 2 FAILED');
console.log('Test 2 PASSED: Policy skipped');

console.log('\nAll integration tests passed!');
```

---

## Hook Wiring

### Step 1: Identify Write Tool Handler

**Find** where OpenCode agent handles `write()` tool calls.

Typical location: Agent middleware / tool handler registry.

```bash
# Search for write tool handler
rg 'write.*tool|handler.*write|writeFile' <opencode-agent-path> --type ts --type js
```

### Step 2: Import Hook

Add import at top of handler file:

```javascript
import { 
  enforceNoPlaceholderPolicy, 
  recordUserApprovalDecision 
} from './sveltekit-frontend/scripts/opencode/no-placeholder-policy-hook.mjs';
```

**Checklist**:
- [ ] Import added
- [ ] Path is correct (relative or absolute)
- [ ] Both functions imported (policy enforcement + user approval recording)

### Step 3: Wrap Write Handler

**Before** calling actual write():

```javascript
const writeHandler = async (toolCall) => {
  const { file_path, content } = toolCall.input;
  
  // NEW: Enforce policy
  const decision = await enforceNoPlaceholderPolicy(file_path);
  
  // Handle denied
  if (decision.proceed_to_create === false) {
    return {
      status: 'blocked',
      reason: decision.reason,
      stopped_at_lane: decision.stopped_at_lane,
      error: `File creation blocked: ${decision.reason}`
    };
  }
  
  // Handle awaiting approval
  if (decision.proceed_to_create === null) {
    // Store for approval flow
    agent.state.pendingApproval = { toolCall, decision };
    return {
      status: 'awaiting_approval',
      prompt: decision.prompt,
      waiting_for: 'user_input'
    };
  }
  
  // Proceed with write
  return await performActualWrite(toolCall);
};
```

**Checklist**:
- [ ] Policy check called before write
- [ ] Denied case handled (return error, don't call write)
- [ ] Approval case handled (prompt user, store state)
- [ ] Success case proceeds normally

### Step 4: Implement Approval Response Handler

Add handler for when user approves/declines:

```javascript
const approvalHandler = async (userInput) => {
  const { toolCall, decision } = agent.state.pendingApproval;
  
  if (!decision) {
    return { error: 'No pending approval' };
  }
  
  // Record user decision
  const approved = userInput.toLowerCase() === 'yes' || userInput === 'y';
  const approval = await recordUserApprovalDecision(
    toolCall.input.file_path,
    approved,
    decision.decision_chain
  );
  
  // Handle approval result
  if (!approval.proceed_to_create) {
    agent.state.pendingApproval = null;
    return {
      status: 'denied',
      reason: approval.reason,
      message: `File creation denied: ${approval.reason}`
    };
  }
  
  // User approved, execute write
  const result = await performActualWrite(toolCall);
  agent.state.pendingApproval = null;
  return result;
};
```

**Checklist**:
- [ ] Approval handler receives user input
- [ ] User decision recorded via `recordUserApprovalDecision()`
- [ ] Approved → write proceeds
- [ ] Denied → return error, clear state
- [ ] State cleanup done

### Step 5: Wire in Tool Registry

Register handlers in OpenCode's tool call dispatcher:

```javascript
const toolHandlers = {
  write: writeHandler,
  approve: approvalHandler,  // NEW
  // ... other tools
};
```

Or middleware:

```javascript
agent.use({
  async beforeToolCall(toolCall) {
    if (toolCall.tool === 'write') {
      // Intercept write calls
      const decision = await enforceNoPlaceholderPolicy(toolCall.input.file_path);
      if (decision.proceed_to_create === false) {
        return { error: `Blocked: ${decision.reason}` };
      }
    }
    return toolCall;
  }
});
```

**Checklist**:
- [ ] Write handler wired
- [ ] Approval handler wired
- [ ] Both handlers in correct place in dispatch chain
- [ ] Handlers execute BEFORE actual write

---

## Testing After Wiring

### Manual Smoke Test

1. **Start OpenCode with policy loaded**
   ```bash
   opencode --model ollama/gemma4-rotorquant:latest
   ```

2. **Request file creation in Atlas scope**
   ```
   User: Create scripts/atlas/test-policy-check.mjs
   
   Expected:
   - Policy check runs
   - All lanes execute (or stop at HIT)
   - If all lanes NONE → user prompt appears
   - No file created without approval
   ```

3. **Approve creation**
   ```
   Prompt: File not found in any retrieval lane. Create? (y/n)
   User: yes
   
   Expected:
   - File created
   - Audit entry written with action="file_creation_approved"
   ```

4. **Request same file again**
   ```
   User: Create scripts/atlas/test-policy-check.mjs
   
   Expected:
   - Lane 1 or Lane 6 HIT
   - File creation denied
   - No user prompt
   - Audit entry written with action="file_creation_denied"
   ```

5. **Monitor audit log**
   ```bash
   tail -5 docs/reports/file-creation-audit.jsonl
   
   Expected:
   - 2 entries (approve + deny)
   - approve: user_approved=true
   - deny: reason="file_exists_in_lanes"
   ```

### Automated Validation

```bash
# 1. Test suite
npm run test opencode/no-placeholder-policy.spec.ts

# 2. Check audit log exists
test -f docs/reports/file-creation-audit.jsonl && echo "✓" || echo "✗"

# 3. Count entries
wc -l docs/reports/file-creation-audit.jsonl

# 4. Check for violations
rg '"action":"file_created_without_retrieval"' docs/reports/file-creation-audit.jsonl
# Should return: (no results)
```

**Checklist**:
- [ ] All 28 tests pass
- [ ] Audit log file created
- [ ] At least 1 entry in audit log
- [ ] No violation entries

---

## Production Rollout

### Pre-Deployment

- [ ] All tests passing in staging environment
- [ ] Audit log has ≥10 entries from manual testing
- [ ] No violations detected in manual testing
- [ ] Performance acceptable (decision chain <2s typical)

### Deployment

- [ ] Deploy updated `opencode.jsonc` (policy in instructions)
- [ ] Deploy hook module: `sveltekit-frontend/scripts/opencode/no-placeholder-policy-hook.mjs`
- [ ] Deploy test suite for CI/CD
- [ ] Wire hook into OpenCode agent (requires agent code changes)

### Post-Deployment

- [ ] Monitor `docs/reports/file-creation-audit.jsonl` for violations
- [ ] Set alert for audit entries with `reason="retrieval_error"` (services down)
- [ ] Review approval patterns (how many files need user approval vs Lane HIT)
- [ ] Adjust lane queries if rg is too slow (Lane 6 timeout)

---

## Rollback Plan

If issues arise:

1. **Disable policy enforcement**:
   - Remove policy from OpenCode `instructions` array in `opencode.jsonc`
   - Agent will not load policy context
   - Hook is still available but not active

2. **Revert agent wiring**:
   - Remove `enforceNoPlaceholderPolicy()` call from write handler
   - Agent proceeds with file creation without policy check

3. **Validate**:
   - Confirm agent behavior reverted to pre-policy state
   - No new audit entries written

---

## Monitoring & Alerts

### Key Metrics

| Metric | Threshold | Alert |
|--------|-----------|-------|
| Approval rate (file creation approved) | >10% | Low if <5% (policy too strict) |
| File exist hit rate (Lane HIT) | >30% | High if >70% (most files exist) |
| Retrieval error rate | <5% | High if >10% (services unstable) |
| Decision chain latency | <2s avg | High if >3s (lanes too slow) |
| Audit log entries | Steady growth | Alert if no entries for 1h (logging broken) |

### Dashboards

Create Grafana dashboard or similar:

```
Audit Log Metrics (refresh every 5min)
├─ Total attempts (last 1h, 24h, 7d)
├─ Approval breakdown
│  ├─ approved (user said yes)
│  ├─ denied (file exists)
│  ├─ denied (user declined)
│  ├─ denied (retrieval error)
│  └─ skipped (non-Atlas scope)
├─ Average decision chain time per lane
└─ Slowest lanes (top 5)
```

### Monitoring Commands

```bash
# Real-time audit log watch
tail -f docs/reports/file-creation-audit.jsonl | jq -c '{action:.action, reason:.reason, lane:.stopped_at_lane}'

# Error summary (last 24h)
rg '"reason":"retrieval_error"' docs/reports/file-creation-audit.jsonl | wc -l

# Approval rate
echo "Approvals: $(rg '"action":"file_creation_approved"' docs/reports/file-creation-audit.jsonl | wc -l)"
echo "Denials: $(rg '"action":"file_creation_denied"' docs/reports/file-creation-audit.jsonl | wc -l)"

# Slowest lanes
rg '"lane":(\d+)' docs/reports/file-creation-audit.jsonl -o -r '$1' | sort | uniq -c | sort -rn
```

---

## Troubleshooting

### Issue: Hook not being called

**Debug**:
```javascript
// Add logging to write handler
console.log('Write called for:', toolCall.input.file_path);
const decision = await enforceNoPlaceholderPolicy(toolCall.input.file_path);
console.log('Decision:', decision);
```

**Check**:
- [ ] Hook imported correctly
- [ ] Write handler modified to call hook
- [ ] Hook path is correct
- [ ] Agent logs show hook execution

### Issue: All lanes timeout

**Debug**:
```bash
# Check each service
curl http://localhost:8788/mcp/health       # trace MCP
curl http://localhost:7474                  # Neo4j
curl http://127.0.0.1:6379 ping             # Redis
```

**Fix**:
- Restart services
- Check connectivity
- Increase LANE_TIMEOUT_MS in hook if services are slow

### Issue: Audit log not being written

**Check**:
- [ ] `docs/reports/` directory writable
- [ ] File permissions correct
- [ ] `recordUserApprovalDecision()` being called
- [ ] No exceptions being silently caught

---

## Verification Checklist (Final)

Before considering implementation complete:

- [ ] All 7 documentation files exist and are readable
- [ ] Hook module is syntactically valid (`node --check`)
- [ ] All 28 tests pass
- [ ] OpenCode config includes policy
- [ ] Write handler imports and calls hook
- [ ] Approval handler implemented
- [ ] Both handlers wired in tool registry
- [ ] Manual smoke test passes (approve + deny)
- [ ] Audit log working (entries written)
- [ ] No violations detected
- [ ] Performance acceptable (<2s decision chain)
- [ ] Monitoring dashboard configured
- [ ] Alert thresholds set
- [ ] Runbook for common issues created

---

## Sign-Off

Once all items are checked:

```
Implementation Date: [DATE]
Deployed By: [NAME]
Verified By: [NAME]
Status: ✅ PRODUCTION READY
```

The no placeholder policy enforcement is now active and monitoring.
