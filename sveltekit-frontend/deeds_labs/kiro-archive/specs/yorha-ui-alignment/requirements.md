# Requirements Document: YoRHa UI Alignment & Production Readiness

## Introduction

This specification defines the requirements for aligning the YoRHa Detective Interface, Evidence Board, and AI Chat components with the provided design mockups while ensuring production-readiness with SvelteKit 2, Drizzle ORM 0.44, Lucia v3 authentication, Uno.css styling, and Bits UI v2. The system must integrate with Ollama endpoints for AI chat functionality and use XState v5 for state management.

## Glossary

- **YoRHa Command Center**: The main detective interface dashboard displaying system metrics, active cases, and evidence board
- **Evidence Board**: A visual canvas for organizing and connecting evidence items with relationships
- **AI Chat Interface**: A contextual chat modal for interacting with the Ollama-powered AI assistant
- **System Metrics**: Real-time CPU, memory, GPU, network, and neural activity indicators
- **Lucia v3**: Authentication framework for user session management
- **Drizzle ORM 0.44**: Type-safe database ORM for data persistence
- **Bits UI v2**: Headless component library with newer API
- **XState v5**: State machine library for complex UI state management
- **Uno.css**: Utility-first CSS framework for styling
- **Ollama Endpoint**: Local LLM inference service for AI chat responses

## Requirements

### Requirement 1: YoRHa Command Center Production Readiness

**User Story:** As a detective, I want a fully functional command center that displays system status, active cases, and evidence overview so that I can manage investigations efficiently.

#### Acceptance Criteria

1. WHEN the command center loads, THE system SHALL display real-time metrics (CPU, memory, GPU, network latency, neural activity) with live updates every 3 seconds
   - _References: Design mockup shows metrics in top-right status cards_
   - _Tech: Use SvelteKit 2 reactive state with $state runes_
   - _Integration: Fetch metrics from `/api/yorha/cluster-health` endpoint_

2. WHILE the user is authenticated via Lucia v3, THE command center SHALL display personalized active cases with status badges (active/pending/open)
   - _References: Design shows 3 active cases in left sidebar_
   - _Tech: Query cases from Drizzle ORM database_
   - _Auth: Verify session via Lucia middleware_

3. WHEN the user clicks "Launch AI Chat", THE system SHALL open ContextualEvidenceChatModal with Ollama endpoint integration
   - _References: Design shows chat button in hero section_
   - _Tech: Use Bits UI v2 dialog component_
   - _Integration: Connect to getOllamaEndpoint() for LLM responses_

4. WHERE the user has evidence items indexed, THE command center SHALL display evidence board preview with draggable nodes
   - _References: Design shows evidence canvas in center panel_
   - _Tech: Use canvas-based rendering or SVG for node visualization_
   - _Data: Load from `/api/evidence/nodes` endpoint_

5. IF system metrics exceed thresholds (CPU >85%, memory >80%, GPU >90%), THEN THE system SHALL display warning indicators with color-coded badges
   - _References: Design shows status indicators with color coding_
   - _Tech: Conditional styling with Uno.css utility classes_
   - _Thresholds: Define in configuration constants_

### Requirement 2: Evidence Board Visual & Functional Alignment

**User Story:** As an investigator, I want an intuitive evidence board where I can organize evidence items, create connections, and analyze relationships so that I can build case theories visually.

#### Acceptance Criteria

1. WHEN evidence items are loaded, THE board SHALL render nodes with titles, descriptions, and confidence scores in a grid layout
   - _References: Design mockup shows evidence nodes with labels and metadata_
   - _Tech: Use canvas or SVG rendering with Svelte components_
   - _Data: Fetch from `/api/evidence/nodes?caseId={caseId}`_

2. WHILE dragging evidence nodes, THE system SHALL update node positions in real-time with smooth animations
   - _References: Design shows interactive canvas with node positioning_
   - _Tech: Use Svelte transitions and drag event handlers_
   - _Persistence: Save positions to Drizzle ORM on drop_

3. WHEN connecting two evidence items, THE system SHALL create visual connections with relationship type labels
   - _References: Design shows connection lines between evidence nodes_
   - _Tech: SVG lines or canvas paths for connections_
   - _Data: Store in `/api/evidence/connections` endpoint_

4. WHERE evidence has AI analysis available, THE system SHALL display analysis results in a side panel with contextual AI chat
   - _References: Design shows AI Legal Assistant panel on right_
   - _Tech: Use Bits UI v2 drawer or panel component_
   - _Integration: Call Ollama endpoint for analysis_

5. IF user uploads new evidence, THEN THE system SHALL automatically index it and add to board with animation
   - _References: Design shows "Add Evidence" button in header_
   - _Tech: Use file upload with progress tracking_
   - _Integration: POST to `/api/evidence/nodes` with file data_

### Requirement 3: AI Chat Interface Production Readiness

**User Story:** As a detective, I want a responsive AI chat interface that provides contextual legal assistance and evidence analysis so that I can get real-time investigative support.

#### Acceptance Criteria

1. WHEN the chat modal opens, THE system SHALL display conversation history with proper message formatting (user vs. assistant)
   - _References: Design shows chat interface with message bubbles_
   - _Tech: Use Bits UI v2 dialog with message list_
   - _State: Manage with XState v5 state machine_

2. WHILE typing a message, THE system SHALL show typing indicator and maintain scroll position at latest message
   - _References: Design shows "AI is analyzing..." indicator_
   - _Tech: Use Svelte reactive state for typing status_
   - _UX: Auto-scroll to bottom on new messages_

3. WHEN user submits a message, THE system SHALL send to Ollama endpoint via getOllamaEndpoint() and stream response
   - _References: Design shows AI responses with streaming text_
   - _Tech: Use fetch with ReadableStream for streaming_
   - _Integration: Call getOllamaEndpoint() to get LLM service URL_

4. WHERE evidence context is available, THE system SHALL include evidence summaries in chat context for better AI responses
   - _References: Design shows evidence context in chat_
   - _Tech: Pass evidence data in system prompt_
   - _Data: Query from Drizzle ORM before sending to LLM_

5. IF chat session exceeds token limit, THEN THE system SHALL summarize conversation and start new session
   - _References: Design shows session management_
   - _Tech: Implement token counting and summarization_
   - _Integration: Use Lucia v3 session for persistence_

### Requirement 4: Authentication & Session Management

**User Story:** As a system administrator, I want all components to respect Lucia v3 authentication so that only authorized users can access sensitive case data.

#### Acceptance Criteria

1. WHEN user is not authenticated, THE system SHALL redirect to login page
   - _Tech: Use SvelteKit load functions with Lucia middleware_
   - _Integration: Check session in +page.server.ts_

2. WHILE user session is active, THE system SHALL maintain authentication across all three components
   - _Tech: Use Lucia v3 session cookies_
   - _Persistence: Store in secure HTTP-only cookies_

3. WHEN user session expires, THE system SHALL gracefully handle re-authentication
   - _Tech: Implement session refresh logic_
   - _UX: Show login prompt without losing work_

### Requirement 5: Database Integration with Drizzle ORM 0.44

**User Story:** As a developer, I want all data operations to use Drizzle ORM 0.44 with type safety so that the system is maintainable and performant.

#### Acceptance Criteria

1. WHEN fetching cases, THE system SHALL use Drizzle ORM queries with proper type inference
   - _Tech: Define schema in `src/lib/db/schema.ts`_
   - _Integration: Query in API routes with proper error handling_

2. WHILE updating evidence nodes, THE system SHALL use Drizzle transactions for data consistency
   - _Tech: Use `db.transaction()` for multi-step operations_
   - _Reliability: Ensure ACID compliance_

3. WHEN persisting evidence connections, THE system SHALL validate relationships before storing
   - _Tech: Use Drizzle schema validation_
   - _Data Integrity: Prevent orphaned connections_

### Requirement 6: Styling with Uno.css

**User Story:** As a designer, I want consistent styling across all components using Uno.css utilities so that the UI matches the design mockups.

#### Acceptance Criteria

1. WHEN rendering components, THE system SHALL use Uno.css utility classes for all styling
   - _Tech: Use `class="flex gap-4 p-2 bg-gray-900 text-white"` pattern_
   - _Consistency: Define color palette in `uno.config.ts`_

2. WHILE responsive design is needed, THE system SHALL use Uno.css breakpoints (sm, md, lg, xl)
   - _Tech: Use `md:flex-col lg:flex-row` responsive utilities_
   - _Mobile: Ensure mobile-first approach_

3. WHEN dark theme is active, THE system SHALL apply dark mode utilities consistently
   - _Tech: Use `dark:bg-gray-900 dark:text-white` utilities_
   - _Theme: Support light/dark toggle_

### Requirement 7: State Management with XState v5

**User Story:** As a developer, I want complex UI state managed with XState v5 so that state transitions are predictable and testable.

#### Acceptance Criteria

1. WHEN chat state changes, THE system SHALL use XState v5 state machines for transitions
   - _Tech: Define machines in `src/lib/machines/`_
   - _States: idle, loading, streaming, error, complete_

2. WHILE evidence board is interactive, THE system SHALL manage selection, dragging, and connection states
   - _Tech: Use XState for board state management_
   - _Predictability: All state changes go through machine_

3. WHEN system metrics update, THE system SHALL use XState for metric state and transitions
   - _Tech: Define metric state machine_
   - _Real-time: Update on 3-second intervals_

### Requirement 8: Bits UI v2 Component Integration

**User Story:** As a developer, I want to use Bits UI v2 components with the newer API so that the UI is accessible and consistent.

#### Acceptance Criteria

1. WHEN rendering dialogs, THE system SHALL use Bits UI v2 Dialog component with new API
   - _Tech: Use `<Dialog.Root>`, `<Dialog.Content>`, `<Dialog.Trigger>`_
   - _Accessibility: Ensure ARIA attributes are correct_

2. WHILE displaying dropdowns, THE system SHALL use Bits UI v2 Dropdown with proper keyboard navigation
   - _Tech: Use `<Dropdown.Root>`, `<Dropdown.Menu>`, `<Dropdown.Item>`_
   - _Keyboard: Support arrow keys and Enter_

3. WHEN showing data tables, THE system SHALL use Bits UI v2 Table component
   - _Tech: Use `<Table.Root>`, `<Table.Header>`, `<Table.Body>`_
   - _Sorting: Support column sorting_

### Requirement 9: Ollama Integration for AI Chat

**User Story:** As a user, I want AI chat to work seamlessly with local Ollama inference so that I get fast, private LLM responses.

#### Acceptance Criteria

1. WHEN chat initializes, THE system SHALL call getOllamaEndpoint() to get LLM service URL
   - _Tech: Import from `$lib/services/ollama`_
   - _Fallback: Handle missing endpoint gracefully_

2. WHILE streaming responses, THE system SHALL display tokens as they arrive from Ollama
   - _Tech: Use fetch with ReadableStream_
   - _UX: Show streaming indicator_

3. WHEN Ollama service is unavailable, THE system SHALL display error message and fallback options
   - _Tech: Implement error boundary_
   - _UX: Suggest troubleshooting steps_

### Requirement 10: Production Deployment Readiness

**User Story:** As an operations team, I want all components production-ready with proper error handling, logging, and monitoring so that the system is reliable.

#### Acceptance Criteria

1. WHEN errors occur, THE system SHALL log to console and error tracking service
   - _Tech: Use error boundaries and try-catch blocks_
   - _Monitoring: Send to error tracking (Sentry, etc.)_

2. WHILE system is running, THE system SHALL monitor performance metrics
   - _Tech: Use Web Vitals and performance API_
   - _Observability: Track load times and interactions_

3. WHEN deploying to production, THE system SHALL have all environment variables configured
   - _Tech: Use `.env.production` with proper secrets_
   - _Security: Never commit secrets to repo_

