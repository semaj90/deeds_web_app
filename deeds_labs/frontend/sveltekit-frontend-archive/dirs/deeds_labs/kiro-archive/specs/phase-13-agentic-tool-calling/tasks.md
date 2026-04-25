#13: Agentic Tool Calling - Implementation Tasks

**Status:** Ready for Execution
**Date:** December 15, 2025
**Framework:** Gemma3-Legal + Ollama + Qdrant + Redis + PostgreSQL + Go Microservices

---

## Implementation Plan

- [ ] 1. Core Agent Infrastructure
  - [ ] 1.1 Create type definitions file
    - Create `sveltekit-frontend/src/lib/agents/types.ts`
    - Define ToolCall, ToolResult, AgentResponse, AgentExecutionResult interfaces
    - Define specialized result types (RagLookupResult, WebCrawlResult, etc.)
    - _Requirements: 1.1, 1.2, 1.3_

  - [ ] 1.2 Create tool registry and execution engine
    - Create `sveltekit-frontend/src/lib/agents/tools.ts`
    - Implement 5 core tools (rag_lookup, web_crawl, web_doc_summary, web_search, code_search)
    - Implement executeToolCall() function
    - Implement getAvailableTools() function
    - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

  - [ ] 1.3 Create agent orchestration
    - Create `sveltekit-frontend/src/lib/agents/gemmaAgent.ts`
    - Implement runGemmaAgent() with system prompt
    - Implement executeAgentWithTools() function
    - Implement executeAgentWithContext() function
    - Implement streamAgentResponse() for streaming support
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 2. Ollama Integration
  - [ ] 2.1 Create Ollama configuration module
    - Create `sveltekit-frontend/src/lib/ai/ollama-config.ts`
    - Implement getOllamaEndpoint(), getOllamaModel(), getOllamaEmbedModel()
    - Implement generateEmbedding() with fallback support
    - Implement generateWithOllama() for text generation
    - Implement streamGenerateWithOllama() for streaming
    - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 3. API Endpoints
  - [ ] 3.1 Create API routes
    - Create `sveltekit-frontend/src/routes/api/agents/+server.ts`
    - Implement POST /api/agents/chat endpoint
    - Implement POST /api/agents/execute-tool endpoint
    - Implement GET /api/agents/health endpoint
    - Add error handling and validation
    - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 4. Frontend Component
  - [ ] 4.1 Create chat component
    - Create `sveltekit-frontend/src/lib/components/agentic/AgentChat.svelte`
    - Implement message display with timestamps
    - Implement input textarea with Enter key support
    - Implement tool result visualization
    - Implement error banner
    - Apply dark theme styling (Noir Detective aesthetic)
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 5. Checkpoint - Verify Core Implementation
  - Ensure all 6 files are created and compile without errors
  - Run TypeScript diagnostics: `npm run check:typescript`
  - Run Svelte validation: `npm run check:svelte:frontend`
  - Verify no TypeScript errors
  - Ask the user if questions arise

- [ ] 6. Tool Implementation - RAG Lookup
  - [x] 6.1 Implement RAG lookup tool


    - Generate embeddings for queries
    - Query Qdrant for similar vectors
    - Return ranked matches with similarity scores
    - Handle empty results gracefully
    - Implement Redis caching
    - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_


- [ ]* 6.2 Write property test for RAG lookup
    - **Property 6: RAG Search Results**
    - **Validates: Requirements 6.2, 6.3**



- [ ] 7. Tool Implementation - Web Crawl
  - [ ] 7.1 Implement web crawl tool
    - Fetch URLs with error handling
    - Extract links from HTML
    - Return page content and links
    - Handle fetch failures gracefully
    - Support optional depth crawling
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [x]* 7.2 Write property test for web crawl

    - **Property 7: Web Crawl Content**
    - **Validates: Requirements 7.1, 7.2, 7.3**


- [ ] 8. Tool Implementation - Web Doc Summary
  - [ ] 8.1 Implement web doc summary tool
    - Fetch documentation pages
    - Call Ollama for summarization
    - Return markdown-formatted summary
    - Handle summarization failures
    - Support topic-guided summarization
    - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_


- [ ]* 8.2 Write property test for web doc summary
    - **Property 8: API Response Format**

    - **Validates: Requirements 4.1, 4.2, 4.3**



- [ ] 9. Tool Implementation - Web Search (Stub)
  - [ ] 9.1 Implement web search stub
    - Accept query parameter
    - Return stub response indicating readiness for API integration



    - Document expected API integration points
    - _Requirements: 9.1, 9.2, 9.3_

- [ ] 10. Tool Implementation - Code Search (Stub)
  - [ ] 10.1 Implement code search stub
    - Accept pattern and path parameters


    - Return stub response indicating readiness for Go service integration
    - Document expected Go service integration points
    - _Requirements: 10.1, 10.2, 10.3_




- [ ] 11. Error Handling and Recovery
  - [ ] 11.1 Implement comprehensive error handling
    - Tool execution error catching



    - Service unavailability handling
    - Invalid input validation
    - Timeout handling
    - Error logging
    - _Requirements: 11.1, 11.2, 11.3, 11.4, 11.5_

- [ ]* 11.2 Write property test for error handling
    - **Property 3: Error Handling**
    - **Validates: Requirements 11.1, 11.4**

- [ ] 12. Type Safety and Documentation
  - [ ] 12.1 Ensure full type safety
    - Verify TypeScript strict mode
    - Add inline documentation comments
    - Provide curl examples for all endpoints
    - Document all types and interfaces
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 13. Checkpoint - Verify Tool Implementation
  - Ensure all tools are implemented and functional
  - Run TypeScript diagnostics again
  - Test each tool individually
  - Verify error handling works correctly
  - Ask the user if questions arise

- [ ] 14. PowerShell Utility Scripts
  - [ ] 14.1 Create check-and-summarize script
    - Create `sveltekit-frontend/scripts/check-and-summarize.ps1`
    - Run tsc and svelte-check
    - Parse output and group issues by file
    - Generate Markdown report
    - Save detailed logs
    - _Requirements: 12.1, 12.2_

  - [ ] 14.2 Create codemod-bitsui-imports script
    - Create `sveltekit-frontend/scripts/codemod-bitsui-imports.ps1`
    - Fix old Bits UI import paths
    - Create timestamped backups
    - Support dry-run mode
    - _Requirements: 12.1, 12.2_

  - [ ] 14.3 Create extract-impl-notes script
    - Create `sveltekit-frontend/scripts/extract-impl-notes.ps1`
    - Scan for PHASE13, TODO, IMPLEMENT, FIXME, NOTE tags
    - Generate grounded documentation
    - Output Markdown report with file locations
    - _Requirements: 12.1, 12.2_

- [ ]* 14.4 Write integration test for PowerShell scripts
    - Test check-and-summarize output format
    - Test codemod backup creation
    - Test extract-impl-notes tag detection
    - Verify all scripts run without errors

- [ ] 15. API Testing
  - [ ] 15.1 Test health check endpoint
    - Verify endpoint returns service status
    - Verify all services are checked
    - Test with services unavailable
    - _Requirements: 4.3_

  - [ ] 15.2 Test tool execution endpoint
    - Test with valid tool names
    - Test with invalid tool names
    - Test with missing arguments
    - Test error handling
    - _Requirements: 4.2, 4.4_

  - [ ] 15.3 Test agent chat endpoint
    - Test with simple prompts
    - Test with context parameter
    - Test tool calling
    - Test error handling
    - _Requirements: 4.1, 4.5_

- [ ]* 15.4 Write property test for API endpoints
    - **Property 8: API Response Format**
    - **Validates: Requirements 4.1, 4.2, 4.3**

- [ ] 16. Frontend Component Testing
  - [ ] 16.1 Test component rendering
    - Verify component renders without errors
    - Verify all UI elements are present

    - Verify dark theme is applied

    - _Requirements: 5.1_

  - [ ] 16.2 Test user interactions
    - Test message sending
    - Test Enter key functionality


    - Test loading states
    - Test error display

    - _Requirements: 5.2, 5.3, 5.4, 5.5_

- [ ]* 16.3 Write property test for component
    - **Property 9: Component Message Display**
    - **Validates: Requirements 5.2, 5.3, 5.4**

- [ ] 17. Checkpoint - Verify All Tests Pass
  - Ensure all tests pass
  - Run TypeScript diagnostics
  - Run Svelte validation

  - Verify no errors or warnings
  - Ask the user if questions arise

- [ ] 18. Documentation and Examples
  - [ ] 18.1 Create comprehensive documentation
    - Verify all documentation files exist
    - Verify examples are accurate
    - Verify API documentation is complete
    - Verify architecture diagrams are clear
    - _Requirements: 12.1, 12.2, 12.3, 12.4, 12.5_

- [ ] 19. Integration with Context Files
  - [ ] 19.1 Prepare for context file integration
    - Document integration points for kiro.md
    - Document integration points for copilot.md
    - Document integration points for claude.md
    - Document integration points for gemini.md
    - Document integration points for context7
    - Create integration guide
    - _Requirements: 1.1, 1.2_

- [ ] 20. Final Checkpoint - Production Ready
  - Ensure all tests pass
  - Verify all documentation is complete
  - Verify all scripts work correctly
  - Verify no TypeScript errors
  - Verify no Svelte errors
  - Ask the user if questions arise

---

## Notes

### Optional Tasks (Marked with *)
Optional tasks are marked with `*` and focus on testing infrastructure. These can be skipped for MVP but are recommended for production quality.

### Task Dependencies
- Tasks 1-4 must complete before task 5
- Tasks 6-10 can run in parallel after task 5
- Tasks 11-12 should complete before task 13
- Tasks 14-16 can run in parallel after task 13
- Task 17 requires all previous tasks
- Tasks 18-20 are final verification steps

### Testing Strategy
- Unit tests verify specific examples and edge cases
- Property tests verify universal properties across all inputs
- Both types of tests are valuable and complement each other

### PowerShell Scripts
- All scripts are non-destructive and create backups
- Scripts produce Markdown reports for easy review
- Scripts can be run in dry-run mode for preview
- Scripts are designed to be safe for CI/CD integration

---

## Success Criteria

- [ ] All 6 implementation files created and compile without errors
- [ ] All 5 tools implemented and functional
- [ ] All 3 API endpoints working correctly
- [ ] Frontend component renders and functions correctly
- [ ] All 3 PowerShell scripts created and working
- [ ] All tests pass (unit and property-based)
- [ ] All documentation complete and accurate
- [ ] Zero TypeScript errors
- [ ] Zero Svelte errors
- [ ] Ready for production deployment

---

**Status:** Ready for Execution
**Last Updated:** December 15, 2025
**Maintained By:** Kiro IDE

