# Node.js Cluster Architecture for Legal AI

## Overview

This directory contains Node.js cluster management for scalable Legal AI services with specialized worker processes.

## Components

### Cluster Manager
- **Purpose**: Master process coordination and load balancing
- **Port**: 3000 (HTTP), 3001 (IPC)
- **Configuration**: `cluster-manager.js`
- **Status**: ✅ Implementation ready

### Worker Types

#### Legal Document Workers
- **Purpose**: PDF processing, OCR, and text extraction
- **Instances**: 2-4 workers
- **Memory**: 512MB per worker
- **Capabilities**: Document parsing, metadata extraction

#### AI Analysis Workers  
- **Purpose**: Legal reasoning, precedent analysis
- **Instances**: 2-3 workers
- **Memory**: 1GB per worker
- **Capabilities**: LLM integration, semantic analysis

#### Vector Processing Workers
- **Purpose**: Embedding generation and similarity search
- **Instances**: 1-2 workers
- **Memory**: 256MB per worker
- **Capabilities**: Qdrant integration, vector operations

#### Database Workers
- **Purpose**: PostgreSQL operations and caching
- **Instances**: 2-3 workers
- **Memory**: 256MB per worker
- **Capabilities**: Query optimization, connection pooling

## Quick Start

### Start Cluster Manager
```powershell
# Start full cluster
./start-cluster.bat

# Start specific worker types
./start-legal-workers.bat
./start-ai-workers.bat
./start-vector-workers.bat
```

### Monitor Cluster
```powershell
# Cluster status
./cluster-status.bat

# Worker health check
./health-check.bat
```

## Architecture

```
┌─────────────────┐
│ Cluster Manager │ ← Master Process (Port 3000)
│   (Load Balance) │
└─────────┬───────┘
          │
    ┌─────┴─────┐
    │           │
┌───▼───┐   ┌───▼───┐
│Legal  │   │  AI   │
│Workers│   │Workers│
└───────┘   └───────┘
    │           │
┌───▼───┐   ┌───▼───┐
│Vector │   │  DB   │
│Workers│   │Workers│
└───────┘   └───────┘
```

## Integration Status

- ✅ Cluster manager scaffolding
- ✅ Worker type definitions
- ✅ Load balancing strategy
- ⏳ IPC message routing
- ⏳ Health monitoring
- ⏳ Auto-scaling configuration

## Message Types

1. **Document Processing**: `cluster.document.process`
2. **AI Analysis**: `cluster.ai.analyze`
3. **Vector Operations**: `cluster.vector.search`
4. **Database Queries**: `cluster.db.query`
5. **Health Checks**: `cluster.health.check`
6. **Load Balancing**: `cluster.load.balance`

## Configuration

### Worker Allocation
```javascript
const workerConfig = {
  legal: { count: 3, memory: '512MB' },
  ai: { count: 2, memory: '1GB' },
  vector: { count: 2, memory: '256MB' },
  database: { count: 3, memory: '256MB' }
};
```

### Load Balancing
- **Round Robin**: Default for document processing
- **Least Connections**: For AI analysis workers
- **CPU-based**: For vector operations
- **Memory-based**: For database workers

## Next Steps

1. Implement worker process logic
2. Set up IPC communication channels
3. Configure auto-scaling policies
4. Implement health monitoring
5. Add performance metrics collection