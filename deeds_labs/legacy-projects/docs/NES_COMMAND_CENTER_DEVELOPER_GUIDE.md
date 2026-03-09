# NES Command Center Developer Guide

## Overview

The NES Command Center is a route monitoring and error tracking system integrated into the YoRHa Legal AI Platform. This guide covers how to integrate with the system, add new routes, and extend functionality.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    SvelteKit Frontend                        │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │ all-routes  │  │ Route Cards │  │ Error Brain Modal   │  │
│  │   +page     │  │  Component  │  │    Component        │  │
│  └──────┬──────┘  └──────┬──────┘  └──────────┬──────────┘  │
│         │                │                     │             │
│         └────────────────┼─────────────────────┘             │
│                          │                                   │
│  ┌───────────────────────▼───────────────────────────────┐  │
│  │                   API Endpoints                        │  │
│  │  /api/routes/metadata    /api/routes/:id/errors       │  │
│  │  /api/routes/:id/health  /api/routes/:id/interactions │  │
│  │  /api/routes/events (SSE)                             │  │
│  └───────────────────────┬───────────────────────────────┘  │
└──────────────────────────┼──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                    Drizzle ORM Layer                         │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐  │
│  │   Schema    │  │   Queries   │  │   Archive Queries   │  │
│  └─────────────┘  └─────────────┘  └─────────────────────┘  │
└──────────────────────────┬──────────────────────────────────┘
                           │
┌──────────────────────────▼──────────────────────────────────┐
│                     PostgreSQL                               │
│  route_metadata | error_cluster | route_health_event        │
│  error_brain_analysis | error_brain_patch                   │
│  route_interaction_log | *_archive tables                   │
└─────────────────────────────────────────────────────────────┘
```

---

## Adding a New Route to Tracking

### 1. Register Route Metadata

```typescript
// POST /api/routes/metadata
const response = await fetch('/api/routes/metadata', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    route_id: '(app)/my-new-route',
    path: '/my-new-route',
    kind: 'page',
    group: 'features',
    priority: 'medium',
    badges: ['new', 'beta']
  })
});
```

### 2. Add to COMMAND_CENTER_MANIFEST (Optional)

For static route definitions, add to the manifest:

```typescript
// sveltekit-frontend/src/lib/config/command-center-manifest.ts
export const COMMAND_CENTER_MANIFEST = {
  routes: [
    // ... existing routes
    {
      id: '(app)/my-new-route',
      path: '/my-new-route',
      label: 'My New Route',
      description: 'Description of the route',
      kind: 'page',
      group: 'features',
      priority: 'medium',
      badges: ['new']
    }
  ]
};
```

---

## Logging Errors

### From Build Tools

```typescript
// Example: Capturing TypeScript errors
import { createErrorCluster } from '$lib/db/queries/nes-command-center';

const error = {
  routeId: '(app)/my-route',
  tool: 'typescript',
  code: 'TS2345',
  message: 'Argument of type X is not assignable to parameter of type Y',
  severity: 'error',
  filePath: 'src/routes/(app)/my-route/+page.svelte',
  rawLogSnippet: 'Full error output...'
};

await createErrorCluster(error);
```

### Via API

```typescript
// POST /api/routes/:routeId/errors
await fetch(`/api/routes/${routeId}/errors`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    tool: 'svelte-check',
    code: 'a11y-click-events-have-key-events',
    message: 'Visible, non-interactive elements must have an onclick event',
    severity: 'warning',
    file_path: 'src/routes/(app)/my-route/+page.svelte'
  })
});
```

---

## Querying Route Data

### Get Route with Health Status

```typescript
import { getRouteMetadata, getErrorClusters, getHealthEvents } from '$lib/db/queries/nes-command-center';

// Get metadata
const route = await getRouteMetadata('(app)/my-route');

// Get errors
const { errors, total } = await getErrorClusters('(app)/my-route', {
  limit: 10,
  resolved: false
});

// Get health history
const { events } = await getHealthEvents('(app)/my-route', {
  limit: 5
});
```

### Query Archived Data

```typescript
import { getCombinedErrorClusters, getCombinedInteractions } from '$lib/db/queries/nes-command-center-archive';

// Get all errors including archived
const { data, total } = await getCombinedErrorClusters('(app)/my-route', {
  includeArchived: true,
  limit: 100
});

// Get archive statistics
const stats = await getArchiveStatistics();
```

---

## Integrating with Error Brain

### Save Analysis Results

```typescript
import { createErrorBrainAnalysis } from '$lib/db/queries/nes-command-center';

const analysis = await createErrorBrainAnalysis({
  routeId: '(app)/my-route',
  errorClusterId: 'uuid-of-error',
  suggestions: [
    {
      title: 'Add type annotation',
      description: 'Explicitly type the variable',
      codeSnippet: 'const x: string = value;'
    }
  ],
  selectedSuggestionIndex: 0,
  phase: 'analysis'
});
```

### Save Applied Patch

```typescript
import { createErrorBrainPatch, updatePatchVerification } from '$lib/db/queries/nes-command-center';

// Save patch
const patch = await createErrorBrainPatch({
  routeId: '(app)/my-route',
  analysisId: analysis.id,
  patchContent: 'const x: string = value;',
  appliedAt: new Date()
});

// Update verification status
await updatePatchVerification(patch.id, {
  verificationStatus: 'passed',
  verificationMessage: 'All tests pass'
});
```

---

## Real-Time Updates

### Subscribe to SSE Events

```typescript
// In Svelte component
let eventSource: EventSource | null = null;

onMount(() => {
  eventSource = new EventSource('/api/routes/events');

  eventSource.onmessage = (event) => {
    const data = JSON.parse(event.data);

    switch (data.type) {
      case 'health_change':
        handleHealthChange(data.routeId, data.newStatus);
        break;
      case 'error_cluster':
        handleNewError(data.routeId, data.errorCount);
        break;
      case 'heartbeat':
        // Connection alive
        break;
    }
  };

  eventSource.onerror = () => {
    // Reconnect after 5 seconds
    setTimeout(() => {
      eventSource = new EventSource('/api/routes/events');
    }, 5000);
  };
});

onDestroy(() => {
  eventSource?.close();
});
```

### Broadcast Events (Server-Side)

```typescript
// In API endpoint
import { broadcastHealthChange, broadcastErrorCluster } from '$lib/sse/broadcaster';

// After creating health event
await broadcastHealthChange({
  routeId,
  oldStatus: 'healthy',
  newStatus: 'broken',
  reason: 'New error detected'
});

// After creating error cluster
await broadcastErrorCluster({
  routeId,
  errorCount: 5,
  severity: 'error'
});
```

---

## Logging Interactions

### Automatic Logging

The all-routes page automatically logs interactions. To add logging to other pages:

```typescript
async function logInteraction(
  routeId: string,
  type: 'view' | 'navigate' | 'analyze' | 'patch_apply',
  metadata?: Record<string, unknown>
) {
  try {
    await fetch(`/api/routes/${encodeURIComponent(routeId)}/interactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        interaction_type: type,
        metadata
      })
    });
  } catch (error) {
    // Don't block UI on logging errors
    console.warn('Failed to log interaction:', error);
  }
}

// Usage
logInteraction('(app)/my-route', 'view');
logInteraction('(app)/my-route', 'navigate', { destination: '/other-route' });
logInteraction('(app)/my-route', 'patch_apply', { patchId: 'uuid' });
```

---

## Extending the Schema

### Adding New Columns

1. Update Drizzle schema:
```typescript
// sveltekit-frontend/src/lib/db/schema/nes-command-center.ts
export const routeMetadata = pgTable('route_metadata', {
  // ... existing columns
  newColumn: varchar('new_column', { length: 100 }),
});
```

2. Generate migration:
```bash
npx drizzle-kit generate:pg
```

3. Apply migration:
```bash
npm run db:migrate
```

### Adding New Tables

1. Define table in schema
2. Add query helpers in `nes-command-center.ts`
3. Create API endpoints
4. Update types

---

## Testing

### Unit Tests

```typescript
// Example test
import { describe, it, expect, beforeEach } from 'vitest';
import { createRouteMetadata, getRouteMetadata } from '$lib/db/queries/nes-command-center';

describe('Route Metadata', () => {
  beforeEach(async () => {
    // Clean up test data
  });

  it('should create and retrieve route metadata', async () => {
    const route = await createRouteMetadata({
      routeId: 'test-route',
      path: '/test',
      kind: 'page'
    });

    expect(route.routeId).toBe('test-route');

    const retrieved = await getRouteMetadata('test-route');
    expect(retrieved).toEqual(route);
  });
});
```

### Integration Tests

```typescript
// tests/nes-command-center-integration.spec.ts
import { test, expect } from '@playwright/test';

test('should display route health status', async ({ page }) => {
  await page.goto('/all-routes');

  const routeCard = page.locator('[data-route-id="(app)/dashboard"]');
  await expect(routeCard).toBeVisible();

  const healthIndicator = routeCard.locator('[data-health-status]');
  await expect(healthIndicator).toHaveAttribute('data-health-status', /(healthy|flaky|broken)/);
});
```

---

## Best Practices

1. **Always use route_id consistently** - Use the same format everywhere (e.g., "(app)/dashboard")

2. **Handle errors gracefully** - Don't let logging failures break the UI

3. **Use pagination** - Always paginate large result sets

4. **Leverage SSE** - Use real-time updates instead of polling

5. **Archive old data** - Let the archival job handle cleanup

6. **Test with real data** - Use integration tests with actual database
