# Type Definitions Quick Reference

## Three Core Endpoints

### 1️⃣ Database Response Types
**Fix**: Components querying DB don't know response types
**File**: `src/lib/types/database.ts`
**Export**: `import type { ... } from '$lib/types'`

```typescript
// Entity Types
Case, Evidence, User, Document, ChatMessage, AnalysisResult

// Query Response Wrappers
QueryResult<T>           // Single item
ListQueryResult<T>       // List with pagination
CreateQueryResult<T>     // Create response
UpdateQueryResult<T>     // Update response
DeleteQueryResult        // Delete response
VectorSearchQueryResult  // Vector search results
BatchQueryResult<T>      // Batch operations

// Shorthand Types (for common entities)
CaseQueryResult, CaseListResult
EvidenceQueryResult, EvidenceListResult
UserQueryResult, UserListResult
ChatMessageQueryResult, ChatMessageListResult
DocumentQueryResult, DocumentListResult
AnalysisResultQueryResult, AnalysisResultListResult
```

**Usage**:
```typescript
import type { ListQueryResult, Case } from '$lib/types';

async function loadCases() {
  const response = await fetch('/api/cases');
  const cases: ListQueryResult<Case> = await response.json();
  // ✅ Now TypeScript knows cases.data is Case[]
}
```

---

### 2️⃣ Admin API Response Types
**Fix**: Admin endpoints return unknown response structures
**File**: `src/lib/types/admin.ts`

```typescript
// Health & Status
AdminHealthResponse      // Basic health metrics
AdminStatusResponse      // Detailed status with metrics
AdminStatus              // State info
SystemMetrics            // CPU, Memory, Disk, Network
ServiceHealth            // Individual service status
ServiceHealthStatus      // All services health

// Database
DatabaseStatus           // Connection pool, replication, extensions
DatabaseQueryStats       // Query statistics

// Cache
CacheStatus              // Redis/Memory hit rates, memory usage

// Message Queue
MessageQueueStatus       // RabbitMQ/Kafka queue info
QueueInfo                // Individual queue details

// Vector Store
VectorStoreStatus        // pgvector/FAISS/Qdrant info
IndexInfo                // Individual index details

// Configuration
AdminConfigResponse      // Full system config
AdminConfiguration       // Database, Cache, GPU, Storage, Security

// Audit Logs
AuditLogResponse         // Log entries with pagination
AuditLog                 // Individual log entry

// Admin Actions
AdminActionResponse      // Generic action response
DatabaseMaintenanceResponse  // Backup, vacuum, analyze
CacheClearResponse       // Cache clear operations
ServiceRestartResponse   // Service restart results
```

**Usage**:
```typescript
import type { AdminStatusResponse, SystemMetrics } from '$lib/types';

async function checkSystem() {
  const response = await fetch('/api/admin/status');
  const status: AdminStatusResponse = await response.json();
  // ✅ Now access: status.metrics.cpu.usage, status.services.database.status, etc.
}
```

---

### 3️⃣ Worker/Cluster State Types
**Fix**: Background workers and file uploads have unknown state
**File**: `src/lib/types/cluster.ts`

```typescript
// Cluster Status
ClusterStatusResponse    // Cluster state snapshot
ClusterMetadata          // Cluster info (ID, version, uptime)
Worker                   // Individual worker info
WorkerMetrics            // Worker performance stats
WorkerPool               // Pool of workers for a job type

// Worker Health
BackgroundWorkerStatus   // Worker status (OCR, Embedding, Autotag)
WorkerHealthCheckResponse // Health check response with summary

// Job Queue
BackgroundJob            // Job details (type, status, retries)
JobQueueStats            // Queue statistics
JobStatusResponse        // Single job response
JobBatchResponse         // Multiple jobs response

// File Upload
FileUploadJob            // Upload job with processing stages
FileUploadInfo           // File metadata
FileProcessingStage      // Individual processing stage
FileUploadResponse       // Single upload response
FileUploadBatchResponse  // Multiple uploads response
FileProcessingProgress   // Real-time progress tracking

// Specific Worker Types
OCRWorkerStatus, OCRJob              // OCR processing
EmbeddingWorkerStatus, EmbeddingJob  // Embedding generation
AutotagWorkerStatus, AutotagJob      // Auto-tagging

// Cluster Events & Commands
ClusterEvent             // Individual cluster event
ClusterEventStreamResponse // SSE stream event
ClusterCommandResponse   // Generic command response
ClusterRestartResponse   // Cluster restart result
WorkerScaleResponse      // Worker scaling result
```

**Usage**:
```typescript
import type { WorkerHealthCheckResponse, FileUploadResponse } from '$lib/types';

// Check worker health
async function checkWorkers() {
  const response = await fetch('/api/health/workers');
  const health: WorkerHealthCheckResponse = await response.json();
  health.workers.forEach(w => {
    console.log(`${w.workerName}: ${w.status}`);
  });
}

// Upload file
async function uploadFile(file: File) {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/files/upload', {
    method: 'POST',
    body: formData
  });

  const upload: FileUploadResponse = await response.json();
  // ✅ Know exact structure of upload.file, upload.uploadJob, etc.
}
```

---

## Common Patterns

### Pattern 1: Safe Data Access

```typescript
import type { ListQueryResult, Case } from '$lib/types';

const result: ListQueryResult<Case> = await fetch('/api/cases').then(r => r.json());

// ✅ Safe: TypeScript enforces check
if (result.success && result.data) {
  result.data.forEach(c => console.log(c.title));
}

// ❌ Error: TypeScript prevents access to non-existent property
// result.data[0].nonExistent;

// ✅ Check pagination
if (result.pagination?.hasMore) {
  // Load next page
}
```

### Pattern 2: Error Handling

```typescript
import type { QueryResult, Case } from '$lib/types';

const result: QueryResult<Case> = await fetch('/api/cases/123').then(r => r.json());

if (!result.success) {
  // ✅ TypeScript knows error exists if success is false
  console.error('Error:', result.error);
} else if (result.data) {
  console.log('Case:', result.data.title);
}
```

### Pattern 3: Metadata Access

```typescript
import type { Evidence, EvidenceMetadata } from '$lib/types';

const evidence: Evidence = {
  // ... fields ...
  metadata: {
    fileHash: 'sha256:abc123',
    fileSize: 1024,
    mimeType: 'application/pdf',
    processingStatus: 'completed',
    ocrResult: 'extracted text...'
  }
};

// ✅ Full type inference on nested object
console.log(evidence.metadata.processingStatus); // 'completed' | 'pending' | ...
```

### Pattern 4: Batch Operations

```typescript
import type { BatchQueryResult, Case } from '$lib/types';

const result: BatchQueryResult<Case> = await fetch('/api/cases/batch/delete', {
  method: 'POST',
  body: JSON.stringify({ ids: ['1', '2', '3'] })
}).then(r => r.json());

console.log(`Success: ${result.successCount} of ${result.results.length}`);

result.results.forEach(item => {
  if (item.success) {
    console.log(`✅ ${item.id}`);
  } else {
    console.log(`❌ ${item.id}: ${item.error}`);
  }
});
```

### Pattern 5: Vector Search

```typescript
import type { VectorSearchQueryResult } from '$lib/types';

const results: VectorSearchQueryResult = await fetch('/api/search/semantic', {
  method: 'POST',
  body: JSON.stringify({ query: 'contract terms', embedding: [...] })
}).then(r => r.json());

results.results?.forEach(r => {
  console.log(`${r.title} (similarity: ${r.similarity.toFixed(2)})`);
  console.log(`Content: ${r.content.substring(0, 100)}...`);
  console.log(`Metadata:`, r.metadata);
});
```

### Pattern 6: Admin Metrics

```typescript
import type { AdminStatusResponse } from '$lib/types';

const status: AdminStatusResponse = await fetch('/api/admin/status').then(r => r.json());

// ✅ Nested type access
const cpuUsage = status.metrics.cpu.usage;
const memoryUsage = status.metrics.memory.percentage;
const dbStatus = status.services.database.status;

// ✅ Conditional rendering based on types
if (status.metrics.cpu.temp && status.metrics.cpu.temp > 80) {
  console.warn('High CPU temperature');
}
```

### Pattern 7: Worker Monitoring

```typescript
import type { BackgroundWorkerStatus, WorkerHealthCheckResponse } from '$lib/types';

const health: WorkerHealthCheckResponse = await fetch('/api/health/workers').then(r => r.json());

health.workers.forEach((worker: BackgroundWorkerStatus) => {
  const isHealthy = worker.healthy && worker.status === 'online';
  const queueBacklog = worker.queueDepth ?? 0;

  // ✅ Type-safe status filtering
  if (worker.type === 'ocr' && !isHealthy) {
    console.error(`OCR worker down: ${worker.details}`);
  }
});
```

### Pattern 8: File Upload Progress

```typescript
import type { FileProcessingProgress } from '$lib/types';

// SSE stream for real-time progress
const source = new EventSource(`/api/files/${fileId}/progress`);

source.onmessage = (event) => {
  const progress: FileProcessingProgress = JSON.parse(event.data);

  // ✅ Typed stage information
  progress.stages.forEach(stage => {
    console.log(`${stage.stageName}: ${stage.progress}% (${stage.status})`);

    if (stage.status === 'failed') {
      console.error(`Stage failed: ${stage.error}`);
    }
  });

  console.log(`ETA: ${progress.estimatedTimeRemaining}s`);
};
```

---

## Type Hierarchy

```
┌─ DatabaseTypes ─────────────────────┐
│ Entity: User, Case, Evidence        │
│ Query: QueryResult<T>, ListQuery... │
│ Vector: VectorSearchQueryResult     │
│ Batch: BatchQueryResult<T>          │
└─────────────────────────────────────┘

┌─ AdminTypes ────────────────────────┐
│ Health: AdminHealthResponse         │
│ Status: AdminStatusResponse         │
│ Metrics: SystemMetrics, CPUMetrics  │
│ Services: ServiceHealth, ServiceHealthStatus
│ Database: DatabaseStatus            │
│ Cache: CacheStatus                  │
│ Queue: MessageQueueStatus           │
│ Vector: VectorStoreStatus           │
│ Config: AdminConfiguration          │
│ Audit: AuditLogResponse             │
│ Actions: AdminActionResponse        │
└─────────────────────────────────────┘

┌─ ClusterTypes ──────────────────────┐
│ Status: ClusterStatusResponse       │
│ Workers: BackgroundWorkerStatus     │
│ Jobs: BackgroundJob, JobBatch...    │
│ Upload: FileUploadJob, Progress     │
│ OCR: OCRWorkerStatus, OCRJob        │
│ Embedding: EmbeddingWorkerStatus    │
│ Autotag: AutotagWorkerStatus        │
│ Events: ClusterEvent, SSE Stream    │
│ Commands: ClusterCommand...         │
└─────────────────────────────────────┘
```

---

## Imports Quick Copy

```typescript
// Database Imports
import type {
  User, Case, Evidence, Document, ChatMessage, AnalysisResult,
  QueryResult, ListQueryResult, CreateQueryResult, UpdateQueryResult, DeleteQueryResult,
  CaseQueryResult, CaseListResult,
  EvidenceQueryResult, EvidenceListResult,
  VectorSearchQueryResult, BatchQueryResult
} from '$lib/types';

// Admin Imports
import type {
  AdminHealthResponse, AdminStatusResponse, SystemMetrics, ServiceHealth,
  DatabaseStatus, CacheStatus, MessageQueueStatus, VectorStoreStatus,
  AdminConfiguration, AuditLog,
  DatabaseMaintenanceResponse, CacheClearResponse, ServiceRestartResponse
} from '$lib/types';

// Worker/Cluster Imports
import type {
  BackgroundWorkerStatus, WorkerHealthCheckResponse, WorkerMetrics,
  BackgroundJob, JobBatchResponse,
  FileUploadJob, FileUploadInfo, FileProcessingProgress,
  OCRWorkerStatus, OCRJob,
  EmbeddingWorkerStatus, EmbeddingJob,
  AutotagWorkerStatus, AutotagJob,
  ClusterEvent, ClusterEventStreamResponse,
  ClusterRestartResponse, WorkerScaleResponse
} from '$lib/types';
```

---

## File Locations

| Purpose | File Path |
|---------|-----------|
| **Database Types** | `src/lib/types/database.ts` |
| **Admin Types** | `src/lib/types/admin.ts` |
| **Cluster/Worker Types** | `src/lib/types/cluster.ts` |
| **Type Exports Hub** | `src/lib/types/index.ts` |
| **Full Guide** | `TYPE_DEFINITIONS_GUIDE.md` |
| **This Cheatsheet** | `TYPE_DEFINITIONS_CHEATSHEET.md` |

---

## Benefits Summary

✅ **Type Safety**: Compile-time error detection
✅ **IDE Support**: Full autocomplete and IntelliSense
✅ **Documentation**: Types serve as inline docs
✅ **Consistency**: Standardized across all APIs
✅ **Refactoring**: Easy to update when types change
✅ **Maintainability**: Single source of truth for schemas

