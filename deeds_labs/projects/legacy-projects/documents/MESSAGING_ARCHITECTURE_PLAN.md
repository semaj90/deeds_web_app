# Messaging Architecture Refactor Plan

## Current Status

### ✅ Fixed This Session
1. **xstate-integration.ts** - Type mismatches resolved (4 errors fixed)
2. **webtransport-service.ts** - Corrupted exports cleaned
3. **ollama-local-llm.ts** - Added missing methods
4. **5 other files** - Various syntax fixes

### 📊 Remaining TypeScript Errors
- **Total Errors**: ~54K+ (widespread across 200+ files - mostly in /src/lib/services)
- **Critical Blockers**:
  - ai-service-orchestrator.ts (10 errors - AIProvider casting)
  - search/+server.ts (11 errors - XState v5 generics)
  - gemma-embedding-service.ts (84 errors)
  - Many other files with cascading import issues

### 🏗️ Existing Infrastructure (Already in Codebase)

#### RabbitMQ Integration ✅
- **Location**: `src/lib/server/rabbitmq.ts`
- **Status**: Working implementation
- **Queues Configured**:
  - `evidence.process` - For document processing
  - `ai.analysis` - For AI analysis tasks
  - `ai.embedding` - For embedding generation
  - `notification.email` - For email notifications
  - `notification.webhook` - For webhook notifications

#### NATS Integration ✅
- **Location**: `src/lib/server/search/nats-quic-search-service.ts`
- **Status**: Implemented with QUIC bridge
- **Subjects**:
  - `legal.ai.process` - Legal AI processing
  - `system.health.check` - Health monitoring
  - Other coordination subjects

#### WebTransport Service ✅
- **Location**: `src/lib/services/webtransport-service.ts`
- **Status**: Fully implemented with fallback chain
- **Fallback Chain**:
  1. WebTransport (HTTP/3 with QUIC) - Ultra-low latency
  2. WebSocket - Fallback for older browsers
  3. HTTP long-polling - Final fallback

#### Go Microservices ✅
- **QUIC-NATS Bridge**: `quic-nats-bridge/main.go` (Port 4233)
- **NATS HTTP Bridge**: `nats-bridge-http.go` (event routing)
- **Legal Services**: ports 8080-8136 (37 microservices total)

---

## Proposed Architecture

### 1. Messaging Layer
```
┌─────────────────────────────────────────────────────────────┐
│           Frontend (Svelte Components)                       │
└────────────────────┬────────────────────────────────────────┘
                     │
         ┌───────────┴────────────┐
         ▼                        ▼
   ┌──────────────┐      ┌──────────────────┐
   │ XState Actor │      │ WebTransport     │
   │  Reference   │      │ Service          │
   └──────┬───────┘      └────────┬─────────┘
          │                       │
    ┌─────▼─────────────┬─────────▼─────────┐
    │                   │                   │
    ▼                   ▼                   ▼
┌─────────────┐   ┌──────────────┐   ┌────────────┐
│ RabbitMQ    │   │ Redis Pub/Sub│   │ WebSocket  │
│ (Primary)   │   │ (Cache)      │   │ (Fallback) │
└────┬────────┘   └──────────────┘   └────────────┘
     │
     ├─ Evidence Processing Queue
     ├─ AI Analysis Queue
     ├─ Embedding Generation Queue
     └─ Notification Queues

     Fallback to:
     ▼
┌─────────────────────────────────┐
│ NATS QUIC Server (port 4233)   │
│ Ultra-low latency fallback      │
└─────────────────────────────────┘
```

### 2. XState Integration Points
- **Primary**: RabbitMQ topic subscriptions → XState actors
- **Fallback**: NATS QUIC subjects → XState actors
- **Transport**: WebTransport with HTTP fallback

### 3. Event Flow
```
Queue Message
     ↓
RabbitMQ Consumer (xstate-integration.ts)
     ↓
Map to XState Event
     ↓
Send to Appropriate Actor (auth, session, aiAssistant, agentShell)
     ↓
Actor State Updates Svelte Store
     ↓
Component Re-renders with New State
```

---

## Implementation Roadmap

### Phase 1: Core Messaging (THIS TASK)
1. ✅ Fix xstate-integration.ts type errors
2. ⏳ Fix ai-service-orchestrator.ts provider casting
3. ⏳ Fix search/+server.ts machine typing
4. ⏳ Get TypeScript compilation to 0 errors (or <10)
5. ⏳ Start SvelteKit dev server

### Phase 2: RabbitMQ Primary Integration
```typescript
// src/lib/services/rabbitmq-xstate-bridge.ts (NEW)
import { rabbitmq } from '$lib/server/rabbitmq';
import { xstateIntegration } from './xstate-integration';

export class RabbitMQXStateBridge {
  async subscribe(queue: string, actor: ActorRef) {
    rabbitmq.subscribe(queue, async (msg) => {
      actor.send({ type: msg.type, payload: msg.data });
    });
  }
}

// Usage in xstate-integration.ts
const bridge = new RabbitMQXStateBridge();
await bridge.subscribe('ai.analysis', aiAssistantActor);
await bridge.subscribe('evidence.process', sessionActor);
```

### Phase 3: NATS QUIC Fallback
```typescript
// src/lib/services/nats-quic-fallback.ts (NEW)
import { natsConn } from '$lib/server/nats-connection';

export class NatsQuicFallback {
  async connectWithFallback(queue: string, handler: Function) {
    try {
      // Try RabbitMQ first
      return await rabbitmqBridge.subscribe(queue, handler);
    } catch (e) {
      console.warn('RabbitMQ unavailable, falling back to NATS QUIC');
      // Fall back to NATS QUIC
      const subject = this.mapQueueToNatsSubject(queue);
      natsConn.subscribe(subject, handler);
    }
  }

  private mapQueueToNatsSubject(queue: string): string {
    return `legal.${queue.replace('_', '.')}`;
  }
}
```

### Phase 4: WebTransport Integration (Already exists!)
- WebTransport already configured in `webtransport-service.ts`
- Already has fallback chain: WebTransport → WebSocket → HTTP
- Just needs wiring into xstate-integration

### Phase 5: End-to-End Testing
- Test RabbitMQ → XState flow
- Test NATS QUIC fallback
- Test WebTransport client → server
- Verify UI updates in real-time

---

## Queue to Actor Mapping

| RabbitMQ Queue | NATS Subject | XState Actor | Event Type |
|---|---|---|---|
| `evidence.process` | `legal.evidence.process` | sessionActor | `PROCESS_EVIDENCE` |
| `ai.analysis` | `legal.ai.analysis` | aiAssistantActor | `ANALYZE` |
| `ai.embedding` | `legal.ai.embedding` | aiAssistantActor | `GENERATE_EMBEDDING` |
| `notification.email` | `legal.notification.email` | sessionActor | `SEND_NOTIFICATION` |
| `notification.webhook` | `legal.notification.webhook` | sessionActor | `WEBHOOK_EVENT` |

---

## Files to Create/Modify

### New Files
- `src/lib/services/rabbitmq-xstate-bridge.ts` - RabbitMQ consumer
- `src/lib/services/nats-quic-fallback.ts` - NATS fallback wrapper
- `src/lib/services/messaging-orchestrator.ts` - Unified messaging API

### Modified Files
- `src/lib/services/xstate-integration.ts` - Add RabbitMQ subscription logic
- `src/lib/services/webtransport-service.ts` - (Already good, just wire it in)
- `src/lib/machines/aiAssistantMachine.ts` - Add queue event handlers

### Configuration
- Environment variables for queue names
- Connection retry logic
- Health check endpoints

---

## Success Criteria

✅ TypeScript compilation: 0 errors (or <10 critical)
✅ SvelteKit dev server running
✅ RabbitMQ messages flow to XState actors
✅ NATS QUIC fallback works when RabbitMQ unavailable
✅ WebTransport connects successfully
✅ UI state updates in real-time from queue messages
✅ Performance: <100ms latency for message → UI update

---

## Notes on Existing Architecture

The codebase already has **excellent** infrastructure:
- ✅ RabbitMQ Docker container running
- ✅ NATS with QUIC bridge (ultra-low latency)
- ✅ WebTransport with HTTP fallback chain
- ✅ XState v5 machines (auth, session, aiAssistant, agentShell)
- ✅ 37+ Go microservices with health checks

The main work is:
1. Fix remaining TypeScript errors
2. Wire these existing systems together
3. Test the integrated flow

This is a **consolidation task**, not a from-scratch build.
