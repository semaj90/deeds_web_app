# CouchDB Analytics Dashboard

**Week 2 Task 5: Complete Analytics Visualization**

## Overview

Interactive Svelte 5 dashboard for visualizing CouchDB analytics data from Week 2 implementation.

## Features

### 📊 Stats Overview
- Total files indexed (4,722)
- LLM summaries generated (3)
- GPU error clusters (3)
- Files with errors (0)
- Average complexity (2.86)

### 🤖 LLM Summaries Tab
- **Components**: `SummaryCard.svelte`
- **Features**:
  - Search summaries by file path or content
  - Filter by LLM provider (Gemma3, GPT-4, Claude)
  - View full summary with metadata modal
  - Key entity extraction display
  - File metadata (LOC, classes, functions, errors)

### 🔗 Dependencies Tab
- **Components**: `DependencyChart.svelte`
- **Features**:
  - D3.js bar chart of most imported modules
  - Adjustable limit (10, 20, 30, 50)
  - Color-coded by import frequency
  - Stats summary (total imports, unique modules)
  - Interactive hover states

### ⚠️ Error Propagation Tab
- **Components**: `ErrorPropagationGraph.svelte`
- **Features**:
  - D3.js force-directed graph
  - Nodes sized by error count
  - Color-coded severity (red/yellow/green)
  - Draggable nodes
  - Click to view file details
  - Import relationships visualized

### 🔬 GPU Clusters Tab
- **Components**: `ClusterInspector.svelte`
- **Features**:
  - Filter by severity (error, warning, info)
  - Sort by size, severity, or occurrences
  - Cluster detail view with timeline
  - Affected files list
  - Severity badges with icons

## API Endpoints Used

```typescript
GET /api/analytics/stats              // Overall statistics
GET /api/analytics/summaries           // LLM summaries list
GET /api/analytics/summaries/{path}    // Specific summary
GET /api/analytics/dependencies        // Dependency graph
GET /api/analytics/file-complexity     // Complexity metrics
GET /api/analytics/error-propagation   // Error chains
GET /api/analytics/clusters            // GPU clusters
```

## Tech Stack

- **Frontend**: Svelte 5 (runes: `$state`, `$derived`, `$effect`, `$props`)
- **Visualizations**: D3.js v7
- **Styling**: Component-scoped CSS with gradient backgrounds
- **API**: Fetch API with error handling
- **Backend**: FastAPI (CouchDB Analytics API)

## Running the Dashboard

### 1. Start Analytics API Server

```powershell
# Standalone server (no PostgreSQL required)
python backend/scripts/analytics_api_server.py
```

Server runs on: `http://localhost:8001`

### 2. Start SvelteKit Dev Server

```powershell
cd sveltekit-frontend
npm run dev
```

### 3. Open Dashboard

Navigate to: `http://localhost:5175/couchdb-analytics`

## Data Requirements

### Generate LLM Summaries

```powershell
$env:PHASE72_PYTHON = "C:\Users\james\Videos\deeds-web-app\.venv\Scripts\python.exe"
& $env:PHASE72_PYTHON backend/scripts/generate_summaries.py --limit 10
```

### Create GPU Clusters

```powershell
python backend/scripts/integrate_gpu_clusters.py
```

### Verify CouchDB Data

```powershell
# Check databases
curl "http://admin:password@localhost:5984/_all_dbs"

# Check summaries
curl "http://admin:password@localhost:5984/llm_summaries/_all_docs?include_docs=true"

# Check clusters
curl "http://admin:password@localhost:5984/error_clusters/_all_docs?include_docs=true"
```

## File Structure

```
sveltekit-frontend/src/routes/couchdb-analytics/
├── +page.svelte              # Main dashboard layout
├── SummaryCard.svelte        # LLM summaries grid + modal
├── DependencyChart.svelte    # D3 bar chart
├── ErrorPropagationGraph.svelte  # D3 force graph
└── ClusterInspector.svelte   # Cluster list + details
```

## Design Patterns

### Svelte 5 Runes
```typescript
let stats = $state<Stats | null>(null);              // Reactive state
let loading = $state(true);                           // Loading flag
let activeTab = $state<'summaries'>('summaries');    // Tab state

const filteredData = $derived(                        // Computed value
  data.filter(item => item.matches(query))
);

$effect(() => {                                       // Side effect
  if (container && data.length > 0) {
    renderChart();
  }
});

let { apiBase }: Props = $props();                    // Component props
```

### API Integration
```typescript
async function loadData() {
  loading = true;
  try {
    const response = await fetch(`${apiBase}/endpoint`);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    data = await response.json();
  } catch (err) {
    console.error('Error:', err);
  } finally {
    loading = false;
  }
}
```

### D3.js Lifecycle
```typescript
onMount(() => {
  loadData();  // Initial load
});

$effect(() => {
  if (container && data.length > 0) {
    renderChart();  // Re-render on data change
  }
});
```

## Week 2 Complete! ✅

All tasks implemented:
- ✅ Task 2.3: LLM Summary Generator
- ✅ Task 2.4: MapReduce Analytics Views
- ✅ Task 2.5: GPU Clustering Integration
- ✅ Task 2.6: Analytics API Endpoints
- ✅ Task 2.7: Svelte Analytics Dashboard

**Next**: Week 3 - Agentic Error Fixing with Human-in-the-Loop
