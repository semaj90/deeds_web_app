# Phase 9 Specification: Database Integration - Error Brain Analysis & Patches

## Overview

Phase 9 integrates error brain analysis and patch management with the database, enabling persistent storage of error analyses and patches. This phase builds on Phases 2-8 and enables the error brain to save its work to the database for historical tracking and analytics.

**Note:** This phase assumes the ErrorBrainModal component and error brain UI from Phase 8 are complete and functional.

## Objectives

1. Create API endpoints for error brain analysis and patch storage
2. Integrate error brain modal to save analyses to database
3. Integrate error brain modal to save patches to database
4. Update patch verification to persist status to database
5. Display error brain history on the all-routes page

## Requirements Mapping

This phase implements the following requirements:

- **Requirement 4.1**: Error brain analysis persistence - Save error analyses to database with suggestions and metadata
- **Requirement 4.2**: Error brain patch persistence - Save applied patches to database with content and timestamps
- **Requirement 4.4**: Patch verification status tracking - Track verification status (pending/passed/failed) for each patch
- **Requirement 4.5**: Patch success rate calculation - Calculate success rate as (passed patches) / (total patches) per route

## Architecture

### Data Flow

```
Error Brain Modal
    ↓
1. Analysis Complete
    ↓
POST /api/routes/:routePath/error-brain-analysis
    ↓
Database: route_health_event table
    ↓
2. Patch Applied
    ↓
POST /api/routes/:routePath/error-brain-patch
    ↓
Database: route_error_patches table
    ↓
3. Patch Verified
    ↓
PUT /api/routes/:routePath/error-brain-patch/:patchId
    ↓
Database: route_error_patches.verification_status updated
```

### Database Tables

#### error_brain_analysis (for storing error brain analyses)
```sql
-- This table stores error brain analysis events
-- Linked to route_health via route_path
CREATE TABLE error_brain_analysis (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_path TEXT NOT NULL,
  suggestions JSONB NOT NULL,
  selected_suggestion_index INTEGER,
  phase TEXT NOT NULL DEFAULT 'analyzing',
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_route_path (route_path),
  INDEX idx_created_at (created_at),
  INDEX idx_phase (phase)
);
```

#### route_error_patches (for storing applied patches)
```sql
-- This table stores patches applied to routes
-- Extended with verification fields and analysis_id link
CREATE TABLE route_error_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_path TEXT NOT NULL,
  file_path TEXT NOT NULL,
  cluster_id TEXT,
  analysis_id UUID REFERENCES error_brain_analysis(id),
  patch_content TEXT NOT NULL,
  description TEXT,
  risk_level TEXT NOT NULL DEFAULT 'medium',
  affected_component_count TEXT,
  status TEXT NOT NULL DEFAULT 'proposed',
  applied_at TIMESTAMP WITH TIME ZONE,
  applied_by_user_id TEXT,
  verification_status TEXT DEFAULT 'pending',
  verification_timestamp TIMESTAMP WITH TIME ZONE,
  verification_message TEXT,
  created_by_user_id TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_route_path (route_path),
  INDEX idx_cluster_id (cluster_id),
  INDEX idx_status (status),
  INDEX idx_verification_status (verification_status),
  INDEX idx_analysis_id (analysis_id)
);
```

### Key Schema Notes

- **route_path**: TEXT identifier for routes (e.g., "cases-overview", "evidence-board")
- **error_brain_analysis**: Stores error brain analysis events with suggestions
- **route_error_patches**: Stores patches with verification status and analysis link
- **analysis_id**: Foreign key linking patches to their source analysis
- All timestamps use TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
- All IDs use UUID DEFAULT gen_random_uuid()
- Schema location: `sveltekit-frontend/src/lib/server/db/schema/`

## API Endpoints

### 1. POST /api/routes/:routePath/error-brain-analysis

Save error brain analysis to database.

**URL Parameters:**
- `routePath`: Route identifier (e.g., "cases-overview")

**Request:**
```typescript
{
  suggestions: Array<{
    title: string;
    description: string;
    code?: string;
    file?: string;
  }>;
  selected_suggestion_index?: number;
  phase: 'analyzing' | 'suggesting' | 'applying' | 'verifying' | 'done' | 'failed';
  error_message?: string;
}
```

**Response:**
```typescript
{
  id: string;  // UUID
  route_path: string;
  suggestions: Array<any>;
  selected_suggestion_index?: number;
  phase: string;
  error_message?: string;
  created_at: string;
  completed_at?: string;
  updated_at: string;
}
```

**Error Handling:**
- 400: Invalid request body (missing suggestions)
- 500: Database error

**Database:**
- Inserts into `error_brain_analysis` table
- No foreign key validation required (route_path is text)

### 2. POST /api/routes/:routePath/error-brain-patch

Save error brain patch to database.

**URL Parameters:**
- `routePath`: Route identifier (e.g., "cases-overview")

**Request:**
```typescript
{
  file_path: string;           // Required: file path being patched
  patch_content: string;       // Required: the patch content
  description?: string;        // Optional: why this patch was proposed
  analysis_id?: string;        // Optional: UUID of source analysis
  risk_level?: string;         // Optional: 'low' | 'medium' | 'high'
  cluster_id?: string;         // Optional: error cluster ID
}
```

**Response:**
```typescript
{
  id: string;  // UUID
  route_path: string;
  file_path: string;
  patch_content: string;
  analysis_id?: string;
  verification_status: 'pending';
  status: 'proposed';
  created_at: string;
  updated_at: string;
}
```

**Error Handling:**
- 400: Invalid request body (missing patch_content or file_path)
- 500: Database error

**Database:**
- Inserts into `route_error_patches` table
- Sets verification_status to 'pending'
- Sets status to 'proposed'

### 3. PUT /api/routes/:routePath/error-brain-patch/:patchId

Update patch verification status.

**URL Parameters:**
- `routePath`: Route identifier (e.g., "cases-overview")
- `patchId`: Patch UUID

**Request:**
```typescript
{
  verification_status: 'passed' | 'failed';  // Required
  verification_message?: string;              // Optional
}
```

**Response:**
```typescript
{
  id: string;  // UUID
  route_path: string;
  file_path: string;
  patch_content: string;
  verification_status: string;
  verification_timestamp: string;
  verification_message?: string;
  created_at: string;
  updated_at: string;
}
```

**Error Handling:**
- 400: Invalid request body (invalid verification_status)
- 404: Patch not found
- 500: Database error

**Database:**
- Updates `route_error_patches` table
- Sets verification_status to 'passed' or 'failed'
- Sets verification_timestamp to current time

### 4. GET /api/routes/:routePath/error-brain-analyses

Get error brain analysis history for a route.

**URL Parameters:**
- `routePath`: Route identifier (e.g., "cases-overview")

**Query Parameters:**
```typescript
{
  limit?: number;   // default 20, max 100
  offset?: number;  // default 0
}
```

**Response:**
```typescript
{
  data: Array<{
    id: string;  // UUID
    route_path: string;
    suggestions: Array<any>;
    selected_suggestion_index?: number;
    phase: string;
    error_message?: string;
    created_at: string;
    completed_at?: string;
    updated_at: string;
    patches: Array<{
      id: string;  // UUID
      patch_content: string;
      verification_status: string;
      verification_timestamp?: string;
      created_at: string;
    }>;
  }>;
  total: number;
  limit: number;
  offset: number;
}
```

**Error Handling:**
- 500: Database error

**Database:**
- Queries `error_brain_analysis` table for route_path
- Joins with `route_error_patches` for related patches
- Orders by created_at descending

## Implementation Tasks

### Task 1: Create API Endpoint - Save Analysis

**File:** `sveltekit-frontend/src/routes/api/routes/[routePath]/error-brain-analysis/+server.ts`

**Requirements:**
- POST handler to save error brain analysis
- Validate route_path exists in route_health table
- Validate request body (suggestions array required)
- Create route_health_event record with event_type = 'error_analysis'
- Return created record with id and timestamps
- Handle errors with appropriate HTTP status codes

**Tests:**
- Test POST with valid analysis data
- Test POST with missing route_path
- Test POST with invalid suggestions format
- Test POST with non-existent route
- Test error handling

### Task 2: Create API Endpoint - Save Patch

**File:** `sveltekit-frontend/src/routes/api/routes/[routePath]/error-brain-patch/+server.ts`

**Requirements:**
- POST handler to save error brain patch
- Validate route_path exists in route_health table
- Validate request body (patch_content required)
- Create route_error_patches record with verification_status = 'pending'
- Return created record with id and timestamps
- Handle errors with appropriate HTTP status codes

**Tests:**
- Test POST with valid patch data
- Test POST with missing route_path
- Test POST with invalid patch format
- Test POST with non-existent route
- Test error handling

### Task 3: Create API Endpoint - Update Patch Verification

**File:** `sveltekit-frontend/src/routes/api/routes/[routePath]/error-brain-patch/[patchId]/+server.ts`

**Requirements:**
- PUT handler to update patch verification status
- Validate patchId exists in route_error_patches
- Validate verification_status is 'passed' or 'failed'
- Update route_error_patches record with verification_status and timestamp
- Return updated record
- Handle errors with appropriate HTTP status codes

**Tests:**
- Test PUT with valid verification data
- Test PUT with invalid verification_status
- Test PUT with non-existent patchId
- Test PUT with missing verification_status
- Test error handling

### Task 4: Create API Endpoint - Get Analysis History

**File:** `sveltekit-frontend/src/routes/api/routes/[routePath]/error-brain-analyses/+server.ts`

**Requirements:**
- GET handler to retrieve error brain analysis history
- Accept limit and offset query parameters
- Query route_health_event for route_path
- For each analysis event, include related patches from route_error_patches
- Order by created_at descending
- Return paginated results with total count
- Handle errors with appropriate HTTP status codes

**Tests:**
- Test GET with valid route_path
- Test GET with pagination (limit, offset)
- Test GET with non-existent route_path
- Test GET returns patches for each analysis
- Test error handling

### Task 5: Integrate Error Brain Modal - Save Analysis

**File:** `sveltekit-frontend/src/lib/components/error-brain/ErrorBrainModal.svelte`

**Requirements:**
- When error brain completes analysis, call POST /api/routes/:routePath/error-brain-analysis
- Include suggestions, selected_suggestion_index, and phase
- Store analysis event ID for later reference
- Handle API errors gracefully (show toast notification)
- Don't block UI on API errors

**Tests:**
- Test analysis save on completion
- Test event ID is stored for reference
- Test error handling and user notification
- Test API call includes correct route_path

### Task 6: Integrate Error Brain Modal - Save Patch

**File:** `sveltekit-frontend/src/lib/components/error-brain/ErrorBrainModal.svelte`

**Requirements:**
- When patch is applied, call POST /api/routes/:routePath/error-brain-patch
- Include patch_content
- Store patch_id for later verification
- Handle API errors gracefully
- Don't block UI on API errors

**Tests:**
- Test patch save on application
- Test patch_id is stored for verification
- Test error handling and user notification
- Test API call includes correct route_path

### Task 7: Integrate Error Brain Modal - Update Verification

**File:** `sveltekit-frontend/src/lib/components/error-brain/ErrorBrainModal.svelte`

**Requirements:**
- When patch verification completes, call PUT /api/routes/:routePath/error-brain-patch/:patchId
- Include verification_status ('passed' or 'failed')
- Include verification_message if available
- Handle API errors gracefully
- Update UI to show verification result

**Tests:**
- Test verification update on completion
- Test verification_status is correctly set
- Test error handling and user notification
- Test API call includes correct patchId

### Task 8: Display Error Brain History

**File:** `sveltekit-frontend/src/routes/(app)/all-routes/+page.svelte`

**Requirements:**
- Add "Error Brain History" section to route modal
- Display list of error brain analyses for the route
- For each analysis, show:
  - Timestamp
  - Number of suggestions
  - Selected suggestion (if any)
  - List of patches with verification status
- Add "View Details" button to expand analysis
- Handle loading and error states

**Tests:**
- Test history displays for routes with analyses
- Test history is empty for routes without analyses
- Test patch verification status is displayed correctly
- Test loading and error states

### Task 9: Write Unit Tests

**File:** `sveltekit-frontend/src/routes/api/routes/[routeId]/error-brain-analysis/+server.test.ts`

**Requirements:**
- Test POST handler with valid and invalid data
- Test error handling and edge cases
- Test database record creation
- Test response format

**File:** `sveltekit-frontend/src/routes/api/routes/[routeId]/error-brain-patch/+server.test.ts`

**Requirements:**
- Test POST handler with valid and invalid data
- Test error handling and edge cases
- Test database record creation
- Test response format

**File:** `sveltekit-frontend/src/routes/api/routes/[routeId]/error-brain-patch/[patchId]/+server.test.ts`

**Requirements:**
- Test PUT handler with valid and invalid data
- Test error handling and edge cases
- Test database record update
- Test response format

### Task 10: Write Property-Based Tests

**Property 28: Error Brain Analysis Storage**
- For any error brain analysis, storing it should result in a database record with route_id, suggestions, and timestamp
- Validates: Requirement 4.1

**Property 29: Error Brain Patch Storage**
- For any error brain patch, storing it should result in a database record with analysis_id, patch_content, and verification_status
- Validates: Requirement 4.2

**Property 30: Patch Verification Status Update**
- For any patch verification, updating it should result in verification_status and verification_timestamp being set
- Validates: Requirement 4.4

**Property 31: Patch Success Rate Calculation**
- For any set of patches for a route, calculating success rate should return (count of passed patches) / (total patches)
- Validates: Requirement 4.5

## Testing Strategy

### Unit Tests
- Test all API endpoints with valid and invalid data
- Test error handling and edge cases
- Test database record creation and updates
- Test response formats

### Property-Based Tests
- Property 28: Analysis storage (generate random analyses)
- Property 29: Patch storage (generate random patches)
- Property 30: Verification status (generate random verification data)
- Property 31: Success rate calculation (generate random patches)

### Integration Tests
- Test full flow: error brain analysis → patch creation → verification
- Test API endpoints with real database
- Test error brain modal integration

## Success Criteria

- ✅ All 4 API endpoints implemented and tested
- ✅ Error brain modal saves analyses to database
- ✅ Error brain modal saves patches to database
- ✅ Patch verification status is persisted
- ✅ Error brain history displays on all-routes page
- ✅ All unit tests passing (20+ tests)
- ✅ All property-based tests passing (4 properties)
- ✅ All integration tests passing
- ✅ Zero TypeScript diagnostics
- ✅ Complete documentation

## Deliverables

1. **API Endpoints** (4 files)
   - `+server.ts` for error-brain-analysis POST
   - `+server.ts` for error-brain-patch POST
   - `+server.ts` for error-brain-patch PUT
   - `+server.ts` for error-brain-analyses GET

2. **Component Integration** (1 file)
   - Updated ErrorBrainModal.svelte with database integration

3. **UI Updates** (1 file)
   - Updated all-routes +page.svelte with error brain history display

4. **Tests** (7 files)
   - Unit tests for each API endpoint (4 files)
   - Property-based tests (1 file)
   - Integration tests (1 file)
   - Component tests (1 file)

5. **Documentation** (3 files)
   - Phase 9 Implementation Summary
   - Phase 9 Quick Reference
   - Phase 9 Verification Checklist

## Timeline

- **Task 1-4**: API Endpoints (4 hours)
- **Task 5-7**: Component Integration (3 hours)
- **Task 8**: UI Updates (2 hours)
- **Task 9-10**: Testing (3 hours)
- **Documentation**: 1 hour

**Total Estimated Time**: 13 hours

## Dependencies

- Phases 2-8 must be complete
- Database tables (error_brain_analysis, error_brain_patch) must exist
- Error brain modal component must be available
- All-routes page must be functional

## Next Steps

After Phase 9 completion:
- Phase 10: Real-Time Updates (WebSocket integration)
- Phase 11: Data Archival (background jobs)
- Phase 12: Integration Testing (end-to-end tests)
- Phase 13: Testing and Validation (comprehensive testing)
- Phase 14: Documentation and Deployment
