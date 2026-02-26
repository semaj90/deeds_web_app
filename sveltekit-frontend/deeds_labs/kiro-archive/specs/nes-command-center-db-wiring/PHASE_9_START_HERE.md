# Phase 9: Start Here

## Welcome to Phase 9 Implementation

Phase 9 integrates the error brain modal with the database, enabling persistent storage of error analyses and patches. This document will guide you through the entire implementation.

## What is Phase 9?

Phase 9 adds 4 API endpoints and integrates the error brain modal with the database:

1. **POST /api/routes/:routeId/error-brain-analysis** - Save error brain analysis
2. **POST /api/routes/:routeId/error-brain-patch** - Save error brain patch
3. **PUT /api/routes/:routeId/error-brain-patch/:patchId** - Update patch verification
4. **GET /api/routes/:routeId/error-brain-analyses** - Get analysis history

## Quick Facts

- **Estimated Time**: 13 hours
- **Files to Create**: 6 (4 API endpoints + 2 component updates)
- **Tests to Write**: 20+ unit tests + 4 property-based tests
- **Requirements**: 4.1, 4.2, 4.4, 4.5
- **Dependencies**: Phases 2-8 complete

## Getting Started

### Step 1: Read the Specification (30 minutes)

Open and read: `.kiro/specs/nes-command-center-db-wiring/PHASE_9_SPECIFICATION.md`

This document covers:
- Overview and objectives
- Requirements mapping
- Architecture and data flow
- Database schema
- API endpoints
- Implementation tasks
- Testing strategy

### Step 2: Review the Implementation Guide (1 hour)

Open and read: `.kiro/specs/nes-command-center-db-wiring/PHASE_9_IMPLEMENTATION_GUIDE.md`

This document provides:
- Step-by-step implementation instructions
- Code examples for each endpoint
- Component integration patterns
- Testing patterns
- Common issues and solutions

### Step 3: Keep the Quick Reference Handy

Open: `.kiro/specs/nes-command-center-db-wiring/PHASE_9_QUICK_REFERENCE.md`

Use this for:
- API endpoint summary
- File structure
- Code patterns
- Common errors and fixes

### Step 4: Track Your Progress

Open: `.kiro/specs/nes-command-center-db-wiring/PHASE_9_VERIFICATION_CHECKLIST.md`

Use this to:
- Check off completed tasks
- Verify implementation
- Ensure all tests pass
- Confirm code quality

## Implementation Overview

### Phase 9 consists of 3 main parts:

#### Part 1: API Endpoints (4 hours)
Create 4 API endpoints for saving and retrieving error brain data:
- POST endpoint for saving analyses
- POST endpoint for saving patches
- PUT endpoint for updating verification
- GET endpoint for retrieving history

#### Part 2: Component Integration (3 hours)
Integrate error brain modal with database:
- Add saveAnalysis() function
- Add savePatch() function
- Add updateVerification() function
- Call functions at appropriate times

#### Part 3: Page Updates (2 hours)
Display error brain history on all-routes page:
- Add "Error Brain History" section
- Load and display analyses
- Show patches with verification status
- Handle loading and error states

#### Part 4: Testing (3 hours)
Write comprehensive tests:
- Unit tests for all endpoints (20+ tests)
- Property-based tests (4 properties)
- Integration tests
- Component tests

## File Structure

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

## Key Concepts

### Error Brain Analysis Event
When the error brain completes analysis, it generates suggestions for fixing errors. We save this to the route_health_event table:

```typescript
{
  id: "550e8400-e29b-41d4-a716-446655440000",
  route_path: "cases-overview",
  event_type: "error_analysis",
  suggestions: [
    {
      title: "Fix import statement",
      description: "Change 'import type' to 'import'",
      code: "import { CaseType } from './types';"
    }
  ],
  selected_suggestion_index: 0,
  phase: "suggesting",
  created_at: "2025-12-14T10:30:00Z"
}
```

### Error Brain Patch
When a patch is applied, we save it to the route_error_patches table with verification status:

```typescript
{
  id: "660e8400-e29b-41d4-a716-446655440001",
  route_path: "cases-overview",
  patch_content: "import { CaseType } from './types';",
  applied_at: "2025-12-14T10:31:00Z",
  verification_status: "pending",
  created_at: "2025-12-14T10:31:00Z"
}
```

### Patch Verification
When verification completes, we update the patch status in route_error_patches:

```typescript
{
  verification_status: "passed",
  verification_timestamp: "2025-12-14T10:32:00Z",
  verification_message: "Patch applied successfully, all tests pass"
}
```

## Implementation Workflow

### Day 1: API Endpoints (4 hours)

1. **Create POST /api/routes/:routeId/error-brain-analysis** (1 hour)
   - Create file
   - Implement POST handler
   - Write unit tests
   - Verify all tests pass

2. **Create POST /api/routes/:routeId/error-brain-patch** (1 hour)
   - Create file
   - Implement POST handler
   - Write unit tests
   - Verify all tests pass

3. **Create PUT /api/routes/:routeId/error-brain-patch/:patchId** (1 hour)
   - Create file
   - Implement PUT handler
   - Write unit tests
   - Verify all tests pass

4. **Create GET /api/routes/:routeId/error-brain-analyses** (1 hour)
   - Create file
   - Implement GET handler
   - Write unit tests
   - Verify all tests pass

### Day 2: Component Integration (3 hours)

5. **Integrate ErrorBrainModal.svelte** (2 hours)
   - Add saveAnalysis() function
   - Add savePatch() function
   - Add updateVerification() function
   - Test integration

6. **Update all-routes +page.svelte** (1 hour)
   - Add error brain history section
   - Load and display analyses
   - Handle loading and error states

### Day 3: Testing & Documentation (3 hours)

7. **Write Property-Based Tests** (1 hour)
   - Property 28: Analysis storage
   - Property 29: Patch storage
   - Property 30: Verification status
   - Property 31: Success rate

8. **Write Integration Tests** (1 hour)
   - Full flow tests
   - Component integration tests

9. **Documentation & Verification** (1 hour)
   - Create implementation summary
   - Verify all tests pass
   - Verify zero diagnostics
   - Sign off on completion

## Common Patterns

### API Endpoint Pattern
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
    showErrorToast('Failed to save analysis');
  }
}
```

## Testing Strategy

### Unit Tests (20+ tests)
- Test each API endpoint with valid data
- Test error handling (400, 404, 409, 500)
- Test database record creation
- Test response formats

### Property-Based Tests (4 properties)
- Property 28: Analysis storage
- Property 29: Patch storage
- Property 30: Verification status update
- Property 31: Success rate calculation

### Integration Tests
- Full flow: analysis → patch → verification
- Component integration
- Real database tests

## Success Criteria

✅ All 4 API endpoints implemented
✅ All unit tests passing (20+ tests)
✅ All property-based tests passing (4 properties)
✅ All integration tests passing
✅ Zero TypeScript diagnostics
✅ Error brain modal saves analyses
✅ Error brain modal saves patches
✅ Patch verification persisted
✅ Error brain history displays
✅ Complete documentation

## Troubleshooting

### Issue: Analysis ID not stored
**Solution:** Ensure analysis_id is extracted from response and stored in component state.

### Issue: Patch verification not updating
**Solution:** Verify patchId is correctly extracted from URL params.

### Issue: API returns 409 Conflict
**Solution:** Verify route_metadata exists for the route_id.

### Issue: Tests failing
**Solution:** Check that database tables exist and migrations have run.

## Next Steps

After Phase 9 completion:
1. Review all code and tests
2. Run full test suite
3. Verify all diagnostics pass
4. Create Phase 9 completion summary
5. Begin Phase 10 (Real-Time Updates)

## Documentation Files

| File | Purpose |
|------|---------|
| PHASE_9_SPECIFICATION.md | Complete specification |
| PHASE_9_IMPLEMENTATION_GUIDE.md | Step-by-step guide |
| PHASE_9_QUICK_REFERENCE.md | Quick lookup |
| PHASE_9_VERIFICATION_CHECKLIST.md | Progress tracking |
| PHASE_9_START_HERE.md | This file |

## Questions?

1. **What should I implement first?**
   - Start with the POST /api/routes/:routeId/error-brain-analysis endpoint

2. **How do I test my implementation?**
   - Follow the testing patterns in the Implementation Guide
   - Run `npm test` to execute all tests

3. **What if I get stuck?**
   - Check the "Common Issues and Solutions" section in the Implementation Guide
   - Review the code examples provided
   - Check the Quick Reference for patterns

4. **How do I know when I'm done?**
   - Use the Verification Checklist to track progress
   - All tests should pass
   - Zero TypeScript diagnostics
   - All documentation complete

## Ready to Start?

1. Open `.kiro/specs/nes-command-center-db-wiring/PHASE_9_SPECIFICATION.md`
2. Read the specification (30 minutes)
3. Open `.kiro/specs/nes-command-center-db-wiring/PHASE_9_IMPLEMENTATION_GUIDE.md`
4. Follow the step-by-step guide
5. Use the Quick Reference as needed
6. Track progress with the Verification Checklist

**Good luck! You've got this! 🚀**

---

**Phase 9 Status:** ⬜ READY FOR IMPLEMENTATION

**Estimated Time:** 13 hours

**Next Phase:** Phase 10 (Real-Time Updates)
