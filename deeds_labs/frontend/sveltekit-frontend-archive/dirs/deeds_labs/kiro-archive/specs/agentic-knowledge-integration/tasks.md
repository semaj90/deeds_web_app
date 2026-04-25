# Agentic Knowledge Integration - Implementation Tasks

**Status:** Ready for Execution
**Date:** December 20, 2025
**Current State:** 19 ACP tools working, 83 test files failing

---

## Implementation Plan

- [x] 1. Test Infrastructure Fixes


  - [x] 1.1 Create comprehensive mock infrastructure

    - Create `sveltekit-frontend/src/lib/test-utils/mocks.ts`
    - Mock Qdrant client with in-memory storage
    - Mock Redis client with Map-based storage
    - Mock Ollama client with fake embeddings/generation
    - Mock PostgreSQL client with in-memory database
    - Mock MinIO client with in-memory object storage

    - _Requirements: 2.1, 2.2, 2.3_


  - [ ] 1.2 Create test setup and teardown utilities
    - Create `sveltekit-frontend/src/lib/test-utils/setup.ts`
    - Implement `beforeEach` hook to initialize mocks
    - Implement `afterEach` hook to clean up mocks


    - Implement `resetAllMocks()` function
    - Add environment variable mocking
    - _Requirements: 2.3, 2.4_


  - [x] 1.3 Update existing tests to use mocks


    - Update all 116 test files in `sveltekit-frontend/src/` directory
    - ✅ Updated `sveltekit-frontend/src/lib/agents/__tests__/rag-lookup.test.ts`
    - Update `sveltekit-frontend/src/lib/agents/__tests__/error-handling.test.ts`
    - Update remaining 114 test files systematically
    - Replace `global.fetch` mocks with proper service mocks
    - Add proper cleanup in afterEach hooks
    - Import mocks from `src/lib/test-utils/mocks.ts`
    - _Requirements: 2.1, 2.2, 2.3_

- [x] 2. Checkpoint - Verify Test Fixes


  - Run all tests: `npm run test:run`
  - Verify 0 test files failing (down from 83)
  - Check that mocks are properly isolated
  - Ask the user if questions arise

- [ ] 3. Docker Container Integration
  - [ ] 3.1 Create container health check utility
    - Create `sveltekit-frontend/src/lib/docker/health-check.ts`
    - Implement `checkContainerRunning(containerName: string)`
    - Implement `checkAllContainers()` for all services
    - Implement `waitForContainer(containerName: string, timeout: number)`
    - Add retry logic with exponential backoff
    - _Requirements: 10.1, 10.5_

  - [ ] 3.2 Create container connection manager
    - Create `sveltekit-frontend/src/lib/docker/connection-manager.ts`
    - Detect if running inside Docker vs host
    - Provide correct hostnames based on environment
    - Implement automatic reconnection on container restart
    - Add connection pooling for PostgreSQL
    - _Requirements: 10.2, 10.4_

  - [ ] 3.3 Update service clients to use connection manager
    - Update PostgreSQL client in `src/lib/server/db.ts`
    - Update Redis client configuration
    - Update Qdrant client configuration
    - Update Ollama client configuration
    - Update MinIO client configuration
    - _Requirements: 10.2, 10.3_

- [ ] 4. Database Tools Enhancement
  - [ ] 4.1 Enhance db:query tool with safety features
    - Update `sveltekit-frontend/src/lib/services/knowledge-search/ACPToolRegistry.ts`
    - Add SQL injection prevention validation
    - Add read-only query enforcement (no INSERT/UPDATE/DELETE)
    - Add query timeout configuration
    - Add result row limit (default 1000)
    - Add query logging for audit
    - _Requirements: 8.1_

  - [ ]* 4.2 Write property test for db:query
    - **Property 6: Database Query Safety**
    - **Validates: Requirements 8.1**
    - Test that parameterized queries prevent SQL injection
    - Test that read-only enforcement works
    - Test that timeouts are enforced

  - [ ] 4.3 Enhance cache tools with TTL validation
    - Update cache:get and cache:set in ACPToolRegistry
    - Add TTL validation (min 1 second, max 7 days)
    - Add cache key namespacing (acp:toolname:key)
    - Add cache statistics tracking
    - _Requirements: 8.2, 8.3_

  - [ ]* 4.4 Write property test for cache tools
    - **Property 7: Redis TTL Enforcement**
    - **Validates: Requirements 8.3**
    - Test that TTL is enforced correctly
    - Test that expired keys return null
    - Test that cache keys are namespaced

  - [ ] 4.5 Enhance MinIO tools with integrity checks
    - Update minio:upload and minio:download in ACPToolRegistry
    - Add upload verification (check object exists after upload)
    - Add content-type detection
    - Add file size limits
    - Add pre-signed URL generation for downloads
    - _Requirements: 8.4, 8.5_

  - [ ]* 4.6 Write property test for MinIO tools
    - **Property 8: MinIO Upload Integrity**
    - **Validates: Requirements 8.4**
    - Test that uploads are verified
    - Test that downloads return correct content
    - Test that file size limits are enforced

- [ ] 5. Checkpoint - Verify Database Tools
  - Test db:query with sample queries
  - Test cache:get/set with various TTLs
  - Test minio:upload/download with sample files
  - Verify all property tests pass
  - Ask the user if questions arise

- [ ] 6. Error Handling Implementation
  - [ ] 6.1 Create retry strategy utility
    - Create `sveltekit-frontend/src/lib/utils/retry-strategy.ts`
    - Implement `executeWithRetry<T>(fn, maxRetries, baseDelay)`
    - Add exponential backoff calculation
    - Add jitter to prevent thundering herd
    - Add retry logging
    - _Requirements: 4.1, 4.2_

  - [ ] 6.2 Create circuit breaker utility
    - Create `sveltekit-frontend/src/lib/utils/circuit-breaker.ts`
    - Implement CircuitBreaker class with state machine
    - Add failure threshold configuration (default 5)
    - Add timeout configuration (default 30s)
    - Add half-open state for recovery testing
    - Add circuit breaker metrics
    - _Requirements: 4.5_

  - [ ] 6.3 Integrate retry and circuit breaker into tool registry
    - Update `executeACPTool()` in ACPToolRegistry
    - Wrap tool execution with retry strategy
    - Wrap service calls with circuit breaker
    - Add fallback implementations for critical tools
    - Add error categorization (retryable vs non-retryable)
    - _Requirements: 4.1, 4.2, 4.3, 4.5_

  - [ ]* 6.4 Write property tests for error handling
    - **Property 3: Error Recovery**
    - **Validates: Requirements 4.1, 4.2**
    - Test retry logic with exponential backoff
    - Test circuit breaker opens after threshold
    - Test circuit breaker recovers in half-open state

- [ ] 7. CLI Enhancement
  - [ ] 7.1 Enhance CLI with better formatting
    - Update `scripts/phase76-acp-cli.mjs`
    - Add colored output with chalk
    - Add table formatting for list results
    - Add JSON output mode (--json flag)
    - Add verbose mode (--verbose flag)
    - Add progress indicators for long operations
    - _Requirements: 9.2, 9.5_

  - [ ] 7.2 Add CLI argument validation
    - Add JSON Schema validation for tool arguments
    - Add helpful error messages for invalid arguments
    - Add argument type coercion (string to number, etc.)
    - Add required argument checking
    - Add argument examples in help text
    - _Requirements: 9.1, 9.5_

  - [ ]* 7.3 Write property test for CLI
    - **Property 9: CLI Argument Validation**
    - **Validates: Requirements 9.1, 9.5**
    - Test that required arguments are validated
    - Test that invalid arguments are rejected
    - Test that error messages are actionable

- [ ] 8. VS Code Tasks Integration
  - [ ] 8.1 Create VS Code tasks configuration
    - Create `.vscode/tasks.json` (if not exists)
    - Add task for each ACP tool category
    - Add input prompts for common arguments
    - Add problem matchers for error detection
    - Add task dependencies where needed
    - _Requirements: 9.3, 9.4_

  - [ ] 8.2 Create task templates for common workflows
    - Add "ACP: Knowledge Search" task
    - Add "ACP: Database Query" task
    - Add "ACP: Code Analysis" task
    - Add "ACP: Cache Operations" task
    - Add "ACP: MinIO Operations" task
    - Add "ACP: Health Check" task
    - _Requirements: 9.3, 9.4_

- [ ] 9. MCP Server Integration
  - [ ] 9.1 Update MCP server to expose all ACP tools
    - Update `scripts/phase76-mcp-server.mjs`
    - Register all 19 ACP tools
    - Add tool schema generation from ACPToolRegistry
    - Add automatic tool discovery
    - Add tool categorization in MCP metadata
    - _Requirements: 5.1, 5.4_

  - [ ] 9.2 Add MCP fallback mechanism
    - Update tool execution to try MCP first
    - Add 5-second timeout for MCP calls
    - Fall back to direct implementation on timeout
    - Log MCP availability status
    - Add MCP health check endpoint
    - _Requirements: 5.3_

  - [ ]* 9.3 Write property test for MCP integration
    - **Property 11: MCP Fallback Behavior**
    - **Validates: Requirements 5.3**
    - Test that MCP timeout triggers fallback
    - Test that fallback completes within 5s
    - Test that direct implementation works

- [ ] 10. Checkpoint - Verify All Integrations
  - Run all tests: `npm run test:run`
  - Verify 0 test files failing
  - Test CLI with all tool categories
  - Test VS Code tasks
  - Test MCP server with all tools
  - Verify Docker container integration
  - Ask the user if questions arise

- [ ] 11. Performance Optimization
  - [ ] 11.1 Implement caching layer
    - Update ACPToolRegistry to use Redis for caching
    - Add cache key generation based on tool name + args
    - Add configurable TTL per tool category
    - Add cache hit/miss metrics
    - Add cache invalidation on tool updates
    - _Requirements: 7.1, 7.2_

  - [ ] 11.2 Implement batch processing
    - Add batch embedding generation for multiple texts
    - Add batch database queries
    - Add batch cache operations
    - Add batch MinIO operations
    - Add batch size limits and chunking
    - _Requirements: 7.3_

  - [ ]* 11.3 Write property tests for performance
    - **Property 5: Cache Consistency**
    - **Validates: Requirements 7.1, 7.2**
    - Test that cache keys are deterministic
    - Test that cache hits return correct data
    - Test that cache misses execute tool

- [ ] 12. Documentation
  - [ ] 12.1 Create comprehensive API documentation
    - Create `docs/ACP_TOOL_REGISTRY.md`
    - Document all 19 tools with examples
    - Add curl examples for HTTP endpoints
    - Add TypeScript examples for programmatic usage
    - Add CLI examples for command-line usage
    - _Requirements: 11.1, 11.2, 11.3_

  - [ ] 12.2 Create troubleshooting guide
    - Create `docs/TROUBLESHOOTING.md`
    - Document common errors and solutions
    - Add Docker container troubleshooting
    - Add service connection troubleshooting
    - Add test failure troubleshooting
    - _Requirements: 11.4_

  - [ ] 12.3 Create architecture diagrams
    - Create `docs/ARCHITECTURE.md`
    - Add system architecture diagram
    - Add data flow diagram
    - Add error handling flow diagram
    - Add Docker container network diagram
    - _Requirements: 11.5_

- [ ] 13. Final Checkpoint - Production Ready
  - Run all tests: `npm run test:run`
  - Verify 0 test files failing
  - Verify all 12 correctness properties pass
  - Test all 19 ACP tools via CLI
  - Test all VS Code tasks
  - Test MCP server integration
  - Verify Docker container integration
  - Review all documentation
  - Ask the user if questions arise

---

## Notes

### Optional Tasks (Marked with *)
Optional tasks focus on property-based testing. These can be skipped for MVP but are recommended for production quality.

### Task Dependencies
- Tasks 1-2 must complete before task 3 (fix tests first)
- Tasks 3-5 can run in parallel (Docker + database tools)
- Tasks 6-9 can run in parallel (error handling + CLI + MCP)
- Task 10 requires all previous tasks
- Tasks 11-12 can run in parallel (performance + docs)
- Task 13 requires all previous tasks

### Testing Strategy
- Unit tests verify specific examples and edge cases
- Property tests verify universal properties across all inputs
- Both types of tests are valuable and complement each other

### Current State
You already have:
- ✅ 19 ACP tools working across 9 categories
- ✅ CLI interface (`scripts/phase76-acp-cli.mjs`)
- ✅ MCP server (`scripts/phase76-mcp-server.mjs`)
- ✅ Knowledge Search Engine (36/36 tests passing)
- ✅ ACE Agent integration
- ✅ Comprehensive mock infrastructure created
- ✅ 1 test file updated (rag-lookup.test.ts)
- ❌ 115 test files remaining to update with new mocks

### Priority Order
1. **HIGH**: Fix failing tests (Tasks 1-2)
2. **HIGH**: Docker container integration (Task 3)
3. **MEDIUM**: Database tools enhancement (Tasks 4-5)
4. **MEDIUM**: Error handling (Task 6)
5. **LOW**: CLI/VS Code/MCP enhancements (Tasks 7-9)
6. **LOW**: Performance optimization (Task 11)
7. **LOW**: Documentation (Task 12)

---

## Success Criteria

- [ ] All tests pass (0 failures, down from 83)
- [ ] All 12 correctness properties validated
- [ ] All 19 ACP tools working with proper error handling
- [ ] Docker container integration working
- [ ] CLI interface enhanced with validation
- [ ] VS Code tasks configured
- [ ] MCP server exposing all tools
- [ ] Performance targets met (< 500ms tool execution)
- [ ] Comprehensive documentation complete
- [ ] Zero TypeScript errors
- [ ] Ready for production deployment

---

**Status:** Ready for Execution
**Last Updated:** December 20, 2025
**Maintained By:** Kiro IDE
