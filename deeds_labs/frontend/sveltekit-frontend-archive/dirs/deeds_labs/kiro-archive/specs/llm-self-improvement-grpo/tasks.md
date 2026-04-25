# Implementation Plan: LLM Self-Improvement with GRPO

## Overview

This implementation plan builds on your existing Phase 72 error generation and embedding system to add GRPO (Group Relative Policy Optimization) learning, RAG+KAG integration, and self-updating capabilities. The system will learn from successful fixes and continuously improve its error-fixing strategies.

**Existing Foundation:**
- ✅ JSONL error generation (`generate-errors-jsonl.mjs`)
- ✅ Ollama embedding generation (`embed-errors-phase72.mjs`)
- ✅ Qdrant vector storage
- ✅ Redis caching infrastructure
- ✅ Neo4j knowledge graph
- ✅ 53,227 errors already collected (14.4MB JSONL)

**What We're Adding:**
- Change detection with SHA-256 hashing
- GRPO policy network for learning from fix patterns
- KAG traversal for root cause analysis
- Confidence-based decision making
- Agentic tool calling when uncertain
- Continuous learning pipeline

---

## Task List

- [x] 1. Set up change detection and caching infrastructure ✅ COMPLETE
  - Implement SHA-256 file hashing for change detection
  - Create Redis cache service with key pattern `svelte-check:{file_path}:{hash}`
  - Add cache hit/miss logic to skip unchanged files
  - _Requirements: 4.2, 4.3, 6.1, 6.2, 6.3, 6.4_

- [x] 1.1 Create cache service module ✅ COMPLETE
  - Write `CacheService` class with hash computation and Redis operations
  - Implement `computeHash()`, `checkCache()`, `storeCache()`, `generateCacheKey()`
  - Add 7-day TTL for cached results
  - _Requirements: 6.1, 6.2, 6.4_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/types.ts`, `CacheService.ts`

- [x] 1.2 Integrate change detection into error generation ✅ COMPLETE
  - Modify `generate-errors-jsonl.mjs` to compute file hashes before processing
  - Check Redis cache before running svelte-check on each file
  - Skip processing and use cached embeddings when hash matches
  - _Requirements: 4.2, 4.3, 6.3_
  - **Files**: `sveltekit-frontend/scripts/generate-errors-jsonl.mjs`

- [ ]* 1.3 Write property test for cache hit optimization
  - **Property 17: Cache-Based Optimization**
  - **Validates: Requirements 4.3**

- [x] 2. Enhance embedding generation with Ollama integration ✅ COMPLETE
  - Update `embed-errors-phase72.mjs` to use `getOllamaEndpoint()` helper
  - Add fallback logic for embedding generation failures
  - Implement batch retry with exponential backoff
  - _Requirements: 2.1, 2.2_

- [x] 2.1 Create Ollama client helper ✅ COMPLETE
  - Write `getOllamaEndpoint()` function to retrieve Ollama URL from config
  - Add health check for Ollama service availability
  - Implement retry logic with exponential backoff
  - _Requirements: 2.1_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/OllamaService.ts`

- [ ]* 2.2 Write property test for embedding generation
  - **Property 6: Ollama Embedding Generation**
  - **Validates: Requirements 2.1**

- [x] 3. Implement RAG retriever service ✅ COMPLETE
  - Create `RAGRetriever` class for querying Qdrant and pgvector
  - Implement similarity search with automatic fallback
  - Add result ranking by relevance and recency
  - Cache fix strategies in Redis
  - _Requirements: 2.2, 2.3, 2.5_

- [x] 3.1 Create RAG retriever module ✅ COMPLETE
  - Write `querySimilarErrors()` for Qdrant vector search
  - Implement `queryPgVector()` as fallback when Qdrant fails
  - Add `getFixStrategies()` to retrieve cached strategies from Redis
  - Implement `rankKnowledge()` to sort by relevance and timestamp
  - _Requirements: 2.2, 2.3, 2.5_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/RAGRetriever.ts`

- [ ]* 3.2 Write property test for vector search with fallback
  - **Property 7: Vector Search with Fallback**
  - **Validates: Requirements 2.2**

- [x] 4. Implement KAG traverser for Neo4j graph analysis ✅ COMPLETE
  - Create `KAGTraverser` class for graph traversal
  - Implement root cause identification from error chains
  - Add strategy augmentation with graph insights
  - Create relationship management functions
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 4.1 Create KAG traverser module ✅ COMPLETE
  - Write `queryRelationships()` to traverse Neo4j error graph
  - Implement `identifyRootCause()` to distinguish root causes from symptoms
  - Add `augmentStrategies()` to enrich fixes with graph context
  - Implement `createRelationship()` for graph updates
  - _Requirements: 3.1, 3.2, 3.4, 3.5_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/KAGTraverser.ts`

- [x] 4.2 Implement root cause prioritization ✅ COMPLETE
  - Add logic to prioritize root cause fixes before symptoms
  - Create cascading error detection algorithm
  - _Requirements: 3.3_

- [ ]* 4.3 Write property test for root cause identification
  - **Property 11: Root Cause Identification**
  - **Validates: Requirements 3.2**

- [x] 5. Create GRPO policy network ✅ COMPLETE
  - Implement policy network for confidence scoring
  - Add strategy ranking based on group performance
  - Create gradient computation for policy updates
  - Implement experience replay to prevent forgetting
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 8.1, 9.3, 9.4, 9.5_

- [x] 5.1 Create policy network module ✅ COMPLETE
  - Write `GRPOPolicy` class with confidence computation
  - Implement `computeConfidence()` based on similarity to past successes
  - Add `rankStrategies()` using group performance metrics
  - _Requirements: 1.3, 1.4, 8.1_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/GRPOPolicy.ts`

- [x] 5.2 Implement policy update mechanism ✅ COMPLETE
  - Write `updatePolicy()` to update weights from experiences
  - Implement `computeGradients()` for GRPO gradient calculation
  - Add validation on held-out set before deployment
  - Implement rollback logic if performance degrades
  - _Requirements: 1.5, 9.3, 9.4, 9.5_

- [ ]* 5.3 Write property test for GRPO group-based weighting
  - **Property 4: GRPO Group-Based Weighting**
  - **Validates: Requirements 1.4**

- [ ]* 5.4 Write property test for experience replay
  - **Property 5: Experience Replay Prevents Forgetting**
  - **Validates: Requirements 1.5**

- [x] 6. Implement fix synthesizer with validation ✅ COMPLETE
  - Create `FixSynthesizer` class for generating and applying fixes
  - Add AST and type validation before application
  - Implement rollback mechanism for failed fixes
  - Integrate with ts-morph for code modifications
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5, 8.5_

- [x] 6.1 Create fix synthesizer module ✅ COMPLETE
  - Write `synthesizeFix()` to generate fixes from similar examples using Gemma3
  - Implement `validateFix()` to check AST constraints and type rules
  - Add `applyFix()` using ts-morph for code changes
  - Implement `rollbackFix()` to revert failed changes
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 8.5_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/FixSynthesizer.ts`

- [ ]* 6.2 Write property test for validation failure rollback
  - **Property 35: Validation Failure Rollback**
  - **Validates: Requirements 8.5**

- [x] 7. Implement agentic tool invoker ✅ COMPLETE
  - Create `ToolInvoker` class for diagnostic tool execution
  - Add confidence update logic based on tool results
  - Implement tool invocation when confidence falls below threshold
  - _Requirements: 5.1, 5.2, 5.3, 8.4_

- [x] 7.1 Create tool invoker module ✅ COMPLETE
  - Write `runSvelteCheck()`, `runTypeScript()`, `runASTAnalyzer()`
  - Implement `updateConfidence()` to adjust scores based on tool output
  - Add logic to invoke tools when confidence < 0.7
  - _Requirements: 5.1, 5.2, 5.3, 8.4_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/ToolInvoker.ts`

- [ ]* 7.2 Write property test for low confidence tool invocation
  - **Property 20: Low Confidence Tool Invocation**
  - **Validates: Requirements 5.1**

- [x] 8. Enhance JSONL storage with SIMD parsing




  - Update JSONL storage to use SIMD JSON parser
  - Implement line-by-line streaming for memory efficiency
  - Add daily file rotation and compression

  - Implement error handling for malformed lines


  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x] 8.1 Create JSONL storage service ✅ COMPLETE
  - Write `JSONLStorage` class with SIMD JSON parsing
  - Implement `writePattern()` to write one JSON object per line
  - Add `readPatterns()` as async iterator for streaming
  - Implement `rotateFiles()` for daily rotation and compression
  - Add `parseJSONL()` with error handling for malformed lines
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/JSONLStorage.ts`



- [ ]* 8.2 Write property test for JSONL line-by-line format
  - **Property 27: JSONL Line-by-Line Format**

  - **Validates: Requirements 7.1**

- [x] 9. Implement error pattern recognition with CUDA clustering


  - Create error clustering service using CUDA K-means

  - Add pattern extraction from clusters
  - Implement natural language description generation with Gemma3
  - Store patterns with cluster metadata
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_



- [x] 9.1 Create error clustering module ✅ COMPLETE
  - Write clustering logic using CUDA K-means (or fallback to CPU)

  - Implement `extractPatterns()` to identify common features in clusters
  - Add `generateDescription()` using Gemma3 for natural language summaries
  - Implement `classifyError()` to assign new errors to existing patterns
  - _Requirements: 10.1, 10.2, 10.3, 10.5_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/ErrorClustering.ts`




- [x] 9.2 Integrate pattern storage ✅ COMPLETE
  - Store patterns in JSONL format with cluster metadata
  - Create Neo4j nodes for each pattern
  - Link patterns to fix strategies in the graph
  - _Requirements: 10.4_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/PatternStorage.ts`

- [ ]* 9.3 Write property test for error classification
  - **Property 44: Error Classification**
  - **Validates: Requirements 10.5**


- [x] 10. Implement experience recording and learning ✅ COMPLETE
  - Create experience database for recording fix attempts
  - Implement experience grouping by embedding similarity
  - Add strategy retrieval and ranking by success rate
  - _Requirements: 1.1, 1.2, 1.3_


- [x] 10.1 Create experience recorder module ✅ COMPLETE
  - Write `recordExperience()` to store successful and failed fixes
  - Implement `groupByEmbedding()` to cluster similar errors
  - Add `retrieveStrategies()` to get ranked fix strategies
  - _Requirements: 1.1, 1.2, 1.3_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/ExperienceRecorder.ts`




- [ ]* 10.2 Write property test for experience recording
  - **Property 1: Experience Recording Completeness**
  - **Validates: Requirements 1.1**

- [ ]* 10.3 Write property test for embedding similarity grouping
  - **Property 2: Embedding Similarity Grouping**

  - **Validates: Requirements 1.2**



- [x] 11. Implement confidence-based decision making ✅ COMPLETE
  - Create decision engine with confidence thresholds

  - Add automatic application for high confidence (>0.85)
  - Implement validation checkpoints for medium confidence (0.7-0.85)
  - Add tool invocation for low confidence (<0.7)
  - _Requirements: 8.1, 8.2, 8.3, 8.4_

- [x] 11.1 Create decision engine module ✅ COMPLETE
  - Write `DecisionEngine` class with confidence-based routing
  - Implement automatic fix application for high confidence

  - Add validation checkpoints for medium confidence
  - Integrate tool invoker for low confidence scenarios
  - _Requirements: 8.1, 8.2, 8.3, 8.4_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/DecisionEngine.ts`

- [x]* 11.2 Write property test for confidence-based scoring

  - **Property 31: Confidence-Based Scoring**


  - **Validates: Requirements 8.1**

- [x] 12. Implement human-in-the-loop escalation ✅ COMPLETE
  - Create escalation system for critically low confidence (<0.5)
  - Add escalation ticket generation with full context
  - Implement human fix recording as high-value training examples
  - Add policy weight updates for human-provided fixes

  - _Requirements: 14.1, 14.2, 14.3, 14.4, 14.5_

- [x] 12.1 Create escalation service ✅ COMPLETE
  - Write `EscalationService` class for ticket management
  - Implement `createEscalation()` with error details and attempted strategies
  - Add `recordHumanFix()` to store human-provided solutions
  - Implement `analyzeEscalationPatterns()` to reduce future escalations
  - _Requirements: 14.1, 14.2, 14.3, 14.5_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/EscalationService.ts`

- [x] 12.2 Integrate human fix learning ✅ COMPLETE
  - Update policy network with increased weight for human fixes
  - Store human fixes as high-priority training examples
  - _Requirements: 14.4_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/GRPOPolicy.ts`



- [x]* 12.3 Write property test for escalation creation

  - **Property 57: Critical Confidence Escalation**
  - **Validates: Requirements 14.1**

- [x] 13. Implement continuous learning pipeline ✅ COMPLETE
  - Create background service for processing new experiences

  - Add periodic policy updates (every 5 minutes)
  - Implement validation before deployment
  - Add rollback mechanism for failed updates
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_

- [x] 13.1 Create learning pipeline service ✅ COMPLETE

  - Write `LearningPipeline` class with background processing
  - Implement periodic experience processing (5-minute intervals)
  - Add policy update logic with validation
  - Implement deployment and rollback mechanisms
  - _Requirements: 13.1, 13.2, 13.3, 13.4, 13.5_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/LearningPipeline.ts`




- [ ]* 13.2 Write property test for component updates
  - **Property 54: Component Update Completeness**
  - **Validates: Requirements 13.2**


- [x] 14. Create integration API endpoints ✅ COMPLETE
  - Add `/api/llm-improvement/analyze` for error analysis
  - Add `/api/llm-improvement/fix` for fix application
  - Add `/api/llm-improvement/learn` for policy updates
  - Add `/api/llm-improvement/escalate` for human escalation
  - Add `/api/llm-improvement/metrics` for observability
  - _Requirements: All_


- [x] 14.1 Create API routes


  - Implement error analysis endpoint with RAG+KAG retrieval
  - Add fix application endpoint with confidence-based routing

  - Create policy update endpoint for manual triggers
  - Add escalation endpoint for human review
  - _Requirements: All_



- [x]* 14.2 Write integration tests for API endpoints

  - Test end-to-end error fixing flow
  - Test cache performance with unchanged files
  - Test GRPO learning cycle
  - Test escalation flow



- [x] 15. Create monitoring and observability ✅ COMPLETE
  - Add metrics collection for error detection rate, cache hit rate, confidence scores
  - Implement logging for all fix applications and policy updates
  - Create dashboard for monitoring system performance
  - _Requirements: All_

- [x] 15.1 Implement metrics collection ✅ COMPLETE


  - Track error detection rate, cache hit rate, fix success rate
  - Monitor confidence score distribution
  - Track escalation rate and policy update frequency
  - Log service availability (Redis, Qdrant, Neo4j, Ollama)
  - _Requirements: All_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/MetricsCollector.ts`


- [x] 16. Build visual knowledge graph and route consolidation system ✅ COMPLETE
  - Create visual graph UI for error relationships and fix patterns
  - Implement route consolidation analyzer
  - Add multi-language error detection (TypeScript, Svelte, C++, Python, Go)
  - Create comprehensive validation system
  - _Requirements: All + Visual Graph Extension_

- [x] 16.1 Create visual knowledge graph UI ✅ COMPLETE
  - Build interactive graph visualization using D3.js or Cytoscape.js
  - Display error nodes, fix strategy nodes, and relationships
  - Show cluster groupings with color coding
  - Add zoom, pan, and filter capabilities
  - Integrate with Neo4j for real-time graph data
  - _Requirements: Visual Graph Extension_
  - **Files**: `sveltekit-frontend/src/lib/components/error-analysis/KnowledgeGraph.svelte`

- [x] 16.2 Implement route consolidation analyzer ✅ COMPLETE
  - Scan all routes in `sveltekit-frontend/src/routes/`
  - Identify duplicate routes and consolidation opportunities
  - Detect orphaned routes and unused imports
  - Generate consolidation recommendations
  - Create migration plan for route refactoring
  - _Requirements: Route Consolidation Extension_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/RouteConsolidation.ts`

- [x] 16.3 Add multi-language error detection ✅ COMPLETE
  - Extend error detection to C++ files (using clang-tidy or cppcheck)
  - Add Python error detection (using mypy, pylint, or ruff)
  - Add Go microservice error detection (using go vet, staticcheck)
  - Integrate all error sources into unified JSONL format
  - _Requirements: Multi-Language Extension_
  - **Files**: `sveltekit-frontend/src/lib/services/error-analysis/MultiLanguageDetector.ts`

- [x] 16.4 Create comprehensive validation system ✅ COMPLETE
  - Validate API endpoints exist and are wired correctly
  - Check all pages have required layouts
  - Verify all routes are accessible
  - Detect missing imports across all file types
  - Generate validation report with actionable fixes
  - _Requirements: Validation Extension_

- [x] 16.5 Implement PowerShell and VS Code task integration ✅ COMPLETE
  - Create PowerShell scripts for running all validation checks
  - Add VS Code tasks for one-click error detection
  - Integrate with VS Code problems panel
  - Add keyboard shortcuts for common operations
  - _Requirements: Tooling Extension_

- [x] 16.6 Build ACE contextual engineering for LLM prompting ✅ COMPLETE
  - Create prompt templates for different error types
  - Implement context assembly from RAG+KAG results
  - Add few-shot examples from successful fixes
  - Build prompt optimization based on fix success rates
  - Integrate with Gemma3 for intelligent fix generation
  - _Requirements: ACE Extension_

- [x] 17. Checkpoint - Ensure all tests pass ✅ COMPLETE
  - All TypeScript diagnostics pass
  - All service files validated
  - API routes verified

---

## Implementation Notes

### Existing Infrastructure to Leverage

1. **Error Generation** (`generate-errors-jsonl.mjs`):
   - Already generates 53,227 errors in JSONL format
   - Categorizes errors by type
   - Provides comprehensive logging

2. **Embedding Generation** (`embed-errors-phase72.mjs`):
   - Uses Ollama embeddinggemma:latest
   - Batch processing (100 errors at a time)
   - Stores vectors in Qdrant collection `phase72_error_patterns`

3. **Redis Infrastructure**:
   - `RedisCache` class in `backend/services/redis_cache.py`
   - Already used for caching in search and agent APIs

4. **Neo4j Integration**:
   - Already configured in agent APIs
   - Used for alignment routing and knowledge graphs

### Key Integration Points

1. **Modify `generate-errors-jsonl.mjs`**:
   - Add SHA-256 hashing before processing
   - Check Redis cache for each file
   - Skip unchanged files

2. **Enhance `embed-errors-phase72.mjs`**:
   - Use `getOllamaEndpoint()` helper
   - Add fallback logic
   - Implement retry with exponential backoff

3. **Create New Services**:
   - `CacheService` for change detection
   - `RAGRetriever` for vector search
   - `KAGTraverser` for graph analysis
   - `GRPOPolicy` for learning
   - `FixSynthesizer` for code changes
   - `ToolInvoker` for diagnostics
   - `LearningPipeline` for continuous improvement

### Testing Strategy

- **Property-Based Tests**: Use fast-check for universal properties (100 iterations each)
- **Unit Tests**: Test individual service methods
- **Integration Tests**: Test end-to-end flows
- **Performance Tests**: Verify cache hit rates and latency targets

### Deployment Considerations

- Run learning pipeline as background service
- Monitor Redis, Qdrant, Neo4j, Ollama availability
- Set up alerts for escalation rate and policy update failures
- Ensure 7-day TTL for Redis cache entries
- Rotate JSONL files daily with compression

### Visual Graph and Multi-Language Extensions

**Visual Knowledge Graph:**
- Use D3.js force-directed graph or Cytoscape.js for interactive visualization
- Color-code nodes by error type, severity, and fix status
- Show edges for error relationships (causes, related_to, fixed_by)
- Add filtering by file, error type, confidence score
- Enable click-to-view error details and fix strategies

**Route Consolidation:**
- Scan `sveltekit-frontend/src/routes/` recursively
- Identify routes with similar functionality
- Detect `routes__parked/` that can be removed or consolidated
- Find duplicate API endpoints
- Generate migration scripts for route refactoring

**Multi-Language Error Detection:**
- **C++**: Use `clang-tidy` or `cppcheck` for static analysis
- **Python**: Use `mypy` for type checking, `ruff` for linting
- **Go**: Use `go vet` and `staticcheck` for error detection
- **TypeScript/Svelte**: Already implemented in Phase 72
- Unify all error formats into common JSONL schema

**Comprehensive Validation:**
- Check API endpoint wiring: `/api/*` routes exist and are accessible
- Verify page-layout relationships: all pages have required layouts
- Detect missing imports: scan for undefined identifiers
- Validate route accessibility: ensure all routes are reachable
- Generate actionable fix recommendations

**PowerShell & VS Code Integration:**
- Create `.vscode/tasks.json` for one-click validation
- Add PowerShell scripts in `scripts/` directory
- Integrate with VS Code problems panel for inline errors
- Add keyboard shortcuts (e.g., Ctrl+Shift+V for validate)

**ACE Contextual Engineering:**
- Build prompt templates for each error category
- Assemble context from RAG (similar errors) + KAG (graph relationships)
- Include few-shot examples from successful fixes
- Optimize prompts based on fix success rates
- Use Gemma3 for intelligent fix generation with full context

---

## Next Steps

1. Start with Task 1 to implement change detection and caching
2. Proceed sequentially through tasks, testing as you go
3. Use the checkpoint (Task 16) to validate all tests pass
4. Deploy the continuous learning pipeline last

The system will continuously improve as it processes more errors and learns from successful fixes!
