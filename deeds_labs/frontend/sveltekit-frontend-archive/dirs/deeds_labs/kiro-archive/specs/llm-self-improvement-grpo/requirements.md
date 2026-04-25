# Requirements Document: LLM Self-Improvement with GRPO and Knowledge-Augmented Generation

## Introduction

This feature implements a self-improving LLM system that learns from its error-fixing experiences using GRPO (Group Relative Policy Optimization) thinking, integrates RAG (Retrieval-Augmented Generation) and KAG (Knowledge-Augmented Generation) for grounded decision-making, and employs agentic tool calling when uncertain. The system maintains a growing knowledge base of successful fixes, error patterns, and resolution strategies that continuously improves the LLM's ability to diagnose and fix errors autonomously.

## Glossary

- **GRPO (Group Relative Policy Optimization)**: Reinforcement learning technique that learns from groups of related experiences to improve decision-making
- **RAG (Retrieval-Augmented Generation)**: Technique that grounds LLM responses in retrieved knowledge from vector databases
- **KAG (Knowledge-Augmented Generation)**: Extension of RAG that combines vector search with knowledge graph traversal for richer context
- **Self-Updating Knowledge Base**: Dynamic repository of error patterns, fixes, and strategies that grows with each successful resolution
- **Agentic Tool Calling**: Autonomous invocation of tools (search, analysis, validation) when the LLM detects uncertainty
- **Error Pattern**: Recurring error signature identified through embedding similarity and graph analysis
- **Fix Strategy**: Proven approach to resolving a specific error pattern, stored with success metrics
- **Confidence Score**: Numerical measure (0-1) of the LLM's certainty about a proposed fix
- **Knowledge Graph**: Neo4j graph connecting errors, fixes, files, and dependencies
- **Experience Replay**: Technique of learning from past successful and failed fix attempts
- **Policy Network**: Neural component that learns optimal fix strategies from experience

## Requirements

### Requirement 1: GRPO Learning Framework

**User Story:** As an AI system, I want to learn from groups of related error-fixing experiences, so that I can improve my fixing strategies over time.

#### Acceptance Criteria

1. WHEN the system successfully fixes an error THEN the system SHALL record the error pattern, fix strategy, and outcome in the experience database
2. WHEN multiple similar errors are fixed THEN the system SHALL group them by embedding similarity and identify common patterns
3. WHEN a new error is encountered THEN the system SHALL retrieve similar past experiences and rank fix strategies by success rate
4. WHEN fix strategies are ranked THEN the system SHALL use GRPO to weight strategies based on group performance rather than individual instances
5. WHEN the policy network is updated THEN the system SHALL use experience replay to prevent catastrophic forgetting

### Requirement 2: RAG Integration for Error Context with Ollama Embeddings

**User Story:** As an error-fixing agent, I want to retrieve relevant context from the knowledge base using Ollama embeddings, so that I can make informed decisions about fixes.

#### Acceptance Criteria

1. WHEN an error is detected THEN the system SHALL generate embeddings using Ollama embeddinggemma:latest via getOllamaEndpoint()
2. WHEN embeddings are generated THEN the system SHALL query Qdrant for similar past errors with fallback to pgvector
3. WHEN similar errors are found THEN the system SHALL retrieve their fix strategies and success rates from Redis cache
4. WHEN no similar errors exist THEN the system SHALL retrieve general patterns from the same file or module
5. WHEN context is assembled THEN the system SHALL rank retrieved knowledge by relevance and recency

### Requirement 3: KAG Integration with Knowledge Graph

**User Story:** As an error-fixing agent, I want to traverse the knowledge graph to understand error relationships, so that I can identify root causes and cascading effects.

#### Acceptance Criteria

1. WHEN an error is analyzed THEN the system SHALL query Neo4j for related errors, files, and dependencies
2. WHEN graph relationships are found THEN the system SHALL identify if the error is a root cause or symptom
3. WHEN cascading errors are detected THEN the system SHALL prioritize fixing the root cause first
4. WHEN fix strategies are retrieved THEN the system SHALL augment them with graph-derived insights
5. WHEN the knowledge graph is updated THEN the system SHALL create new relationships between errors and fixes

### Requirement 4: Self-Updating Knowledge Base with Change Detection

**User Story:** As a learning system, I want to automatically update my knowledge base with new patterns and strategies, so that I continuously improve without wasting time on unchanged files.

#### Acceptance Criteria

1. WHEN a fix is successfully applied THEN the system SHALL extract the fix pattern and store it in JSONL format for efficient streaming
2. WHEN a file is analyzed THEN the system SHALL compute a hash and check Redis cache to determine if svelte-check output has changed
3. WHEN svelte-check output is unchanged THEN the system SHALL skip processing and use cached embeddings from Redis
4. WHEN a new error pattern is identified THEN the system SHALL create a Neo4j node with properties and relationships
5. WHEN the knowledge base grows THEN the system SHALL periodically consolidate similar patterns to prevent redundancy

### Requirement 5: Agentic Tool Calling When Lost

**User Story:** As an autonomous agent, I want to invoke tools when I'm uncertain, so that I can gather more information before making decisions.

#### Acceptance Criteria

1. WHEN the confidence score falls below 0.7 THEN the system SHALL invoke diagnostic tools to gather more context
2. WHEN diagnostic tools are invoked THEN the system SHALL call svelte-check, TypeScript compiler, and AST analyzer
3. WHEN tool results are received THEN the system SHALL update the confidence score based on new information
4. WHEN confidence remains low THEN the system SHALL query the knowledge graph for similar low-confidence scenarios
5. WHEN all tools have been exhausted THEN the system SHALL escalate to human review with detailed context

### Requirement 6: Redis Cache and Change Detection

**User Story:** As a performance engineer, I want to cache svelte-check results and skip unchanged files, so that I don't waste time reprocessing files that haven't changed.

#### Acceptance Criteria

1. WHEN svelte-check runs THEN the system SHALL compute SHA-256 hash of each file's content and error output
2. WHEN a file hash is computed THEN the system SHALL check Redis cache with key "svelte-check:{file_path}:{hash}"
3. WHEN cache hit occurs THEN the system SHALL skip embedding generation and use cached results
4. WHEN cache miss occurs THEN the system SHALL process the file and store results in Redis with 7-day TTL
5. WHEN Redis is unavailable THEN the system SHALL fall back to processing all files without caching

### Requirement 7: JSONL Storage Format for Efficient Streaming

**User Story:** As an autonomous agent, I want to invoke tools when I'm uncertain, so that I can gather more information before making decisions.

#### Acceptance Criteria

1. WHEN the confidence score falls below 0.7 THEN the system SHALL invoke diagnostic tools to gather more context
2. WHEN diagnostic tools are invoked THEN the system SHALL call svelte-check, TypeScript compiler, and AST analyzer
3. WHEN tool results are received THEN the system SHALL update the confidence score based on new information
4. WHEN confidence remains low THEN the system SHALL query the knowledge graph for similar low-confidence scenarios
5. WHEN all tools have been exhausted THEN the system SHALL escalate to human review with detailed context

### Requirement 7: JSONL Storage Format for Efficient Streaming

**User Story:** As a data engineer, I want to store error patterns and fixes in JSONL format, so that I can efficiently stream and process large datasets.

#### Acceptance Criteria

1. WHEN error patterns are stored THEN the system SHALL write them to JSONL files with one JSON object per line
2. WHEN JSONL files are read THEN the system SHALL use SIMD JSON parser for high-speed parsing
3. WHEN streaming large datasets THEN the system SHALL process JSONL line-by-line to minimize memory usage
4. WHEN JSONL files grow large THEN the system SHALL rotate them daily and compress old files
5. WHEN JSONL parsing fails THEN the system SHALL skip the malformed line and log the error

### Requirement 8: Confidence-Based Decision Making

**User Story:** As an error-fixing agent, I want to assess my confidence before applying fixes, so that I avoid making incorrect changes.

#### Acceptance Criteria

1. WHEN a fix strategy is proposed THEN the system SHALL compute a confidence score based on similarity to past successes
2. WHEN confidence is high (>0.85) THEN the system SHALL apply the fix automatically
3. WHEN confidence is medium (0.7-0.85) THEN the system SHALL apply the fix with validation checkpoints
4. WHEN confidence is low (<0.7) THEN the system SHALL invoke agentic tools before proceeding
5. WHEN validation fails THEN the system SHALL rollback the fix and update the knowledge base with the failure

### Requirement 9: Experience Replay and Policy Updates

**User Story:** As a learning system, I want to replay past experiences to update my policy, so that I learn from both successes and failures.

#### Acceptance Criteria

1. WHEN the system has accumulated 100+ experiences THEN the system SHALL trigger a policy update cycle
2. WHEN policy update begins THEN the system SHALL sample experiences with priority given to recent and high-impact cases
3. WHEN experiences are sampled THEN the system SHALL compute GRPO gradients based on group performance
4. WHEN gradients are computed THEN the system SHALL update the policy network using Adam optimizer
5. WHEN policy is updated THEN the system SHALL validate on a held-out set and rollback if performance degrades

### Requirement 10: Error Pattern Recognition

**User Story:** As an error analyst, I want to automatically identify recurring error patterns, so that I can develop targeted fix strategies.

#### Acceptance Criteria

1. WHEN errors are collected THEN the system SHALL cluster them by embedding similarity using CUDA K-means
2. WHEN clusters are formed THEN the system SHALL analyze each cluster to extract common patterns
3. WHEN patterns are extracted THEN the system SHALL generate natural language descriptions using Gemma3
4. WHEN patterns are described THEN the system SHALL store them in the knowledge base with cluster metadata
5. WHEN new errors arrive THEN the system SHALL classify them into existing patterns or create new ones

### Requirement 11: Fix Strategy Synthesis

**User Story:** As an autonomous fixer, I want to synthesize new fix strategies from successful patterns, so that I can handle novel errors.

#### Acceptance Criteria

1. WHEN a novel error is encountered THEN the system SHALL retrieve the top-5 most similar past fixes
2. WHEN similar fixes are retrieved THEN the system SHALL use Gemma3 to synthesize a new strategy
3. WHEN a strategy is synthesized THEN the system SHALL validate it against AST constraints and type rules
4. WHEN validation passes THEN the system SHALL apply the strategy with low confidence and monitor results
5. WHEN the strategy succeeds THEN the system SHALL add it to the knowledge base as a new pattern

### Requirement 12: Multi-Modal Error Context

**User Story:** As an error analyzer, I want to consider multiple modalities (text, AST, runtime, visual), so that I have complete context for fixing.

#### Acceptance Criteria

1. WHEN an error is analyzed THEN the system SHALL extract text (error message), AST (code structure), and runtime (stack trace)
2. WHEN visual context is available THEN the system SHALL include screenshots or UI state from Playwright
3. WHEN all modalities are collected THEN the system SHALL generate a 1024-dimensional feature vector
4. WHEN the feature vector is generated THEN the system SHALL use it for similarity search and clustering
5. WHEN fixes are proposed THEN the system SHALL consider all modalities to ensure comprehensive solutions

### Requirement 13: Continuous Learning Pipeline

**User Story:** As a system operator, I want the learning pipeline to run continuously in the background, so that the system improves without manual intervention.

#### Acceptance Criteria

1. WHEN the system is running THEN the learning pipeline SHALL process new experiences every 5 minutes
2. WHEN experiences are processed THEN the system SHALL update embeddings, clusters, and policy weights
3. WHEN policy weights are updated THEN the system SHALL validate changes against a test set
4. WHEN validation passes THEN the system SHALL deploy the updated policy to production
5. WHEN validation fails THEN the system SHALL rollback and log the failure for investigation

### Requirement 14: Human-in-the-Loop Escalation

**User Story:** As a developer, I want the system to escalate to me when it's uncertain, so that I can provide guidance and improve the system.

#### Acceptance Criteria

1. WHEN confidence is critically low (<0.5) THEN the system SHALL create an escalation ticket with full context
2. WHEN an escalation is created THEN the system SHALL include error details, attempted strategies, and confidence scores
3. WHEN a human provides a fix THEN the system SHALL record it as a high-value training example
4. WHEN the human fix is successful THEN the system SHALL update the policy with increased weight
5. WHEN escalations are resolved THEN the system SHALL analyze patterns to reduce future escalations

## Acceptance Criteria Testing Prework

### 1.1 Record error pattern and fix strategy
**Thoughts:** This is about recording all successful fixes. We can generate random errors and fixes, record them, and verify they're stored correctly.
**Testable:** yes - property

### 1.2 Group similar errors by embedding similarity
**Thoughts:** This is about clustering. We can generate errors with known similarities and verify they're grouped correctly.
**Testable:** yes - property

### 1.3 Retrieve and rank fix strategies
**Thoughts:** This is about retrieval and ranking. We can query for errors and verify strategies are ranked by success rate.
**Testable:** yes - property

### 1.4 GRPO weighting of strategies
**Thoughts:** This is about the GRPO algorithm. We can verify that group performance influences weights more than individual instances.
**Testable:** yes - property

### 1.5 Experience replay prevents forgetting
**Thoughts:** This is about catastrophic forgetting. We can train on new data and verify old patterns are still recognized.
**Testable:** yes - property

### 2.1 Generate embeddings using Ollama
**Thoughts:** This is about embedding generation. We can generate random errors and verify embeddings are created via getOllamaEndpoint().
**Testable:** yes - property

### 2.2 Query Qdrant for similar errors
**Thoughts:** This is about vector search. We can query and verify similar errors are returned.
**Testable:** yes - property

### 2.3 Retrieve fix strategies from Redis cache
**Thoughts:** This is about cache retrieval. We can verify strategies are retrieved with their success metrics from Redis.
**Testable:** yes - property

### 2.4 Retrieve general patterns when no matches
**Thoughts:** This is a fallback behavior. We can test with novel errors and verify general patterns are retrieved.
**Testable:** yes - edge-case

### 2.5 Rank retrieved knowledge by relevance
**Thoughts:** This is about ranking. We can verify knowledge is ranked correctly by relevance and recency.
**Testable:** yes - property

### 3.1 Query Neo4j for error relationships
**Thoughts:** This is about graph traversal. We can query and verify relationships are found.
**Testable:** yes - property

### 3.2 Identify root cause vs symptom
**Thoughts:** This is about causal analysis. We can create error chains and verify root causes are identified.
**Testable:** yes - property

### 3.3 Prioritize root cause fixes
**Thoughts:** This is about prioritization. We can verify root causes are fixed before symptoms.
**Testable:** yes - property

### 3.4 Augment strategies with graph insights
**Thoughts:** This is about enrichment. We can verify strategies include graph-derived context.
**Testable:** yes - property

### 3.5 Create new graph relationships
**Thoughts:** This is about graph updates. We can verify new relationships are created correctly.
**Testable:** yes - property

### 4.1 Extract and store fix patterns in JSONL
**Thoughts:** This is about pattern extraction. We can verify patterns are stored in JSONL format.
**Testable:** yes - property

### 4.2 Compute hash and check Redis cache
**Thoughts:** This is about change detection. We can verify file hashes are computed and checked against Redis.
**Testable:** yes - property

### 4.3 Skip processing when unchanged
**Thoughts:** This is about optimization. We can verify unchanged files are skipped and cached results are used.
**Testable:** yes - property

### 4.4 Create Neo4j nodes for patterns
**Thoughts:** This is about graph creation. We can verify nodes are created with correct properties.
**Testable:** yes - property

### 4.5 Consolidate similar patterns
**Thoughts:** This is about deduplication. We can verify similar patterns are merged to prevent redundancy.
**Testable:** yes - property

### 5.1 Invoke tools when confidence is low
**Thoughts:** This is about tool invocation. We can set low confidence and verify tools are called.
**Testable:** yes - property

### 5.2 Call diagnostic tools
**Thoughts:** This is about specific tool calls. We can verify svelte-check, tsc, and AST analyzer are invoked.
**Testable:** yes - property

### 5.3 Update confidence from tool results
**Thoughts:** This is about confidence updates. We can verify confidence changes based on tool output.
**Testable:** yes - property

### 5.4 Query knowledge graph when confidence remains low
**Thoughts:** This is a fallback behavior. We can verify graph queries happen when tools don't help.
**Testable:** yes - edge-case

### 5.5 Escalate to human when exhausted
**Thoughts:** This is the final fallback. We can verify escalation happens with detailed context.
**Testable:** yes - edge-case

### 6.1 Compute file hash and check Redis
**Thoughts:** This is about caching. We can verify SHA-256 hashes are computed and checked against Redis.
**Testable:** yes - property

### 6.2 Check Redis cache with key pattern
**Thoughts:** This is about cache lookup. We can verify the correct key pattern is used for cache lookups.
**Testable:** yes - property

### 6.3 Skip embedding on cache hit
**Thoughts:** This is about optimization. We can verify embeddings are not regenerated when cached.
**Testable:** yes - property

### 6.4 Process and store on cache miss
**Thoughts:** This is about cache population. We can verify results are stored in Redis with correct TTL.
**Testable:** yes - property

### 6.5 Fall back when Redis unavailable
**Thoughts:** This is about resilience. We can verify the system continues without caching when Redis is down.
**Testable:** yes - edge-case

### 7.1 Write patterns to JSONL format
**Thoughts:** This is about storage format. We can verify patterns are written as one JSON object per line.
**Testable:** yes - property

### 7.2 Use SIMD JSON parser for reading
**Thoughts:** This is about parsing performance. We can verify SIMD JSON is used for high-speed parsing.
**Testable:** yes - property

### 7.3 Process line-by-line for memory efficiency
**Thoughts:** This is about streaming. We can verify large files are processed incrementally.
**Testable:** yes - property

### 7.4 Rotate and compress old files
**Thoughts:** This is about file management. We can verify files are rotated daily and compressed.
**Testable:** yes - property

### 7.5 Skip malformed lines and log errors
**Thoughts:** This is about error handling. We can verify malformed lines are skipped gracefully.
**Testable:** yes - edge-case

### 8.1 Compute confidence score
**Thoughts:** This is about confidence calculation. We can verify scores are computed based on similarity.
**Testable:** yes - property

### 8.2 Auto-apply high confidence fixes
**Thoughts:** This is about automatic application. We can verify fixes with >0.85 confidence are applied.
**Testable:** yes - property

### 8.3 Apply medium confidence with validation
**Thoughts:** This is about cautious application. We can verify validation checkpoints are used.
**Testable:** yes - property

### 8.4 Invoke tools for low confidence
**Thoughts:** This is about tool invocation. We can verify tools are called when confidence is <0.7.
**Testable:** yes - property

### 8.5 Rollback on validation failure
**Thoughts:** This is about rollback. We can verify failed fixes are rolled back and recorded.
**Testable:** yes - property

### 9.1 Trigger policy update after 100 experiences
**Thoughts:** This is about update triggering. We can verify updates happen at the right threshold.
**Testable:** yes - example

### 9.2 Sample experiences with priority
**Thoughts:** This is about sampling. We can verify recent and high-impact cases are prioritized.
**Testable:** yes - property

### 9.3 Compute GRPO gradients
**Thoughts:** This is about gradient computation. We can verify gradients are computed from group performance.
**Testable:** yes - property

### 9.4 Update policy with Adam optimizer
**Thoughts:** This is about optimization. We can verify the policy network is updated correctly.
**Testable:** yes - property

### 9.5 Validate and rollback if degraded
**Thoughts:** This is about validation. We can verify rollback happens if performance drops.
**Testable:** yes - property

### 10.1 Cluster errors by embedding similarity
**Thoughts:** This is about clustering. We can verify errors are clustered using CUDA K-means.
**Testable:** yes - property

### 10.2 Extract common patterns from clusters
**Thoughts:** This is about pattern extraction. We can verify patterns are extracted from clusters.
**Testable:** yes - property

### 10.3 Generate natural language descriptions
**Thoughts:** This is about description generation. We can verify Gemma3 generates readable descriptions.
**Testable:** yes - property

### 10.4 Store patterns with cluster metadata
**Thoughts:** This is about storage. We can verify patterns are stored with correct metadata.
**Testable:** yes - property

### 10.5 Classify new errors into patterns
**Thoughts:** This is about classification. We can verify new errors are classified correctly.
**Testable:** yes - property

### 11.1 Retrieve top-5 similar fixes
**Thoughts:** This is about retrieval. We can verify the top-5 most similar fixes are retrieved.
**Testable:** yes - property

### 11.2 Synthesize new strategy with Gemma3
**Thoughts:** This is about synthesis. We can verify Gemma3 creates new strategies from examples.
**Testable:** yes - property

### 11.3 Validate against AST and type rules
**Thoughts:** This is about validation. We can verify strategies are validated before application.
**Testable:** yes - property

### 11.4 Apply with low confidence and monitor
**Thoughts:** This is about cautious application. We can verify new strategies are applied carefully.
**Testable:** yes - property

### 11.5 Add successful strategies to knowledge base
**Thoughts:** This is about knowledge base updates. We can verify successful strategies are stored.
**Testable:** yes - property

### 12.1 Extract multi-modal context
**Thoughts:** This is about context extraction. We can verify text, AST, and runtime are extracted.
**Testable:** yes - property

### 12.2 Include visual context when available
**Thoughts:** This is about visual inclusion. We can verify screenshots are included when available.
**Testable:** yes - edge-case

### 12.3 Generate 1024-dimensional feature vector
**Thoughts:** This is about feature vector generation. We can verify vectors have correct dimensions.
**Testable:** yes - property

### 12.4 Use feature vector for similarity search
**Thoughts:** This is about vector usage. We can verify vectors are used for search and clustering.
**Testable:** yes - property

### 12.5 Consider all modalities for fixes
**Thoughts:** This is about comprehensive fixing. We can verify all modalities influence fix proposals.
**Testable:** yes - property

### 13.1 Process experiences every 5 minutes
**Thoughts:** This is about continuous processing. We can verify the pipeline runs on schedule.
**Testable:** yes - example

### 13.2 Update embeddings, clusters, and policy
**Thoughts:** This is about updates. We can verify all components are updated during processing.
**Testable:** yes - property

### 13.3 Validate changes against test set
**Thoughts:** This is about validation. We can verify changes are tested before deployment.
**Testable:** yes - property

### 13.4 Deploy updated policy to production
**Thoughts:** This is about deployment. We can verify successful updates are deployed.
**Testable:** yes - property

### 13.5 Rollback and log on validation failure
**Thoughts:** This is about failure handling. We can verify rollback happens and failures are logged.
**Testable:** yes - edge-case

### 14.1 Create escalation ticket when critically low confidence
**Thoughts:** This is about escalation. We can verify tickets are created when confidence <0.5.
**Testable:** yes - property

### 14.2 Include full context in escalation
**Thoughts:** This is about context inclusion. We can verify escalations have all necessary details.
**Testable:** yes - property

### 14.3 Record human fixes as high-value examples
**Thoughts:** This is about learning from humans. We can verify human fixes are recorded with high weight.
**Testable:** yes - property

### 14.4 Update policy with increased weight
**Thoughts:** This is about policy updates. We can verify human fixes influence the policy more.
**Testable:** yes - property

### 14.5 Analyze escalation patterns
**Thoughts:** This is about pattern analysis. We can verify the system learns to reduce escalations.
**Testable:** yes - property
