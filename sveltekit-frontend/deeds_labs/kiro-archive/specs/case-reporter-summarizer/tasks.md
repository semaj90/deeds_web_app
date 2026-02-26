# Implementation Plan: Case Reporter Summarizer

- [x] 1. Set up database schema and migrations


  - Create case_reports table with versioning support
  - Create case_charges table for statute tracking
  - Create audit_log table for compliance
  - Add pgvector indexes on statute and case embeddings
  - _Requirements: 4.1, 6.5, 8.1_





- [x] 2. Implement core service layer

  - [x] 2.1 Create CaseSummaryService with generate, retrieve, and version methods


    - Implement caching logic with Redis


    - Add transaction management for database writes
    - _Requirements: 1.5, 4.1, 8.2_

  - [x] 2.2 Create RAGService for statute and case law retrieval


    - Query pgvector for statute embeddings
    - Query Qdrant for case law vectors
    - Implement ranking algorithm by relevance
    - _Requirements: 1.2, 1.3, 8.3_



  - [x] 2.3 Create LLMService for Gemma3-Legal inference



    - Generate summary from retrieved context
    - Extract citations using regex and NLP
    - Extract holding statement
    - _Requirements: 1.4, 2.1, 2.2_

  - [x] 2.4 Create GraphService for Neo4j operations

    - Create case → statute relationships
    - Query similar cases by charge bundle
    - Rank precedents by relevance score
    - _Requirements: 3.1, 3.2, 3.3_








- [ ] 3. Fix and complete existing API routes
  - [ ] 3.1 Fix POST /api/cases/summary endpoint
    - Archive existing broken file to backup

    - Rewrite with proper TypeScript types
    - Add Lucia v3 authentication

    - Implement job queuing for async processing
    - _Requirements: 1.1, 6.1, 6.2_







  - [ ] 3.2 Create GET /api/cases/[id]/summary endpoint
    - Retrieve cached or stored summary

    - Return with metadata and version info
    - _Requirements: 4.2, 4.3_



  - [ ] 3.3 Create GET /api/cases/[id]/summary/similar endpoint
    - Query GraphService for similar cases


    - Return top 5 with relevance scores
    - _Requirements: 3.4, 3.5_

  - [x] 3.4 Create POST /api/cases/[id]/summary/export-pdf endpoint

    - Generate PDF from summary text
    - Include citations table and metadata
    - Return download URL
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_



- [x] 4. Implement frontend components

  - [ ] 4.1 Create CaseDetailPage.svelte with summary section
    - Add "Generate Summary" button






    - Display processing status with spinner
    - Render summary in TinyMCE editor
    - Show similar cases panel
    - _Requirements: 1.1, 3.4, 4.3_


  - [ ] 4.2 Create SummaryEditor.svelte component
    - Wrap TinyMCE with summary content
    - Render citations as clickable hyperlinks
    - Add "Export to PDF" button
    - Show version history dropdown
    - _Requirements: 2.3, 5.1, 4.4_


  - [ ] 4.3 Create SimilarCasesPanel.svelte component
    - Display top 5 similar cases
    - Show case number, charges, outcome








    - Link to case detail pages



    - Display relevance score
    - _Requirements: 3.4, 3.5_

  - [x] 4.4 Create error handling UI components








    - Display error messages with retry button
    - Show fallback UI when services unavailable
    - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_



- [x] 5. Implement background job processing

  - [x] 5.1 Create RabbitMQ job queue for summary generation


    - Enqueue jobs with case ID and user ID
    - Process jobs asynchronously







    - Update job status in Redis
    - _Requirements: 1.4, 8.2_









  - [x] 5.2 Create summary generation worker

    - Retrieve case data from database
    - Call RAGService to retrieve statutes and case law
    - Call LLMService to generate summary

    - Call GraphService to create relationships
    - Store summary in database




    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_


  - [ ] 5.3 Create citation extraction worker
    - Extract statute references from summary
    - Normalize citations to standard format
    - Create Neo4j relationships

    - _Requirements: 2.1, 2.2, 2.3_

- [ ] 6. Implement caching and performance optimization
  - [x] 6.1 Add Redis caching for summaries






    - Cache key: summary:[caseId]
    - TTL: 24 hours
    - Invalidate on update
    - _Requirements: 8.1, 8.2_


  - [ ] 6.2 Add Redis caching for similar cases
    - Cache key: similar-cases:[caseId]
    - TTL: 24 hours



    - Invalidate on case update
    - _Requirements: 8.1, 8.3_


  - [x] 6.3 Implement parallel RAG queries



    - Retrieve statutes and case law simultaneously
    - Use Promise.all() for concurrent requests
    - _Requirements: 8.4_










- [ ] 7. Implement error handling and recovery
  - [x] 7.1 Add retry logic with exponential backoff


    - Retry transient errors (network, timeout)

    - Max 3 retries with 1s, 2s, 4s delays
    - _Requirements: 7.1, 7.2_



  - [x] 7.2 Add fallback behavior for service failures

    - Use cached results if available


    - Return basic template if LLM unavailable
    - Skip recommendations if Neo4j unavailable
    - _Requirements: 7.1, 7.2, 7.3, 7.4_




  - [ ] 7.3 Add transaction rollback on database errors
    - Rollback on write failures
    - Preserve case data

    - Notify prosecutor
    - _Requirements: 7.3, 7.4_

- [x] 8. Implement audit logging

  - [ ] 8.1 Log all summary operations
    - Log generate, retrieve, update, delete actions
    - Include user ID, timestamp, case ID
    - Store in audit_log table

    - _Requirements: 6.5_

  - [x] 8.2 Log authorization checks


    - Log access attempts (success and failure)

    - Include user role and case ID
    - _Requirements: 6.1, 6.2, 6.3_

- [x] 9. Write unit tests for service layer

  - [ ] 9.1 Test CaseSummaryService
    - Test generate, retrieve, version methods
    - Test caching behavior
    - Test error handling

    - _Requirements: 1.1, 1.5, 4.1_

  - [ ] 9.2 Test RAGService
    - Test statute retrieval
    - Test ranking algorithm
    - Test error handling
    - _Requirements: 1.2, 1.3, 8.3_

  - [ ] 9.3 Test LLMService
    - Test summary generation
    - Test citation extraction
    - Test holding extraction
    - _Requirements: 1.4, 2.1, 2.2_

  - [ ] 9.4 Test GraphService
    - Test relationship creation
    - Test similar case queries
    - Test ranking algorithm
    - _Requirements: 3.1, 3.2, 3.3_

- [ ] 10. Write integration tests
  - [ ] 10.1 Test end-to-end summary generation
    - Test full pipeline from API to database
    - Verify all services work together
    - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

  - [ ] 10.2 Test database transaction rollback
    - Test error recovery
    - Verify data integrity
    - _Requirements: 7.3, 7.4_

  - [ ] 10.3 Test cache invalidation
    - Test cache updates on summary change
    - Verify stale data is not served
    - _Requirements: 8.1, 8.2_

  - [ ] 10.4 Test PDF export
    - Test PDF generation with citations
    - Verify formatting and metadata
    - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 11. Write performance tests
  - [ ] 11.1 Test summary generation performance
    - Measure time for typical cases (< 50 pages)
    - Verify < 30 second target
    - _Requirements: 8.5_

  - [ ] 11.2 Test cache hit performance
    - Measure retrieval time for cached summaries
    - Verify < 100ms target
    - _Requirements: 8.1, 8.2_

  - [ ] 11.3 Test similar case query performance
    - Measure Neo4j query time
    - Verify < 5 second target
    - _Requirements: 3.1, 3.2_
