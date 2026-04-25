# YoRHa Components Documentation

## Overview

This document describes the Svelte components that make up the YoRHa Detective Interface.

## Components

### YoRHaCommandCenter

Main dashboard component displaying system metrics and active cases.

**Location:** `src/lib/components/yorha/YoRHaCommandCenter.svelte`

**Props:** None

**Features:**
- Real-time system metrics (CPU, memory, GPU, disk)
- Active cases list with status badges
- Auto-refresh every 3 seconds
- Health status indicators with color coding
- Responsive grid layout

**Usage:**
```svelte
<script>
  import YoRHaCommandCenter from '$lib/components/yorha/YoRHaCommandCenter.svelte';
</script>

<YoRHaCommandCenter />
```

**Styling:**
- Dark theme with cyan accents (#00d4ff)
- Monospace font (Courier New)
- Responsive grid for metrics
- Hover effects on cards

---

### EvidenceBoard

Interactive canvas for visualizing and managing evidence nodes and connections.

**Location:** `src/lib/components/yorha/EvidenceBoard.svelte`

**Props:**
```typescript
export let caseId: string; // Required: ID of the case
```

**Features:**
- SVG canvas rendering
- Drag-and-drop node positioning
- Connection visualization with strength indicators
- Node selection with detail panel
- Color-coded evidence types
- Legend display

**Usage:**
```svelte
<script>
  import EvidenceBoard from '$lib/components/yorha/EvidenceBoard.svelte';

  let caseId = 'case-123';
</script>

<EvidenceBoard {caseId} />
```

**Node Colors:**
- Document: #00d4ff (cyan)
- Photo: #00ff00 (green)
- Video: #ff6600 (orange)
- Audio: #ffaa00 (gold)
- Testimony: #ff00ff (magenta)
- Forensic: #ff0000 (red)
- Physical: #00aa00 (dark green)
- Digital: #0066ff (blue)

**Interactions:**
- Click node to select/deselect
- Drag node to reposition
- Hover for visual feedback
- View details in side panel

---

## State Management

### Metrics Store

Manages metrics state using XState and Svelte stores.

**Location:** `src/lib/stores/metrics.ts`

**Exports:**
```typescript
export const metricsState;      // Full state snapshot
export const metrics;            // Derived: current metrics
export const metricsError;       // Derived: error message
export const isUpdating;         // Derived: loading state
export const isFailed;           // Derived: failed state

export function fetchMetrics();
export function retryMetrics();
export function resetMetrics();
export function setMetricsSuccess(data);
export function setMetricsError(error);
```

**Usage:**
```svelte
<script>
  import { metrics, isUpdating, fetchMetrics } from '$lib/stores/metrics';

  onMount(() => {
    fetchMetrics();
  });
</script>

{#if $isUpdating}
  <p>Loading...</p>
{:else if $metrics}
  <p>CPU: {$metrics.cpu_usage}%</p>
{/if}
```

---

## State Machines

### Metrics Machine

XState v5 state machine for managing metrics fetching.

**Location:** `src/lib/machines/metrics.ts`

**States:**
- `idle` - Waiting for fetch request
- `updating` - Fetching metrics
- `error` - Fetch failed, can retry
- `failed` - Max retries exceeded

**Events:**
- `FETCH` - Start fetching metrics
- `FETCH_SUCCESS` - Metrics fetched successfully
- `FETCH_ERROR` - Fetch failed
- `RETRY` - Retry after error
- `RESET` - Reset to idle state

**Context:**
```typescript
{
  metrics: any | null;
  error: string | null;
  retryCount: number;
  maxRetries: number; // Default: 3
}
```

**Usage:**
```typescript
import { createActor } from 'xstate';
import { createMetricsMachine } from '$lib/machines/metrics';

const machine = createMetricsMachine();
const actor = createActor(machine);
actor.start();

actor.send({ type: 'FETCH' });
actor.send({ type: 'FETCH_SUCCESS', data: { cpu_usage: 50 } });
```

---

## Styling

### Design System

**Colors:**
- Primary: #00d4ff (cyan)
- Success: #00ff00 (green)
- Warning: #ffaa00 (gold)
- Error: #ff0000 (red)
- Background: #1a1a2e (dark blue)
- Text: #e0e0e0 (light gray)

**Typography:**
- Headings: Crimson Text (serif)
- Body: Source Sans 3 (sans-serif)
- Code: Courier New (monospace)

**Spacing:**
- Base unit: 0.5rem
- Padding: 1rem, 1.5rem, 2rem
- Gap: 0.5rem, 1rem, 1.5rem

**Breakpoints:**
- Mobile: < 640px
- Tablet: 640px - 1024px
- Desktop: > 1024px

---

## API Integration

### Fetching Data

All components use standard fetch API with proper error handling:

```typescript
async function loadData() {
  try {
    const response = await fetch('/api/yorha/cases');
    if (!response.ok) throw new Error('Failed to load');
    const data = await response.json();
    return data;
  } catch (error) {
    console.error('Error:', error);
    // Handle error
  }
}
```

### Authentication

Authentication is handled automatically via Lucia v3 middleware. No additional headers needed.

---

## Testing

### Unit Tests

Located in `src/lib/machines/__tests__/`

```bash
npm run test
```

### Integration Tests

Located in `src/routes/api/yorha/__tests__/`

```bash
npm run test:integration
```

### E2E Tests

Located in `src/routes/api/yorha/__tests__/`

```bash
npm run test:e2e
```

---

## Performance Optimization

### Component Optimization

- Use `$state()` for reactive variables
- Minimize re-renders with proper state management
- Lazy load components when possible
- Debounce API calls for position updates

### Query Optimization

- Use indexed columns in queries
- Limit result sets with pagination
- Cache frequently accessed data
- Use connection pooling for database

---

## Accessibility

### WCAG Compliance

- Semantic HTML structure
- Proper color contrast ratios
- Keyboard navigation support
- ARIA labels where needed

### Keyboard Navigation

- Tab through interactive elements
- Enter to activate buttons
- Escape to close modals
- Arrow keys for navigation

---

## Browser Support

- Chrome/Edge: Latest 2 versions
- Firefox: Latest 2 versions
- Safari: Latest 2 versions
- Mobile browsers: Latest versions

---

## Troubleshooting

### Common Issues

**Metrics not updating:**
- Check network tab for API errors
- Verify authentication is working
- Check browser console for errors

**Evidence board not rendering:**
- Ensure case_id is valid
- Check if evidence nodes exist
- Verify SVG support in browser

**Chat not working:**
- Verify session was created
- Check Ollama endpoint configuration
- Review error messages in console

---

## Contributing

When adding new components:

1. Create component in `src/lib/components/yorha/`
2. Add TypeScript types for props
3. Include JSDoc comments
4. Add unit tests
5. Update this documentation
6. Follow existing style patterns

---

## Resources

- [Svelte Documentation](https://svelte.dev)
- [SvelteKit Documentation](https://kit.svelte.dev)
- [XState Documentation](https://xstate.js.org)
- [Drizzle ORM Documentation](https://orm.drizzle.team)
- [Lucia Authentication](https://lucia-auth.com)
