# Phase 70: AI Chat Integration - Implementation Plan

- [ ] 1. Implement Chat Service Backend
  - Create `backend/chat_service.py` with ChatService class
  - Implement message storage in Postgres
  - Implement context window management (last 10 messages)
  - Implement conversation persistence
  - Add latency tracking and logging
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ] 2. Implement Legal Guardrails
  - Create `backend/legal_guardrails.py` with LegalGuardrails class
  - Implement disclaimer injection
  - Implement citation enforcement
  - Implement confidence scoring
  - Add response validation
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 3. Implement Evidence Context Injection
  - Create `backend/evidence_context.py` with ContextInjector class
  - Implement evidence search integration
  - Implement top-3 result injection
  - Implement evidence metadata inclusion
  - Add evidence reference tracking
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 4. Implement Evidence Memory
  - Create `backend/evidence_memory.py` with EvidenceMemory class
  - Implement evidence tracking
  - Implement relevance scoring
  - Implement evidence clustering
  - Add timeline visualization data
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 5. Implement Gemma-2b-it Integration
  - Create `backend/gemma_service.py` with GemmaService class
  - Load gemma3-legal:latest model
  - Implement prompt formatting
  - Implement streaming token generation
  - Add latency monitoring
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 6. Implement Chat API Endpoints
  - Create `backend/api/chat_routes.py` with FastAPI routes
  - Implement `POST /api/chat/message` endpoint
  - Implement `GET /api/chat/history/{case_id}` endpoint
  - Implement `GET /api/chat/stream/{message_id}` SSE endpoint
  - Implement `GET /api/chat/evidence/{case_id}` endpoint
  - Implement `DELETE /api/chat/history/{case_id}` endpoint
  - Add request validation and error handling
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5, 4.1, 4.2_

- [ ] 7. Create Chat UI Page
  - Create `sveltekit-frontend/src/routes/chat/+page.svelte`
  - Implement chat message list
  - Implement message input box
  - Implement streaming response display
  - Implement disclaimer stripe
  - Add loading and error states
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 8. Implement Chat Input Handling
  - Create `sveltekit-frontend/src/lib/services/chatService.ts`
  - Implement message submission
  - Implement SSE connection for streaming
  - Implement token-by-token rendering
  - Add error handling and retry logic
  - _Requirements: 4.1, 4.2, 4.3_

- [ ] 9. Implement Message Display
  - Create `sveltekit-frontend/src/lib/components/ChatMessages.svelte`
  - Implement message list rendering
  - Display user and assistant messages
  - Implement role labels (Prosecutor, Detective, AI Legal Assistant)
  - Add timestamp display
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 10. Implement Streaming Response Rendering
  - Create `sveltekit-frontend/src/lib/components/StreamingResponse.svelte`
  - Implement token-by-token rendering
  - Implement loading indicator
  - Add error display
  - Implement response completion
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 11. Implement Citation Linking
  - Create `sveltekit-frontend/src/lib/components/CitationLink.svelte`
  - Implement statute reference detection
  - Implement case reference detection
  - Add clickable link rendering
  - Implement navigation handlers
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ] 12. Implement Evidence Memory Panel
  - Create `sveltekit-frontend/src/lib/components/EvidenceMemory.svelte`
  - Display top-10 referenced evidence
  - Show relevance scores
  - Implement evidence clustering
  - Add click handlers for navigation
  - _Requirements: 7.1, 7.2, 7.3, 7.4, 7.5_

- [ ] 13. Implement Disclaimer Stripe
  - Create `sveltekit-frontend/src/lib/components/LegalDisclaimer.svelte`
  - Display disclaimer message
  - Show "cannot determine guilt or innocence" warning
  - Add styling and positioning
  - Implement dismissal option
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ] 14. Implement Context Window Management
  - Update `backend/chat_service.py` with context management
  - Implement last 10 message retrieval
  - Implement token counting
  - Implement message truncation if needed
  - Add context formatting
  - _Requirements: 2.1, 2.2, 2.3, 2.4, 2.5_

- [ ] 15. Implement Conversation Persistence
  - Create `backend/models/conversation.py` with Conversation model
  - Implement Postgres schema for conversations
  - Implement conversation creation
  - Implement conversation updates
  - Add conversation deletion
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5_

- [ ] 16. Implement Chat Performance Monitoring
  - Create `backend/chat_metrics.py` with MetricsCollector class
  - Track message latency
  - Track streaming latency
  - Track context preparation time
  - Implement latency logging and alerting
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 17. Implement Chat Error Handling
  - Update `backend/api/chat_routes.py` with error handlers
  - Implement LLM unavailable handling
  - Implement evidence search failure handling
  - Implement message storage failure handling
  - Implement streaming connection failure handling
  - _Requirements: 10.1, 10.2, 10.3, 10.4, 10.5_

- [ ] 18. Implement Chat Analytics
  - Create `backend/chat_analytics.py` with AnalyticsCollector class
  - Track chat queries (anonymized)
  - Track evidence references
  - Track citation usage
  - Implement analytics dashboard endpoint
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ] 19. Integrate Chat with Evidence Search
  - Update `backend/evidence_context.py` to call search service
  - Implement evidence search for chat context
  - Add evidence reference tracking
  - Implement evidence memory updates
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ] 20. Implement Citation Extraction
  - Create `backend/citation_extractor.py` with CitationExtractor class
  - Implement statute reference extraction
  - Implement case reference extraction
  - Implement evidence reference extraction
  - Add citation validation
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_

- [ ]* 21. Write Unit Tests for Chat Service
  - Test message storage and retrieval
  - Test context window management
  - Test conversation persistence
  - Test error handling
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 1.5_

- [ ]* 22. Write Unit Tests for Legal Guardrails
  - Test disclaimer injection
  - Test citation enforcement
  - Test confidence scoring
  - Test response validation
  - _Requirements: 5.1, 5.2, 5.3, 5.4, 5.5_

- [ ]* 23. Write Unit Tests for Evidence Context
  - Test evidence search integration
  - Test context injection
  - Test evidence reference tracking
  - _Requirements: 3.1, 3.2, 3.3, 3.4, 3.5_

- [ ]* 24. Write Integration Tests for Chat Pipeline
  - Test end-to-end chat (message → response → storage)
  - Test evidence context injection
  - Test streaming response
  - Test conversation persistence
  - _Requirements: 1.1, 3.1, 4.1, 8.1_

- [ ]* 25. Write Performance Tests
  - Test chat start latency (<500ms)
  - Test token streaming latency (<100ms)
  - Test context preparation (<100ms)
  - Test evidence search (<200ms)
  - Test concurrent chat handling (10+ simultaneous)
  - _Requirements: 9.1, 9.2, 9.3, 9.4, 9.5_

- [ ]* 26. Write UI Tests for Chat Page
  - Test message input and submission
  - Test streaming response display
  - Test evidence memory panel
  - Test citation linking
  - Test disclaimer display
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5_

- [ ] 27. Create Chat Documentation
  - Create `docs/CHAT_API.md` with API documentation
  - Document all endpoints with examples
  - Document message format
  - Document error codes
  - Document performance characteristics
  - _Requirements: All_

- [ ] 28. Create Chat User Guide
  - Create `docs/CHAT_USER_GUIDE.md` with user guide
  - Document chat interface
  - Document evidence memory
  - Document citation linking
  - Document legal guardrails
  - _Requirements: All_

- [ ] 29. Deploy Chat Service
  - Build Docker image for chat service
  - Configure environment variables
  - Deploy to production
  - Verify Postgres connectivity
  - Verify search service connectivity
  - Verify Gemma model loading
  - _Requirements: All_

- [ ] 30. Deploy Frontend Updates
  - Build SvelteKit frontend
  - Deploy chat page
  - Verify API connectivity
  - Test end-to-end chat
  - _Requirements: All_
