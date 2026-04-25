# Person of Interest Feature - Implementation Tasks

**Date**: December 14, 2025
**Status**: Ready for Implementation
**Feature Name**: person-of-interest

---

## Implementation Plan

- [ ] 1. Database Schema & Migrations
  - [x] 1.1 Create PostgreSQL schema for POI and associates tables

    - Create `persons_of_interest` table with pgvector support
    - Create `known_associates` relationship table
    - Create indexes for performance
    - _Requirements: 1.2, 4.1_

  - [ ] 1.2 Create Qdrant collection for POI vectors
    - Define collection schema with payload fields
    - Configure vector similarity settings


    - _Requirements: 5.1_
  - [ ] 1.3 Write database migration scripts
    - Create migration files for schema changes


    - Test migration up/down

    - _Requirements: 1.2_

- [ ] 2. Backend API Implementation
  - [ ] 2.1 Implement POI CRUD endpoints
    - GET /api/persons-of-interest (list with pagination)
    - POST /api/persons-of-interest (create)

    - GET /api/persons-of-interest/[id] (detail)
    - PUT /api/persons-of-interest/[id] (update)
    - DELETE /api/persons-of-interest/[id] (delete)
    - _Requirements: 1.1, 1.3_

  - [ ] 2.2 Implement vector embedding service
    - Generate embeddings for POI profiles
    - Store embeddings in pgvector
    - Update embeddings on profile changes

    - _Requirements: 4.1_
  - [ ] 2.3 Implement Qdrant integration
    - Index POI vectors in Qdrant
    - Implement semantic search endpoint

    - Handle vector updates and deletions
    - _Requirements: 5.1, 5.2_
  - [ ] 2.4 Implement known associates endpoints
    - POST /api/persons-of-interest/[id]/associates (add)
    - DELETE /api/persons-of-interest/[id]/associates/[associateId] (remove)
    - GET /api/persons-of-interest/[id]/associates (list)
    - _Requirements: 2.1, 2.2_
  - [ ] 2.5 Implement vector search endpoint
    - POST /api/persons-of-interest/search (semantic search)
    - Support filtering by status, priority, case
    - Return ranked results with similarity scores
    - _Requirements: 4.3, 5.2_

- [ ] 3. Frontend Components - Svelte 5 & SvelteKit 2
  - [ ] 3.1 Create POI list page
    - Implement `/routes/(app)/persons-of-interest/+page.svelte`
    - Display POI list with pagination
    - Add search and filter controls
    - Use Svelte 5 runes for state management
    - _Requirements: 1.1, 6.3_
  - [ ] 3.2 Create POI detail page
    - Implement `/routes/(app)/persons-of-interest/[id]/+page.svelte`
    - Display full POI profile
    - Show known associates
    - Display vector search results
    - _Requirements: 1.1, 2.2, 4.3_
  - [ ] 3.3 Create POI form component with SuperForms
    - Implement `POIForm.svelte` with SuperForms integration
    - Add validation for all fields
    - Handle form submission and error states
    - _Requirements: 3.1, 3.2, 3.3_
  - [ ] 3.4 Create known associates component
    - Implement `AssociatesList.svelte`
    - Display associates with relationship types
    - Add/remove associate functionality
    - _Requirements: 2.1, 2.2_
  - [ ] 3.5 Create vector search results component
    - Implement `SearchResults.svelte`
    - Display ranked results with similarity scores
    - Add filtering and sorting
    - _Requirements: 4.3, 5.2_
  - [ ] 3.6 Create POI card component
    - Implement `POICard.svelte` for list display
    - Show status, priority, threat level badges
    - Apply YoRHa theme styling
    - _Requirements: 6.2, 6.4_

- [ ] 4. Form Integration with SuperForms
  - [ ] 4.1 Create POI form schema with Zod
    - Define validation schema for all fields
    - Add custom validators for complex fields
    - _Requirements: 3.1_
  - [ ] 4.2 Implement SvelteKit form actions
    - Create `+page.server.ts` for create/update actions
    - Add server-side validation
    - Handle database persistence
    - _Requirements: 3.2, 8.2_
  - [ ] 4.3 Implement form error handling
    - Display validation errors for each field
    - Preserve form state on errors
    - Show success messages
    - _Requirements: 3.3_

- [ ] 5. YoRHa Theme UI/UX Implementation
  - [ ] 5.1 Apply YoRHa theme colors and styling
    - Use crimson accents (#dc2626)
    - Dark background (#0f0f23)
    - Consistent typography and spacing
    - _Requirements: 6.1, 6.2_
  - [ ] 5.2 Implement status and priority badges
    - Color-coded badges for status
    - Priority indicators
    - Threat level visualization
    - _Requirements: 6.4_
  - [ ] 5.3 Implement responsive layout
    - Mobile: Single column
    - Tablet: Two columns
    - Desktop: Three columns with sidebar
    - _Requirements: 6.3_

- [ ] 6. Command Center Integration
  - [ ] 6.1 Add POI statistics to Command Center dashboard
    - Display total POI count
    - Show active investigations
    - Display recent activity
    - _Requirements: 7.1_
  - [ ] 6.2 Add POI navigation to Command Center
    - Add "Persons" link to sidebar
    - Implement navigation to POI management
    - _Requirements: 7.2_
  - [ ] 6.3 Add POI quick actions to Command Center
    - "Create New POI" button
    - "View All POIs" link
    - Recent POIs list
    - _Requirements: 7.3_

- [ ] 7. Checkpoint - Core Functionality Complete
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 8. Property-Based Tests
  - [ ] 8.1 Write property test for POI creation persistence
    - **Property 1: POI Creation Persistence**
    - **Validates: Requirements 1.2**
  - [ ] 8.2 Write property test for vector embedding consistency
    - **Property 2: Vector Embedding Consistency**
    - **Validates: Requirements 4.1**
  - [ ] 8.3 Write property test for known associates integrity
    - **Property 3: Known Associates Relationship Integrity**
    - **Validates: Requirements 2.3**
  - [ ] 8.4 Write property test for vector search relevance
    - **Property 4: Vector Search Relevance**
    - **Validates: Requirements 4.3**
  - [ ] 8.5 Write property test for form validation round-trip
    - **Property 5: Form Validation Round-Trip**
    - **Validates: Requirements 3.4**
  - [ ] 8.6 Write property test for Qdrant synchronization
    - **Property 6: Qdrant Index Synchronization**
    - **Validates: Requirements 5.1**
  - [ ] 8.7 Write property test for status consistency
    - **Property 7: Status Consistency**
    - **Validates: Requirements 1.1**

- [ ] 9. Unit Tests
  - [ ] 9.1 Write unit tests for POI CRUD operations
    - Test create, read, update, delete
    - Test validation and error handling
    - _Requirements: 1.1, 1.3_
  - [ ] 9.2 Write unit tests for vector embedding service
    - Test embedding generation
    - Test vector storage and retrieval
    - _Requirements: 4.1_
  - [ ] 9.3 Write unit tests for known associates management
    - Test add/remove associates
    - Test relationship integrity
    - _Requirements: 2.1, 2.3_
  - [ ] 9.4 Write unit tests for vector search
    - Test search query execution
    - Test result ranking
    - Test filtering
    - _Requirements: 4.3, 5.2_
  - [ ] 9.5 Write unit tests for form validation
    - Test all validation rules
    - Test error messages
    - _Requirements: 3.1, 3.3_

- [ ] 10. Integration Tests
  - [ ] 10.1 Write integration tests for full CRUD workflow
    - Create → Read → Update → Delete
    - Verify data persistence
    - _Requirements: 1.1, 1.2, 1.3_
  - [ ] 10.2 Write integration tests for vector search workflow
    - Create POI → Generate embedding → Search
    - Verify Qdrant indexing
    - _Requirements: 4.1, 5.1, 5.2_
  - [ ] 10.3 Write integration tests for Command Center integration
    - Navigate to POI management
    - Create POI from Command Center
    - Verify statistics update
    - _Requirements: 7.1, 7.2, 7.3_

- [ ] 11. Checkpoint - All Tests Passing
  - Ensure all tests pass, ask the user if questions arise.

- [ ] 12. Documentation & Cleanup
  - [ ] 12.1 Write API documentation
    - Document all endpoints
    - Include request/response examples
    - _Requirements: 1.1_
  - [ ] 12.2 Write component documentation
    - Document component props and usage
    - Include examples
    - _Requirements: 3.1_
  - [ ] 12.3 Clean up code and remove TODOs
    - Remove placeholder code
    - Add final comments
    - _Requirements: 8.1_

- [ ] 13. Final Checkpoint - Feature Complete
  - Ensure all tests pass, ask the user if questions arise.

---

## Notes

- All components use Svelte 5 runes ($state, $derived, $effect)
- All forms use SuperForms with Zod validation
- All data persists to PostgreSQL legal_ai_db
- All POI profiles are indexed in Qdrant for semantic search
- All UI follows YoRHa theme with crimson accents
- All endpoints follow REST conventions
- All tests use property-based testing where applicable

