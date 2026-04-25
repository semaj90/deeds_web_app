# Comprehensive Type Definitions Guide

## Overview

This document explains the three core type definition endpoints that solve the type checking problems in your SvelteKit + TypeScript legal AI platform:

1. **ENDPOINT 1: Database Response Types** - All `db.query()` operations
2. **ENDPOINT 2: Admin API Response Types** - Health checks, cluster status, metrics
3. **ENDPOINT 3: Worker/Cluster State Types** - Background workers and file uploads

All types are exported from `src/lib/types/index.ts` for easy importing.

---

## Endpoint 1: Database Response Types

**File**: `src/lib/types/database.ts`

### Core Problem
Components querying the database with `db.query()` don't know the response types, causing:
- Type errors when accessing result properties
- No autocomplete for database fields
- Cascading failures across UI components

### Solution
Comprehensive type definitions for all database entities and query responses.

### Core Entity Types

#### User
```typescript
import type { User } from '$lib/types';

const user: User = {
  id: string;
  email: string;
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  role: string;
  isActive: boolean;
  avatarUrl: string | null;
  createdAt: Date;
  updatedAt: Date;
};
```

#### Case
```typescript
import type { Case, CaseMetadata } from '$lib/types';

const legalCase: Case = {
  id: string;
  title: string;
  description: string | null;
  createdBy: string;
  createdAt: Date;
  updatedAt: Date;
  status: string;
  metadata: CaseMetadata | null; // Legal-specific metadata
};

// CaseMetadata provides structure for legal case data
const metadata: CaseMetadata = {
  jurisdiction?: string;
  parties?: Array<{ role: string; name: string; type: string }>;
  courtLevel?: 'district' | 'appellate' | 'supreme';
  caseNumber?: string;
  datesFiled?: string[];
  notes?: string;
};
```

#### Evidence
```typescript
import type { Evidence, EvidenceAnalysis, ChainOfCustodyRecord } from '$lib/types';

const evidence: Evidence = {
  id: string;
  caseId: string;
  title: string;
  description: string | null;
  evidenceType: string;
  subType: string | null;
  summary: string | null;
  aiSummary: string | null;
  aiAnalysis: EvidenceAnalysis | null;
  tags: string[] | null;
  chainOfCustody: ChainOfCustodyRecord[] | null;
  uploadedBy: string;
  isAdmissible: boolean;
  confidentialityLevel: string | null;
  collectedAt: Date | null;
  location: string | null;
  createdAt: Date;
  updatedAt: Date;
  embedding: number[] | null; // pgvector embedding
  metadata: EvidenceMetadata | null;
};

// Chain of custody tracking
const custodyRecord: ChainOfCustodyRecord = {
  timestamp: string;
  handler: string;
  action: string;
  location?: string;
  notes?: string;
};
```

### Query Response Types

#### Single Item Query
```typescript
import type { QueryResult, Case } from '$lib/types';

// Use generic wrapper for any entity
async function getCaseById(id: string): Promise<QueryResult<Case>> {
  const response = await fetch(`/api/cases/${id}`);
  const data: QueryResult<Case> = await response.json();

  if (data.success && data.data) {
    console.log(data.data.title); // ✅ TypeScript knows this is a string
  }
}
```

#### List Query with Pagination
```typescript
import type { ListQueryResult, Case } from '$lib/types';

async function listCases(page = 1): Promise<ListQueryResult<Case>> {
  const response = await fetch(`/api/cases?page=${page}&pageSize=20`);
  const data: ListQueryResult<Case> = await response.json();

  if (data.success && data.data) {
    data.data.forEach(legalCase => {
      console.log(legalCase.title); // ✅ Full type inference
    });

    if (data.pagination) {
      console.log(`Page ${data.pagination.page} of ${data.pagination.pages}`);
    }
  }
}
```

#### Create Query
```typescript
import type { CreateQueryResult, Case } from '$lib/types';

async function createCase(title: string): Promise<CreateQueryResult<Case>> {
  const response = await fetch('/api/cases', {
    method: 'POST',
    body: JSON.stringify({ title })
  });
  return response.json();
}
```

#### Update Query
```typescript
import type { UpdateQueryResult, Case } from '$lib/types';

async function updateCase(id: string, updates: Partial<Case>): Promise<UpdateQueryResult<Case>> {
  const response = await fetch(`/api/cases/${id}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
  const data: UpdateQueryResult<Case> = await response.json();

  if (data.success && data.updated) {
    console.log('Case updated:', data.data);
  }
}
```

#### Delete Query
```typescript
import type { DeleteQueryResult } from '$lib/types';

async function deleteCase(id: string): Promise<DeleteQueryResult> {
  const response = await fetch(`/api/cases/${id}`, { method: 'DELETE' });
  const data: DeleteQueryResult = await response.json();

  if (data.success && data.deleted) {
    console.log('Case deleted');
  }
}
```

### Domain-Specific Shorthand Types

For common patterns, use specialized types:

```typescript
import type {
  CaseQueryResult,      // QueryResult<Case>
  CaseListResult,       // ListQueryResult<Case>
  EvidenceQueryResult,  // QueryResult<Evidence>
  EvidenceListResult,   // ListQueryResult<Evidence>
  UserQueryResult,      // QueryResult<User>
} from '$lib/types';

// These are equivalent:
const result1: QueryResult<Case> = { success: true, data: null };
const result2: CaseQueryResult = { success: true, data: null };
```

### Vector Search Types

```typescript
import type { VectorSearchQueryResult } from '$lib/types';

async function searchLegalDocuments(query: string, embedding: number[]) {
  const response = await fetch('/api/search/semantic', {
    method: 'POST',
    body: JSON.stringify({ query, embedding })
  });

  const results: VectorSearchQueryResult = await response.json();

  if (results.success && results.results) {
    results.results.forEach(result => {
      console.log(result.title);
      console.log(result.similarity); // 0-1 similarity score
      console.log(result.metadata);   // Document metadata
    });
  }
}
```

### Batch Operations

```typescript
import type { BatchQueryResult } from '$lib/types';

async function deleteMultipleCases(ids: string[]): Promise<BatchQueryResult<Case>> {
  const response = await fetch('/api/cases/batch/delete', {
    method: 'POST',
    body: JSON.stringify({ ids })
  });

  const results: BatchQueryResult<Case> = await response.json();
  console.log(`Deleted ${results.successCount} of ${results.results.length}`);
}
```

---

## Endpoint 2: Admin API Response Types

**File**: `src/lib/types/admin.ts`

### Core Problem
Components querying admin endpoints for system status, health checks, and metrics don't know the response structure, causing:
- Missing health check information
- Unable to display cluster metrics
- No error handling for service failures

### Solution
Comprehensive types for all admin operations.

### Health Check Types

```typescript
import type { AdminHealthResponse } from '$lib/types';

async function checkSystemHealth(): Promise<AdminHealthResponse> {
  const response = await fetch('/api/admin/health');
  const health: AdminHealthResponse = await response.json();

  if (health.success && health.data) {
    console.log(`CPU: ${health.data.cpu}%`);
    console.log(`Memory: ${health.data.memory}%`);
    console.log(`Database: ${health.data.database}`);
    console.log(`Storage: ${health.data.storage}%`);
    console.log(`Uptime: ${health.data.uptime}s`);
  }
}
```

### System Metrics Types

```typescript
import type { AdminStatusResponse, SystemMetrics } from '$lib/types';

async function getDetailedStatus(): Promise<AdminStatusResponse> {
  const response = await fetch('/api/admin/status');
  const status: AdminStatusResponse = await response.json();

  if (status.success) {
    const metrics: SystemMetrics = status.metrics;

    console.log(`CPU Usage: ${metrics.cpu.usage}%`);
    console.log(`CPU Cores: ${metrics.cpu.cores}`);
    console.log(`CPU Temp: ${metrics.cpu.temp}°C`);

    console.log(`Memory Used: ${metrics.memory.used} / ${metrics.memory.total}`);
    console.log(`Memory %: ${metrics.memory.percentage}%`);

    console.log(`Disk Used: ${metrics.disk.used} / ${metrics.disk.total}`);
    console.log(`Network In: ${metrics.network?.bytesIn}`);

    console.log(`Uptime: ${metrics.uptime}s`);
  }
}
```

### Service Health Types

```typescript
import type { AdminStatusResponse, ServiceHealth } from '$lib/types';

async function checkServiceHealth() {
  const response = await fetch('/api/admin/status');
  const status: AdminStatusResponse = await response.json();

  if (status.success) {
    const services = status.services;

    // Check individual services
    const dbHealth: ServiceHealth = services.database;
    const cacheHealth: ServiceHealth = services.cache;
    const vectorHealth: ServiceHealth = services.vectorStore;

    console.log(`Database: ${dbHealth.status}`); // 'healthy' | 'degraded' | 'unhealthy'
    console.log(`Latency: ${dbHealth.latency}ms`);
    console.log(`Last Check: ${dbHealth.lastCheck}`);

    if (dbHealth.status !== 'healthy') {
      console.error(`Database error: ${dbHealth.error}`);
    }
  }
}
```

### Database Status Types

```typescript
import type { DatabaseStatus, DatabaseQueryStats } from '$lib/types';

async function getDatabaseStatus(): Promise<DatabaseStatus> {
  const response = await fetch('/api/admin/database/status');
  const dbStatus: DatabaseStatus = await response.json();

  console.log(`Connected: ${dbStatus.connected}`);
  console.log(`Version: ${dbStatus.version}`);
  console.log(`Active Connections: ${dbStatus.connectionPool.active}`);
  console.log(`Available Extensions: ${dbStatus.extensions.join(', ')}`);

  if (dbStatus.replication?.enabled) {
    console.log(`Replication Lag: ${dbStatus.replication.lag}ms`);
  }
}
```

### Cache Status Types

```typescript
import type { CacheStatus } from '$lib/types';

async function getCacheStatus(): Promise<CacheStatus> {
  const response = await fetch('/api/admin/cache/status');
  const cache: CacheStatus = await response.json();

  console.log(`Type: ${cache.type}`); // 'redis' | 'memory' | 'hybrid'
  console.log(`Connected: ${cache.connected}`);
  console.log(`Memory Used: ${cache.memoryUsage.used}MB / ${cache.memoryUsage.allocated}MB`);
  console.log(`Hit Rate: ${cache.statistics.hitRate}%`);
  console.log(`Keys in Cache: ${cache.keyCount}`);
}
```

### Message Queue Status Types

```typescript
import type { MessageQueueStatus } from '$lib/types';

async function getQueueStatus(): Promise<MessageQueueStatus> {
  const response = await fetch('/api/admin/queue/status');
  const queues: MessageQueueStatus = await response.json();

  console.log(`Type: ${queues.type}`); // 'rabbitmq' | 'kafka' | 'redis'
  console.log(`Queues: ${queues.queues.length}`);

  queues.queues.forEach(q => {
    console.log(`${q.name}: ${q.messageCount} messages, ${q.consumerCount} consumers`);

    if (q.status === 'error') {
      console.error(`Queue error: ${q.error}`);
    }
  });
}
```

### Vector Store Status Types

```typescript
import type { VectorStoreStatus } from '$lib/types';

async function getVectorStoreStatus(): Promise<VectorStoreStatus> {
  const response = await fetch('/api/admin/vectorstore/status');
  const vectors: VectorStoreStatus = await response.json();

  console.log(`Type: ${vectors.type}`); // 'pgvector' | 'qdrant' | 'faiss' | 'hybrid'
  console.log(`Total Vectors: ${vectors.statistics.totalVectors}`);
  console.log(`Dimensions: ${vectors.statistics.totalDimensions}`);
  console.log(`Search Latency: ${vectors.statistics.searchLatency}ms`);

  if (vectors.gpuAcceleration?.enabled) {
    console.log(`GPU: ${vectors.gpuAcceleration.device}`);
    console.log(`GPU Memory: ${vectors.gpuAcceleration.memoryUsage}MB`);
  }

  vectors.indexes.forEach(idx => {
    console.log(`Index: ${idx.name}, Vectors: ${idx.vectorCount}, Size: ${idx.size}MB`);
  });
}
```

### Configuration Types

```typescript
import type { AdminConfigResponse, GPUConfig } from '$lib/types';

async function getConfiguration(): Promise<AdminConfigResponse> {
  const response = await fetch('/api/admin/config');
  const config: AdminConfigResponse = await response.json();

  if (config.success) {
    console.log(`Database Host: ${config.configuration.database.host}`);
    console.log(`Cache Type: ${config.configuration.cache.type}`);

    if (config.configuration.gpu?.enabled) {
      console.log(`GPU Devices: ${config.configuration.gpu.devices.length}`);
      config.configuration.gpu.devices.forEach(gpu => {
        console.log(`  - ${gpu.name}: ${gpu.memory}MB`);
      });
    }
  }
}
```

### Audit Log Types

```typescript
import type { AuditLogResponse, AuditLog } from '$lib/types';

async function getAuditLogs(page = 1): Promise<AuditLogResponse> {
  const response = await fetch(`/api/admin/audit?page=${page}`);
  const logs: AuditLogResponse = await response.json();

  logs.logs.forEach((log: AuditLog) => {
    console.log(`[${log.timestamp}] ${log.action} on ${log.resource} by ${log.userId}`);
    console.log(`Status: ${log.status}`);
    console.log(`IP: ${log.ipAddress}`);
  });

  console.log(`Page ${logs.pagination.page} of ${logs.pagination.pages}`);
}
```

### Admin Action Response Types

```typescript
import type {
  DatabaseMaintenanceResponse,
  CacheClearResponse,
  ServiceRestartResponse
} from '$lib/types';

// Database maintenance
async function backupDatabase(): Promise<DatabaseMaintenanceResponse> {
  const response = await fetch('/api/admin/database/backup', {
    method: 'POST'
  });
  const result: DatabaseMaintenanceResponse = await response.json();

  if (result.success) {
    console.log(`Backup saved to: ${result.result.backupPath}`);
    console.log(`Size: ${result.result.size}MB`);
    console.log(`Duration: ${result.result.duration}ms`);
  }
}

// Cache operations
async function clearCache(): Promise<CacheClearResponse> {
  const response = await fetch('/api/admin/cache/clear', {
    method: 'POST'
  });
  const result: CacheClearResponse = await response.json();

  console.log(`Keys deleted: ${result.result.keysDeleted}`);
  console.log(`Memory freed: ${result.result.memoryFreed}MB`);
}

// Service restart
async function restartService(service: string): Promise<ServiceRestartResponse> {
  const response = await fetch('/api/admin/service/restart', {
    method: 'POST',
    body: JSON.stringify({ service })
  });
  const result: ServiceRestartResponse = await response.json();

  if (result.success) {
    console.log(`Service restarted: ${result.result.service}`);
    console.log(`Downtime: ${result.result.downtime}ms`);
  }
}
```

---

## Endpoint 3: Worker/Cluster State Types

**File**: `src/lib/types/cluster.ts`

### Core Problem
Background workers (OCR, embedding, autotag) and file uploads cascade type errors to components because:
- Worker state types aren't exported
- File upload progress isn't typed
- Job queue status is unknown

### Solution
Comprehensive types for all worker operations, job queues, and file uploads.

### Background Worker Types

```typescript
import type { WorkerHealthCheckResponse, BackgroundWorkerStatus } from '$lib/types';

async function checkWorkerHealth() {
  const response = await fetch('/api/health/workers');
  const health: WorkerHealthCheckResponse = await response.json();

  health.workers.forEach((worker: BackgroundWorkerStatus) => {
    console.log(`${worker.workerName}:`);
    console.log(`  Type: ${worker.type}`); // 'ocr' | 'embedding' | 'autotag'
    console.log(`  Status: ${worker.status}`);
    console.log(`  Healthy: ${worker.healthy}`);
    console.log(`  Jobs Processed: ${worker.processedJobs}`);
    console.log(`  Queue Depth: ${worker.queueDepth}`);
    console.log(`  Last Heartbeat: ${worker.lastHeartbeat}`);
  });

  console.log(`Summary:`);
  console.log(`  Total: ${health.summary?.total}`);
  console.log(`  Online: ${health.summary?.online}`);
  console.log(`  Offline: ${health.summary?.offline}`);
}
```

### Worker Pool Types

```typescript
import type { WorkerPool } from '$lib/types';

async function getWorkerPoolStats(): Promise<WorkerPool[]> {
  const response = await fetch('/api/workers/pools');
  const pools: WorkerPool[] = await response.json();

  pools.forEach(pool => {
    console.log(`Pool: ${pool.poolName}`);
    console.log(`  Type: ${pool.workerType}`);
    console.log(`  Total Workers: ${pool.totalWorkers}`);
    console.log(`  Active Workers: ${pool.activeWorkers}`);
    console.log(`  Queued Jobs: ${pool.queuedJobs}`);
    console.log(`  Avg Job Duration: ${pool.averageJobDuration}ms`);
  });
}
```

### Job Queue Types

```typescript
import type { BackgroundJob, JobBatchResponse } from '$lib/types';

async function getQueuedJobs(): Promise<JobBatchResponse> {
  const response = await fetch('/api/jobs?status=pending&pageSize=50');
  const jobs: JobBatchResponse = await response.json();

  if (jobs.success && jobs.jobs) {
    jobs.jobs.forEach((job: BackgroundJob) => {
      console.log(`Job: ${job.jobId}`);
      console.log(`  Type: ${job.jobType}`);
      console.log(`  Status: ${job.status}`);
      console.log(`  Priority: ${job.priority}`);
      console.log(`  Created: ${job.createdAt}`);
      console.log(`  Retries: ${job.retryCount}/${job.maxRetries}`);

      if (job.status === 'failed') {
        console.error(`  Error: ${job.error}`);
      }
    });

    console.log(`Page ${jobs.pagination?.page} of ${jobs.pagination?.pages}`);
  }
}
```

### File Upload Types

```typescript
import type { FileUploadResponse, FileUploadBatchResponse, FileProcessingProgress } from '$lib/types';

// Single file upload
async function uploadFile(file: File): Promise<FileUploadResponse> {
  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch('/api/files/upload', {
    method: 'POST',
    body: formData
  });

  const uploadResult: FileUploadResponse = await response.json();

  if (uploadResult.success) {
    console.log(`File: ${uploadResult.file.fileName}`);
    console.log(`Size: ${uploadResult.file.fileSize}MB`);
    console.log(`Upload Job ID: ${uploadResult.uploadJob.jobId}`);

    // Processing jobs spawned from upload
    uploadResult.processingJobs.forEach(job => {
      console.log(`Processing Job: ${job.jobType}`);
    });
  }

  return uploadResult;
}

// Batch file upload
async function uploadFiles(files: File[]): Promise<FileUploadBatchResponse> {
  const formData = new FormData();
  files.forEach(file => formData.append('files', file));

  const response = await fetch('/api/files/upload/batch', {
    method: 'POST',
    body: formData
  });

  const batchResult: FileUploadBatchResponse = await response.json();

  console.log(`Summary:`);
  console.log(`  Total: ${batchResult.summary.total}`);
  console.log(`  Successful: ${batchResult.summary.successful}`);
  console.log(`  Failed: ${batchResult.summary.failed}`);
  console.log(`  Processing: ${batchResult.summary.processing}`);

  return batchResult;
}

// Monitor file processing progress
async function monitorFileProgress(fileId: string) {
  const response = await fetch(`/api/files/${fileId}/progress`);
  const progress: FileProcessingProgress = await response.json();

  console.log(`File: ${progress.fileName}`);
  console.log(`Overall Progress: ${progress.overallProgress}%`);
  console.log(`Current Stage: ${progress.currentStage}`);

  progress.stages.forEach(stage => {
    console.log(`  ${stage.name}: ${stage.progress}% (${stage.status})`);
  });

  if (progress.estimatedTimeRemaining) {
    console.log(`ETA: ${progress.estimatedTimeRemaining}s`);
  }
}
```

### OCR Worker Types

```typescript
import type { OCRWorkerStatus, OCRJob } from '$lib/types';

async function checkOCRStatus() {
  const response = await fetch('/api/workers/ocr/status');
  const ocrStatus: OCRWorkerStatus = await response.json() as any;

  console.log(`OCR Worker Status:`);
  console.log(`  Type: ${ocrStatus.type}`);
  console.log(`  Status: ${ocrStatus.status}`);
  console.log(`  Pages Processed: ${ocrStatus.processingStats?.pagesProcessed}`);
  console.log(`  Avg Confidence: ${ocrStatus.processingStats?.avgConfidence}`);
  console.log(`  GPU Enabled: ${ocrStatus.processingStats?.gpuEnabled}`);
}

async function getOCRJob(jobId: string): Promise<OCRJob> {
  const response = await fetch(`/api/jobs/${jobId}`);
  const ocrJob: OCRJob = await response.json() as any;

  console.log(`OCR Job: ${ocrJob.jobId}`);
  console.log(`  File: ${ocrJob.fileName}`);
  console.log(`  Total Pages: ${ocrJob.totalPages}`);
  console.log(`  Processed Pages: ${ocrJob.processedPages}`);
  console.log(`  Progress: ${(ocrJob.processedPages / ocrJob.totalPages * 100).toFixed(1)}%`);

  if (ocrJob.status === 'completed') {
    console.log(`  Extracted Text Length: ${ocrJob.extractedText?.length}`);
    console.log(`  Confidence: ${ocrJob.confidence}`);
    console.log(`  Languages: ${ocrJob.languages?.join(', ')}`);
  }

  return ocrJob;
}
```

### Embedding Worker Types

```typescript
import type { EmbeddingWorkerStatus, EmbeddingJob } from '$lib/types';

async function checkEmbeddingStatus() {
  const response = await fetch('/api/workers/embedding/status');
  const embeddingStatus: EmbeddingWorkerStatus = await response.json() as any;

  console.log(`Embedding Worker Status:`);
  console.log(`  Type: ${embeddingStatus.type}`);
  console.log(`  Status: ${embeddingStatus.status}`);
  console.log(`  Documents Embedded: ${embeddingStatus.processingStats?.documentsEmbedded}`);
  console.log(`  Model: ${embeddingStatus.processingStats?.model}`);
  console.log(`  Dimensions: ${embeddingStatus.processingStats?.dimensions}`);
  console.log(`  Failed Embeddings: ${embeddingStatus.processingStats?.failedEmbeddings}`);
}

async function getEmbeddingJob(jobId: string): Promise<EmbeddingJob> {
  const response = await fetch(`/api/jobs/${jobId}`);
  const embeddingJob: EmbeddingJob = await response.json() as any;

  console.log(`Embedding Job: ${embeddingJob.jobId}`);
  console.log(`  Document Count: ${embeddingJob.documentCount}`);
  console.log(`  Embedded Count: ${embeddingJob.embeddedCount}`);
  console.log(`  Model: ${embeddingJob.model}`);
  console.log(`  Dimensions: ${embeddingJob.dimensions}`);

  if (embeddingJob.status === 'completed' && embeddingJob.embeddings) {
    console.log(`  Embeddings Generated: ${embeddingJob.embeddings.length}`);

    embeddingJob.embeddings.forEach(e => {
      console.log(`    ${e.documentId}: [${e.embedding.slice(0, 3).join(', ')}...]`);
    });
  }

  return embeddingJob;
}
```

### Autotag Worker Types

```typescript
import type { AutotagWorkerStatus, AutotagJob } from '$lib/types';

async function checkAutotagStatus() {
  const response = await fetch('/api/workers/autotag/status');
  const autotagStatus: AutotagWorkerStatus = await response.json() as any;

  console.log(`Autotag Worker Status:`);
  console.log(`  Type: ${autotagStatus.type}`);
  console.log(`  Status: ${autotagStatus.status}`);
  console.log(`  Documents Tagged: ${autotagStatus.processingStats?.documentsTagged}`);
  console.log(`  Avg Confidence: ${autotagStatus.processingStats?.avgConfidence}`);
  console.log(`  AI Powered: ${autotagStatus.processingStats?.aiPowered}`);
}

async function getAutotagJob(jobId: string): Promise<AutotagJob> {
  const response = await fetch(`/api/jobs/${jobId}`);
  const autotagJob: AutotagJob = await response.json() as any;

  console.log(`Autotag Job: ${autotagJob.jobId}`);
  console.log(`  Document Count: ${autotagJob.documentCount}`);
  console.log(`  Tagged Count: ${autotagJob.taggedCount}`);

  if (autotagJob.status === 'completed' && autotagJob.tags) {
    autotagJob.tags.forEach(t => {
      console.log(`  ${t.documentId}: ${t.tags.join(', ')} (${t.confidence.toFixed(2)})`);
    });
  }

  return autotagJob;
}
```

### Cluster Event Types

```typescript
import type { ClusterEventStreamResponse } from '$lib/types';

// Server-Sent Events (SSE) for real-time cluster events
async function monitorClusterEvents() {
  const eventSource = new EventSource('/api/admin/cluster/events');

  eventSource.onmessage = (event) => {
    const streamEvent: ClusterEventStreamResponse = JSON.parse(event.data);

    console.log(`[${streamEvent.timestamp}] ${streamEvent.event.eventType}`);
    console.log(`  Source: ${streamEvent.event.source}`);
    console.log(`  Severity: ${streamEvent.event.severity}`);
    console.log(`  Message: ${streamEvent.event.message}`);

    console.log(`Cluster Status:`);
    console.log(`  Total Workers: ${streamEvent.cluster.totalWorkers}`);
    console.log(`  Active Workers: ${streamEvent.cluster.activeWorkers}`);
    console.log(`  Uptime: ${streamEvent.cluster.uptime}s`);
  };

  eventSource.onerror = () => {
    console.error('Cluster event stream error');
    eventSource.close();
  };
}
```

### Cluster Command Types

```typescript
import type { ClusterRestartResponse, WorkerScaleResponse } from '$lib/types';

// Restart cluster
async function restartCluster(): Promise<ClusterRestartResponse> {
  const response = await fetch('/api/admin/cluster/restart', {
    method: 'POST',
    body: JSON.stringify({ graceful: true })
  });

  const result: ClusterRestartResponse = await response.json();

  if (result.success) {
    console.log(`Cluster restarted`);
    console.log(`  Workers Restarted: ${result.workersRestarted}`);
    console.log(`  Jobs Preserved: ${result.jobsPreserved}`);
    console.log(`  Downtime: ${result.gracefulShutdownTimeout}ms`);
  }

  return result;
}

// Scale workers up/down
async function scaleWorkers(count: number): Promise<WorkerScaleResponse> {
  const response = await fetch('/api/admin/cluster/scale', {
    method: 'POST',
    body: JSON.stringify({ targetWorkerCount: count })
  });

  const result: WorkerScaleResponse = await response.json();

  if (result.success) {
    console.log(`Cluster scaled`);
    console.log(`  Previous: ${result.previousWorkerCount} → Target: ${result.targetWorkerCount}`);
    console.log(`  Actual: ${result.actualWorkerCount}`);
    console.log(`  Added: ${result.workersAdded}`);
    console.log(`  Removed: ${result.workersRemoved}`);
  }

  return result;
}
```

---

## Usage Summary

### Import Pattern

```typescript
// Import specific types from the main export hub
import type {
  // Database types
  Case,
  Evidence,
  QueryResult,
  ListQueryResult,

  // Admin types
  AdminStatusResponse,
  SystemMetrics,
  ServiceHealth,

  // Worker/cluster types
  BackgroundWorkerStatus,
  FileUploadResponse,
  ClusterEventStreamResponse
} from '$lib/types';
```

### Component Pattern (Svelte 5)

```svelte
<script lang="ts">
  import type { ListQueryResult, Case } from '$lib/types';

  let cases: ListQueryResult<Case> | null = null;
  let loading = true;
  let error: string | null = null;

  async function loadCases() {
    try {
      const response = await fetch('/api/cases?page=1');
      cases = await response.json();
    } catch (err) {
      error = err instanceof Error ? err.message : 'Unknown error';
    } finally {
      loading = false;
    }
  }

  // Reactive derived type
  let caseCount = $derived(cases?.data?.length ?? 0);
</script>

{#if loading}
  <p>Loading...</p>
{:else if error}
  <p class="error">{error}</p>
{:else if cases?.success && cases.data}
  <ul>
    {#each cases.data as legalCase}
      <li>{legalCase.title}</li>
    {/each}
  </ul>

  {#if cases.pagination}
    <p>Page {cases.pagination.page} of {cases.pagination.pages}</p>
  {/if}
{:else}
  <p>No cases found</p>
{/if}
```

### API Endpoint Pattern

```typescript
// src/routes/api/cases/+server.ts
import type { RequestHandler } from './$types';
import type { ListQueryResult, Case } from '$lib/types';
import { db } from '$lib/server/db';

export const GET: RequestHandler = async ({ url }) => {
  const page = parseInt(url.searchParams.get('page') ?? '1');
  const pageSize = 20;

  const cases = await db.select().from(cases).limit(pageSize).offset((page - 1) * pageSize);
  const total = await db.select().from(cases);

  const result: ListQueryResult<Case> = {
    success: true,
    data: cases,
    pagination: {
      page,
      pageSize,
      total: total.length,
      pages: Math.ceil(total.length / pageSize),
      hasMore: page < Math.ceil(total.length / pageSize)
    },
    timestamp: new Date().toISOString()
  };

  return Response.json(result);
};
```

---

## Benefits

✅ **Full Type Safety**: Complete type information for all components
✅ **Better Autocomplete**: IDE knows all available properties
✅ **Error Prevention**: Catch type errors at compile time
✅ **Documentation**: Types serve as inline documentation
✅ **Consistency**: Standardized response formats across all APIs
✅ **Maintainability**: Changes to types are propagated everywhere

---

## Next Steps

1. **Update Components**: Use these types in all component queries
2. **Update API Routes**: Return properly typed responses from endpoints
3. **Run Type Checking**: `npx tsc --noEmit --skipLibCheck`
4. **Test Integration**: Verify types work with real data
5. **Document Patterns**: Create endpoint-specific documentation

