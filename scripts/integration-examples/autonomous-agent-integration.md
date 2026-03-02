# Autonomous Agent Integration Examples

Quick copy-paste examples for wiring the `AutonomousInvestigator` component to existing routes.

---

## 1. Evidence Board Integration

**File**: `sveltekit-frontend/src/routes/(app)/cases/[id]/evidence-board/+page.svelte`

Add autonomous investigation panel below the evidence grid:

```svelte
<script lang="ts">
  import AutonomousInvestigator from '$lib/components/agent/AutonomousInvestigator.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let caseId = $derived(data.case?.id);
</script>

<!-- Existing evidence board UI -->
<div class="evidence-board">
  <!-- ... existing code ... -->
</div>

<!-- NEW: Autonomous Investigation Panel -->
<section class="mt-6">
  <h2 class="text-xl font-semibold text-sand-12 mb-4">AI Investigation Assistant</h2>
  <AutonomousInvestigator
    {caseId}
    initialQuery="What evidence supports the key claims in this case?"
    onComplete={(result) => {
      // Optional: Store investigation in CouchDB ace_synthesis
      console.log('Investigation complete:', result);
    }}
  />
</section>
```

---

## 2. AI Dashboard Integration

**File**: `sveltekit-frontend/src/routes/(app)/ai-dashboard/+page.svelte`

Add as a dashboard card with pre-loaded codebase investigation queries:

```svelte
<script lang="ts">
  import AutonomousInvestigator from '$lib/components/agent/AutonomousInvestigator.svelte';
  import { Tabs } from 'bits-ui';

  let selectedTab = $state('investigate');
</script>

<div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
  <!-- Existing dashboard cards -->
  <!-- ... -->

  <!-- NEW: Autonomous Investigation Card -->
  <div class="panel p-6">
    <h3 class="text-lg font-semibold text-sand-12 mb-4">Code Investigation</h3>
    <AutonomousInvestigator
      initialQuery="Find all TODO comments and create a prioritized implementation roadmap"
      onComplete={(result) => {
        // Display roadmap in dashboard
      }}
    />
  </div>
</div>
```

---

## 3. Command Center Integration

**File**: `sveltekit-frontend/src/routes/(app)/command-center/+page.svelte`

Add as a quick-action panel for infrastructure investigations:

```svelte
<script lang="ts">
  import AutonomousInvestigator from '$lib/components/agent/AutonomousInvestigator.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  let showInvestigator = $state(false);
</script>

<!-- Existing command center UI -->

<!-- NEW: Quick Investigation Panel -->
<div class="fixed bottom-4 right-4 z-50">
  {#if !showInvestigator}
    <button
      onclick={() => showInvestigator = true}
      class="btn-primary p-4 rounded-full shadow-lg"
      title="Open AI Investigator"
    >
      <Icon name="bot" size="lg" />
    </button>
  {:else}
    <div class="panel w-[600px] max-h-[800px] overflow-y-auto shadow-2xl">
      <div class="flex items-center justify-between p-4 border-b border-sand-6">
        <h3 class="font-semibold text-sand-12">AI Investigator</h3>
        <button onclick={() => showInvestigator = false} class="text-sand-11 hover:text-accent">
          <Icon name="x" />
        </button>
      </div>
      <div class="p-4">
        <AutonomousInvestigator
          initialQuery="Which API endpoints are broken or returning 500 errors?"
        />
      </div>
    </div>
  {/if}
</div>
```

---

## 4. Dev Tools Integration

**File**: `sveltekit-frontend/src/routes/(app)/dev-tools/+page.svelte`

Add as a developer investigation tool with pre-loaded queries:

```svelte
<script lang="ts">
  import AutonomousInvestigator from '$lib/components/agent/AutonomousInvestigator.svelte';
  import { Tabs } from 'bits-ui';

  const devQueries = [
    'Find all Svelte 4 patterns needing migration to Svelte 5',
    'Which API endpoints are broken or returning 500 errors?',
    'Review drizzle migrations for dangerous DROP TABLE statements',
    'Is Redis configured with connection pooling?',
    'Find all TypeScript any types to fix',
    'How many training datasets exist and what infrastructure is missing?'
  ];

  let selectedQuery = $state(devQueries[0]);
</script>

<Tabs.Root bind:value={selectedTab}>
  <Tabs.List>
    <Tabs.Trigger value="investigate">Investigate</Tabs.Trigger>
    <!-- ... other tabs ... -->
  </Tabs.List>

  <Tabs.Content value="investigate">
    <!-- Quick query selector -->
    <div class="mb-4">
      <label class="text-sm text-sand-11 mb-2 block">Quick Queries</label>
      <select
        bind:value={selectedQuery}
        class="w-full px-3 py-2 bg-panel-soft border border-sand-6 rounded text-sand-12"
      >
        {#each devQueries as query}
          <option value={query}>{query}</option>
        {/each}
      </select>
    </div>

    <AutonomousInvestigator
      initialQuery={selectedQuery}
      onComplete={(result) => {
        // Log to dev console
        console.log('[Dev Tools] Investigation:', result);
      }}
    />
  </Tabs.Content>
</Tabs.Root>
```

---

## 5. Global Search Integration

**File**: `sveltekit-frontend/src/routes/(app)/global-search/+page.svelte`

Add AI investigation mode alongside regular search:

```svelte
<script lang="ts">
  import AutonomousInvestigator from '$lib/components/agent/AutonomousInvestigator.svelte';
  import { Tabs } from 'bits-ui';

  let searchMode = $state<'standard' | 'ai'>('standard');
  let query = $state('');
</script>

<!-- Search mode toggle -->
<div class="flex gap-2 mb-4">
  <button
    onclick={() => searchMode = 'standard'}
    class:active={searchMode === 'standard'}
    class="px-4 py-2 rounded"
  >
    Standard Search
  </button>
  <button
    onclick={() => searchMode = 'ai'}
    class:active={searchMode === 'ai'}
    class="px-4 py-2 rounded"
  >
    AI Investigation
  </button>
</div>

{#if searchMode === 'standard'}
  <!-- Existing search UI -->
  <!-- ... -->
{:else}
  <!-- NEW: AI Investigation Mode -->
  <AutonomousInvestigator
    initialQuery={query}
    onComplete={(result) => {
      // Display results in search panel
    }}
  />
{/if}
```

---

## 6. Evidence Upload Integration

**File**: `sveltekit-frontend/src/routes/(app)/evidence/+page.svelte`

Add post-upload autonomous analysis:

```svelte
<script lang="ts">
  import AutonomousInvestigator from '$lib/components/agent/AutonomousInvestigator.svelte';

  let uploadedEvidenceId = $state<string | null>(null);
  let showAnalysis = $state(false);

  async function handleUploadComplete(evidenceId: string) {
    uploadedEvidenceId = evidenceId;
    showAnalysis = true;
  }
</script>

<!-- Existing upload UI -->
<FileUploadSection onUploadComplete={handleUploadComplete} />

<!-- NEW: Post-Upload Analysis -->
{#if showAnalysis && uploadedEvidenceId}
  <div class="mt-6 panel p-6">
    <h3 class="text-lg font-semibold text-sand-12 mb-4">Automatic Evidence Analysis</h3>
    <AutonomousInvestigator
      initialQuery={`Analyze evidence ID ${uploadedEvidenceId} for forensic patterns, entities, and key insights`}
      onComplete={(result) => {
        // Store analysis result
        console.log('Evidence analyzed:', result);
      }}
    />
  </div>
{/if}
```

---

## 7. Case Overview Integration

**File**: `sveltekit-frontend/src/routes/(app)/cases/[id]/overview/+page.svelte`

Add case summary investigation panel:

```svelte
<script lang="ts">
  import AutonomousInvestigator from '$lib/components/agent/AutonomousInvestigator.svelte';
  import type { PageData } from './$types';

  let { data }: { data: PageData } = $props();
  let caseId = $derived(data.case?.id);
  let caseTitle = $derived(data.case?.title);
</script>

<!-- Existing case overview sections -->
<!-- ... -->

<!-- NEW: AI Case Summary -->
<section class="mt-6">
  <AutonomousInvestigator
    {caseId}
    initialQuery={`Summarize all evidence and key findings for case: ${caseTitle}`}
    onComplete={(result) => {
      // Update case narrative with AI summary
    }}
  />
</section>
```

---

## 8. Standalone Investigation Page

**New File**: `sveltekit-frontend/src/routes/(app)/investigate/+page.svelte`

Create a dedicated investigation page:

```svelte
<script lang="ts">
  import AutonomousInvestigator from '$lib/components/agent/AutonomousInvestigator.svelte';
  import Icon from '$lib/components/ui/Icon.svelte';

  let investigations = $state<Array<{
    id: string;
    query: string;
    result: any;
    timestamp: Date;
  }>>([]);

  function handleComplete(result: any, query: string) {
    investigations.push({
      id: crypto.randomUUID(),
      query,
      result,
      timestamp: new Date()
    });
    investigations = investigations; // trigger reactivity
  }
</script>

<div class="max-w-4xl mx-auto p-6 space-y-6">
  <!-- Page header -->
  <div class="flex items-center gap-3">
    <Icon name="bot" size="xl" class="text-accent" />
    <div>
      <h1 class="text-2xl font-bold text-sand-12">AI Investigation Center</h1>
      <p class="text-sand-11">Autonomous multi-step investigation with 14 FastMCP tools</p>
    </div>
  </div>

  <!-- Main investigator -->
  <AutonomousInvestigator
    onComplete={(result) => handleComplete(result, result.metadata?.query || '')}
  />

  <!-- Investigation history -->
  {#if investigations.length > 0}
    <div class="space-y-4">
      <h2 class="text-lg font-semibold text-sand-12">Investigation History</h2>
      {#each investigations as investigation}
        <details class="panel p-4">
          <summary class="cursor-pointer flex items-center justify-between">
            <span class="text-sand-12">{investigation.query}</span>
            <span class="text-xs text-sand-10">{investigation.timestamp.toLocaleString()}</span>
          </summary>
          <div class="mt-4 text-sm text-sand-11">
            <pre class="bg-sand-3 p-3 rounded overflow-x-auto">{JSON.stringify(investigation.result, null, 2)}</pre>
          </div>
        </details>
      {/each}
    </div>
  {/if}
</div>
```

**Also create**: `sveltekit-frontend/src/routes/(app)/investigate/+page.ts`

```typescript
export const ssr = false; // Client-only for investigation history state
```

---

## 9. API Route for Backend Investigations

**File**: `sveltekit-frontend/src/routes/api/cases/[id]/investigate/+server.ts`

Trigger investigations from backend workflows:

```typescript
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request, fetch }) => {
  const caseId = params.id;
  const { query } = await request.json();

  // Trigger autonomous investigation
  const response = await fetch('/api/agent/investigate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      query,
      useACE: true,
      caseId,
      maxIterations: 10
    })
  });

  const result = await response.json();

  // Store investigation result in CouchDB ace_synthesis
  await fetch(`${process.env.COUCHDB_URL}/ace_synthesis`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      _id: `investigation_${caseId}_${Date.now()}`,
      caseId,
      query,
      result,
      timestamp: new Date().toISOString()
    })
  });

  return json(result);
};
```

**Usage from frontend**:
```typescript
// Trigger investigation from any page
const result = await fetch(`/api/cases/${caseId}/investigate`, {
  method: 'POST',
  body: JSON.stringify({
    query: 'Summarize all fraud evidence'
  })
});
```

---

## 10. Evidence Analysis Workflow

**Hook into evidence upload pipeline**:

```typescript
// After successful evidence upload
async function handleEvidenceUploaded(evidenceId: string, caseId: string) {
  // Trigger autonomous analysis
  const analysis = await fetch('/api/agent/investigate', {
    method: 'POST',
    body: JSON.stringify({
      query: `Analyze evidence ID ${evidenceId} for:
        1. Forensic patterns (SSN, CC, PII)
        2. Entity extraction (persons, dates, locations)
        3. Legal relevance to case claims
        4. Recommended tags`,
      useACE: true,
      caseId,
      maxIterations: 5
    })
  });

  const result = await analysis.json();

  // Auto-apply recommended tags
  if (result.aceContext?.tags) {
    await fetch(`/api/evidence/${evidenceId}/tags`, {
      method: 'POST',
      body: JSON.stringify({ tags: result.aceContext.tags })
    });
  }

  return result;
}
```

---

## Common Integration Patterns

### Pattern 1: Pre-filled Query from Context
```svelte
<AutonomousInvestigator
  caseId={currentCase.id}
  initialQuery={`Analyze ${evidenceCount} pieces of evidence for ${caseType} case`}
/>
```

### Pattern 2: Investigation as Background Job
```typescript
// Fire-and-forget investigation
fetch('/api/agent/investigate', {
  method: 'POST',
  body: JSON.stringify({ query, useACE: true }),
  keepalive: true // Allow request to complete even if page navigates away
});
```

### Pattern 3: Chained Investigations
```svelte
<script>
  let step1Result = $state(null);
  let step2Query = $derived(
    step1Result
      ? `Based on these findings: ${step1Result.answer}, what are the next steps?`
      : ''
  );
</script>

<AutonomousInvestigator
  initialQuery="Find all evidence supporting fraud claim"
  onComplete={(result) => step1Result = result}
/>

{#if step1Result}
  <AutonomousInvestigator initialQuery={step2Query} />
{/if}
```

### Pattern 4: Batch Investigations
```typescript
const queries = [
  'Analyze evidence for forensic patterns',
  'Extract all entity mentions',
  'Identify key legal arguments'
];

const results = await Promise.all(
  queries.map(query =>
    fetch('/api/agent/investigate', {
      method: 'POST',
      body: JSON.stringify({ query, useACE: true, caseId })
    }).then(r => r.json())
  )
);
```

---

## Testing Your Integration

After adding the component to a route, test with these queries:

1. **Evidence Analysis**: `"Analyze evidence ID abc123 for forensic patterns"`
2. **Detective Mode**: `"Find all TODO comments in the codebase"`
3. **Case Investigation**: `"What evidence supports the fraud claim?"`
4. **Multimodal**: `"Detect objects in uploaded image"`
5. **Infrastructure**: `"Is Redis configured correctly?"`

---

## Next Steps

1. Choose integration points from examples above
2. Copy relevant code snippets
3. Test with example queries
4. Monitor tool usage via browser console
5. Replace mock tool implementations (see AUTONOMOUS_AGENT_COMPLETE.md)

---

## Troubleshooting

**Component not rendering**:
- Check import path: `$lib/components/agent/AutonomousInvestigator.svelte`
- Verify route has `export const ssr = false` if using client-only features

**Investigation fails immediately**:
- Check Ollama is running: `curl http://localhost:11434/api/tags`
- Verify model loaded: Should include `gemma3-legal:latest`
- Check browser console for detailed error messages

**ACE context fails**:
- Try with `useACE: false` to isolate issue
- Verify CouchDB/Neo4j/Qdrant services are running
- Check ACE Context Engine logs in terminal

**Tools return mock data**:
- Expected! See "Replace Mock Tool Implementations" in AUTONOMOUS_AGENT_COMPLETE.md
- 6 detective mode tools need real implementations (web_search, ripgrep_search, find_files, etc.)
