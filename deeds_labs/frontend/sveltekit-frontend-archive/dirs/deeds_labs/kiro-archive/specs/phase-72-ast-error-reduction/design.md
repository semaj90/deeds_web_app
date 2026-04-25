# Phase 72: AST Error Reduction - Design

## Overview

Phase 72 implements a self-healing codebase agent that reduces TypeScript/Svelte errors through a 6-phase pipeline combining graph analysis, GPU clustering, and AI patch generation. The system processes 80k+ errors down to <1k through iterative refinement.

## Architecture

### System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                     Frontend Dashboard                           │
│  (Real-time monitoring, cluster visualization, patch tracking)  │
└────────────────────────┬────────────────────────────────────────┘
                         │
┌─────────────────────────▼────────────────────────────────────────┐
│                  Phase 72 Orchestrator                            │
│  (Pipeline coordination, iteration management, progress tracking)│
└────┬────────────┬────────────────┬────────────────┬──────────────┘
     │            │                │                │
     ▼            ▼                ▼                ▼
┌─────────┐  ┌──────────┐  ┌──────────────┐  ┌──────────────┐
│ Error   │  │ Neo4j    │  │ GPU          │  │ AI Patch     │
│ Extract │  │ Graph    │  │ Clustering   │  │ Generation   │
│ Service │  │ Service  │  │ Service      │  │ Service      │
└────┬────┘  └────┬─────┘  └──────┬───────┘  └──────┬───────┘
     │            │               │                 │
     ▼            ▼               ▼                 ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────────┐   │
│  │ Qdrant   │  │ Neo4j    │  │ Redis    │  │ Postgres     │   │
│  │ (vectors)│  │ (graph)  │  │ (cache)  │  │ (tracking)   │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

### Pipeline Phases

```
Phase 1: Error Extraction & Embedding
  ├─ Run svelte-check
  ├─ Parse error output
  ├─ Generate embeddings (Ollama)
  └─ Store in Qdrant

Phase 2: Error Relationship Graph
  ├─ Create error nodes (Neo4j)
  ├─ Establish file dependencies
  ├─ Calculate relationship weights
  └─ Identify error patterns

Phase 3: GPU-Accelerated Clustering
  ├─ Load embeddings from Qdrant
  ├─ Perform K-means clustering (CUDA)
  ├─ Calculate silhouette scores
  └─ Generate cluster metadata

Phase 4: AI Patch Generation
  ├─ Analyze cluster patterns
  ├─ Generate patches (gemma3-legal)
  ├─ Score confidence levels
  └─ Create multi-file patches

Phase 5: Patch Application & Validation
  ├─ Apply patches (ts-morph)
  ├─ Validate with svelte-check
  ├─ Track results
  └─ Rollback on failure

Phase 6: Self-Healing Loop
  ├─ Check improvement threshold
  ├─ Iterate if needed
  ├─ Track metrics
  └─ Report results
```

## Components and Interfaces

### 1. Error Extraction Service

**Purpose**: Extract and analyze TypeScript/Svelte errors

**Interface**:
```typescript
interface ErrorExtractionService {
  extractErrors(): Promise<Error[]>;
  generateEmbeddings(errors: Error[]): Promise<Embedding[]>;
  storeEmbeddings(embeddings: Embedding[]): Promise<void>;
}

interface Error {
  id: string;
  file: string;
  line: number;
  column: number;
  message: string;
  severity: 'error' | 'warning';
  code: string;
  context: string;
}

interface Embedding {
  errorId: string;
  vector: number[];
  model: string;
  timestamp: Date;
}
```

**Implementation**:
- Execute `svelte-check` command
- Parse JSON output
- Generate embeddings using Ollama
- Store in Qdrant with metadata

### 2. Neo4j Error Graph Service

**Purpose**: Build and manage error relationship graph

**Interface**:
```typescript
interface Neo4jErrorGraphService {
  initializeSchema(): Promise<void>;
  createErrorNodes(errors: Error[]): Promise<void>;
  establishRelationships(errors: Error[]): Promise<void>;
  getErrorClusters(): Promise<ErrorCluster[]>;
  close(): Promise<void>;
}

interface ErrorCluster {
  id: string;
  errors: Error[];
  relationships: Relationship[];
  patterns: string[];
}

interface Relationship {
  source: string;
  target: string;
  type: 'similar_to' | 'depends_on' | 'caused_by';
  weight: number;
}
```

**Implementation**:
- Create error nodes with properties
- Establish relationships based on file dependencies
- Calculate relationship weights using embeddings
- Query for error patterns

### 3. GPU Clustering Service

**Purpose**: Perform CUDA-accelerated error clustering

**Interface**:
```typescript
interface GPUClusteringService {
  clusterErrors(embeddings: Embedding[]): Promise<Cluster[]>;
  calculateSilhouetteScores(clusters: Cluster[]): Promise<number[]>;
  findOptimalK(embeddings: Embedding[]): Promise<number>;
  getClusteringStats(): Promise<ClusteringStats>;
}

interface Cluster {
  id: string;
  centroid: number[];
  errors: Error[];
  silhouetteScore: number;
  size: number;
}

interface ClusteringStats {
  cudaAvailable: boolean;
  gpuMemory: number;
  processingTime: number;
  clusterCount: number;
}
```

**Implementation**:
- Load embeddings from Qdrant
- Perform K-means clustering with CUDA
- Calculate silhouette scores
- Determine optimal cluster count

### 4. AI Patch Generation Service

**Purpose**: Generate intelligent patches for error clusters

**Interface**:
```typescript
interface AIPatchGenerationService {
  generatePatches(clusters: Cluster[]): Promise<Patch[]>;
  scoreConfidence(patch: Patch): Promise<number>;
  generateMultiFilePatch(errors: Error[]): Promise<Patch>;
}

interface Patch {
  id: string;
  clusterId: string;
  files: PatchFile[];
  description: string;
  confidence: number;
  reasoning: string;
}

interface PatchFile {
  path: string;
  changes: Change[];
  before: string;
  after: string;
}

interface Change {
  type: 'add' | 'remove' | 'modify';
  line: number;
  content: string;
}
```

**Implementation**:
- Analyze error cluster patterns
- Generate patches using gemma3-legal
- Score confidence based on pattern match
- Support multi-file patches

### 5. Patch Application Service

**Purpose**: Apply patches safely with validation

**Interface**:
```typescript
interface PatchApplicationService {
  applyPatch(patch: Patch): Promise<PatchResult>;
  validatePatch(patch: Patch): Promise<ValidationResult>;
  rollbackPatch(patch: Patch): Promise<void>;
}

interface PatchResult {
  patchId: string;
  applied: boolean;
  validationPassed: boolean;
  errorsResolved: number;
  newErrorsIntroduced: number;
  timestamp: Date;
}

interface ValidationResult {
  passed: boolean;
  errorsBefore: number;
  errorsAfter: number;
  newErrors: Error[];
  resolvedErrors: Error[];
}
```

**Implementation**:
- Apply patches using ts-morph
- Validate with svelte-check
- Track validation results
- Rollback on failure

### 6. Progress Tracking Service

**Purpose**: Track and report pipeline progress

**Interface**:
```typescript
interface ProgressTrackingService {
  trackIteration(iteration: number, metrics: IterationMetrics): Promise<void>;
  getProgressReport(): Promise<ProgressReport>;
  saveProgress(): Promise<void>;
}

interface IterationMetrics {
  errorCount: number;
  successfulPatches: number;
  improvement: number;
  processingTime: number;
  timestamp: Date;
}

interface ProgressReport {
  iterations: IterationMetrics[];
  totalImprovement: number;
  improvementPercent: number;
  estimatedCompletion: Date;
}
```

**Implementation**:
- Store metrics in Postgres
- Generate progress reports
- Provide real-time dashboard updates
- Track historical trends

## Data Models

### Error Model
```typescript
interface Error {
  id: string;                    // Unique identifier
  file: string;                  // File path
  line: number;                  // Line number
  column: number;                // Column number
  message: string;               // Error message
  severity: 'error' | 'warning'; // Severity level
  code: string;                  // Error code
  context: string;               // Code context
  embedding?: number[];          // Vector embedding
  clusterId?: string;            // Assigned cluster
  patchId?: string;              // Applied patch
  resolved: boolean;             // Resolution status
  timestamp: Date;               // Creation time
}
```

### Cluster Model
```typescript
interface Cluster {
  id: string;                    // Unique identifier
  centroid: number[];            // Cluster center
  errors: Error[];               // Member errors
  silhouetteScore: number;       // Quality metric
  size: number;                  // Number of errors
  pattern: string;               // Error pattern
  suggestedFix: string;          // Suggested solution
  timestamp: Date;               // Creation time
}
```

### Patch Model
```typescript
interface Patch {
  id: string;                    // Unique identifier
  clusterId: string;             // Source cluster
  files: PatchFile[];            // Files to modify
  description: string;           // Patch description
  confidence: number;            // Confidence score (0-100)
  reasoning: string;             // Generation reasoning
  applied: boolean;              // Application status
  validationPassed: boolean;     // Validation status
  timestamp: Date;               // Creation time
}
```

## Error Handling

### Retry Logic
- Exponential backoff for transient failures
- Maximum 3 retries with 1s, 2s, 4s delays
- Circuit breaker for persistent failures

### Validation
- Input validation for all service calls
- Schema validation for Neo4j operations
- Embedding dimension validation

### Rollback Strategy
- Automatic rollback on validation failure
- Manual rollback capability
- Rollback history tracking

## Testing Strategy

### Unit Tests
- Error extraction parsing
- Embedding generation
- Clustering algorithm
- Patch generation logic
- Validation logic

### Integration Tests
- End-to-end pipeline execution
- Service communication
- Database operations
- Error recovery

### Performance Tests
- Clustering speed (target: <5s for 1000 errors)
- Patch generation speed (target: <2s per cluster)
- Memory usage (target: <4GB for 80k errors)
- GPU utilization (target: 70-90%)

### Validation Tests
- Patch correctness
- Error resolution verification
- No new errors introduced
- Code quality maintained

## Performance Targets

| Metric | Target | Notes |
|--------|--------|-------|
| Error Extraction | <30s | For full codebase |
| Embedding Generation | <2min | For 80k errors |
| Clustering | <5s | With GPU acceleration |
| Patch Generation | <2s/cluster | Using gemma3-legal |
| Validation | <1min | Per iteration |
| Total Iteration | <5min | Full cycle |
| Error Reduction | 95%+ | 80k → <1k |
| Success Rate | 75-85% | Patch acceptance |

## Deployment Architecture

### Docker Services
- Phase 72 Orchestrator (Node.js)
- Neo4j Graph Database
- Ollama LLM Service
- Qdrant Vector Database
- Redis Cache
- Postgres Tracking Database

### Resource Requirements
- GPU: NVIDIA RTX 3060 Ti or better
- Memory: 16GB+ RAM
- Storage: 50GB+ for databases
- CPU: 8+ cores recommended

## Monitoring and Observability

### Metrics
- Error count over time
- Patch success rate
- GPU utilization
- Processing time per phase
- Memory usage

### Logging
- Structured JSON logging
- Error tracking with stack traces
- Performance metrics
- Audit trail for patches

### Dashboard
- Real-time error count
- Cluster visualization
- Patch success tracking
- System health metrics
- Historical trends
