# 🎮 NES Command Center - Development Roadmap

## Overview
The NES Command Center at `/command/routes` is the central hub for monitoring, managing, and optimizing the application's 1305+ routes during the consolidation to production.

## Core Features

### 1. **Route Discovery & Health Monitoring**
- Real-time route scanning via `import.meta.glob`
- Health check testing for all endpoints
- Visual status indicators (✅ healthy, ❌ error, ⏳ pending)
- Filter by type (Pages, APIs, Layouts)
- Search by path, tag, or file

### 2. **ACE Pipeline Integration**
Displays status for each route through the 5-stage pipeline:
- 🌐 **Web Crawl**: Data collection from route
- 🖼️ **VLM Processing**: Vision Language Model analysis
- 🕸️ **Graph Building**: Knowledge graph integration
- 🎯 **Vector Indexing**: Qdrant embedding storage
- 🤖 **LLM Output**: AI-powered insights

### 3. **Error Tracking Dashboard**
Integrated error counters from:
- **svelte-check**: ~31K+ Svelte/TypeScript errors
- **TypeScript**: Type checking errors
- **C++ Services**: libtorch, CUDA compilation errors
- **Go Microservices**: SIMD JSON optimizer errors
- **Database**: Migration and schema errors

### 4. **Consolidation Phase Tracker**
Visual progress through 4-week plan:
- **Week 1**: Archive ~500 demo routes
- **Week 2**: Migrate ~200 APIs to v2
- **Week 3**: Test & Security audit
- **Week 4**: Production deployment

## Data Sources

### API Endpoints
```typescript
GET /api/routes/all           // All discovered routes + stats
POST /api/ace/web-crawl       // Trigger ACE indexing
GET /api/ace/inspect?route=X  // Get ACE status for route
GET /api/errors/summary       // Error counts by type
GET /api/consolidation/status // Phase progress
```

### Real-time Monitoring
```typescript
// Route health
const health = await fetch(route.path).then(r => r.ok)

// Error counts
const errors = await fetch('/api/errors/summary').then(r => r.json())

// ACE status
const aceStatus = await fetch(`/api/ace/inspect?route=${routePath}`)
```

## UI Components

### NES Modal Structure
```svelte
<dialog class="nes-dialog">
  <div class="nes-container is-dark">
    <!-- Route Inspector -->
    <div class="route-info">
      <h3>{route.path}</h3>
      <code>{route.files.join(', ')}</code>
    </div>

    <!-- ACE Pipeline Status -->
    <div class="ace-pipeline">
      {#each aceStages as stage}
        <div class="stage {stage.status}">
          <i class="nes-icon {stage.icon}"></i>
          <span>{stage.name}</span>
          <progress value={stage.progress} max="100"></progress>
        </div>
      {/each}
    </div>

    <!-- Feature Vector Visualization -->
    <div class="vector-viz">
      <canvas bind:this={vectorCanvas}></canvas>
    </div>

    <!-- Actions -->
    <div class="actions">
      <button class="nes-btn is-primary">▶ Test</button>
      <button class="nes-btn is-success">→ Navigate</button>
      <button class="nes-btn is-warning">🔧 Fix</button>
    </div>
  </div>
</dialog>
```

### Error Tracker Component
```svelte
<div class="nes-container error-dashboard">
  <h2 class="nes-text is-error">Error Summary</h2>

  <div class="error-grid">
    <div class="nes-container is-rounded stat-box">
      <p class="error-type">Svelte Check</p>
      <p class="error-count nes-text is-error">{svelteErrors}</p>
      <button class="nes-btn is-sm" on:click={fixSvelteErrors}>
        Auto-Fix
      </button>
    </div>

    <div class="nes-container is-rounded stat-box">
      <p class="error-type">TypeScript</p>
      <p class="error-count nes-text is-warning">{tsErrors}</p>
      <button class="nes-btn is-sm">View</button>
    </div>

    <div class="nes-container is-rounded stat-box">
      <p class="error-type">C++ Services</p>
      <p class="error-count nes-text is-primary">{cppErrors}</p>
      <button class="nes-btn is-sm">Compile</button>
    </div>

    <div class="nes-container is-rounded stat-box">
      <p class="error-type">Go Services</p>
      <p class="error-count nes-text is-success">{goErrors}</p>
      <button class="nes-btn is-sm">Build</button>
    </div>
  </div>
</div>
```

### Consolidation Progress
```svelte
<div class="nes-container phase-tracker">
  <h2>🎯 Production Roadmap</h2>

  <div class="timeline">
    {#each phases as phase, i}
      <div class="phase {phase.status}">
        <div class="phase-header">
          <span class="week">Week {i + 1}</span>
          <span class="nes-badge {phase.badgeClass}">{phase.status}</span>
        </div>

        <h3>{phase.title}</h3>
        <p class="target">{phase.target}</p>

        <progress
          class="nes-progress {phase.progressClass}"
          value={phase.progress}
          max="100"
        ></progress>

        <div class="checklist">
          {#each phase.tasks as task}
            <label>
              <input type="checkbox" class="nes-checkbox" checked={task.done}>
              <span>{task.name}</span>
            </label>
          {/each}
        </div>
      </div>
    {/each}
  </div>
</div>
```

## Implementation Steps

### Step 1: Create Error Summary API
```typescript
// src/routes/api/errors/summary/+server.ts
export const GET = async () => {
  const summary = {
    svelte: await getSvelteCheckErrors(),
    typescript: await getTSErrors(),
    cpp: await getCppCompileErrors(),
    go: await getGoErrors(),
    total: 0
  };
  summary.total = Object.values(summary).reduce((a, b) => a + b, 0);
  return json(summary);
};
```

### Step 2: Create ACE Inspect API
```typescript
// src/routes/api/ace/inspect/+server.ts
export const GET = async ({ url }) => {
  const route = url.searchParams.get('route');
  const status = {
    indexed: await checkQdrantIndex(route),
    vectorized: await getFeatureVector(route),
    graphNode: await getNeo4jNode(route),
    lastCrawl: await getLastCrawlTime(route)
  };
  return json(status);
};
```

### Step 3: Create Consolidation Status API
```typescript
// src/routes/api/consolidation/status/+server.ts
export const GET = async () => {
  const status = {
    totalRoutes: 1305,
    archivedRoutes: await countArchived(),
    migratedAPIs: await countMigrated(),
    currentPhase: 1,
    phaseProgress: {
      week1: 45, // % complete
      week2: 0,
      week3: 0,
      week4: 0
    }
  };
  return json(status);
};
```

### Step 4: Enhanced Route Inspector Modal
Add to `/command/routes/+page.svelte`:
```typescript
let aceDetails = $state({
  loading: false,
  indexed: false,
  vector: [] as number[],
  graphNode: null as string | null,
  lastCrawl: null as string | null
});

async function inspectRoute(route: RouteEntry) {
  selectedRoute = route;
  showInspector = true;
  aceDetails.loading = true;

  const res = await fetch(`/api/ace/inspect?route=${encodeURIComponent(route.path)}`);
  const data = await res.json();

  aceDetails = {
    loading: false,
    ...data
  };
}
```

## Styling Guide

### NES.css Classes Used
```css
.nes-container         /* Main container */
.nes-container.is-dark /* Dark theme container */
.nes-dialog            /* Modal dialog */
.nes-btn               /* Button */
.nes-btn.is-primary    /* Blue button */
.nes-btn.is-error      /* Red button */
.nes-input             /* Text input */
.nes-progress          /* Progress bar */
.nes-badge             /* Badge/label */
.nes-icon              /* Icon container */
.nes-text.is-primary   /* Primary color text */
```

### Custom Animations
```css
@keyframes scan-line {
  0% { transform: translateY(-100%); }
  100% { transform: translateY(100vh); }
}

.scanline {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: rgba(0, 255, 0, 0.3);
  animation: scan-line 8s linear infinite;
}
```

## Next Actions

1. **Create Error APIs** - Implement `/api/errors/summary`
2. **Wire ACE Pipeline** - Connect to real Qdrant/Neo4j
3. **Add Auto-Fix** - Implement agentic error fixing
4. **Phase Tracking** - Build consolidation progress UI
5. **Testing** - Add E2E tests for command center

## Related Files
- `/command/routes/+page.svelte` - Main UI
- `src/lib/server/routesIndex.ts` - Route scanner
- `.agent/workflows/agentic-error-fixing.md` - Workflow guide
- `docs/PRODUCTION_CONSOLIDATION_PLAN.md` - 4-week plan
