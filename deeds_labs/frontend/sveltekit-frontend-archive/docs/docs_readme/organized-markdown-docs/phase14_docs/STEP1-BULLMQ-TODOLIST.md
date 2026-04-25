# Step 1: BullMQ Integration & Complete Pipeline - Todo List

## ✅ Foundation Complete
- **NPM Dependencies**: Fixed @langchain/community conflicts with --legacy-peer-deps
- **Batch Script Issues**: Created COMPLETE-AI-SYSTEM-STARTUP-FIXED.bat without BOM encoding
- **Go Server**: Consolidated main.go is built and running successfully on port 8080
- **Database Connections**: PostgreSQL + pgvector and Ollama are connected and operational

## 🎯 Phase 1: Core Infrastructure (Priority 1)

### 1. Neo4j Database Setup
**Status**: Pending  
**Steps**:
- Install Neo4j Desktop from https://neo4j.com/download/
- Create new database with password
- Start database and verify connection at `neo4j://localhost:7687`
- Note credentials: `neo4j` / `your-password`

### 2. Neo4j Go Driver Integration
**Status**: Pending  
**Dependencies**: Neo4j Database Setup  
**Steps**:
```bash
cd go-microservice
go get github.com/neo4j/neo4j-go-driver/v5
```
- Add Neo4j driver import to main.go
- Implement `initNeo4j()` connection function
- Add `logActivityInGraph()` for entity logging
- Test connection in health endpoint

### 3. BullMQ Worker Implementation
**Status**: Pending  
**Location**: `workers/document-processor.worker.js`  
**Requirements**:
- Connect to Redis on localhost:6379
- Process document jobs from 'document-processing' queue
- Call Go microservice `/process-document` endpoint
- Handle job completion/failure states
- Log progress to console

**Template**:
```javascript
const { Worker } = require('bullmq');
const axios = require('axios');

const worker = new Worker('document-processing', async job => {
    const { documentId, content, options } = job.data;
    
    try {
        const response = await axios.post('http://localhost:8080/process-document', {
            document_id: documentId,
            content: content,
            document_type: 'evidence',
            options: options
        });
        
        return response.data;
    } catch (error) {
        throw new Error(`Processing failed: ${error.message}`);
    }
}, { connection: { host: 'localhost', port: 6379 } });
```

## 🎯 Phase 2: API Integration (Priority 2)

### 4. SvelteKit API Endpoints
**Status**: Pending  
**Location**: `sveltekit-frontend/src/routes/api/`  
**Endpoints to Create**:

#### `/api/documents/upload/+server.ts`
- Accept file uploads
- Extract text content
- Dispatch BullMQ job
- Return job ID for tracking

#### `/api/jobs/[id]/+server.ts`  
- Get job status from BullMQ
- Return processing state and results

#### `/api/jobs/+server.ts`
- List all jobs for user
- Filter by status (pending, processing, completed, failed)

**Template Structure**:
```typescript
// +server.ts
import { json } from '@sveltejs/kit';
import { Queue } from 'bullmq';

const documentQueue = new Queue('document-processing', {
    connection: { host: 'localhost', port: 6379 }
});

export async function POST({ request }) {
    const { content, documentType } = await request.json();
    
    const job = await documentQueue.add('process-document', {
        documentId: crypto.randomUUID(),
        content,
        options: {
            extract_entities: true,
            generate_summary: true,
            assess_risk: true,
            generate_embedding: true,
            store_in_database: true
        }
    });
    
    return json({ jobId: job.id, status: 'queued' });
}
```

### 5. WebSocket Real-time Bridge
**Status**: Pending  
**Location**: `ws-server.js` (root directory)  
**Purpose**: Bridge Redis pub/sub to WebSocket clients  
**Features**:
- Listen to Redis channels for job updates
- Broadcast to connected SvelteKit clients
- Handle user-specific channels
- Reconnection logic

## 🎯 Phase 3: Frontend Enhancement (Priority 3)

### 6. shadcn-svelte Setup
**Status**: Pending  
**Steps**:
```bash
cd sveltekit-frontend
npx shadcn-svelte@latest init
npx shadcn-svelte@latest add button dialog card progress
```
- Configure theme and styling
- Add components to existing pages
- Test component integration

### 7. XState State Machines
**Status**: Pending  
**Machines to Create**:

#### Document Processing Machine
```typescript
const documentMachine = createMachine({
  id: 'documentProcessor',
  initial: 'idle',
  states: {
    idle: { on: { UPLOAD: 'uploading' } },
    uploading: { on: { SUCCESS: 'processing', ERROR: 'failed' } },
    processing: { on: { COMPLETE: 'complete', FAILED: 'failed' } },
    complete: { type: 'final' },
    failed: { on: { RETRY: 'uploading' } }
  }
});
```

#### Report Generation Machine
- Multi-step wizard state management
- Progress tracking
- Error handling and recovery

## 🎯 Phase 4: Production Setup (Priority 4)

### 8. PM2 Process Management
**Status**: Pending  
**File**: `ecosystem.config.js`  
**Processes**:
- SvelteKit frontend server
- BullMQ document processor worker
- WebSocket bridge server
- Optional: Go microservice (if not using direct binary)

### 9. WebSocket Store Integration
**Status**: Pending  
**Location**: `sveltekit-frontend/src/lib/stores/websocket.ts`  
**Features**:
- Reactive connection state
- Message handling
- Automatic reconnection
- Type-safe message parsing

## 🎯 Phase 5: End-to-End Testing (Priority 5)

### 10. Complete Pipeline Test
**Status**: Pending  
**Test Flow**:
1. Upload PDF through SvelteKit UI
2. Verify BullMQ job creation
3. Monitor worker processing
4. Confirm Go microservice receives request
5. Check database storage (PostgreSQL + Neo4j)
6. Verify WebSocket real-time updates
7. Validate UI state changes

**Success Criteria**:
- ✅ File upload completes
- ✅ Job appears in BullMQ dashboard
- ✅ Worker processes without errors
- ✅ Document data stored in databases
- ✅ Real-time updates reach frontend
- ✅ UI reflects completion state

## 📋 Implementation Order

### Week 1: Infrastructure
1. ✅ Neo4j setup and Go driver integration
2. ✅ BullMQ worker implementation
3. ✅ Basic SvelteKit API endpoints

### Week 2: Integration
4. ✅ WebSocket bridge server
5. ✅ Frontend WebSocket store
6. ✅ shadcn-svelte component setup

### Week 3: State Management & Testing
7. ✅ XState machine implementation
8. ✅ PM2 configuration
9. ✅ End-to-end pipeline testing

## 🔧 Environment Variables Required

```bash
# Go Microservice
PORT=8080
OLLAMA_URL=http://localhost:11434
DATABASE_URL=postgresql://legal_admin:LegalAI2024!@localhost:5432/legal_ai_db
REDIS_URL=localhost:6379
NEO4J_URI=neo4j://localhost:7687
NEO4J_USER=neo4j
NEO4J_PASS=your-neo4j-password
QDRANT_URL=http://localhost:6333

# Node.js Services
REDIS_HOST=localhost
REDIS_PORT=6379
WEBSOCKET_PORT=8081
GO_MICROSERVICE_URL=http://localhost:8080
```

## 🚀 Getting Started

Run this command to begin Phase 1:

```bash
# Verify current status
curl http://localhost:8080/health

# Start with Neo4j setup
echo "1. Download Neo4j Desktop"
echo "2. Create database with password"
echo "3. Run: cd go-microservice && go get github.com/neo4j/neo4j-go-driver/v5"
echo "4. Implement Neo4j connection in main.go"
```

## 📊 Success Metrics

- **Performance**: Document processing < 30 seconds
- **Reliability**: 99%+ job completion rate
- **Real-time**: WebSocket updates < 1 second latency
- **User Experience**: Seamless state transitions in UI
- **Scalability**: Handle 10+ concurrent document uploads

This roadmap transforms your legal AI system from a working prototype into a production-ready, real-time document processing platform with comprehensive state management and monitoring.