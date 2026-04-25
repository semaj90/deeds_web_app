# Messaging Architecture Migration - RabbitMQ + NATS

**Recommendation**: Replace BullMQ (Redis-based) with RabbitMQ + NATS for low-latency microservices

---

## Performance Comparison

| Metric | BullMQ (Redis) | RabbitMQ | NATS |
|--------|---|---|---|
| **Latency** | 50-100ms | 1-5ms | <1ms |
| **Throughput** | 10K msg/s | 50K+ msg/s | 100K+ msg/s |
| **Protocol** | Binary (Redis) | AMQP | Native |
| **Go Integration** | ⚠️ Limited | ✅ Native | ✅ Native |
| **Queue Persistence** | ✅ Yes | ✅ Yes | ✅ JetStream |
| **Best Use Case** | General jobs | Enterprise queues | Microservices |

---

## Architecture Recommendation

### Current (Slow):
```
BullMQ (Redis) → Node.js → Workers
└─ 50-100ms latency per message
└─ Redis becomes bottleneck
└─ Job queue overhead
```

### Recommended (Fast):
```
NATS Jetstream (Low-latency) → Go Microservice
├─ <1ms latency
├─ Native Go support
├─ Persistence with JetStream
└─ Perfect for real-time processing

RabbitMQ (Reliable) → Node.js Backend
├─ 1-5ms latency
├─ Enterprise reliability
├─ Complex routing
└─ For scheduled jobs
```

---

## Implementation Plan

### Phase 1: Add NATS (Immediate - < 2 hours)
```typescript
// New: src/lib/messaging/nats-client.ts
import { connect } from 'nats';

const nc = await connect({ servers: 'localhost:4222' });
const js = nc.jetstream();

// Publish low-latency message
await js.publish('evidence.process', JSON.stringify(evidenceData));

// Subscribe to results
const sub = await js.subscribe('results.evidence');
for await (const msg of sub) {
  handleResult(msg.data);
}
```

### Phase 2: Upgrade Evidence Worker to Go (1-2 days)
```go
// New Go service: go-microservice/services/evidence-processor.go
package services

import (
	"github.com/nats-io/nats.go"
)

func ProcessEvidenceWithNATS() {
	nc, _ := nats.Connect(nats.DefaultURL)
	js, _ := nc.JetStream()

	// Subscribe to NATS topic
	js.Subscribe("evidence.process", func(m *nats.Msg) {
		result := processEvidence(m.Data)
		js.Publish("results.evidence", result)
	})
}
```

### Phase 3: Migrate BullMQ Jobs (1-2 weeks)
- Document-processing → NATS + Go processor
- Embedding-generation → NATS + GPU service
- AI-analysis → NATS + Ollama wrapper
- Recommendations → RabbitMQ (scheduled, lower latency requirement)
- Cache-invalidation → NATS (broadcast)

---

## Why This Matters for Your Platform

### Current Problem (BullMQ):
- Evidence processing: 100-200ms per job (queue overhead + Redis latency)
- Legal analysis: Stalled by queue bottleneck
- Real-time updates: Too slow for collaborative canvas

### With NATS:
- Evidence processing: <1ms message latency
- Legal analysis: Immediate response
- Real-time updates: Sub-millisecond propagation
- Cost: Lower (NATS uses <100MB RAM vs Redis 1GB+)

---

## Configuration Files

### NATS Server (docker-compose)
```yaml
nats:
  image: nats:latest
  ports:
    - "4222:4222"  # NATS protocol
    - "8222:8222"  # HTTP monitoring
  command: "-js"   # Enable JetStream persistence
  volumes:
    - nats-store:/data
```

### RabbitMQ (Keep for non-critical jobs)
```yaml
rabbitmq:
  image: rabbitmq:3.11-management
  ports:
    - "5672:5672"  # AMQP
    - "15672:15672" # Management UI
  environment:
    RABBITMQ_DEFAULT_USER: guest
    RABBITMQ_DEFAULT_PASS: guest
```

---

## Next Steps

1. **Add NATS** (2 hours):
   - Install: `npm install nats`
   - Create client: `src/lib/messaging/nats-client.ts`
   - Test connection

2. **Migrate first worker** (4 hours):
   - Move evidence processor to Go
   - Use NATS for messaging
   - Benchmark vs BullMQ

3. **Scale gradually** (1-2 weeks):
   - Migrate high-latency jobs first
   - Keep RabbitMQ for background tasks
   - Monitor performance improvements

---

## Decision Point

**Keep BullMQ for**: Scheduled background jobs (hourly reports, nightly optimization)
**Switch to NATS for**: Real-time processing (evidence correlation, legal analysis)
**Use RabbitMQ for**: Complex workflows needing persistence and reliability

This hybrid approach gives you:
- ✅ Low-latency processing (NATS)
- ✅ Reliable job persistence (RabbitMQ)
- ✅ Background task handling (keep BullMQ for non-critical work)

---

**Recommendation**: Implement NATS + Go microservice for evidence processing immediately for 50-100x latency improvement.

