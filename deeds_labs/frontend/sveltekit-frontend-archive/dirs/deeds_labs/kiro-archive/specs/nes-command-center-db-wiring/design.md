# Design Document: NES Command Center Database Wiring

## Overview

The NES Command Center Database Wiring feature extends the existing all-routes page with persistent storage for route metadata, error tracking, health status, and user interactions. This enables historical analysis, trend tracking, and integration with the Error Brain (Phase 78) for AI-powered error resolution.

The design follows a layered architecture:
- **Database Layer**: PostgreSQL schema with route_metadata, error_cluster, route_health_event, error_brain_analysis, error_brain_patch, and route_interaction_log tables
- **API Layer**: RESTful endpoints for CRUD operations on route data
- **Server Layer**: SvelteKit +page.server.ts that loads and enriches route data from the database
- **Client Layer**: Svelte 5 components that display route data and trigger interactions

## Architecture

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Frontend: all-routes page (+page.svelte)                    │
│ - Displays routes with health status, error counts          │
│ - Logs user interactions (view, navigate, analyze, patch)   │
│ - Triggers error brain analysis                             │
└────────────────────┬────────────────────────────────────────┘
                     │ HTTP requests
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ API Layer: /api/routes/* endpoints                          │
│ - POST /api/routes/metadata (create/update)                 │
│ - GET /api/routes/:routeId/metadata                         │
│ - POST /api/routes/:routeId/errors (create error cluster)   │
│ - GET /api/routes/:routeId/errors (list with pagination)    │
│ - POST /api/routes/:routeId/health-event                    │
│ - GET /api/routes/:routeId/health-history                   │
│ - POST /api/routes/:routeId/interactions (log interaction)   │
│ - GET /api/routes/:routeId/interactions                     │
└────────────────────┬────────────────────────────────────────┘
                     │ SQL queries
                     ▼
┌─────────────────────────────────────────────────────────────┐
│ Database Layer: PostgreSQL                                  │
│ - route_metadata: path, kind, group, status, archived_at    │
│ - error_cluster: route_id, tool, code, severity, resolved   │
│ - route_health_event: route_id, old_status, new_status      │
│ - error_brain_analysis: route_id, suggestions, timestamp    │
│ - error_brain_patch: analysis_id, patch, verification       │
│ - route_interaction_log: route_id, type, user_id, timestamp │
└─────────────────────────────────────────────────────────────┘
```

### Server-Side Data Loading

```
+page.server.ts load() function:
1. Query database for all route_metadata (non-archived)
2. Merge with COMMAND_CENTER_MANIFEST to get complete definitions
3. For each route:
   - Query error_cluster table for unresolved errors
   - Query route_health_event for most recent status
   - Query error_brain_analysis for suggestion count
   - Compute health status (broken/flaky/healthy)
4. Return enriched routes to client
```

## Components and Interfaces

### Database Schema

#### route_metadata
```sql
CREATE TABLE route_metadata (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id VARCHAR(255) UNIQUE NOT NULL,  -- e.g., "/cases/[id]/overview"
  path VARCHAR(255) NOT NULL,
  kind VARCHAR(50) NOT NULL,  -- page, layout, server, endpoint
  group VARCHAR(100),  -- (app), (yorha), etc.
  status VARCHAR(50) DEFAULT 'healthy',  -- healthy, flaky, broken
  priority INT DEFAULT 50,
  badges JSONB DEFAULT '[]',  -- ["ai", "shield", "special"]
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  archived_at TIMESTAMP,
  INDEX idx_route_id (route_id),
  INDEX idx_status (status),
  INDEX idx_archived_at (archived_at)
);
```

#### error_cluster
```sql
CREATE TABLE error_cluster (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id VARCHAR(255) NOT NULL REFERENCES route_metadata(route_id),
  tool VARCHAR(100) NOT NULL,  -- svelte-check, tsc, vite, drizzle
  code VARCHAR(100) NOT NULL,  -- TS2345, import-type, etc.
  message TEXT NOT NULL,
  severity VARCHAR(50) NOT NULL,  -- error, warning, info
  count INT DEFAULT 1,
  file_path VARCHAR(255),
  raw_log_snippet TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  resolved_at TIMESTAMP,
  INDEX idx_route_id (route_id),
  INDEX idx_severity (severity),
  INDEX idx_created_at (created_at),
  INDEX idx_resolved_at (resolved_at)
);
```

#### route_health_event
```sql
CREATE TABLE route_health_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id VARCHAR(255) NOT NULL REFERENCES route_metadata(route_id),
  old_status VARCHAR(50),  -- healthy, flaky, broken
  new_status VARCHAR(50) NOT NULL,
  reason VARCHAR(255),  -- "error_cluster_created", "error_resolved", etc.
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_route_id (route_id),
  INDEX idx_created_at (created_at)
);
```

#### error_brain_analysis
```sql
CREATE TABLE error_brain_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id VARCHAR(255) NOT NULL REFERENCES route_metadata(route_id),
  suggestions JSONB NOT NULL,  -- Array of suggestion objects
  selected_suggestion_index INT,
  phase VARCHAR(50),  -- analyzing, suggesting, applying, verifying, done, failed
  error_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  INDEX idx_route_id (route_id),
  INDEX idx_created_at (created_at)
);
```

#### error_brain_patch
```sql
CREATE TABLE error_brain_patch (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  analysis_id UUID NOT NULL REFERENCES error_brain_analysis(id),
  route_id VARCHAR(255) NOT NULL REFERENCES route_metadata(route_id),
  patch_content TEXT NOT NULL,
  applied_at TIMESTAMP,
  verification_status VARCHAR(50),  -- pending, passed, failed
  verification_timestamp TIMESTAMP,
  verification_message TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_analysis_id (analysis_id),
  INDEX idx_route_id (route_id),
  INDEX idx_verification_status (verification_status)
);
```

#### route_interaction_log
```sql
CREATE TABLE route_interaction_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_id VARCHAR(255) NOT NULL REFERENCES route_metadata(route_id),
  user_id VARCHAR(255),
  interaction_type VARCHAR(50) NOT NULL,  -- view, navigate, analyze, patch_apply
  metadata JSONB,  -- Additional context
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_route_id (route_id),
  INDEX idx_user_id (user_id),
  INDEX idx_created_at (created_at)
);
```

### API Endpoints

#### POST /api/routes/metadata
Create or update route metadata
```typescript
Request: {
  route_id: string;
  path: string;
  kind: 'page' | 'layout' | 'server' | 'endpoint';
  group?: string;
  priority?: number;
  badges?: string[];
}

Response: {
  id: string;
  route_id: string;
  path: string;
  kind: string;
  status: string;
  created_at: string;
  updated_at: string;
}
```

#### GET /api/routes/:routeId/metadata
Get route metadata with current health status
```typescript
Response: {
  id: string;
  route_id: string;
  path: string;
  kind: string;
  status: string;
  error_count: number;
  last_error_at?: string;
  last_error_message?: string;
  suggestion_count: number;
  created_at: string;
  updated_at: string;
}
```

#### POST /api/routes/:routeId/errors
Create error cluster
```typescript
Request: {
  tool: string;
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  file_path?: string;
  raw_log_snippet?: string;
}

Response: {
  id: string;
  route_id: string;
  tool: string;
  code: string;
  severity: string;
  created_at: string;
}
```

#### GET /api/routes/:routeId/errors
List error clusters with pagination
```typescript
Query: {
  limit?: number;  // default 20
  offset?: number;  // default 0
  resolved?: boolean;  // filter by resolution status
}

Response: {
  data: ErrorCluster[];
  total: number;
  limit: number;
  offset: number;
}
```

#### POST /api/routes/:routeId/health-event
Create health event
```typescript
Request: {
  old_status?: string;
  new_status: string;
  reason?: string;
}

Response: {
  id: string;
  route_id: string;
  old_status?: string;
  new_status: string;
  created_at: string;
}
```

#### GET /api/routes/:routeId/health-history
Get health event history with pagination
```typescript
Query: {
  limit?: number;  // default 20
  offset?: number;  // default 0
}

Response: {
  data: RouteHealthEvent[];
  total: number;
  limit: number;
  offset: number;
}
```

#### POST /api/routes/:routeId/interactions
Log user interaction
```typescript
Request: {
  interaction_type: 'view' | 'navigate' | 'analyze' | 'patch_apply';
  user_id?: string;
  metadata?: Record<string, any>;
}

Response: {
  id: string;
  route_id: string;
  interaction_type: string;
  created_at: string;
}
```

#### GET /api/routes/:routeId/interactions
Get interaction logs with pagination
```typescript
Query: {
  limit?: number;  // default 20
  offset?: number;  // default 0
}

Response: {
  data: RouteInteractionLog[];
  total: number;
  limit: number;
  offset: number;
}
```

### Server-Side Functions

#### enrichRoutesWithDatabase()
Loads routes from database and enriches with current data
```typescript
async function enrichRoutesWithDatabase(
  baseRoutes: CommandCenterRoute[],
  db: Database
): Promise<CommandCenterRoute[]> {
  // 1. Load route_metadata from database
  // 2. Merge with baseRoutes
  // 3. For each route:
  //    - Get unresolved error_cluster count
  //    - Get most recent route_health_event
  //    - Get error_brain_analysis count
  //    - Compute health status
  // 4. Return enriched routes
}
```

#### calculateRouteHealth()
Determines route health status based on error clusters
```typescript
function calculateRouteHealth(
  errorClusters: ErrorCluster[]
): 'healthy' | 'flaky' | 'broken' {
  const unresolvedErrors = errorClusters.filter(e => !e.resolved_at);
  const hasErrors = unresolvedErrors.some(e => e.severity === 'error');
  const hasWarnings = unresolvedErrors.some(e => e.severity === 'warning');

  if (hasErrors) return 'broken';
  if (hasWarnings) return 'flaky';
  return 'healthy';
}
```

## Data Models

### CommandCenterRoute (Extended)
```typescript
interface CommandCenterRoute {
  // Existing fields
  href: string;
  label: string;
  description: string;
  kind: 'page' | 'layout' | 'server' | 'endpoint';
  tab: 'cases' | 'evidence' | 'persons' | 'system';
  priority: number;
  badges?: string[];

  // New database-backed fields
  errorState?: 'healthy' | 'flaky' | 'broken';
  errorCount?: number;
  lastErrorAt?: string;
  lastErrorMessage?: string;
  suggestionCount?: number;
  group?: string;
}
```

### ErrorCluster
```typescript
interface ErrorCluster {
  id: string;
  route_id: string;
  tool: string;
  code: string;
  message: string;
  severity: 'error' | 'warning' | 'info';
  count: number;
  file_path?: string;
  raw_log_snippet?: string;
  created_at: string;
  resolved_at?: string;
}
```

### RouteHealthEvent
```typescript
interface RouteHealthEvent {
  id: string;
  route_id: string;
  old_status?: string;
  new_status: string;
  reason?: string;
  created_at: string;
}
```

## Correctness Properties

A property is a characteristic or behavior that should hold true across all valid executions of a system—essentially, a formal statement about what the system should do. Properties serve as the bridge between human-readable specifications and machine-verifiable correctness guarantees.

### Property 1: Route Metadata Merge Completeness
*For any* set of manifest routes and database routes, merging them should result in a set containing all unique routes from both sources.
**Validates: Requirements 1.1**

### Property 2: Route Metadata Creation
*For any* new route, creating a route_metadata record should result in a database entry with all required fields (path, kind, group, status).
**Validates: Requirements 1.2**

### Property 3: Route Metadata Update Idempotence
*For any* route metadata update, applying the same update twice should result in the same final state as applying it once.
**Validates: Requirements 1.3**

### Property 4: Soft Delete Preservation
*For any* archived route, the route_metadata record should still exist in the database with archived_at timestamp set, and should not appear in non-archived queries.
**Validates: Requirements 1.4, 1.5**

### Property 5: Error Cluster Separation
*For any* error code appearing on multiple routes, querying error clusters should return separate records for each route.
**Validates: Requirements 2.2**

### Property 6: Error Cluster Ordering
*For any* set of error clusters for a route, querying them should return results ordered by severity (error > warning > info) then by timestamp descending.
**Validates: Requirements 2.3**

### Property 7: Health Status Calculation
*For any* route with error clusters, the calculated health status should be broken if any unresolved errors exist, flaky if only warnings exist, and healthy if no unresolved errors exist.
**Validates: Requirements 2.5, 3.4, 3.5, 3.6**

### Property 8: Health Event Creation
*For any* route health status change, a route_health_event record should be created with old_status, new_status, and timestamp.
**Validates: Requirements 3.1**

### Property 9: Health Event Ordering
*For any* set of health events for a route, querying them should return results ordered by timestamp descending.
**Validates: Requirements 3.2**

### Property 10: Error Brain Analysis Storage
*For any* error brain analysis, storing it should result in a database record with route_id, suggestions, selected_suggestion_index, and timestamp.
**Validates: Requirements 4.1**

### Property 11: Error Brain Patch Storage
*For any* error brain patch application, storing it should result in a database record with analysis_id, patch_content, applied_timestamp, and verification_status.
**Validates: Requirements 4.2**

### Property 12: Patch Success Rate Calculation
*For any* set of patches for a route, calculating success rate should return (count of passed patches) / (total patches).
**Validates: Requirements 4.5**

### Property 13: Interaction Logging
*For any* user interaction, logging it should result in a database record with route_id, interaction_type, user_id, and timestamp.
**Validates: Requirements 5.1**

### Property 14: Interaction Log Ordering
*For any* set of interaction logs for a route, querying them should return results ordered by timestamp descending with user information included.
**Validates: Requirements 5.5**

### Property 15: Migration Table Creation
*For any* application startup, running migrations should create all required tables (route_metadata, error_cluster, route_health_event, error_brain_analysis, error_brain_patch, route_interaction_log).
**Validates: Requirements 6.1**

### Property 16: Index Creation
*For any* table creation, appropriate indexes should be created on route_id, timestamp, status, and tool columns.
**Validates: Requirements 6.2**

### Property 17: Timestamp Format Consistency
*For any* timestamp stored in the database, it should be in UTC timezone and ISO 8601 format.
**Validates: Requirements 6.3**

### Property 18: Referential Integrity
*For any* error_cluster, route_health_event, or other record referencing a route, the referenced route_id must exist in route_metadata.
**Validates: Requirements 6.4**

### Property 19: API Metadata Endpoint
*For any* POST request to /api/routes/metadata with valid data, the response should contain the stored route metadata record.
**Validates: Requirements 7.1**

### Property 20: API Error Cluster Endpoint
*For any* POST request to /api/routes/:routeId/errors with valid data, the response should contain the created error_cluster record.
**Validates: Requirements 7.3**

### Property 21: API Pagination
*For any* GET request with limit and offset parameters, the response should return the correct page of results with total count.
**Validates: Requirements 7.4, 7.6, 7.8**

### Property 22: Server-Side Data Enrichment
*For any* page load, the server should query the database for route metadata and merge with COMMAND_CENTER_MANIFEST to produce complete route definitions.
**Validates: Requirements 8.1, 8.2**

### Property 23: Health Status Enrichment
*For any* route enrichment, the current health status should be added from the most recent route_health_event or computed from error_cluster records.
**Validates: Requirements 8.3**

### Property 24: Error Count Enrichment
*For any* route enrichment, the error count should be added from unresolved error_cluster records.
**Validates: Requirements 8.4**

### Property 25: Real-Time Health Update
*For any* error cluster creation, the route health status should be recalculated and a route_health_event should be created if status changed.
**Validates: Requirements 9.1, 9.2, 9.3**

### Property 26: Data Archival
*For any* error cluster older than 90 days, it should be archived to error_cluster_archive table and not appear in default queries.
**Validates: Requirements 10.1, 10.4**

### Property 27: Archival Query Filter
*For any* query with archived flag set to true, archived records should be included in results.
**Validates: Requirements 10.5**

## Error Handling

### Database Connection Errors
- If database connection fails, log error and return empty routes array
- UI will display "Unable to load route data" message
- Retry logic with exponential backoff (3 attempts)

### Data Validation Errors
- If route_metadata is missing required fields, reject with 400 Bad Request
- If error_cluster severity is invalid, reject with 400 Bad Request
- Return detailed error message in response

### Referential Integrity Errors
- If creating error_cluster with non-existent route_id, reject with 409 Conflict
- If deleting route_metadata with existing error_cluster records, reject with 409 Conflict
- Suggest archiving route instead of deleting

### Concurrency Errors
- If two requests try to update same route_metadata simultaneously, use optimistic locking with version field
- Return 409 Conflict if version mismatch detected
- Client should retry with latest version

## Testing Strategy

### Unit Testing
- Test calculateRouteHealth() with various error cluster combinations
- Test enrichRoutesWithDatabase() with mock database
- Test API endpoint handlers with mock requests
- Test migration scripts with test database

### Property-Based Testing
- Property 1: Route merge completeness (generate random manifest + DB routes)
- Property 7: Health status calculation (generate random error clusters)
- Property 14: Interaction log ordering (generate random interactions)
- Property 22: Server-side enrichment (generate random routes + DB data)
- Property 26: Data archival (generate old error clusters)

### Integration Testing
- Test full flow: create route → create error → verify health status → verify event created
- Test API endpoints with real database
- Test server-side data loading with real database
- Test concurrent updates to same route

### Testing Framework
- **Unit Tests**: Vitest with @testing-library/svelte
- **Property Tests**: fast-check for JavaScript property-based testing
- **Integration Tests**: Playwright for end-to-end testing
- **Database Tests**: Test database with migrations applied

### Test Configuration
- Minimum 100 iterations for property-based tests
- Test database: PostgreSQL with test schema
- Mock external services (error brain, etc.)
- Clean up test data after each test

