# Implementation Plan: YoRHa UI Alignment & Production Readiness

## Overview

This implementation plan breaks down the feature into discrete, manageable coding tasks that build incrementally. Each task focuses on writing, modifying, or testing code to align the YoRHa Detective Interface with production standards.

---

## Task List

- [x] 1. Set up database schema and Drizzle ORM configuration









  - Create Drizzle schema file with cases, evidence_nodes, evidence_connections, chat_sessions, and chat_messages tables
  - Configure Drizzle ORM with PostgreSQL connection
  - Generate migration files for schema
  - _Requirements: 5.1, 5.2, 5.3_


- [ ] 2. Implement Lucia v3 authentication middleware
  - Configure Lucia v3 with session storage
  - Create authentication hooks for SvelteKit
  - Implement session validation in +layout.server.ts
  - Add logout functionality



  - _Requirements: 4.1, 4.2, 4.3_

- [x] 3. Create API routes for system metrics and cases


  - Implement GET /api/yorha/cluster-health endpoint
  - Implement GET /api/yorha/cases endpoint with Lucia auth
  - Add real-time metric calculation logic
  - _Requirements: 1.1, 1.2_



- [ ] 4. Build YoRHa Command Center component
  - Create YoRHaCommandCenter.svelte with system metrics display
  - Implement real-time metric updates (3-second intervals)
  - Add active cases list with status badges
  - Create navigation sidebar with all sections


  - _Requirements: 1.1, 1.2, 1.5_

- [ ] 5. Implement XState v5 state machine for metrics
  - Create metrics state machine in src/lib/machines/metrics.ts
  - Define states: idle, updating, error
  - Implement metric update transitions


  - Connect to component with Svelte store
  - _Requirements: 7.3_

- [ ] 6. Create Evidence Board API routes
  - Implement GET /api/evidence/nodes endpoint

  - Implement GET /api/evidence/connections endpoint
  - Implement POST /api/evidence/nodes for creating evidence
  - Implement PATCH /api/evidence/nodes/:id for updating positions
  - Implement POST /api/evidence/connections for creating connections
  - _Requirements: 2.1, 2.3, 2.5_


- [ ] 7. Build Evidence Board component with canvas rendering
  - Create EvidenceBoard.svelte with SVG canvas
  - Implement node rendering with titles and metadata
  - Add node selection and highlighting
  - Implement connection line rendering
  - _Requirements: 2.1, 2.4_


- [ ] 8. Implement drag-and-drop for evidence nodes
  - Add mouse event handlers for dragging
  - Implement smooth position updates during drag
  - Add debounced position persistence to database
  - Implement visual feedback during drag

  - _Requirements: 2.2_

- [ ] 9. Create evidence connection UI and logic
  - Implement connection creation UI (click two nodes to connect)
  - Add connection type selector
  - Implement connection deletion

  - Add visual connection strength indicators
  - _Requirements: 2.3_

- [ ] 10. Build AI Chat Interface component
  - Create ContextualEvidenceChatModal.svelte using Bits UI v2 Dialog
  - Implement message list with user/assistant formatting

  - Add message input field with send button
  - Implement typing indicator
  - _Requirements: 3.1, 3.2_

- [ ] 11. Implement XState v5 state machine for chat
  - Create chat state machine in src/lib/machines/chat.ts

  - Define states: idle, loading, streaming, error, complete
  - Implement message sending transitions
  - Connect to chat component
  - _Requirements: 7.1_

- [x] 12. Create Ollama integration service

  - Create src/lib/services/ollama.ts with getOllamaEndpoint() function
  - Implement chat message sending to Ollama
  - Add streaming response handling with ReadableStream
  - Implement error handling for missing endpoint
  - _Requirements: 3.3, 9.1, 9.2_


- [ ] 13. Implement chat message streaming and display
  - Add fetch with ReadableStream for Ollama responses
  - Implement token-by-token display in chat
  - Add auto-scroll to latest message
  - Implement streaming indicator
  - _Requirements: 3.2, 3.3_


- [ ] 14. Add evidence context to chat
  - Implement evidence context passing to chat component
  - Add evidence summaries to system prompt
  - Query evidence from Drizzle ORM before sending to LLM
  - Display evidence references in chat

  - _Requirements: 3.4_

- [ ] 15. Create chat session persistence
  - Implement chat session creation in database
  - Store messages in chat_messages table
  - Implement session history retrieval

  - Add session management UI
  - _Requirements: 3.5_

- [ ] 16. Style all components with Uno.css
  - Apply Uno.css utility classes to YoRHa Command Center
  - Style Evidence Board with Uno.css

  - Style AI Chat Interface with Uno.css
  - Implement dark theme with Uno.css dark mode utilities
  - _Requirements: 6.1, 6.2, 6.3_

- [ ] 17. Implement responsive design with Uno.css breakpoints
  - Add mobile-first responsive layout to Command Center

  - Implement responsive Evidence Board
  - Add responsive chat modal
  - Test on mobile, tablet, and desktop
  - _Requirements: 6.2_

- [x] 18. Integrate Bits UI v2 components

  - Replace custom dialogs with Bits UI v2 Dialog
  - Implement Bits UI v2 Dropdown for case selection
  - Add Bits UI v2 Table for evidence list
  - Ensure proper keyboard navigation
  - _Requirements: 8.1, 8.2, 8.3_


- [ ] 19. Implement error boundaries and error handling
  - Create error boundary component for each major section
  - Add try-catch blocks in API routes
  - Implement error logging to console and tracking service
  - Add user-friendly error messages

  - _Requirements: 10.1_

- [ ] 20. Add system metric threshold warnings
  - Implement threshold checking for CPU, memory, GPU
  - Add warning badge styling with Uno.css
  - Display threshold alerts in Command Center

  - Implement threshold configuration
  - _Requirements: 1.5_

- [ ] 21. Create API route for evidence upload
  - Implement POST /api/evidence/upload endpoint
  - Add file validation and processing

  - Store file metadata in database
  - Return created evidence node
  - _Requirements: 2.5_

- [ ] 22. Implement evidence node animation on creation
  - Add Svelte transition for new node appearance

  - Implement fade-in animation
  - Add node position animation from center
  - _Requirements: 2.5_

- [ ] 23. Create comprehensive error handling for Ollama
  - Implement fallback when Ollama endpoint is missing

  - Add retry logic for failed requests
  - Display troubleshooting suggestions to user
  - Log Ollama errors for debugging
  - _Requirements: 9.3_

- [x] 24. Implement session refresh and re-authentication

  - Add session expiration detection
  - Implement automatic session refresh
  - Show login prompt on session expiration
  - Preserve user work during re-auth
  - _Requirements: 4.3_



- [ ] 25. Add performance monitoring
  - Implement Web Vitals tracking
  - Monitor API response times
  - Track component render times


  - Send metrics to monitoring service
  - _Requirements: 10.2_

- [x] 26. Create environment configuration


  - Set up .env.production with Ollama endpoint
  - Configure database connection string
  - Add Lucia v3 session configuration
  - Add error tracking service credentials
  - _Requirements: 10.3_



- [ ] 27. Implement database transaction handling
  - Add transaction support for multi-step operations
  - Implement rollback on failure
  - Add transaction logging


  - Test transaction consistency
  - _Requirements: 5.2_

- [ ] 28. Create input validation with Zod schemas
  - Define Zod schemas for all API inputs



  - Implement validation in API routes
  - Add client-side validation in components
  - Return validation errors to client
  - _Requirements: 10.1_

- [ ] 29. Implement CSRF protection
  - Add CSRF token generation in SvelteKit
  - Validate CSRF tokens in API routes
  - Add token refresh logic
  - _Requirements: 10.1_

- [ ] 30. Add rate limiting to API endpoints
  - Implement rate limiting middleware
  - Configure limits per endpoint
  - Return 429 status on limit exceeded
  - Add rate limit headers to responses
  - _Requirements: 10.1_

- [ ]* 31. Write unit tests for XState machines
  - Test metrics state machine transitions
  - Test chat state machine transitions
  - Test state machine edge cases
  - _Requirements: 7.1, 7.2, 7.3_

- [ ]* 32. Write integration tests for API routes
  - Test cases API with mock database
  - Test evidence API with mock database
  - Test chat API with mock Ollama
  - Test authentication flow
  - _Requirements: 5.1, 5.2, 5.3_

- [ ]* 33. Write E2E tests for user workflows
  - Test create case → add evidence → chat workflow
  - Test evidence board interactions
  - Test real-time metric updates
  - Test chat streaming
  - _Requirements: 1.1, 2.1, 3.1_

- [ ]* 34. Write performance tests
  - Test component render times
  - Test API response times
  - Test bundle size
  - Measure Lighthouse scores
  - _Requirements: 10.2_

- [ ]* 35. Create documentation
  - Document API endpoints
  - Document component props and usage
  - Document state machines
  - Create deployment guide
  - _Requirements: 10.3_

---

## Implementation Notes

### Phase 1: Foundation (Tasks 1-3)
- Set up database and authentication
- Create core API infrastructure
- Establish security baseline

### Phase 2: Command Center (Tasks 4-5)
- Build main dashboard
- Implement real-time metrics
- Create navigation structure

### Phase 3: Evidence Board (Tasks 6-9)
- Create evidence management API
- Build interactive canvas
- Implement drag-and-drop

### Phase 4: AI Chat (Tasks 10-15)
- Build chat UI
- Integrate Ollama
- Implement message persistence

### Phase 5: Styling & UX (Tasks 16-18)
- Apply Uno.css styling
- Implement responsive design
- Integrate Bits UI v2

### Phase 6: Production Hardening (Tasks 19-30)
- Add error handling
- Implement security measures
- Add monitoring and logging

### Phase 7: Testing & Documentation (Tasks 31-35)
- Write comprehensive tests
- Create documentation
- Prepare for deployment

---

## Success Criteria

✅ All three components (Command Center, Evidence Board, AI Chat) are production-ready
✅ SvelteKit 2, Drizzle ORM 0.44, Lucia v3, Bits UI v2, XState v5, Uno.css are properly integrated
✅ Ollama integration works with streaming responses
✅ Real-time metrics update every 3 seconds
✅ Evidence board supports drag-and-drop and connections
✅ Chat persists messages and supports evidence context
✅ All components are styled with Uno.css and match design mockups
✅ Error handling and logging are comprehensive
✅ Security measures (CSRF, rate limiting, input validation) are implemented
✅ Tests cover critical paths and edge cases
✅ Performance meets acceptable thresholds
✅ Documentation is complete and accurate

