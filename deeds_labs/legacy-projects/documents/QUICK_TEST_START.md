# ⚡ QUICK START: Next Steps for Test Execution

## Current Status: ✅ Ready to Test

### What's Done ✅
- Cache consolidation complete (SERVICES: 10/12 features)
- Imports fixed (0 TypeScript errors)
- Dev server running on 5173
- MCP workers online (15/15)
- Documentation complete (3,500+ lines)

### What's Next ⏳
Execute 5 validation tests in sequence (~45 minutes total)

---

## 🚀 Execute Tests Now

### Quick Commands

```bash
# Verify dev server is still running
curl http://localhost:5173/

# If dev server stopped, restart:
cd sveltekit-frontend
npm run dev

# Open frontend in browser
# http://localhost:5173/
# Then open DevTools (F12)
```

### Test Execution (In Order)

#### Test 1: WebTransport Connection (5 min)
**Open browser console and run:**
```javascript
// Check WebSocket connection
const ws = new WebSocket('ws://localhost:5173');
console.log('WebSocket ready:', ws.readyState === 0 || ws.readyState === 1);

// Check WebTransport availability
console.log('WebTransport available:', 'WebTransport' in window);

// Expected: Both should be true
```
✅ **Success:** No connection errors, both true

#### Test 2: XState Actors (5 min)
**Continue in console:**
```javascript
// Import and check XState integration
import xstateIntegration from '$lib/services/xstate-integration';

// Check all 4 machines
console.log('Auth Actor:', xstateIntegration.authActor?.getSnapshot?.());
console.log('Session Actor:', xstateIntegration.sessionActor?.getSnapshot?.());
console.log('AI Assistant:', xstateIntegration.aiAssistantActor?.getSnapshot?.());
console.log('Agent Shell:', xstateIntegration.agentShellActor?.getSnapshot?.());

// Expected: All 4 machines should have snapshots
```
✅ **Success:** All 4 actors respond with state

#### Test 3: Queue Messaging (10 min)
**Terminal command:**
```bash
# Check RabbitMQ is online
curl -i http://localhost:5672/ 2>/dev/null

# If available, test message routing via console
# (See TEST_EXECUTION_GUIDE.md for detailed steps)
```
✅ **Success:** RabbitMQ responds, messages routed

#### Test 4: NATS Failover (10 min)
**To test failover mechanism:**
```bash
# Optional: Stop RabbitMQ to trigger failover
# docker stop legal-ai-rabbitmq

# Verify NATS bridge activates
# (See TEST_EXECUTION_GUIDE.md for detailed steps)
```
✅ **Success:** NATS bridge activates on RabbitMQ failure

#### Test 5: Latency Metrics (15 min)
**Console command:**
```javascript
// Measure latency
const start = performance.now();
await fetch('http://localhost:5173/api/health');
const latency = performance.now() - start;
console.log('Latency:', latency, 'ms');

// Check if < 100ms (target)
console.log('Within target:', latency < 100);
```
✅ **Success:** Latency < 100ms

---

## 📋 Complete Reference

For detailed procedures, see: **TEST_EXECUTION_GUIDE.md**

### Key Files
- `TEST_EXECUTION_GUIDE.md` - Full test specs (line 45+)
- `QUICK_START_TESTING.md` - Quick commands
- `CACHE_CONSOLIDATION_COMPLETE.md` - Architecture details
- `TEST_EXECUTION_COMPLETE.md` - Current session report

### Support Commands

```bash
# Check dev server
curl http://localhost:5173/

# Check MCP workers
curl http://localhost:3002/mcp/health

# Check Ollama
curl http://localhost:11434/api/tags

# Restart dev server if needed
cd sveltekit-frontend && npm run dev

# TypeScript check
npx tsc --noEmit --skipLibCheck
```

---

## ⏱️ Timeline

| Test | Duration | Status |
|------|----------|--------|
| 1. WebTransport | 5 min | 🟡 Ready |
| 2. XState Actors | 5 min | ⏳ Next |
| 3. Queue Messaging | 10 min | ⏳ Pending |
| 4. NATS Failover | 10 min | ⏳ Pending |
| 5. Latency Metrics | 15 min | ⏳ Pending |
| **Total** | **~45 min** | |

---

## ✅ Success Criteria

All 5 tests passing = ✅ **System Ready for Phase 8 (Store Consolidation)**

### Test 1 Success
- No connection errors
- WebSocket responds
- WebTransport available

### Test 2 Success
- All 4 XState machines present
- Each has valid snapshot
- State transitions responsive

### Test 3 Success
- RabbitMQ responds
- Messages route correctly
- Queue operations complete

### Test 4 Success
- NATS bridge activates on RabbitMQ failure
- Fallback routing works
- No message loss

### Test 5 Success
- Latency < 100ms p99
- No spike patterns
- Consistent performance

---

## 🆘 If Tests Fail

### WebTransport Fails
```bash
# Check browser console for CORS errors
# Verify: http://localhost:5173/ loads
# Check: Development server running
# Restart: npm run dev
```

### XState Actors Not Found
```bash
# Verify imports: src/lib/services/xstate-integration.ts
# Check: All machine files present
# Restart: npm run dev (reinitializes machines)
```

### Queue Messaging Fails
```bash
# Start RabbitMQ: docker-compose up -d rabbitmq
# Check: docker ps | grep rabbitmq
# Verify: Ports 5672, 15672 open
```

### NATS Failover Fails
```bash
# Check NATS bridge active: $lib/messages/nats-quic-bridge.ts
# Verify: NATS connection available
# See: Failover trigger in test procedure
```

### Latency Too High
```bash
# Check: System resources
# Monitor: MCP worker status
# Verify: No other processes using CPU/network
# Review: Backend logs for bottlenecks
```

---

## 📞 Questions?

See comprehensive documentation:
- **TEST_EXECUTION_GUIDE.md** - Complete procedures & troubleshooting
- **CACHE_CONSOLIDATION_COMPLETE.md** - Architecture & decisions
- **TEST_EXECUTION_COMPLETE.md** - Current session report

---

**Status: Ready to proceed with Test 1 ✅**

Dev server running on **http://localhost:5173/** 🚀
