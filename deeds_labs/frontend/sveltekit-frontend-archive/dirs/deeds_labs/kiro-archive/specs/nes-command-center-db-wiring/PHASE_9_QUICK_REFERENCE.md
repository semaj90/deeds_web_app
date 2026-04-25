# Phase 9 Quick Reference: Error Brain Database Integration

## Overview

Phase 9 adds 4 API endpoints and integrates the error brain modal with the database for persistent storage of analyses and patches.

## API Endpoints Summary

| Endpoint | Method | Purpose | Status |
|----------|--------|---------|--------|
| `/api/routes/:routePath/error-brain-analysis` | POST | Save error brain analysis | ⬜ TODO |
| `/api/routes/:routePath/error-brain-patch` | POST | Save error brain patch | ⬜ TODO |
| `/api/routes/:routePath/error-brain-patch/:patchId` | PUT | Update patch verification | ⬜ TODO |
| `/api/routes/:routePath/error-brain-analyses` | GET | Get analysis history | ⬜ TODO |

## Files to Create

### API Endpoints (4 files)
```
sveltekit-frontend/src/routes/api/routes/[routePath]/
├── error-brain-analysis/
│   ├── +server.ts          # POST endpoint
│   └── +server.test.ts     # Unit tests
├── error-brain-patch/
│   ├── +server.ts          # POST endpoint
│   ├── [patchId]/
│   │   ├── +server.ts      # PUT endpoint
│   │   └── +server.test.ts # Unit tests
│   └── +server.test.ts     # Unit tests
└── error-brain-analyses/
    ├── +server.ts          # GET endpoint
    └── +server.test.ts     # Unit tests
```

### Component Updates (1 file)
```
sveltekit-frontend/src/lib/components/error-brain/
└── ErrorBrainModal.svelte  # Add database integration
```

### Page Updates (1 file)
```
sveltekit-frontend/src/routes/(app)/all-routes/
└── +page.svelte            # Add error brain history display
```

## Implementation Checklist

### API Endpoints
- [ ] POST /api/routes/:routeId/error-brain-analysis
  - [ ] Extract route_id from URL
  - [ ] Validate request body
  - [ ] Check route_metadata exists
  - [ ] Create error_brain_analysis record
  - [ ] Return created record
  - [ ] Write unit tests

- [ ] POST /api/routes/:routeId/error-brain-patch
  - [ ] Extract route_id from URL
  - [ ] Validate request body
  - [ ] Check route_metadata and analysis exist
  - [ ] Create error_brain_patch record
  - [ ] Set verification_status to 'pending'
  - [ ] Return created record
  - [ ] Write unit tests

- [ ] PUT /api/routes/:routeId/error-brain-patch/:patchId
  - [ ] Extract route_id and patchId from URL
  - [ ] Validate request body
  - [ ] Check patch exists
  - [ ] Update verification_status and timestamp
  - [ ] Return updated record
  - [ ] Write unit tests

- [ ] GET /api/routes/:routeId/error-brain-analyses
  - [ ] Extract route_id from URL
  - [ ] Parse limit and offset query params
  - [ ] Query error_brain_analysis table
  - [ ] Join with error_brain_patch
  - [ ] Return paginated results
  - [ ] Write unit tests

### Component Integration
- [ ] ErrorBrainModal.svelte
  - [ ] Add saveAnalysis() function
  - [ ] Add savePatch() function
  - [ ] Add updateVerification() function
  - [ ] Call functions at appropriate times
  - [ ] Handle API errors gracefully
  - [ ] Store IDs for tracking

### Page Updates
- [ ] all-routes +page.svelte
  - [ ] Add "Error Brain History" section
  - [ ] Load analyses when modal opens
  - [ ] Display analyses with timestamps
  - [ ] Display patches with verification status
  - [ ] Handle loading and error states

### Testing
- [ ] Unit tests for all 4 endpoints (20+ tests)
- [ ] Property-based tests (4 properties)
- [ ] Integration tests
- [ ] Component tests
- [ ] All tests passing
- [ ] Zero TypeScript diagnostics

## Key Code Patterns

### POST Endpoint Pattern
```typescript
export async function POST({ request, params }) {
  const { routePath } = params;
  const body = await request.json();

  // Validate
  if (!body.suggestions || !Array.isArray(body.suggestions)) {
    return json({ error: 'Missing or invalid suggestions' }, { status: 400 });
  }

  // Check route exists
  const route = await db.query.routeHealth.findFirst({
    where: eq(routeHealth.routePath, routePath)
  });

  if (!route) {
    return json({ error: 'Route not found' }, { status: 404 });
  }

  // Create record
  const result = await db.insert(routeHealthEvent).values({
    routePath,
    eventType: 'error_analysis',
    suggestions: body.suggestions,
    selectedSuggestionIndex: body.selected_suggestion_index,
    phase: body.phase,
    errorMessage: body.error_message,
    createdAt: new Date()
  }).returning();

  return json(result[0]);
}
```

### PUT Endpoint Pattern
```typescript
export async function PUT({ request, params }) {
  const { routePath, patchId } = params;
  const body = await request.json();

  // Validate
  if (!['passed', 'failed'].includes(body.verification_status)) {
    return json({ error: 'Invalid verification_status' }, { status: 400 });
  }

  // Update record
  const result = await db.update(routeErrorPatches)
    .set({
      verificationStatus: body.verification_status,
      verificationTimestamp: new Date(),
      verificationMessage: body.verification_message
    })
    .where(eq(routeErrorPatches.id, patchId))
    .returning();

  if (result.length === 0) {
    return json({ error: 'Patch not found' }, { status: 404 });
  }

  return json(result[0]);
}
```

### GET Endpoint Pattern
```typescript
export async function GET({ url, params }) {
  const { routePath } = params;
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
  const offset = parseInt(url.searchParams.get('offset') || '0');

  // Query analyses
  const analyses = await db.query.routeHealthEvent.findMany({
    where: eq(routeHealthEvent.routePath, routePath),
    orderBy: desc(routeHealthEvent.createdAt),
    limit,
    offset
  });

  // Query patches for each analysis
  const analysesWithPatches = await Promise.all(
    analyses.map(async (analysis) => ({
      ...analysis,
      patches: await db.query.routeErrorPatches.findMany({
        where: eq(routeErrorPatches.routePath, routePath)
      })
    }))
  );

  // Get total count
  const total = await db.select({ count: count() })
    .from(routeHealthEvent)
    .where(eq(routeHealthEvent.routePath, routePath));

  return json({
    data: analysesWithPatches,
    total: total[0].count,
    limit,
    offset
  });
}
```

### Component Integration Pattern
```typescript
async function saveAnalysis(suggestions, phase) {
  try {
    const response = await fetch(
      `/api/routes/${routePath}/error-brain-analysis`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          suggestions,
          selected_suggestion_index: selectedIndex,
          phase,
          error_message: null
        })
      }
    );

    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }

    const data = await response.json();
    eventId = data.id;  // Store event ID for reference
  } catch (error) {
    console.error('Failed to save analysis:', error);
    // Show error toast
  }
}
```

## Database Tables

### route_health_event (for error brain analyses)
```sql
CREATE TABLE route_health_event (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_path VARCHAR(255) NOT NULL REFERENCES route_health(route_path),
  event_type VARCHAR(50) NOT NULL,  -- 'error_analysis', 'patch_applied', etc.
  suggestions JSONB,
  selected_suggestion_index INT,
  phase VARCHAR(50),
  error_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  completed_at TIMESTAMP,
  INDEX idx_route_path (route_path),
  INDEX idx_created_at (created_at),
  INDEX idx_event_type (event_type)
);
```

### route_error_patches (for applied patches)
```sql
CREATE TABLE route_error_patches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  route_path VARCHAR(255) NOT NULL REFERENCES route_health(route_path),
  patch_content TEXT NOT NULL,
  applied_at TIMESTAMP,
  verification_status VARCHAR(50),  -- pending, passed, failed
  verification_timestamp TIMESTAMP,
  verification_message TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_route_path (route_path),
  INDEX idx_verification_status (verification_status),
  INDEX idx_created_at (created_at)
);
```

## Testing Patterns

### Unit Test Pattern
```typescript
describe('POST /api/routes/:routeId/error-brain-analysis', () => {
  it('should create analysis with valid data', async () => {
    const response = await POST({
      request: {
        json: async () => ({
          suggestions: [{ title: 'Fix' }],
          phase: 'suggesting'
        })
      },
      params: { routeId: 'test-route' }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.id).toBeDefined();
    expect(data.route_id).toBe('test-route');
  });

  it('should return 400 for missing suggestions', async () => {
    const response = await POST({
      request: {
        json: async () => ({ phase: 'suggesting' })
      },
      params: { routeId: 'test-route' }
    });

    expect(response.status).toBe(400);
  });
});
```

### Property Test Pattern
```typescript
fc.assert(
  fc.property(
    fc.record({
      suggestions: fc.array(fc.object()),
      phase: fc.constantFrom('analyzing', 'suggesting', 'done')
    }),
    async (data) => {
      // Save analysis
      const response = await saveAnalysis(data);

      // Verify
      expect(response.id).toBeDefined();
      expect(response.suggestions).toEqual(data.suggestions);
      expect(response.phase).toBe(data.phase);
    }
  )
);
```

## Common Errors and Fixes

| Error | Cause | Fix |
|-------|-------|-----|
| 404 Not Found | Route doesn't exist in route_health | Verify route_path is correct |
| 400 Bad Request | Missing suggestions array | Check request body validation |
| 404 Not Found | Patch doesn't exist | Verify patchId is correct |
| 500 Server Error | Database error | Check database connection and schema |
| Event ID undefined | Response not parsed | Await response.json() |
| Patch not saving | API call not awaited | Add await to fetch call |
| routePath undefined | URL parameter not extracted | Check params destructuring |

## Performance Considerations

- Index on route_id for fast lookups
- Index on created_at for sorting
- Pagination with limit/offset for large result sets
- Join patches with analyses in single query
- Cache analysis history if frequently accessed

## Security Considerations

- Validate route_id exists before creating records
- Validate analysis_id exists before creating patches
- Validate verification_status is one of allowed values
- Use parameterized queries to prevent SQL injection
- Validate request body size to prevent DoS

## Deployment Checklist

- [ ] All API endpoints implemented
- [ ] All tests passing
- [ ] All TypeScript diagnostics passing
- [ ] Database tables created
- [ ] Migrations applied
- [ ] Error brain modal updated
- [ ] All-routes page updated
- [ ] Documentation complete
- [ ] Code reviewed
- [ ] Ready for production

## Timeline

- **API Endpoints**: 4 hours
- **Component Integration**: 3 hours
- **Page Updates**: 2 hours
- **Testing**: 3 hours
- **Documentation**: 1 hour
- **Total**: 13 hours

## Next Phase

Phase 10: Real-Time Updates (WebSocket integration for live health status updates)
