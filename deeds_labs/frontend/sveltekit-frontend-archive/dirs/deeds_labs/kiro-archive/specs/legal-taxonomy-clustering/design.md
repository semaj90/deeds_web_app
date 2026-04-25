# Legal Taxonomy Clustering System - Design Document

## Overview

The Legal Taxonomy Clustering System is a distributed, event-driven architecture that discovers and maintains a dynamic taxonomy of legal statutes. It combines Self-Organizing Maps (SOM) for pattern discovery with K-Means clustering for category assignment, integrated with Redis caching, RabbitMQ job queues, and XState orchestration.

### Key Design Principles

1. **Asynchronous Processing**: Clustering jobs run in background queues, never blocking user requests
2. **Fault Tolerance**: Automatic retries, timeouts, and rollback capabilities ensure reliability
3. **Observability**: Comprehensive metrics, logging, and change tracking for monitoring
4. **Scalability**: Distributed job processing with Redis caching for performance
5. **Auditability**: Full change history and version tracking for compliance

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Legal Search System                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌──────────────────┐         ┌──────────────────┐             │
│  │  Statute Index   │         │  Search Requests │             │
│  │  (PostgreSQL)    │         │  (SvelteKit)     │             │
│  └────────┬─────────┘         └────────┬─────────┘             │
│           │                            │                       │
│           │ NEW_DATA event             │ Search query          │
│           │                            │                       │
│           ▼                            ▼                       │
│  ┌─────────────────────────────────────────────────┐           │
│  │         RabbitMQ Job Queue                      │           │
│  │  Queue: clustering.jobs                         │           │
│  │  - NEW_DATA events                              │           │
│  │  - Retry logic (3x exponential backoff)         │           │
│  │  - 1-hour timeout per job                       │           │
│  └────────────────┬────────────────────────────────┘           │
│                   │                                             │
│                   ▼                                             │
│  ┌─────────────────────────────────────────────────┐           │
│  │    XState Clustering Machine                    │           │
│  │  States: waiting → queue → clustering →         │           │
│  │          tagging → indexing → complete          │           │
│  │  - 3 retries per state                          │           │
│  │  - Rollback on failure                          │           │
│  │  - Version tracking                             │           │
│  └────────────────┬────────────────────────────────┘           │
│                   │                                             │
│        ┌──────────┴──────────┐                                 │
│        │                     │                                 │
│        ▼                     ▼                                 │
│  ┌──────────────┐    ┌──────────────┐                         │
│  │ SOM Training │    │ K-Means      │                         │
│  │ (10x10 grid) │    │ Clustering   │                         │
│  │ 768D → 2D    │    │ (K=8)        │                         │
│  └──────┬───────┘    └──────┬───────┘                         │
│         │                   │                                 │
│         └───────┬───────────┘                                 │
│                 │                                             │
│                 ▼                                             │
│  ┌─────────────────────────────────────────────────┐          │
│  │    Redis Cache                                  │          │
│  │  - SOM grid state                               │          │
│  │  - Cluster centroids                            │          │
│  │  - Echo hit counters                            │          │
│  │  - Job status tracking                          │          │
│  │  - Change history                               │          │
│  └────────────────┬────────────────────────────────┘          │
│                   │                                            │
│                   ▼                                            │
│  ┌─────────────────────────────────────────────────┐          │
│  │    Qdrant Vector Store                          │          │
│  │  Payloads:                                      │          │
│  │  - som_cluster_id (0-99)                        │          │
│  │  - kmeans_label (string)                        │          │
│  │  - cluster_confidence (0-1)                     │          │
│  └────────────────┬────────────────────────────────┘          │
│                   │                                            │
│                   ▼                                            │
│  ┌─────────────────────────────────────────────────┐          │
│  │    Search Results with Clustering               │          │
│  │  - Cluster filter options                       │          │
│  │  - Echo ranking boost                           │          │
│  │  - Confidence scores                            │          │
│  └─────────────────────────────────────────────────┘          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. RabbitMQ Clustering Service

**File**: `src/lib/server/services/rabbitmq-clustering-service.ts`

```typescript
interface ClusteringJob {
  id: string;
  type: 'NEW_DATA' | 'RECLUSTERING';
  statutes: string[]; // statute IDs
  timestamp: Date;
  retryCount: number;
  maxRetries: number;
}

interface ClusteringJobResult {
  jobId: string;
  status: 'success' | 'failed' | 'timeout';
  executionTimeMs: number;
  clusterCount: number;
  statuteCount: number;
  averageConfidence: number;
  error?: string;
}

// Publish clustering job
async function publishClusteringJob(job: ClusteringJob): Promise<void>

// Consume clustering jobs
async function consumeClusteringJobs(handler: (job: ClusteringJob) => Promise<void>): Promise<void>

// Track job status
async function trackJobStatus(jobId: string, status: string): Promise<void>
```

### 2. XState Clustering Machine

**File**: `src/lib/server/services/xstate-clustering-machine.ts`

```typescript
interface ClusteringContext {
  jobId: string;
  statutes: Statute[];
  somGrid?: SOMGrid;
  kmeansClusters?: KMeansCluster[];
  previousLabels?: Map<string, string>;
  currentLabels?: Map<string, string>;
  changePercentage?: number;
  version: number;
  retryCount: number;
}

interface ClusteringEvent {
  type: 'START' | 'QUEUE' | 'CLUSTER' | 'TAG' | 'INDEX' | 'COMPLETE' | 'ERROR' | 'RETRY';
  data?: any;
}

// Create clustering machine
function createClusteringMachine(): StateMachine<ClusteringContext, ClusteringEvent>

// Interpret and run machine
async function runClusteringWorkflow(context: ClusteringContext): Promise<ClusteringContext>
```

### 3. SOM Clustering Service

**File**: `src/lib/server/services/som-clustering-service.ts`

```typescript
interface SOMGrid {
  width: number;
  height: number;
  neurons: Neuron[][];
  learningRate: number;
  epochs: number;
}

interface Neuron {
  weights: number[]; // 768-dimensional
  x: number;
  y: number;
}

// Initialize SOM grid
function initializeSOMGrid(width: number, height: number, inputDim: number): SOMGrid

// Train SOM on embeddings
async function trainSOM(
  embeddings: number[][],
  grid: SOMGrid,
  epochs: number
): Promise<SOMGrid>

// Get cluster centroids from trained SOM
function getSOMCentroids(grid: SOMGrid): number[][]

// Find best matching unit for embedding
function findBestMatchingUnit(embedding: number[], grid: SOMGrid): { x: number; y: number }
```

### 4. K-Means Clustering Service

**File**: `src/lib/server/services/kmeans-clustering-service.ts`

```typescript
interface KMeansCluster {
  id: number;
  centroid: number[];
  members: string[]; // statute IDs
  label: string;
  confidence: number;
}

interface ClusterAssignment {
  statuteId: string;
  clusterId: number;
  label: string;
  confidence: number;
  flaggedForReview: boolean;
}

// Run K-Means clustering
async function runKMeans(
  centroids: number[][],
  k: number,
  maxIterations: number
): Promise<KMeansCluster[]>

// Assign statutes to clusters
async function assignStatutesToClusters(
  statutes: Statute[],
  clusters: KMeansCluster[],
  confidenceThreshold: number
): Promise<ClusterAssignment[]>

// Generate cluster labels using LLM
async function generateClusterLabels(
  clusters: KMeansCluster[],
  statutes: Statute[]
): Promise<Map<number, string>>
```

### 5. Change Detection Service

**File**: `src/lib/server/services/change-detection-service.ts`

```typescript
interface ChangeDetectionResult {
  changePercentage: number;
  changedStatutes: string[];
  newLabels: Map<string, string>;
  previousLabels: Map<string, string>;
  shouldAlert: boolean;
  alertMessage: string;
}

// Detect changes between clustering runs
async function detectChanges(
  previousLabels: Map<string, string>,
  currentLabels: Map<string, string>,
  changeThreshold: number
): Promise<ChangeDetectionResult>

// Emit operator alert
async function emitOperatorAlert(result: ChangeDetectionResult): Promise<void>

// Store change history
async function storeChangeHistory(
  runId: string,
  result: ChangeDetectionResult
): Promise<void>
```

### 6. Echo Ranking Service

**File**: `src/lib/server/services/echo-ranking-service.ts`

```typescript
interface EchoRankingResult {
  statuteId: string;
  hitCount: number;
  boostScore: number;
  finalScore: number;
}

// Increment hit counter
async function incrementHitCounter(statuteId: string): Promise<number>

// Get hit count
async function getHitCount(statuteId: string): Promise<number>

// Apply echo ranking boost
function applyEchoBoost(semanticScore: number, hitCount: number, boostFactor: number): number

// Get top statutes by echo hits
async function getTopStatutesByEcho(limit: number): Promise<EchoRankingResult[]>

// Reset echo cache
async function resetEchoCache(): Promise<void>
```

## Data Models

### Statute with Clustering Metadata

```typescript
interface StatuteWithClustering {
  id: string;
  titleNumber: number;
  section: string;
  text: string;
  embedding: number[]; // 768-dim
  som_cluster_id: number; // 0-99 (10x10 grid)
  kmeans_label: string; // e.g., "Violent Crimes"
  cluster_confidence: number; // 0-1
  flagged_for_review: boolean;
  echo_hits: number;
  version: number;
  updated_at: Date;
}
```

### Clustering Job Status

```typescript
interface ClusteringJobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  startedAt: Date;
  completedAt?: Date;
  executionTimeMs?: number;
  retryCount: number;
  error?: string;
  result?: ClusteringJobResult;
}
```

## Error Handling

### Retry Strategy

- **Max Retries**: 3 per state
- **Backoff**: Exponential (1s, 2s, 4s)
- **Timeout**: 1 hour per job
- **Rollback**: Automatic on failure

### Error Scenarios

1. **Missing Embeddings**: Skip statute, log warning
2. **SOM Training Failure**: Retry state, rollback if max retries exceeded
3. **K-Means Convergence**: Use previous labels, emit warning
4. **LLM Label Generation**: Use generic labels (e.g., "Cluster 1")
5. **Qdrant Update Failure**: Retry with exponential backoff

## Testing Strategy

### Unit Tests

- SOM grid initialization and training
- K-Means clustering and assignment
- Change detection logic
- Echo ranking calculations
- Confidence score computation

### Integration Tests

- End-to-end clustering workflow
- RabbitMQ job publishing and consumption
- XState machine transitions
- Qdrant payload updates
- Redis cache operations

### Performance Tests

- SOM training throughput (statutes/second)
- K-Means convergence time
- Change detection latency
- Echo ranking query performance

## Deployment Considerations

### Infrastructure Requirements

- **RabbitMQ**: Message queue for job distribution
- **Redis**: Caching and state storage
- **PostgreSQL**: Change history and audit trail
- **Qdrant**: Vector store with payload updates
- **Node.js**: Clustering service runtime

### Configuration

```env
CLUSTERING_ENABLED=true
CLUSTERING_SOM_WIDTH=10
CLUSTERING_SOM_HEIGHT=10
CLUSTERING_K_MEANS_K=8
CLUSTERING_CONFIDENCE_THRESHOLD=0.7
CLUSTERING_CHANGE_THRESHOLD=0.2
CLUSTERING_MAX_RETRIES=3
CLUSTERING_JOB_TIMEOUT_MS=3600000
CLUSTERING_ECHO_BOOST_FACTOR=0.15
CLUSTERING_ECHO_TTL_HOURS=24
```

### Monitoring

- Job success rate
- Average execution time
- Cluster quality metrics
- Change detection frequency
- Echo hit distribution

---

**Status**: Design Complete
**Last Updated**: November 21, 2025
