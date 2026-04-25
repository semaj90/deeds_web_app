# Message Queue System for Legal AI

## Overview

This directory contains message queue configurations for inter-service communication in the Legal AI system.

## Components

### NATS (Primary)
- **Purpose**: Lightweight, high-performance messaging
- **Port**: 4222
- **Configuration**: `nats/nats-server.conf`
- **Status**: ✅ Implementation ready

### RabbitMQ (Alternative)
- **Purpose**: Traditional message broker with routing
- **Port**: 5672 (AMQP), 15672 (Management)
- **Configuration**: `rabbitmq/rabbitmq.conf`
- **Status**: ⏳ Placeholder for future use

## Quick Start

### NATS Server
```powershell
# Start NATS server
cd nats
./start-nats.bat

# Or use the Go coordinator
./nats-coordinator.exe
```

### RabbitMQ (Alternative)
```powershell
# Start RabbitMQ
cd rabbitmq
./start-rabbitmq.bat
```

## Integration Status

- ✅ NATS coordinator implementation
- ✅ Go-based message coordination
- ✅ Service registry and load balancing
- ⏳ RabbitMQ integration (placeholder)
- ⏳ Message queue clustering

## Message Types

1. **Document Processing**: `legal.document.process`
2. **Vector Indexing**: `legal.vector.index`
3. **AI Analysis**: `legal.ai.analyze`
4. **System Alerts**: `legal.system.alert`
5. **Memory Management**: `legal.memory.cleanup`
6. **Service Health**: `legal.service.health`

## Next Steps

1. Deploy NATS server cluster
2. Configure message persistence
3. Set up monitoring and alerting
4. Implement dead letter queues
