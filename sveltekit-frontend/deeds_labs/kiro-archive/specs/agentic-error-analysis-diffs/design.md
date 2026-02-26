# Agentic Error Analysis & Diff Generation - Design

## Overview

The Agentic Error Analysis & Diff Generation system is an intelligent error fixing pipeline that combines AST analysis, semantic search, LLM reasoning, and persistent context management. The system analyzes TypeScript/Svelte errors, retrieves relevant code patterns from the knowledge base, generates contextual diffs using agentic reasoning, and persists LLM prompts for ACE context.

**Key Capabilities:**
- Autonomous error analysis with agentic LLM reasoning
- RAG-based pattern retrieval from Qdrant knowledge base
- Contextual diff generation with surrounding code
- LLM prompt persistence for ACE context
- Error clustering for batch processing
- Error-brain namespace isolation
- Full audit trail and progress tracking

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Error Analysis Pipeline                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │ Error        │      │ AST          │      │ Clustering   │  │
│  │ Extraction   │─────▶│ Analysis     │─────▶│ & Grouping   │  │
│  │ (svelte-check)      │ (ts-morph)   │      │              │  │
│  └──────────────┘      └──────────────┘      └──────────────┘  │
│                                                      │            │
│                                                      ▼            │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │ Knowledge    │      │ Agentic      │      │ Diff         │  │
│  │ Base Query   │◀─────│ LLM Reasoning│─────▶│ Generation   │  │
│  │ (Qdrant RAG) │      │ (Gemma3)     │      │ (ts-morph)   │  │
│  └──────────────┘      └──────────────┘      └──────────────┘  │
│         │                      │                      │          │
│         │                      ▼                      │          │
│         │              ┌──────────────┐              │          │
│         │              │ Prompt       │              │          │
│         │              │ Persistence  │              │          │
│         │              │ (PostgreSQL) │              │          │
│         │              └──────────────┘              │          │
│         │                                             │          │
│         └─────────────────────────────────────────────┘          │
│                                                                   │
│  ┌──────────────┐      ┌──────────────┐      ┌──────────────┐  │
│  │ Validation   │      │ ACE Context  │      │ Audit Trail  │  │
│  │ (svelte-check)      │ Persistence  │      │ (PostgreSQL) │  │
│  └──────────────┘      └──────────────┘      └──────────────┘  │
│                                                                   │
└─────────────────────────────────────────────────────────────────┘
```

## Components and Interfaces

### 1. Error Extraction Service
**Purpose**: Extract errors from TypeScript/Svelte compilation

**Interface**:
```typescript
interface ErrorExtractor {
  extractErrors(): Promise<Error[]>;
  generateEmbeddings(errors: Error[]): Promise<Embedding[]>;
  storeInQdrant(embeddings: Embedding[]): Promise<void>;
}

interface Error {
  file: string;
  line: number;
  column: number;
  message: string;
  type: 'typescript' | 'svelte';
  severity: 'error' | 'warning';
  code?: string;
}
```

### 2. RAG Context Retriever
**Purpose**: Retrieve relevant code patterns from knowledge base

**Interface**:
```typescript
interface RAGRetriever {
  queryPatterns(error: Error, topK?: number): Promise<Pattern[]>;
  rankByRelevance(patterns: Pattern[]): Promise<Pattern[]>;
  formatContext(patterns: Pattern[]): Promise<string>;
}

interface Pattern {
  id: string;
  filePath: string;
  lineNumber: number;
  code: string;
  errorType: string;
  similarity: number;
}
```

### 3. Agentic LLM Analyzer
**Purpose**: Analyze errors and generate fixes using agentic reasoning

**Interface**:
```typescript
interface AgenticAnalyzer {
  analyzeError(error: Error, context: string): Promise<Analysis>;
  generatePrompt(error: Error, patterns: Pattern[]): Promise<string>;
  callLLM(prompt: string): Promise<LLMResponse>;
  persistPrompt(prompt: string, response: LLMResponse): Promise<void>;
}

interface Analysis {
  rootCause: string;
  suggestedFix: string;
  confidence: number;
  relatedErrors: string[];
}

interface LLMResponse {
  text: string;
  tokens: number;
  model: string;
  timestamp: Date;
}
```

### 4. Diff Generator
**Purpose**: Generate contextual diffs with surrounding code

**Interface**:
```typescript
interface DiffGenerator {
  generateDiff(error: Error, fix: string): Promise<Diff>;
  addContext(diff: Diff, contextLines?: number): Promise<Diff>;
  formatDiff(diff: Diff): Promise<string>;
}

interface Diff {
  file: string;
  original: string;
  modified: string;
  context: string;
  explanation: string;
  lineStart: number;
  lineEnd: number;
}
```

### 5. Error Clustering Service
**Purpose**: Group similar errors for batch processing

**Interface**:
```typescript
interface ErrorClusterer {
  clusterErrors(errors: Error[]): Promise<Cluster[]>;
  identifyRootCause(cluster: Cluster): Promise<string>;
  calculateImpact(cluster: Cluster): Promise<number>;
  prioritizeClusters(clusters: Cluster[]): Promise<Cluster[]>;
}

interface Cluster {
  id: string;
  errors: Error[];
  rootCause: string;
  impact: number;
  commonFix?: string;
}
```

### 6. ACE Context Manager
**Purpose**: Persist and restore agent context

**Interface**:
```typescript
interface ACEContextManager {
  saveContext(context: ACEContext): Promise<void>;
  loadContext(sessionId: string): Promise<ACEContext>;
  updateMetrics(metrics: Metrics): Promise<void>;
}

interface ACEContext {
  sessionId: string;
  errorAnalysis: Analysis[];
  fixesApplied: Diff[];
  metrics: Metrics;
  timestamp: Date;
}

interface Metrics {
  totalErrors: number;
  errorsFixed: number;
  successRate: number;
  averageConfidence: number;
}
```

### 7. Audit Trail Service
**Purpose**: Track all error analysis and fixes

**Interface**:
```typescript
interface AuditTrail {
  logAnalysis(error: Error, analysis: Analysis): Promise<void>;
  logFix(diff: Diff, result: 'success' | 'failure'): Promise<void>;
  queryHistory(filters: AuditFilter): Promise<AuditEntry[]>;
}

interface AuditEntry {
  id: string;
  timestamp: Date;
  user: string;
  action: 'analyze' | 'fix' | 'validate';
  details: Record<string, any>;
}
```

## Data Models

### Error Model
```typescript
interface Error {
  id: string;
  file: string;
  line: number;
  column: number;
  message: string;
  type: 'typescript' | 'svelte';
  severity: 'error' | 'warning';
  code?: string;
  embedding?: number[];
  clusterId?: string;
  status: 'new' | 'analyzing' | 'fixed' | 'failed';
  createdAt: Date;
  updatedAt: Date;
}
```

### LLM Prompt Model
```typescript
interface LLMPrompt {
  id: string;
  errorId: string;
  prompt: string;
  response: string;
  model: string;
  tokens: number;
  confidence: number;
  createdAt: Date;
  updatedAt: Date;
}
```

### Diff Model
```typescript
interface Diff {
  id: string;
  errorId: string;
  file: string;
  original: string;
  modified: string;
  context: string;
  explanation: string;
  lineStart: number;
  lineEnd: number;
  status: 'pending' | 'applied' | 'validated' | 'failed';
  createdAt: Date;
  appliedAt?: Date;
}
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Error Extraction Completeness
*For any* TypeScript/Svelte codebase, running error extraction SHALL return all errors reported by svelte-check and tsc.
**Validates: Requirements 1.1**

### Property 2: RAG Context Relevance
*For any* error and its semantic embedding, querying Qdrant SHALL return patterns with similarity scores ranked in descending order.
**Validates: Requirements 2.2, 2.3**

### Property 3: Prompt Persistence Round-Trip
*For any* LLM prompt and response, storing and retrieving from PostgreSQL SHALL return identical data.
**Validates: Requirements 3.1, 3.3**

### Property 4: Diff Context Preservation
*For any* diff with context lines, the modified code SHALL be surrounded by exactly 3-5 lines of original code before and after.
**Validates: Requirements 4.1, 4.2**

### Property 5: Error Clustering Consistency
*For any* set of errors with identical patterns, clustering SHALL group them into a single cluster.
**Validates: Requirements 5.1, 5.2**

### Property 6: ACE Context State Consistency
*For any* saved ACE context, loading and re-saving SHALL produce identical JSON structure.
**Validates: Requirements 6.1, 6.2**

### Property 7: Feature Flag Enforcement
*For any* request to `/api/error-brain/*` when error-brain is disabled, the system SHALL return 403 Forbidden.
**Validates: Requirements 7.2, 7.5**

### Property 8: Diff Application Idempotence
*For any* diff applied to a file, applying the same diff twice SHALL result in the same final state as applying it once.
**Validates: Requirements 8.1, 8.4**

### Property 9: Progress Metric Monotonicity
*For any* error analysis session, the total errors fixed SHALL never decrease as analysis progresses.
**Validates: Requirements 9.2, 9.3**

### Property 10: Knowledge Base Learning
*For any* successfully applied fix, storing it in the knowledge base and querying for similar errors SHALL return the stored fix with high similarity.
**Validates: Requirements 10.1, 10.4**

### Property 11: Audit Trail Completeness
*For any* error analysis operation, querying the audit trail with appropriate filters SHALL return all related entries.
**Validates: Requirements 12.1, 12.4**

### Property 12: Error Handling Resilience
*For any* transient service failure, the system SHALL retry with exponential backoff and eventually succeed or fail gracefully.
**Validates: Requirements 11.1, 11.2**

## Error Handling

**Transient Failures**:
- Implement exponential backoff (100ms → 1s → 10s → 60s)
- Maximum 5 retries before failing
- Log each retry attempt

**Validation Failures**:
- Skip invalid items and continue processing
- Log validation errors with context
- Alert operator if >10% of items fail validation

**Service Unavailability**:
- Pause processing and alert operator
- Queue operations for retry
- Provide fallback behavior (e.g., generic fixes)

**Data Integrity**:
- Use transactions for multi-step operations
- Implement rollback on failure
- Maintain audit trail of all changes

## Testing Strategy

### Unit Testing
- Test each service independently with mocked dependencies
- Test error extraction with sample error files
- Test diff generation with various code patterns
- Test clustering algorithm with synthetic error sets

### Property-Based Testing
- **Property 1**: Generate random error sets and verify extraction completeness
- **Property 2**: Generate random embeddings and verify ranking
- **Property 3**: Generate random prompts and verify round-trip
- **Property 4**: Generate random diffs and verify context
- **Property 5**: Generate random error patterns and verify clustering
- **Property 6**: Generate random contexts and verify state consistency
- **Property 7**: Generate requests with various feature flag states
- **Property 8**: Generate diffs and verify idempotence
- **Property 9**: Generate error sequences and verify monotonicity
- **Property 10**: Generate fixes and verify knowledge base retrieval
- **Property 11**: Generate operations and verify audit trail
- **Property 12**: Simulate failures and verify resilience

### Integration Testing
- Test full pipeline with real error files
- Test RAG retrieval with actual Qdrant instance
- Test LLM integration with Ollama
- Test database persistence with PostgreSQL
- Test feature flag enforcement with middleware

### Performance Testing
- Measure error extraction time for 1000+ errors
- Measure RAG query latency (target: <100ms)
- Measure diff generation time (target: <500ms)
- Measure clustering performance (target: <1s for 1000 errors)

## Implementation Phases

**Phase 1: Core Error Analysis**
- Error extraction service
- AST analysis with ts-morph
- Basic error clustering

**Phase 2: RAG Integration**
- Qdrant integration
- Pattern retrieval and ranking
- Context formatting

**Phase 3: Agentic LLM**
- Prompt generation
- LLM integration with Ollama
- Prompt persistence

**Phase 4: Diff Generation**
- Diff generation with context
- Diff application with ts-morph
- Validation with svelte-check

**Phase 5: ACE Context & Audit**
- ACE context persistence
- Audit trail implementation
- Progress tracking

**Phase 6: Error-Brain Isolation**
- Feature flag enforcement
- Namespace routing
- Production hardening

