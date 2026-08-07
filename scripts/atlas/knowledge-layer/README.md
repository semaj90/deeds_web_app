# Knowledge Layer Implementation

## Overview

This implementation provides the core components for the Knowledge Layer architecture, enabling ranked documentation retrieval, A2A hooks, and agentic error fixing through multi-lane analysis.

## Components

### Core Types (`types.ts`)
- `Symbol`: Represents code entities with boundaries, signatures, control flow
- `SymbolEdge`: Edges between symbols (CALLS, IMPORTS, WRITES_TABLE, etc.)
- `PatchCandidate`: Ranked candidates for editing/patching
- `RetrievalHook`: Standardized query interface for A2A
- `Evidence`: Ground truth claims with confidence scores

### Lane Implementations

#### Lane A: Lexical (`types.ts`)
- BM25, BM42, inverse search support
- Token matching and term frequency analysis

#### Lane B: Semantic (`semantic-behavior.ts`)
- Generates descriptions for symbols
- Extracts roles and ground spans
- Uses template-based approach (ready for LLM integration)

#### Lane C: Structural (`ast-extractor.ts`)
- Tree-sitter AST parsing
- Extracts function/class/method boundaries
- Identifies imports, exports, calls, control flow

#### Lane D: Functional Graph (`graph-construction.ts`)
- Builds edges between symbols
- Analyzes impact propagation
- Calculates blast radius

#### Lane E: Runtime Evidence (`runtime-evidence.ts`)
- Collects traces, logs, test results
- Aggregates symbol metrics
- Calculates evidence confidence

#### Lane F: Ranker (`ranker.ts`)
- Implements P = Σ(impact, confidence, evidence, failure) / (cost × blastRadius)
- Applies hard exclusions
- Scores and ranks symbols

#### Lane G: Inverse Search (`types.ts`)
- Recommendations for A2A hooks
- Error fixing suggestions

### Orchestrator (`retrieval-orchestrator.ts`)
- Routes queries across lanes
- RRF (Reciprocal Rank Fusion) score combining
- Unified RetrievalResult interface

### DAG Scheduler (`dag-scheduler.ts`)
- Topological sort for dependent tasks
- Execution plan management
- Recommendation pipeline support

### Embedding Verification (`embedding-verification.ts`)
- Verifies embeddinggemma:latest returns 768-dim vectors
- Checks for finite values
- Proper API usage (input vs prompt)

## Usage

```typescript
import { 
  parseAndExtract, 
  buildFunctionalGraph, 
  rankSymbols, 
  fuseLaneResults 
} from './knowledge-layer';

// Step 1: Parse source code
const astResult = await parseAndExtract(source, filePath, language);

// Step 2: Build functional graph
const edges = buildFunctionalGraph(astResult.symbols);

// Step 3: Rank symbols
const ranked = rankSymbols({
  symbols: astResult.symbols,
  edges,
  metrics: symbolMetricsMap,
  query: { impact: 10, confidence: 0.8, evidenceStrength: 0.7 }
});

// Step 4: Fuse results across lanes
const result = fuseLaneResults([
  { lane: 'lexical', results: lexicalResults, score: 0.5 },
  { lane: 'semantic', results: semanticResults, score: 0.6 },
  // ... other lanes
]);
```

## Recommendation Pipeline

The DAG scheduler supports the recommended implementation sequence:

1. **Normalize packet identities** (no dependencies)
2. **Rebuild Qdrant payload lineage** (depends on #1)
3. **Add CAGRA benchmark** (depends on #2)
4. **Train retrieval policy adapter** (depends on #3)

```typescript
const pipeline = createRecommendationPipeline();
const plan = buildExecutionPlan([
  pipeline.normalizeIdentities,
  pipeline.rebuildQdrantPayload,
  pipeline.addCAGRABenchmark,
  pipeline.trainRetrievalAdapter,
]);

await executePlan(plan);
```

## Embedding Verification

```typescript
const check = await verifyEmbedding();
console.log(`Model: ${check.model}`);
console.log(`Dimensions: ${check.result.dimension}`);
console.log(`Finite: ${check.result.finite}`);
```

Expected output:
```
Model: embeddinggemma:latest
Dimensions: 768
Finite: true
```

## Next Steps

1. **Integrate Tree-sitter parsers** for TypeScript, Rust, Python
2. **Connect to actual trace/logging systems** for runtime evidence
3. **Implement BM25/BM42 search** backends
4. **Add LLM integration** for semantic descriptions
5. **Build Qdrant integration** for payload lineage
6. **Implement CAGRA benchmark** suite
7. **Create A2A protocol** for agent interoperability

## Status

- ✅ Core types and interfaces defined
- ✅ AST extraction pipeline structure
- ✅ Graph construction logic
- ✅ Ranker with P formula
- ✅ DAG scheduler for recommendation pipelines
- ✅ Embedding verification
- ⏳ Tree-sitter parser integration (pending)
- ⏳ Runtime evidence collection (pending)
- ⏳ BM25/BM42 search backends (pending)
- ⏳ LLM integration for semantic descriptions (pending)
