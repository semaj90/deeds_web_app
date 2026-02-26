# Phase 9: Implementation Guide

**Status:** ✅ READY FOR IMPLEMENTATION
**Schema:** Frontend (SvelteKit)
**Estimated Time:** 13 hours
**Last Updated:** December 14, 2025

---

## Overview

This guide provides step-by-step instructions for implementing Phase 9. Follow each task in order.

---

## Task 0: Database Migration (1 hour)

### Objective
Create database migration to add error_brain_analysis table and extend route_error_patches.

### Steps

1. **Create migration file**
   ```bash
   # Navigate to migrations directory
   cd sveltekit-frontend/drizzle/migrations

   # Create new migration file with timestamp
   # Format: YYYYMMDDHHMMSS_description.sql
   # Example: 20251214100000_add_error_brain_tables.sql
   ```

2. **Add migration content**

   File: `sveltekit-frontend/drizzle/migrations/20251214100000_add_error_brain_tables.sql`

   ```sql
   -- Create error_brain_analysis table
   CREATE TABLE IF NOT EXISTS error_brain_analysis (
       id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
       route_path TEXT NOT NULL,
       suggestions JSONB NOT NULL,
       selected_suggestion_index INTEGER,
       phase TEXT NOT NULL DEFAULT 'analyzing',
       error_message TEXT,
       metadata JSONB DEFAULT '{}',
       created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP,
       completed_at TIMESTAMP WITH TIME ZONE,
       updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT CURRENT_TIMESTAMP
   );

   -- Create indexes for error_brain_analysis
   CREATE INDEX IF NOT EXISTS error_brain_analysis_route_path_idx ON error_brain_analysis(route_path);
   CREATE INDEX IF NOT EXISTS error_brain_analysis_created_at_idx ON error_brain_analysis(created_at);
   CREATE INDEX IF NOT EXISTS error_brain_analysis_phase_idx ON error_brain_analysis(phase);

   -- Add columns to route_error_patches
   ALTER TABLE route_error_patches
   ADD COLUMN IF NOT EXISTS analysis_id UUID,
   ADD COLUMN IF NOT EXISTS verification_status TEXT DEFAULT 'pending',
   ADD COLUMN IF NOT EXISTS verification_timestamp TIMESTAMP WITH TIME ZONE,
   ADD COLUMN IF NOT EXISTS verification_message TEXT;

   -- Create indexes for new columns
   CREATE INDEX IF NOT EXISTS route_error_patches_analysis_id_idx ON route_error_patches(analysis_id);
   CREATE INDEX IF NOT EXISTS route_error_patches_verification_status_idx ON route_error_patches(verification_status);

   -- Add foreign key
   ALTER TABLE route_error_patches
   ADD CONSTRAINT route_error_patches_analysis_id_fk
   FOREIGN KEY (analysis_id) REFERENCES error_brain_analysis(id) ON DELETE SET NULL;
   ```

3. **Run migration**
   ```bash
   npm run db:migrate
   ```

4. **Verify migration**
   ```bash
   # Connect to database and verify tables
   psql $DATABASE_URL
   \dt error_brain_analysis
   \dt route_error_patches
   \d route_error_patches  # Check columns
   ```

### Verification Checklist
- ✅ error_brain_analysis table created
- ✅ route_error_patches columns added
- ✅ All indexes created
- ✅ Foreign key constraint added

---

## Task 1: POST /api/routes/:routePath/error-brain-analysis (1 hour)

### Objective
Create API endpoint to save error brain analysis to database.

### File Structure
```
sveltekit-frontend/src/routes/api/routes/[routePath]/
├── error-brain-analysis/
│   ├── +server.ts          # POST endpoint
│   └── +server.test.ts     # Unit tests
```

### Implementation

**File:** `sveltekit-frontend/src/routes/api/routes/[routePath]/error-brain-analysis/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { errorBrainAnalysisTable } from '$lib/server/db/schema/error_brain_analysis';

export const POST: RequestHandler = async ({ request, params }) => {
  try {
    const { routePath } = params;
    const body = await request.json();

    // Validate request body
    if (!body.suggestions || !Array.isArray(body.suggestions)) {
      return json(
        { error: 'Missing or invalid suggestions array' },
        { status: 400 }
      );
    }

    if (!body.phase || typeof body.phase !== 'string') {
      return json(
        { error: 'Missing or invalid phase' },
        { status: 400 }
      );
    }

    // Create analysis record
    const result = await db
      .insert(errorBrainAnalysisTable)
      .values({
        routePath,
        suggestions: body.suggestions,
        selectedSuggestionIndex: body.selected_suggestion_index ?? null,
        phase: body.phase,
        errorMessage: body.error_message ?? null,
        metadata: body.metadata ?? {}
      })
      .returning();

    if (!result || result.length === 0) {
      return json(
        { error: 'Failed to create analysis' },
        { status: 500 }
      );
    }

    return json(result[0], { status: 201 });
  } catch (error) {
    console.error('Error saving analysis:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
```

### Testing

**File:** `sveltekit-frontend/src/routes/api/routes/[routePath]/error-brain-analysis/+server.test.ts`

```typescript
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { POST } from './+server';

describe('POST /api/routes/:routePath/error-brain-analysis', () => {
  it('should save analysis with valid data', async () => {
    const request = new Request('http://localhost/api/routes/test-route/error-brain-analysis', {
      method: 'POST',
      body: JSON.stringify({
        suggestions: [
          {
            title: 'Fix import',
            description: 'Change import statement',
            code: "import { Type } from './types';"
          }
        ],
        selected_suggestion_index: 0,
        phase: 'suggesting'
      })
    });

    const response = await POST({
      request,
      params: { routePath: 'test-route' }
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBeDefined();
    expect(data.route_path).toBe('test-route');
  });

  it('should return 400 for missing suggestions', async () => {
    const request = new Request('http://localhost/api/routes/test-route/error-brain-analysis', {
      method: 'POST',
      body: JSON.stringify({ phase: 'suggesting' })
    });

    const response = await POST({
      request,
      params: { routePath: 'test-route' }
    });

    expect(response.status).toBe(400);
  });

  it('should return 400 for invalid phase', async () => {
    const request = new Request('http://localhost/api/routes/test-route/error-brain-analysis', {
      method: 'POST',
      body: JSON.stringify({
        suggestions: [],
        phase: null
      })
    });

    const response = await POST({
      request,
      params: { routePath: 'test-route' }
    });

    expect(response.status).toBe(400);
  });
});
```

### Verification Checklist
- ✅ Endpoint created at correct path
- ✅ POST handler implemented
- ✅ Request validation working
- ✅ Database insert working
- ✅ Response format correct
- ✅ Error handling working
- ✅ Unit tests passing

---

## Task 2: POST /api/routes/:routePath/error-brain-patch (1 hour)

### Objective
Create API endpoint to save error brain patch to database.

### File Structure
```
sveltekit-frontend/src/routes/api/routes/[routePath]/
├── error-brain-patch/
│   ├── +server.ts          # POST endpoint
│   └── +server.test.ts     # Unit tests
```

### Implementation

**File:** `sveltekit-frontend/src/routes/api/routes/[routePath]/error-brain-patch/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { routeErrorPatchesTable } from '$lib/server/db/schema/route_error_patches';

export const POST: RequestHandler = async ({ request, params }) => {
  try {
    const { routePath } = params;
    const body = await request.json();

    // Validate request body
    if (!body.patch_content || typeof body.patch_content !== 'string') {
      return json(
        { error: 'Missing or invalid patch_content' },
        { status: 400 }
      );
    }

    if (!body.file_path || typeof body.file_path !== 'string') {
      return json(
        { error: 'Missing or invalid file_path' },
        { status: 400 }
      );
    }

    // Create patch record
    const result = await db
      .insert(routeErrorPatchesTable)
      .values({
        routePath,
        filePath: body.file_path,
        patchContent: body.patch_content,
        description: body.description ?? null,
        analysisId: body.analysis_id ?? null,
        riskLevel: body.risk_level ?? 'medium',
        clusterId: body.cluster_id ?? null,
        status: 'proposed',
        verificationStatus: 'pending'
      })
      .returning();

    if (!result || result.length === 0) {
      return json(
        { error: 'Failed to create patch' },
        { status: 500 }
      );
    }

    return json(result[0], { status: 201 });
  } catch (error) {
    console.error('Error saving patch:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
```

### Testing

**File:** `sveltekit-frontend/src/routes/api/routes/[routePath]/error-brain-patch/+server.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { POST } from './+server';

describe('POST /api/routes/:routePath/error-brain-patch', () => {
  it('should save patch with valid data', async () => {
    const request = new Request('http://localhost/api/routes/test-route/error-brain-patch', {
      method: 'POST',
      body: JSON.stringify({
        file_path: 'src/routes/test/+page.svelte',
        patch_content: 'import { Type } from "./types";',
        description: 'Fix import statement',
        risk_level: 'low'
      })
    });

    const response = await POST({
      request,
      params: { routePath: 'test-route' }
    });

    expect(response.status).toBe(201);
    const data = await response.json();
    expect(data.id).toBeDefined();
    expect(data.verification_status).toBe('pending');
  });

  it('should return 400 for missing patch_content', async () => {
    const request = new Request('http://localhost/api/routes/test-route/error-brain-patch', {
      method: 'POST',
      body: JSON.stringify({ file_path: 'src/test.ts' })
    });

    const response = await POST({
      request,
      params: { routePath: 'test-route' }
    });

    expect(response.status).toBe(400);
  });
});
```

### Verification Checklist
- ✅ Endpoint created at correct path
- ✅ POST handler implemented
- ✅ Request validation working
- ✅ Database insert working
- ✅ verification_status set to 'pending'
- ✅ status set to 'proposed'
- ✅ Unit tests passing

---

## Task 3: PUT /api/routes/:routePath/error-brain-patch/:patchId (1 hour)

### Objective
Create API endpoint to update patch verification status.

### File Structure
```
sveltekit-frontend/src/routes/api/routes/[routePath]/
├── error-brain-patch/
│   ├── [patchId]/
│   │   ├── +server.ts          # PUT endpoint
│   │   └── +server.test.ts     # Unit tests
```

### Implementation

**File:** `sveltekit-frontend/src/routes/api/routes/[routePath]/error-brain-patch/[patchId]/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { routeErrorPatchesTable } from '$lib/server/db/schema/route_error_patches';
import { eq } from 'drizzle-orm';

export const PUT: RequestHandler = async ({ request, params }) => {
  try {
    const { patchId } = params;
    const body = await request.json();

    // Validate request body
    if (!body.verification_status || typeof body.verification_status !== 'string') {
      return json(
        { error: 'Missing or invalid verification_status' },
        { status: 400 }
      );
    }

    if (!['passed', 'failed'].includes(body.verification_status)) {
      return json(
        { error: 'verification_status must be "passed" or "failed"' },
        { status: 400 }
      );
    }

    // Update patch record
    const result = await db
      .update(routeErrorPatchesTable)
      .set({
        verificationStatus: body.verification_status,
        verificationTimestamp: new Date(),
        verificationMessage: body.verification_message ?? null,
        updatedAt: new Date()
      })
      .where(eq(routeErrorPatchesTable.id, patchId))
      .returning();

    if (!result || result.length === 0) {
      return json(
        { error: 'Patch not found' },
        { status: 404 }
      );
    }

    return json(result[0]);
  } catch (error) {
    console.error('Error updating patch:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
```

### Testing

**File:** `sveltekit-frontend/src/routes/api/routes/[routePath]/error-brain-patch/[patchId]/+server.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { PUT } from './+server';

describe('PUT /api/routes/:routePath/error-brain-patch/:patchId', () => {
  it('should update verification status to passed', async () => {
    const request = new Request('http://localhost/api/routes/test-route/error-brain-patch/123', {
      method: 'PUT',
      body: JSON.stringify({
        verification_status: 'passed',
        verification_message: 'All tests pass'
      })
    });

    const response = await PUT({
      request,
      params: { routePath: 'test-route', patchId: '123' }
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.verification_status).toBe('passed');
  });

  it('should return 400 for invalid verification_status', async () => {
    const request = new Request('http://localhost/api/routes/test-route/error-brain-patch/123', {
      method: 'PUT',
      body: JSON.stringify({ verification_status: 'invalid' })
    });

    const response = await PUT({
      request,
      params: { routePath: 'test-route', patchId: '123' }
    });

    expect(response.status).toBe(400);
  });

  it('should return 404 for non-existent patch', async () => {
    const request = new Request('http://localhost/api/routes/test-route/error-brain-patch/nonexistent', {
      method: 'PUT',
      body: JSON.stringify({ verification_status: 'passed' })
    });

    const response = await PUT({
      request,
      params: { routePath: 'test-route', patchId: 'nonexistent' }
    });

    expect(response.status).toBe(404);
  });
});
```

### Verification Checklist
- ✅ Endpoint created at correct path
- ✅ PUT handler implemented
- ✅ Request validation working
- ✅ Database update working
- ✅ verification_timestamp set correctly
- ✅ 404 handling for missing patch
- ✅ Unit tests passing

---

## Task 4: GET /api/routes/:routePath/error-brain-analyses (1 hour)

### Objective
Create API endpoint to retrieve error brain analysis history.

### File Structure
```
sveltekit-frontend/src/routes/api/routes/[routePath]/
├── error-brain-analyses/
│   ├── +server.ts          # GET endpoint
│   └── +server.test.ts     # Unit tests
```

### Implementation

**File:** `sveltekit-frontend/src/routes/api/routes/[routePath]/error-brain-analyses/+server.ts`

```typescript
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db';
import { errorBrainAnalysisTable } from '$lib/server/db/schema/error_brain_analysis';
import { routeErrorPatchesTable } from '$lib/server/db/schema/route_error_patches';
import { eq, desc } from 'drizzle-orm';

export const GET: RequestHandler = async ({ params, url }) => {
  try {
    const { routePath } = params;
    const limit = Math.min(parseInt(url.searchParams.get('limit') ?? '20'), 100);
    const offset = parseInt(url.searchParams.get('offset') ?? '0');

    // Get analyses for route
    const analyses = await db
      .select()
      .from(errorBrainAnalysisTable)
      .where(eq(errorBrainAnalysisTable.routePath, routePath))
      .orderBy(desc(errorBrainAnalysisTable.createdAt))
      .limit(limit)
      .offset(offset);

    // Get total count
    const countResult = await db
      .select({ count: db.count() })
      .from(errorBrainAnalysisTable)
      .where(eq(errorBrainAnalysisTable.routePath, routePath));

    const total = countResult[0]?.count ?? 0;

    // For each analysis, get related patches
    const analysesWithPatches = await Promise.all(
      analyses.map(async (analysis) => {
        const patches = await db
          .select()
          .from(routeErrorPatchesTable)
          .where(eq(routeErrorPatchesTable.analysisId, analysis.id))
          .orderBy(desc(routeErrorPatchesTable.createdAt));

        return {
          ...analysis,
          patches
        };
      })
    );

    return json({
      data: analysesWithPatches,
      total,
      limit,
      offset
    });
  } catch (error) {
    console.error('Error fetching analyses:', error);
    return json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
};
```

### Testing

**File:** `sveltekit-frontend/src/routes/api/routes/[routePath]/error-brain-analyses/+server.test.ts`

```typescript
import { describe, it, expect } from 'vitest';
import { GET } from './+server';

describe('GET /api/routes/:routePath/error-brain-analyses', () => {
  it('should return analyses for route', async () => {
    const url = new URL('http://localhost/api/routes/test-route/error-brain-analyses');
    const request = new Request(url);

    const response = await GET({
      request,
      params: { routePath: 'test-route' },
      url
    });

    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.data).toBeDefined();
    expect(Array.isArray(data.data)).toBe(true);
    expect(data.total).toBeDefined();
  });

  it('should respect limit parameter', async () => {
    const url = new URL('http://localhost/api/routes/test-route/error-brain-analyses?limit=5');
    const request = new Request(url);

    const response = await GET({
      request,
      params: { routePath: 'test-route' },
      url
    });

    const data = await response.json();
    expect(data.data.length).toBeLessThanOrEqual(5);
  });

  it('should include patches in response', async () => {
    const url = new URL('http://localhost/api/routes/test-route/error-brain-analyses');
    const request = new Request(url);

    const response = await GET({
      request,
      params: { routePath: 'test-route' },
      url
    });

    const data = await response.json();
    if (data.data.length > 0) {
      expect(data.data[0].patches).toBeDefined();
      expect(Array.isArray(data.data[0].patches)).toBe(true);
    }
  });
});
```

### Verification Checklist
- ✅ Endpoint created at correct path
- ✅ GET handler implemented
- ✅ Pagination working (limit, offset)
- ✅ Analyses retrieved correctly
- ✅ Patches joined correctly
- ✅ Total count calculated
- ✅ Unit tests passing

---

## Task 5-7: Component Integration (3 hours)

See ErrorBrainModal integration guide in PHASE_9_QUICK_REFERENCE.md

---

## Task 8: Display Error Brain History (2 hours)

See all-routes page update guide in PHASE_9_QUICK_REFERENCE.md

---

## Task 9-10: Testing (3 hours)

See testing guide in PHASE_9_QUICK_REFERENCE.md

---

## Verification Checklist

### Database
- ✅ error_brain_analysis table created
- ✅ route_error_patches extended with verification fields
- ✅ All indexes created
- ✅ Foreign keys working

### API Endpoints
- ✅ POST /api/routes/:routePath/error-brain-analysis
- ✅ POST /api/routes/:routePath/error-brain-patch
- ✅ PUT /api/routes/:routePath/error-brain-patch/:patchId
- ✅ GET /api/routes/:routePath/error-brain-analyses

### Component Integration
- ✅ ErrorBrainModal saves analyses
- ✅ ErrorBrainModal saves patches
- ✅ ErrorBrainModal updates verification

### UI
- ✅ Error brain history displays on all-routes page
- ✅ Patches show verification status
- ✅ Loading and error states handled

### Testing
- ✅ All unit tests passing (20+ tests)
- ✅ All property-based tests passing (4 properties)
- ✅ All integration tests passing
- ✅ Zero TypeScript diagnostics

---

## Common Issues & Solutions

### Issue: Database migration fails
**Solution:** Check that PostgreSQL is running and DATABASE_URL is set correctly

### Issue: API endpoint returns 500
**Solution:** Check server logs for database errors, verify table exists

### Issue: Tests failing
**Solution:** Ensure database is set up correctly, run migrations first

### Issue: TypeScript errors
**Solution:** Run `npm run check:typescript` to see all errors, fix type mismatches

---

## Next Steps

1. ✅ Complete all 10 tasks
2. ✅ Verify all tests passing
3. ✅ Check TypeScript diagnostics
4. ✅ Create Phase 9 completion summary
5. ⏭️ Begin Phase 10 (Real-Time Updates)

---

**Status:** ✅ READY FOR IMPLEMENTATION
**Estimated Time:** 13 hours
**Next Phase:** Phase 10 (Real-Time Updates)

