# Implementation Plan: NES Command Center Database Wiring

## Overview

This implementation plan converts the design into actionable coding tasks. Each task builds incrementally on previous tasks, starting with database schema and migrations, then API endpoints, then server-side data loading, and finally client-side integration.

---

## Phase 1: Database Schema and Migrations (Drizzle ORM)

- [x] 1. Create Drizzle ORM schema definitions

  - Create `backend/db/schema.ts` with Drizzle ORM table definitions
  - Define route_metadata, error_cluster, route_health_event, error_brain_analysis, error_brain_patch, route_interaction_log tables
  - Use Drizzle ORM 0.44 with PostgreSQL dialect
  - Add indexes on route_id, timestamp, status, tool columns
  - Use soft delete pattern with archived_at timestamp (no dropping tables)
  - _Requirements: 6.1, 6.2, 6.3, 6.4, 6.5_






- [x] 1.1 Implement Drizzle migration generator
  - Create `backend/db/migrations.ts` with Drizzle migration runner
  - Use `drizzle-kit` to generate migrations from schema
  - Execute migrations in order with transaction support
  - Track applied migrations in drizzle_migrations table
  - Ensure migrations preserve existing data (no drops)
  - _Requirements: 6.1_



- [x] 1.2 Write property test for migration execution
  - **Property 15: Migration Table Creation**
  - **Validates: Requirements 6.1**



- [x] 1.3 Create database connection pool
  - Create `backend/db/pool.ts` with PostgreSQL connection pool using Drizzle
  - Configure pool size, timeout, and retry logic
  - Export getDb() function for use in API handlers
  - _Requirements: 6.1_

- [x] 1.4 Create database query helpers
  - Create `backend/db/queries.ts` with helper functions for common queries
  - Implement getRouteMetadata(), createRouteMetadata(), updateRouteMetadata()
  - Implement getErrorClusters(), createErrorCluster()
  - Implement getHealthEvents(), createHealthEvent()
  - Use Drizzle ORM query builder
  - _Requirements: 6.1_

- [x] 1.5 Write unit tests for database queries


  - Create `backend/db/queries.test.ts` with Vitest
  - Test all query helper functions with test database
  - Test error handling and edge cases
  - _Requirements: 6.1_

---

## Phase 2: API Endpoints - Route Metadata

- [x] 2. Implement route metadata API endpoints
  - Create `sveltekit-frontend/src/routes/api/routes/metadata/+server.ts`
  - Implement POST handler for create/update route metadata
  - Implement GET handler for retrieve route metadata with health status
  - Add error handling and validation
  - _Requirements: 7.1, 7.2_

- [x] 2.1 Implement POST /api/routes/metadata
  - Accept route_id, path, kind, group, priority, badges
  - Check if route_metadata exists (update) or create new
  - Return stored record with id, created_at, updated_at
  - Validate required fields and return 400 if invalid
  - _Requirements: 7.1_

- [x] 2.2 Implement GET /api/routes/:routeId/metadata
  - Query route_metadata by route_id
  - Query error_cluster for unresolved error count
  - Query route_health_event for most recent status
  - Query error_brain_analysis for suggestion count
  - Return enriched metadata with health status
  - _Requirements: 7.2_

- [x] 2.3 Write property test for metadata endpoint
  - **Property 19: API Metadata Endpoint**
  - **Validates: Requirements 7.1**

- [x] 2.4 Write unit tests for metadata endpoints
  - Create `sveltekit-frontend/src/routes/api/routes/metadata/+server.test.ts`
  - Test POST handler with valid and invalid data
  - Test GET handler with various route states
  - Test error handling and edge cases
  - _Requirements: 7.1, 7.2_

---

## Phase 3: API Endpoints - Error Clusters

- [x] 3. Implement error cluster API endpoints
  - Create `sveltekit-frontend/src/routes/api/routes/[routeId]/errors/+server.ts`
  - Implement POST handler for create error cluster
  - Implement GET handler for list error clusters with pagination
  - Add error handling and validation
  - _Requirements: 7.3, 7.4_

- [x] 3.1 Implement POST /api/routes/:routeId/errors
  - Accept tool, code, message, severity, file_path, raw_log_snippet
  - Validate route_id exists in route_metadata (return 409 if not)
  - Create error_cluster record
  - Recalculate route health status
  - Return created error_cluster record
  - _Requirements: 7.3, 9.1, 9.2_

- [x] 3.2 Implement GET /api/routes/:routeId/errors
  - Accept limit, offset, resolved query parameters
  - Query error_cluster for route_id
  - Filter by resolved status if provided
  - Order by severity (error > warning > info) then timestamp descending
  - Return paginated results with total count
  - _Requirements: 7.4_

- [x] 3.3 Write property test for error cluster endpoint
  - **Property 20: API Error Cluster Endpoint**
  - **Validates: Requirements 7.3**

- [x] 3.4 Write property test for error cluster ordering
  - **Property 6: Error Cluster Ordering**
  - **Validates: Requirements 2.3**

- [x] 3.5 Write unit tests for error cluster endpoints
  - Create `sveltekit-frontend/src/routes/api/routes/[routeId]/errors/+server.test.ts`
  - Test POST handler with valid and invalid data
  - Test GET handler with pagination and filtering
  - Test error handling and referential integrity
  - _Requirements: 7.3, 7.4_

---

## Phase 4: API Endpoints - Health Events

- [x] 4. Implement health event API endpoints
  - Create `sveltekit-frontend/src/routes/api/routes/[routeId]/health-event/+server.ts`
  - Implement POST handler for create health event
  - Implement GET handler for list health events with pagination
  - Add error handling and validation
  - _Requirements: 7.5, 7.6_

- [x] 4.1 Implement POST /api/routes/:routeId/health-event
  - Accept old_status, new_status, reason
  - Validate route_id exists in route_metadata (return 409 if not)
  - Create route_health_event record
  - Update route_metadata status field
  - Return created health event record
  - _Requirements: 7.5, 3.1_

- [x] 4.2 Implement GET /api/routes/:routeId/health-history
  - Accept limit, offset query parameters
  - Query route_health_event for route_id
  - Order by timestamp descending
  - Return paginated results with total count
  - _Requirements: 7.6_

- [x] 4.3 Write property test for health event endpoint
  - **Property 8: Health Event Creation**
  - **Validates: Requirements 3.1**

- [x] 4.4 Write property test for health event ordering
  - **Property 9: Health Event Ordering**
  - **Validates: Requirements 3.2**

- [x] 4.5 Write unit tests for health event endpoints
  - Create `sveltekit-frontend/src/routes/api/routes/[routeId]/health-event/+server.test.ts`
  - Test POST handler with valid and invalid data
  - Test GET handler with pagination
  - Test health status calculation and updates
  - _Requirements: 7.5, 7.6_

---

## Phase 5: API Endpoints - Interactions

- [x] 5. Implement interaction logging API endpoints
  - Create `sveltekit-frontend/src/routes/api/routes/[routeId]/interactions/+server.ts`
  - Implement POST handler for log interaction
  - Implement GET handler for list interactions with pagination
  - Add error handling and validation
  - _Requirements: 7.7, 7.8_

- [x] 5.1 Implement POST /api/routes/:routeId/interactions
  - Accept interaction_type, user_id, metadata
  - Validate route_id exists in route_metadata (return 409 if not)
  - Validate interaction_type is one of: view, navigate, analyze, patch_apply
  - Create route_interaction_log record
  - Return created interaction record
  - _Requirements: 7.7, 5.1_

- [x] 5.2 Implement GET /api/routes/:routeId/interactions
  - Accept limit, offset query parameters
  - Query route_interaction_log for route_id
  - Join with user information if available
  - Order by timestamp descending
  - Return paginated results with total count
  - _Requirements: 7.8_

- [x] 5.3 Write property test for interaction logging
  - **Property 13: Interaction Logging**
  - **Validates: Requirements 5.1**

- [x] 5.4 Write property test for interaction log ordering
  - **Property 14: Interaction Log Ordering**
  - **Validates: Requirements 5.5**

- [x] 5.5 Write unit tests for interaction endpoints
  - Create `sveltekit-frontend/src/routes/api/routes/[routeId]/interactions/+server.test.ts`
  - Test POST handler with all interaction types
  - Test GET handler with pagination
  - Test validation of interaction_type values
  - _Requirements: 7.7, 7.8_

---

## Phase 6: Server-Side Data Loading


- [x] 6. Update +page.server.ts to load from database
  - Modify `sveltekit-frontend/src/routes/(app)/all-routes/+page.server.ts`
  - Implement enrichRoutesWithDatabase() function
  - Load route_metadata from database
  - Merge with COMMAND_CENTER_MANIFEST

  - Enrich with error counts, health status, suggestion counts
  - Return enriched routes to client
  - _Requirements: 8.1, 8.2, 8.3, 8.4, 8.5, 8.6_

- [x] 6.1 Implement database query for route metadata
  - Query route_metadata table for all non-archived routes

  - Handle database connection errors gracefully
  - Return empty array if database unavailable
  - _Requirements: 8.1_

- [x] 6.2 Implement route merge logic

  - Merge database routes with COMMAND_CENTER_MANIFEST
  - Prefer database values for status, error_count, etc.
  - Keep manifest values for label, description, badges
  - Return complete route definitions
  - _Requirements: 8.2_



- [x] 6.3 Implement error count enrichment
  - For each route, query error_cluster for unresolved errors
  - Count errors by severity
  - Add errorCount, lastErrorAt, lastErrorMessage to route
  - _Requirements: 8.4, 8.5_

- [x] 6.4 Implement health status enrichment
  - For each route, query route_health_event for most recent status
  - If no event, compute from error_cluster
  - Add errorState (healthy/flaky/broken) to route
  - _Requirements: 8.3_

- [x] 6.5 Implement suggestion count enrichment
  - For each route, query error_brain_analysis for count
  - Add suggestionCount to route
  - _Requirements: 8.6_

- [x] 6.6 Write property test for server-side enrichment
  - **Property 22: Server-Side Data Enrichment**



  - **Validates: Requirements 8.1, 8.2**

- [x] 6.7 Write property test for health status enrichment
  - **Property 23: Health Status Enrichment**
  - **Validates: Requirements 8.3**


- [x] 6.8 Write unit tests for server-side data loading
  - Create `sveltekit-frontend/src/routes/(app)/all-routes/+page.server.test.ts`
  - Test enrichRoutesWithDatabase() with mock database
  - Test route merge logic
  - Test error count and health status enrichment
  - _Requirements: 8.1-8.6_


---

## Phase 7: Client-Side Integration - Interaction Logging


- [x] 7. Add interaction logging to all-routes page
  - Modify `sveltekit-frontend/src/routes/(app)/all-routes/+page.svelte`
  - Create logInteraction() helper function

  - Log interactions on route view, navigate, analyze, patch_apply
  - Handle logging errors gracefully
  - _Requirements: 5.1, 5.2, 5.3, 5.4_


- [x] 7.1 Implement logInteraction() helper
  - Create async function that POSTs to /api/routes/:routeId/interactions
  - Accept interaction_type and optional metadata
  - Handle network errors gracefully
  - Don't block UI on logging errors
  - _Requirements: 5.1_

- [x] 7.2 Log route view interactions
  - Call logInteraction('view') when route modal opens
  - Include route_id in request
  - _Requirements: 5.1_

- [x] 7.3 Log route navigate interactions
  - Call logInteraction('navigate') when "Visit Page" button clicked
  - Include route_id in request
  - _Requirements: 5.2_

- [x] 7.4 Log error brain analyze interactions
  - Call logInteraction('analyze') when error brain analysis starts
  - Include route_id in request
  - _Requirements: 5.3_

- [x] 7.5 Log patch apply interactions
  - Call logInteraction('patch_apply') when patch is applied
  - Include route_id and patch_id in metadata
  - _Requirements: 5.4_

---

## Phase 8: Client-Side Integration - Error Display

- [x] 8. Update route cards to display error information



  - Modify `sveltekit-frontend/src/routes/(app)/all-routes/+page.svelte`
  - Display error count on route cards
  - Display health status emoji (✅ 🟡 ❌)
  - Display last error timestamp
  - _Requirements: 1.5, 2.5_

- [x] 8.1 Display error count on route cards
  - Show error count badge if errorCount > 0
  - Format as "N errors" or "1 error"
  - _Requirements: 1.5_

- [x] 8.2 Display health status indicator
  - Show emoji based on errorState (healthy/flaky/broken)
  - Add color coding to route card border
  - _Requirements: 2.5_

- [x] 8.3 Display last error information
  - Show last error timestamp in route card
  - Show last error message in tooltip
  - _Requirements: 8.5_

---

## Phase 9: Client-Side Integration - Error Brain

- [x] 9. Integrate error brain with database
  - Modify error brain modal to save analyses to database
  - Save error_brain_analysis records
  - Save error_brain_patch records when patches applied
  - _Requirements: 4.1, 4.2_

- [x] 9.1 Save error brain analysis to database
  - When error brain completes analysis, POST to /api/routes/:routeId/error-brain-analysis
  - Include suggestions, selected_suggestion_index, phase
  - Store analysis_id for later patch tracking
  - _Requirements: 4.1_

- [x] 9.2 Save error brain patch to database
  - When patch is applied, POST to /api/routes/:routeId/error-brain-patch
  - Include analysis_id, patch_content, applied_timestamp
  - Set verification_status to pending
  - _Requirements: 4.2_

- [x] 9.3 Update patch verification status
  - When patch verification completes, PUT to /api/routes/:routeId/error-brain-patch/:patchId
  - Update verification_status to passed or failed
  - Include verification_message
  - _Requirements: 4.4_

---



## Phase 10: Real-Time Updates (SSE)

- [x] 10. Implement real-time health status updates using Server-Sent Events
  - Create SSE endpoint for route health updates
  - Broadcast health changes to connected clients



  - Update route cards in real-time without page reload
  - _Requirements: 9.4, 9.5_

- [x] 10.1 Create SSE endpoint for health updates
  - Create `sveltekit-frontend/src/routes/api/routes/events/+server.ts`
  - Implement GET handler that returns EventSource stream


  - Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`
  - Keep connection alive with heartbeat every 30 seconds
  - _Requirements: 9.4_



- [x] 10.2 Broadcast health changes via SSE
  - When route_health_event is created, send SSE message to all connected clients
  - Message format: `data: {"type":"health_change","routeId":"...","oldStatus":"...","newStatus":"..."}`
  - Include route_id, old_status, new_status, timestamp
  - Handle client disconnections gracefully
  - _Requirements: 9.4_



- [x] 10.3 Update UI on health change
  - Create EventSource connection in all-routes page
  - Listen for 'message' events from SSE endpoint


  - Update route card health indicator in real-time
  - Update error count if changed
  - Auto-reconnect on connection loss
  - Don't reload page
  - _Requirements: 9.5_

---

## Phase 11: Data Archival

- [x] 11. Implement data archival background job
  - Create `backend/jobs/archiveOldData.ts`
  - Archive error_cluster records older than 90 days
  - Archive route_interaction_log records older than 180 days
  - Run as background job without blocking application
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 11.1 Create archival migration
  - Create `backend/migrations/007_create_archive_tables.sql`
  - Create error_cluster_archive table
  - Create route_interaction_log_archive table
  - _Requirements: 10.1, 10.2_

- [x] 11.2 Implement archival job
  - Create archiveOldData() function
  - Query error_cluster for records older than 90 days
  - Move to error_cluster_archive table
  - Query route_interaction_log for records older than 180 days
  - Move to route_interaction_log_archive table
  - _Requirements: 10.1, 10.2, 10.3_

- [x] 11.3 Schedule archival job
  - Add archival job to background job scheduler
  - Run daily at 2 AM UTC
  - Log archival results
  - _Requirements: 10.3_

- [x] 11.4 Implement archive query support
  - Add archived flag to GET endpoints
  - When archived=true, query archive tables
  - When archived=false (default), query main tables
  - _Requirements: 10.4, 10.5_

---



## Phase 12: Integration Testing

- [x] 12. Write end-to-end integration tests
  - Create `tests/nes-command-center-integration.spec.ts` with Playwright
  - Test full flow: create route → create error → verify health update
  - Test API endpoints with real database
  - Test real-time updates via SSE
  - _Requirements: All_

- [x] 12.1 Test route creation and metadata persistence
  - Create a new route via API
  - Verify it appears in database
  - Verify it appears on all-routes page
  - _Requirements: 1.2, 7.1_

- [x] 12.2 Test error cluster creation and health calculation
  - Create error clusters for a route
  - Verify health status changes from healthy to broken
  - Verify error count updates on UI
  - _Requirements: 2.1, 2.5, 3.1, 8.4_

- [x] 12.3 Test error brain analysis persistence
  - Run error brain analysis on a route
  - Verify analysis is saved to database
  - Verify patch is saved when applied
  - _Requirements: 4.1, 4.2_

- [x] 12.4 Test interaction logging
  - Perform various interactions (view, navigate, analyze, patch_apply)
  - Verify all interactions are logged to database
  - Verify interaction history is retrievable
  - _Requirements: 5.1-5.5_

- [x] 12.5 Test real-time health updates via SSE
  - Create error cluster for a route
  - Verify SSE broadcasts health change
  - Verify UI updates without page reload
  - _Requirements: 9.4, 9.5_

- [x] 12.6 Test data archival
  - Archive old error clusters (90+ days)
  - Archive old interactions (180+ days)
  - Query archived data via API
  - _Requirements: 10.1-10.5_

---

## Phase 13: Testing and Validation

- [x] 13. Checkpoint - Ensure all tests pass
  - Run all unit tests: `npm test`
  - Run all property-based tests: `npm run test:properties`
  - Run all integration tests: `npm run test:integration`
  - Fix any failing tests before proceeding
  - _Requirements: All_

- [x] 13.1 Run unit tests
  - Execute Vitest for all unit tests
  - Verify 100% pass rate
  - Check code coverage > 80%
  - _Requirements: All_

- [x] 13.2 Run property-based tests
  - Execute fast-check for all property tests
  - Verify 100 iterations per property
  - Check for any failing examples
  - _Requirements: All_

- [x] 13.3 Run integration tests
  - Execute Playwright for end-to-end tests
  - Test full flow: create route → error → health update
  - Test API endpoints with real database
  - _Requirements: All_

- [x] 13.4 Performance testing
  - Test query performance with 1000+ routes
  - Verify indexes are being used
  - Verify response times < 100ms
  - _Requirements: 6.2_

---

## Phase 14: Documentation and Deployment

- [x] 14. Create API documentation
  - Document all endpoints in OpenAPI/Swagger format
  - Include request/response examples
  - Document error codes and messages
  - Create `docs/API.md` with endpoint reference
  - _Requirements: 7.1-7.8_

- [x] 14.1 Create database documentation
  - Document schema with table descriptions
  - Document indexes and performance considerations
  - Document migration process
  - Create `docs/DATABASE.md` with schema reference
  - _Requirements: 6.1-6.5_

- [x] 14.2 Create deployment guide
  - Document database setup steps
  - Document environment variables
  - Document migration execution
  - Create `docs/DEPLOYMENT.md` with setup instructions
  - _Requirements: 6.1_

- [x] 14.3 Create developer guide
  - Document how to add new routes to tracking
  - Document how to query route data
  - Document how to integrate with error brain
  - Create `docs/DEVELOPER_GUIDE.md`
  - _Requirements: All_

- [x] 14.4 Create troubleshooting guide
  - Document common issues and solutions
  - Document how to debug database issues
  - Document how to recover from failed migrations
  - Create `docs/TROUBLESHOOTING.md`
  - _Requirements: All_

---

## Summary

This implementation plan covers:
- **Phase 1**: Database schema and migrations using Drizzle ORM 0.44 (6 tables, indexes, types, query helpers)
- **Phase 2-5**: API endpoints (8 endpoints for CRUD operations with unit tests)
- **Phase 6**: Server-side data loading and enrichment with unit tests
- **Phase 7-9**: Client-side integration (logging, display, error brain)
- **Phase 10**: Real-time updates via WebSocket
- **Phase 11**: Data archival background job
- **Phase 12**: End-to-end integration testing with Playwright
- **Phase 13**: Testing and validation (unit, property-based, integration)
- **Phase 14**: Documentation and deployment guides

### Key Features
- **Drizzle ORM 0.44**: Type-safe database queries with PostgreSQL
- **Soft Delete Pattern**: No data loss - archived_at timestamp instead of dropping tables
- **Property-Based Testing**: 27 properties validated with fast-check (100+ iterations each)
- **Comprehensive Testing**: Unit, property-based, and integration tests
- **Real-Time Updates**: WebSocket support for live health status updates
- **Data Archival**: Automatic archival of old data (90/180 day retention)
- **Complete Documentation**: API, database, deployment, and troubleshooting guides

### Testing Coverage
- **Unit Tests**: All API endpoints, database queries, server-side functions
- **Property Tests**: 27 properties covering all requirements
- **Integration Tests**: Full flow testing with Playwright
- **Performance Tests**: Query performance with 1000+ routes

Total estimated effort: 120-150 hours of development time (including comprehensive testing and documentation).

