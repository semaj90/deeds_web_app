# Core Utility Components — API Contracts

**Last Updated:** 2026-04-13
**Status:** Production-Ready (Svelte 5 Runes)
**Usage:** Used across 17-20 routes each

---

## 1. SearchBar.svelte

**Purpose:** Lightweight text input with debounced search callback and keyboard shortcuts.

**Imports Required:**
```typescript
import SearchBar from '$lib/components/SearchBar.svelte';
```

### Props (Svelte 5 `$props()`)

```typescript
interface Props {
  placeholder?: string;    // Default: 'Search...'
  value?: string;          // Default: ''
  onsearch?: (query: string) => void;  // Callback on search
}
```

### Props Details

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `placeholder` | string | `'Search...'` | Input placeholder text |
| `value` | string | `''` | Current search query (bindable) |
| `onsearch` | function | undefined | Called on Enter or after 300ms debounce |

### Features

- ✅ **Debounced input** — 300ms delay before calling `onsearch()`
- ✅ **Enter key support** — Immediate search on Enter
- ✅ **Escape key support** — Clears search and blurs input
- ✅ **Clear button** — Shows when `value` is not empty
- ✅ **Cleanup** — Auto-clears debounce timer on destroy

### Behavior

```typescript
// Debounce on input
<input oninput={(e) => { clearTimeout(timer); timer = setTimeout(() => onsearch(value), 300); }} />

// Immediate search on Enter
if (e.key === 'Enter') {
  clearTimeout(timer);
  onsearch(value);
}

// Clear on Escape
if (e.key === 'Escape') {
  value = '';
  onsearch('');
  inputElement?.blur();
}
```

### Usage Example

```svelte
<script>
  import SearchBar from '$lib/components/SearchBar.svelte';
  
  let searchQuery = $state('');
  let results = $state<Case[]>([]);
  
  async function handleSearch(query: string) {
    if (!query) {
      results = [];
      return;
    }
    
    const response = await fetch(`/api/cases/search?q=${encodeURIComponent(query)}`);
    results = await response.json();
  }
</script>

<SearchBar 
  placeholder="Search cases..."
  bind:value={searchQuery}
  onsearch={handleSearch}
/>

{#each results as case}
  <CaseCard {case} />
{/each}
```

### Styling

- **Max width:** 500px
- **Border radius:** 25px (pill-shaped)
- **Icon:** 🔍 (hardcoded emoji)
- **Colors:** Cyan focus border (#00d4ff), gray icon
- **Responsive:** Adjusts padding/font on mobile

### Performance Notes

- Debounce timer cleaned up via `$effect()` on destroy
- No state machine or heavy dependencies
- Suitable for high-frequency re-renders

---

## 2. CodebaseSearch.svelte

**Purpose:** Command-palette style codebase search using XState retrieval machine (Fuse.js → Qdrant reranking).

**Imports Required:**
```typescript
import CodebaseSearch from '$lib/components/CodebaseSearch.svelte';
import { useMachine } from '$lib/utils/xstate-svelte5.svelte.js';
import { retrievalMachine } from '$lib/machines/retrieval-machine.js';
```

### Props (None — Internal State)

This component is self-contained and doesn't accept props. Open/close is controlled by keyboard shortcut or parent action.

### Global Keyboard Shortcut

- **Ctrl+K** (Windows/Linux) or **Cmd+K** (macOS) — Handled by root layout `GlobalCommandPalette`
- **Escape** — Close modal and clear results

### Internal State

```typescript
let query = $state('');
let isOpen = $state(false);
let dialogEl: HTMLDialogElement | undefined;

// Derived from XState machine
let isLoading = $derived(snapshot.matches('recalling') || snapshot.matches('reranking') || snapshot.matches('assembling'));
let results = $derived<RankedChunk[]>(snapshot.context.reranked ?? []);
let error = $derived<string | null>(snapshot.context.error);
let currentStage = $derived.by(() => { /* 'Recalling...', 'Reranking...', 'Assembling...' */ });
```

### XState Retrieval Machine

**Stages:**
1. **recalling** — Fuse.js fuzzy search on codebase index
2. **reranking** — Qdrant dual-vector reranking (content + signature)
3. **assembling** — Group results by kind (routes, schemas, functions, types, tests)

**Triggers:**
- `SEARCH` — Start retrieval pipeline with query
- `RESET` — Clear results and close dialog

### Result Types

```typescript
interface RankedChunk {
  symbol: string;              // Function/class/table name
  relativePath: string;        // File path
  lineStart: number;           // Line number in file
  kind: string;                // 'route-handler' | 'table-def' | 'function' | 'class' | 'type' | 'test' | 'other'
  httpMethod?: string;         // 'GET' | 'POST' | 'PATCH' | 'DELETE' (for routes)
  score: number;               // 0-1 relevance score
  tags: string[];              // Metadata tags
}
```

### Search Behavior

- **Minimum query length:** 2 characters
- **Debounce:** 250ms
- **Max results:** Unlimited (paginated in UI)
- **Result grouping:** Automatically grouped by `kind` field

```typescript
const groupedResults = {
  'API Routes': [result1, result2],
  'Schema': [result3, result4],
  'Functions': [result5],
  'Types': [result6, result7],
  'Tests': [result8],
  'Other': [result9]
};
```

### Result Click Behavior

Clicking a result:
1. Copies file path to clipboard
2. Closes modal
3. Clears search query
4. Resets machine state

```typescript
onclick={() => {
  navigator.clipboard.writeText(result.relativePath);
  close();
}}
```

### Timing Display

Shows retrieval performance metrics in footer:

```
recall 45ms · rerank 12ms · total 57ms
```

### Usage Example (From Root Layout)

```svelte
<script>
  import CodebaseSearch from '$lib/components/CodebaseSearch.svelte';
  
  function handleGlobalKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      codebaseSearch.open(); // Call open() method on component
    }
  }
</script>

<svelte:window onkeydown={handleGlobalKeydown} />
<CodebaseSearch bind:this={codebaseSearch} />
```

### Styling

- **Dialog width:** 90%, max 640px
- **Max height:** 75vh
- **Background:** Semi-transparent dark (rgb(15 23 42 / 0.97))
- **Backdrop blur:** 16px
- **Results height:** 55vh (scrollable)

### Performance Notes

- **Heavy dependencies:** XState, Qdrant client, Fuse.js
- **Dynamic import location:** Usually in root `(app)/+layout.svelte` with dynamic import
- **Network:** Calls server `/api/codebase-search` on each SEARCH event
- **Memory:** Keeps 2+ hours of Qdrant connection open

### Error Handling

If retrieval fails:
- `error` derived state contains error message
- Displays in red alert box
- No automatic retry (user must search again)

---

## 3. EvidenceCard.svelte

**Purpose:** Display a single piece of evidence (file) with metadata, AI analysis, and optional action buttons.

**Imports Required:**
```typescript
import EvidenceCard from '$lib/components/EvidenceCard.svelte';
import Badge from '$lib/components/ui/Badge.svelte';
import Card from '$lib/components/ui/Card.svelte';
import Icon from '$lib/components/ui/Icon.svelte';
import type { Evidence } from '$lib/schemas/evidence';
```

### Props (Svelte 5 `$props()`)

```typescript
interface Props {
  evidence: Evidence;
  onAskAI?: (evidence: Evidence) => void;
  onDelete?: (id: string) => void;
}
```

### Props Details

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `evidence` | `Evidence` | ✅ Yes | Evidence object with metadata and analysis |
| `onAskAI` | function | ❌ Optional | Callback when "Ask AI" button clicked |
| `onDelete` | function | ❌ Optional | Callback when "Delete" button clicked |

### Evidence Schema

```typescript
interface Evidence {
  id?: string;
  file_name: string;
  evidence_type: string;        // 'contract', 'email', 'photo', etc.
  file_type: string;            // 'pdf', 'docx', 'png', etc.
  file_size?: number;           // Bytes
  file_url?: string;            // Direct download/view link
  uploaded_at?: Date;
  ai_summary?: string;          // Auto-generated legal summary
  tags?: string[];              // Manual tags
  ai_tags?: string[];           // Auto-generated tags
  chat_turns?: Array<{
    keywords?: string[];
    suggestions?: string[];
  }>;
}
```

### Component Sections

**1. Header**
- File name (truncated)
- Evidence type badge
- Action buttons (conditional)

**2. AI Summary** (if `evidence.ai_summary` exists)
- Blue-tinted box with "AI Summary" label
- Full summary text

**3. Metadata Grid** (3-column)
- File Type
- File Size (human-readable)
- Upload Date (relative time)

**4. Manual Tags** (if `evidence.tags` exists)
- Label "Tags"
- Badge list with `variant="primary"`

**5. AI Tags** (if `evidence.ai_tags` exists)
- Label "AI Tags"
- Badge list with `variant="secondary"`

**6. AI Analysis** (if `evidence.chat_turns` exists)
- Keyword section (badges)
- Suggestions section (bulleted list)

**7. File Link** (if `evidence.file_url` exists)
- "View File" link with external-link icon
- Opens in new tab (`target="_blank"`)

### Behavior

- **Ask AI button:** Visible only if `onAskAI` callback provided
  ```typescript
  onclick={() => onAskAI(evidence)}
  ```

- **Delete button:** Visible only if `onDelete` callback provided
  ```typescript
  onclick={() => onDelete?.(evidence.id ?? '')}
  ```

- **Date formatting:** Relative time (e.g., "2 hours ago")
  ```typescript
  const rtf = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });
  ```

- **File size formatting:** Human-readable (e.g., "2.5 MB")

### Usage Example

```svelte
<script>
  import EvidenceCard from '$lib/components/EvidenceCard.svelte';
  import type { Evidence } from '$lib/schemas/evidence';
  
  let evidenceList = $state<Evidence[]>([]);
  
  async function handleAskAI(evidence: Evidence) {
    // Open AI analysis dialog or sidebar
    selectedEvidence = evidence;
    showAIPanel = true;
  }
  
  async function handleDelete(id: string) {
    if (confirm('Delete this evidence?')) {
      await fetch(`/api/evidence/${id}`, { method: 'DELETE' });
      evidenceList = evidenceList.filter(e => e.id !== id);
    }
  }
</script>

<div class="grid grid-cols-3 gap-4">
  {#each evidenceList as evidence (evidence.id)}
    <EvidenceCard
      {evidence}
      onAskAI={handleAskAI}
      onDelete={handleDelete}
    />
  {/each}
</div>
```

### Styling

- **Card variant:** `elevated` (shadow effect)
- **Padding:** `md` (standard card padding)
- **Hover effect:** `:shadow-xl` on card
- **Border left:** Blue (#64748b) on AI Summary box
- **Colors:** Uses `sand` (light text), `info` (blue), `danger` (red)

### Performance Notes

- No expensive computations (date/size formatting only)
- Suitable for lists of 50+ cards
- Re-renders only on `evidence` prop change
- No network calls (parent handles API)

---

## 4. EvidenceConnections.svelte

**Purpose:** Render SVG lines between evidence items to visualize relationships (precedents, related cases).

**Imports Required:**
```typescript
import EvidenceConnections from '$lib/components/EvidenceConnections.svelte';
```

### Props (Svelte 5 `$props()`)

```typescript
interface Props {
  evidence?: EvidenceItem[];
}

interface EvidenceItem {
  id: string;
  x?: number;           // SVG x coordinate (default: 100)
  y?: number;           // SVG y coordinate (default: 100)
  related?: string[];   // Array of related evidence IDs
  relation_type?: string;  // 'precedent' | 'related' (default)
}
```

### Props Details

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `evidence` | `EvidenceItem[]` | ❌ Optional | Array of evidence items with positions |

### Internal Behavior

```typescript
function getConnectionLines(): ConnectionLine[] {
  // For each evidence item:
  //   For each related ID:
  //     Find the related item
  //     Draw a line from (x,y) to (related.x, related.y)
  //     Use relation_type to determine line style
}
```

**Connection Line Structure:**
```typescript
interface ConnectionLine {
  from: EvidenceItem;
  to: EvidenceItem;
  type: string;  // 'precedent' | 'related'
}
```

### Line Styling

| Type | Stroke Color | Stroke Width | Opacity | CSS Class |
|------|--------------|--------------|---------|-----------|
| `precedent` | #6b8e6b (green) | 1 | 0.6 | `.precedent` |
| `related` | #8b3a3a (red) | 1 | 0.4 | `.related` |
| `default` | #d0ccc7 (tan) | 1 | 0.5 | none |
| **hover** | (same) | **2** | **1.0** | - |

**Line Style:**
- Dashed: `stroke-dasharray: 4, 4` (4px dash, 4px gap)
- Pointer events: None (doesn't interfere with UI)
- Z-index: 1 (behind interactive elements)

### Usage Example

```svelte
<script>
  import EvidenceConnections from '$lib/components/EvidenceConnections.svelte';
  
  // Typically positioned absolutely in a parent container
  let evidenceItems = $state<EvidenceItem[]>([
    {
      id: 'ev1',
      x: 100,
      y: 100,
      related: ['ev2'],
      relation_type: 'precedent'
    },
    {
      id: 'ev2',
      x: 300,
      y: 300,
      related: [],
      relation_type: 'related'
    }
  ]);
</script>

<div class="relative w-full h-96">
  <EvidenceConnections evidence={evidenceItems} />
  
  <!-- Evidence cards positioned with same x,y coordinates -->
  {#each evidenceItems as item}
    <div
      class="absolute"
      style="left: {item.x}px; top: {item.y}px; width: 200px;"
    >
      <EvidenceCard evidence={item} />
    </div>
  {/each}
</div>
```

### Position Coordination

The parent component must:
1. **Position children absolutely** — Matches SVG coordinate system
2. **Calculate x, y** — Usually based on layout grid or force-directed algorithm
3. **Update relations** — Pass `related` array when evidence connects

**Example: Grid Layout**
```typescript
const cols = 4;
const rows = Math.ceil(evidence.length / cols);
const colWidth = containerWidth / cols;
const rowHeight = 200;

evidence.forEach((item, i) => {
  item.x = (i % cols) * colWidth + colWidth / 2;
  item.y = Math.floor(i / cols) * rowHeight + 100;
});
```

### SVG Coordinate System

- **SVG fills 100% width/height** of parent
- **Pointer events:** `none` (doesn't block UI)
- **Lines update reactively** via `$derived(getConnectionLines())`

### Performance Notes

- **O(n²)** complexity — Grows with evidence count
- **Suitable for:** 20-50 items (most use cases)
- **Heavy rendering at 100+ items** — Consider windowing
- **Memory:** Stores all connections in memory

### Accessibility Notes

- Lines have no semantic meaning (decorative)
- No `role` or `aria-*` attributes needed
- Text alternatives via surrounding card components

---

## 5. Integration Patterns

### Pattern A: Search → Results

```svelte
<script>
  import SearchBar from '$lib/components/SearchBar.svelte';
  import EvidenceCard from '$lib/components/EvidenceCard.svelte';
  
  let query = $state('');
  let results = $state<Evidence[]>([]);
  
  async function search(q: string) {
    if (!q) {
      results = [];
      return;
    }
    
    const res = await fetch(`/api/evidence/search?q=${q}`);
    results = await res.json();
  }
</script>

<SearchBar onsearch={search} bind:value={query} />

<div class="grid grid-cols-3 gap-4 mt-4">
  {#each results as evidence (evidence.id)}
    <EvidenceCard {evidence} />
  {/each}
</div>
```

### Pattern B: Graph Visualization

```svelte
<script>
  import EvidenceConnections from '$lib/components/EvidenceConnections.svelte';
  import EvidenceCard from '$lib/components/EvidenceCard.svelte';
  
  let evidence = $state<EvidenceItem[]>([]);
  
  // Force-directed layout or manual positioning
  function layoutEvidence() {
    // Calculate x, y positions
    // Populate related[] arrays
  }
</script>

<div class="relative w-full h-screen">
  <EvidenceConnections {evidence} />
  
  {#each evidence as item}
    <div class="absolute" style="left: {item.x}px; top: {item.y}px;">
      <EvidenceCard evidence={item} />
    </div>
  {/each}
</div>
```

### Pattern C: Command Palette

```svelte
<!-- In root (app)/+layout.svelte -->
<script>
  import CodebaseSearch from '$lib/components/CodebaseSearch.svelte';
  
  function handleKeydown(e: KeyboardEvent) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      codebaseSearch?.open();
    }
  }
</script>

<svelte:window onkeydown={handleKeydown} />
<CodebaseSearch bind:this={codebaseSearch} />
```

---

## 6. Testing & Validation

### SearchBar Tests
```typescript
// Input debounce
const { onsearch } = render(SearchBar, { onsearch: fn });
userEvent.type(input, 'test');
await new Promise(resolve => setTimeout(resolve, 350));
expect(fn).toHaveBeenCalledWith('test');

// Escape clears
userEvent.keyboard('{Escape}');
expect(input.value).toBe('');
```

### EvidenceCard Tests
```typescript
// Render with all sections
const { evidence, onAskAI, onDelete } = render(EvidenceCard, {
  evidence: mockEvidence,
  onAskAI: fn1,
  onDelete: fn2
});
expect(screen.getByText(mockEvidence.file_name)).toBeDefined();

// Buttons only show if callbacks provided
expect(screen.queryByText('Ask AI')).toBeDefined(); // if onAskAI
expect(screen.queryByText('Delete')).toBeDefined(); // if onDelete
```

### EvidenceConnections Tests
```typescript
// Lines render for each relation
const { evidence } = render(EvidenceConnections, {
  evidence: [
    { id: 'a', x: 0, y: 0, related: ['b'] },
    { id: 'b', x: 100, y: 100, related: [] }
  ]
});
const lines = document.querySelectorAll('.connection-line');
expect(lines.length).toBe(1);
```

---

## Summary

| Component | Used By | Complexity | Dependencies | Type |
|-----------|---------|------------|--------------|------|
| **SearchBar** | 5 routes | Low | None | Input utility |
| **CodebaseSearch** | 1 route (root) | High | XState, Qdrant, Fuse.js | Modal dialog |
| **EvidenceCard** | 4 routes | Medium | Badge, Card, Icon | Card display |
| **EvidenceConnections** | 2 routes | Low | None | SVG overlay |

**Total Reuse:** 17+ routes (measured in audit)
**Status:** Production-ready, Svelte 5 compliant, fully typed
**Maintenance:** Low (stable APIs, no breaking changes planned)
