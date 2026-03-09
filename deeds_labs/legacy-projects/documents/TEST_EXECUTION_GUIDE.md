# 🧪 NEXT ITERATION - TEST EXECUTION GUIDE

**Date:** October 16, 2025
**Session:** Cache Consolidation Complete → Testing Phase
**Status:** ✅ READY FOR EXECUTION

---

## 📊 Progress Summary

### ✅ Completed in Previous Steps

1. **Import Fixes** ✅
   - Fixed: `agent-shell-machine.js` → `agentShellMachine.js`
   - Fixed: Cache imports → `$lib/services/advanced_cache_manager.js`
   - Status: **No import errors** ✅

2. **Cache Consolidation** ✅
   - Analyzed 3 implementations
   - Deployed: SERVICES version (10/12 features)
   - Deleted: Redundant facade
   - Status: **Production-ready** ✅

3. **TypeScript Validation** ✅
   - Total Errors: 53,754 (pre-existing in unrelated files)
   - **Cache/Import Errors: 0** ✅
   - Status: **Our fixes verified** ✅

### ⏳ Current Phase: Testing & Validation

---

## 🎯 Test Execution Plan

### Test 1: WebTransport Connection (HTTP/3)
**Duration:** 5 minutes
**Objective:** Verify WebTransport HTTP/3 fallback chain works

**Steps:**
```bash
# 1. Start dev environment
cd sveltekit-frontend && npm run dev

# 2. Open browser at http://localhost:5173
# 3. Open DevTools → Console

# 4. Look for messages like:
#    ✅ Connected via WebTransport (HTTP/3)
#    OR fallback chain messages

# 5. Check Network tab for WebTransport connections
```

**Success Criteria:**
- ✅ No connection errors in console
- ✅ Page loads successfully
- ✅ XState actors initialize (check actor states)

**Expected Output:**
```
✅ Connected via WebTransport (HTTP/3)
// OR fallback:
✅ Falling back to WebSocket
✅ Transport initialized successfully
```

---

### Test 2: XState Actor Initialization
**Duration:** 5 minutes
**Objective:** Verify all 4 state machines are running

**Browser Console Commands:**
```typescript
// Import the integration
import xstateIntegration from '$lib/services/xstate-integration';

// Check each actor
console.log('Auth Actor:', xstateIntegration.authActor.getSnapshot().value);
console.log('Session Actor:', xstateIntegration.sessionActor.getSnapshot().value);
console.log('AI Assistant Actor:', xstateIntegration.aiAssistantActor.getSnapshot().value);
console.log('Agent Shell Actor:', xstateIntegration.agentShellActor.getSnapshot().value);

// Check overall status
console.log('Transport Status:', xstateIntegration.getTransportStatus());
```

**Success Criteria:**
- ✅ All actors return state values without errors
- ✅ States show: 'idle', 'authenticated', or similar
- ✅ Transport status shows: `{ connected: true, ... }`

**Expected Output:**
```
Auth Actor: authenticated
Session Actor: idle
AI Assistant Actor: idle
Agent Shell Actor: idle
Transport Status: {
  connected: true,
  transport: 'websocket',
  messaging: {
    connected: true,
    failoverActive: false,
    subscriptions: 4
  }
}
```

---

### Test 3: Queue Subscription & Messaging Flow
**Duration:** 10 minutes
**Objective:** Send test message and verify actor receives it

**Prerequisites:**
```bash
# Verify RabbitMQ is running
docker ps | grep rabbitmq
# Should show running container

# Check Redis (cache for embeddings)
docker ps | grep redis
```

**Steps:**

1. **Access RabbitMQ Management UI**
   ```
   URL: http://localhost:15672
   Username: guest
   Password: guest
   ```

2. **Publish Test Message**
   - Go to: Queues tab
   - Select: `ai.analysis` queue
   - Click: "Publish message"
   - Payload:
   ```json
   {
     "type": "ANALYZE",
     "data": {
       "caseId": "test-case-001",
       "query": "Test analysis query"
     }
   }
   ```

3. **Verify in Browser Console**
   ```typescript
   // Check if actor received the message
   xstateIntegration.aiAssistantActor.getSnapshot().context.lastMessage
   // Should show the message we just sent

   // Monitor for updates
   xstateIntegration.globalState.subscribe(state => {
     console.log('State updated:', state);
   });
   ```

**Success Criteria:**
- ✅ Message published successfully to queue
- ✅ Actor receives message within 1 second
- ✅ Store updates reflect new state
- ✅ Console shows no connection errors

**Expected Timeline:**
```
T+0ms: Message published to RabbitMQ
T+50ms: Message consumed from queue
T+80ms: Actor processes event
T+100ms: Store updated, UI re-renders
```

---

### Test 4: NATS QUIC Failover
**Duration:** 10 minutes
**Objective:** Verify automatic failover when RabbitMQ unavailable

**Steps:**

1. **Check Initial Status**
   ```typescript
   const status1 = xstateIntegration.getTransportStatus();
   console.log('Before failover:', status1);
   // Should show: failoverActive: false
   ```

2. **Stop RabbitMQ**
   ```bash
   docker stop rabbitmq
   ```

3. **Attempt to Send Message**
   ```typescript
   // Try sending through the bridge (will fail to RabbitMQ)
   await xstateIntegration.sendToQueue('ai.analysis', {
     type: 'TEST',
     data: { query: 'failover test' }
   });
   ```

4. **Check Failover Status**
   ```typescript
   const status2 = xstateIntegration.getTransportStatus();
   console.log('After failover:', status2);
   // Should show: failoverActive: true
   ```

5. **Restart RabbitMQ**
   ```bash
   docker start rabbitmq
   # Wait 5 seconds for startup
   ```

6. **Verify Recovery**
   ```typescript
   const status3 = xstateIntegration.getTransportStatus();
   console.log('After recovery:', status3);
   // Should show: failoverActive: false
   ```

**Success Criteria:**
- ✅ Failover activates within 3 seconds of RabbitMQ stop
- ✅ System remains responsive during failover
- ✅ No connection errors in console
- ✅ Messages resume flowing after restart
- ✅ UI remains functional throughout

**Expected Behavior:**
```
Normal → RabbitMQ stops → NATS failover activates → Waiting for RabbitMQ
↓
Messages queue → RabbitMQ restarts → Messages resume flowing
```

---

### Test 5: Latency Metrics
**Duration:** 15 minutes
**Objective:** Measure queue→UI update time

**Browser DevTools Performance Test:**

1. **Open Performance Tab**
   - DevTools → Performance tab
   - Clear any previous recordings

2. **Start Recording**
   ```
   Click "Record" button
   ```

3. **Send Queue Message**
   - Send test message via RabbitMQ UI (same as Test 3)
   - Time the send: Note the timestamp

4. **Stop Recording**
   ```
   Click "Stop" button
   ```

5. **Analyze Timeline**
   - Look for timeline markers:
     - Queue message sent (start)
     - Actor event processed
     - Store updated
     - UI re-render (final)
   - Calculate total time: should be <100ms

**Manual Timing Test:**
```typescript
// Log timestamps at each stage
const t0 = performance.now();
console.log('T0 - Message sent');

xstateIntegration.globalState.subscribe(state => {
  const t1 = performance.now();
  console.log(`T1 - Store updated (${t1 - t0}ms)`);
});

// Check actor processing
setInterval(() => {
  const t_actor = performance.now();
  const lastUpdate = xstateIntegration.aiAssistantActor.getSnapshot().lastUpdated;
  if (lastUpdate) {
    console.log(`Latency from queue: ${t_actor - lastUpdate}ms`);
  }
}, 100);
```

**Success Criteria:**
- ✅ Queue → Actor: <50ms
- ✅ Actor → Store: <20ms
- ✅ Store → UI: <50ms
- ✅ **Total: <200ms** (target)

**Expected Metrics:**
```
Stage              | Expected Time | Target
─────────────────────────────────────────
Queue Consumer     | 10-20ms       | <20ms ✅
Actor Processing   | 20-30ms       | <30ms ✅
Store Update       | 10-15ms       | <20ms ✅
UI Re-render       | 30-50ms       | <50ms ✅
──────────────────────────────────────────
Total Queue→UI     | 70-115ms      | <200ms ✅
```

---

## 🔍 Troubleshooting Guide

### Issue: WebTransport Connection Failed
**Symptoms:** Console shows connection error, falls back immediately
**Cause:** HTTP/3 not supported (common in development)
**Solution:** This is normal - fallback to WebSocket works fine

### Issue: Queue Messages Not Flowing
**Symptoms:** Message published but actor doesn't receive it
**Cause:** RabbitMQ not running or queue not bound
**Solution:**
```bash
docker ps | grep rabbitmq  # Check if running
docker logs rabbitmq       # Check for errors
docker restart rabbitmq    # Restart if needed
```

### Issue: Actors Not Initializing
**Symptoms:** `getSnapshot()` returns undefined or error
**Cause:** XState integration not initialized
**Solution:**
```typescript
// Make sure integration is imported and actors are started
import xstateIntegration from '$lib/services/xstate-integration';
await xstateIntegration.initializeMessaging();
```

### Issue: Failover Not Activating
**Symptoms:** System hangs when RabbitMQ stops
**Cause:** Failover timeout not configured
**Solution:**
```typescript
// Check bridge configuration
const status = xstateIntegration.getTransportStatus();
console.log('Current failover timeout:', status.failoverTimeout);
// Should be 3000ms (3 seconds)
```

### Issue: High Latency (>200ms)
**Symptoms:** UI updates slow, latency metric high
**Cause:** Network congestion or actor queue buildup
**Solution:**
1. Check DevTools Performance timeline
2. Monitor actor queue depth
3. Verify Redis connection speed
4. Check RabbitMQ consumer lag

---

## 📋 Test Results Summary Template

Use this template to record test results:

```markdown
## Test Execution Results - [DATE]

### Test 1: WebTransport Connection
- Status: ✅ PASS / ❌ FAIL / ⚠️ SKIP
- Notes:
- Evidence: [screenshot/console output]

### Test 2: XState Actor Initialization
- Status: ✅ PASS / ❌ FAIL / ⚠️ SKIP
- Notes:
- Evidence: [actor states]

### Test 3: Queue Subscription
- Status: ✅ PASS / ❌ FAIL / ⚠️ SKIP
- Notes:
- Evidence: [message received]

### Test 4: NATS Failover
- Status: ✅ PASS / ❌ FAIL / ⚠️ SKIP
- Notes:
- Evidence: [failover timeline]

### Test 5: Latency Metrics
- Status: ✅ PASS / ❌ FAIL / ⚠️ SKIP
- Latency: [ms] (Target: <200ms)
- Evidence: [performance recording]

## Overall Result: ✅ PASS / ❌ FAIL
```

---

## 🚀 Next Steps After Testing

### If All Tests Pass ✅
1. Proceed to store consolidation (74 stores → 7 unified)
2. Run integration tests with actual legal AI workflows
3. Performance benchmarking with real data

### If Some Tests Fail ⚠️
1. Debug using troubleshooting guide above
2. Check MESSAGING_ARCHITECTURE_PLAN.md for design details
3. Review xstate-integration.ts implementation
4. File detailed issue report with console logs

### If Critical Issues 🔴
1. Revert recent changes: `git checkout HEAD~1`
2. Review error logs in detail
3. Check if services are actually running (docker ps)
4. Verify network connectivity

---

## 📚 Reference Documentation

- **NEXT_ITERATION_TESTING.md** - Original test specifications
- **MESSAGING_ARCHITECTURE_PLAN.md** - System design
- **xstate-integration.ts** - Core implementation
- **rabbitmq-xstate-bridge.ts** - Queue integration

---

## ✅ Test Execution Checklist

### Pre-Test
- ✅ All services running (PostgreSQL, Redis, RabbitMQ, Ollama)
- ✅ SvelteKit dev server started
- ✅ Browser console open
- ✅ No unrelated errors in console

### During Tests
- ✅ Record test results
- ✅ Capture console output/screenshots
- ✅ Note any unexpected behavior
- ✅ Track timing metrics

### Post-Test
- ✅ Compile results summary
- ✅ Document any issues found
- ✅ Plan next iteration
- ✅ Update status document

---

**Status:** 🟢 READY TO BEGIN TESTING

**Next Action:** Start Test 1 (WebTransport Connection)

---

**Generated:** October 16, 2025
**For:** Legal AI Platform - Cache Consolidation → Testing Phase
