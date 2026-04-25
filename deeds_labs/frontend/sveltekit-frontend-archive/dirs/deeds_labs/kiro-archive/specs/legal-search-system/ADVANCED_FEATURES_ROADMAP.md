# Advanced Features Roadmap - Legal Search System

## 🎯 Feature Paths (Choose Primary Direction)

### 🅐 On-Demand Legal Explanations (RECOMMENDED FIRST)
**Impact**: High | **Complexity**: Medium | **Time**: 2-3 tasks
- Statute → summarized elements → defenses → penalties
- Transforms into expert system
- Builds on existing LLM infrastructure
- **Next Tasks**: 9, 10, 24

### 🅑 Case-Law Linking Engine
**Impact**: High | **Complexity**: High | **Time**: 4-5 tasks
- Statute embeddings → nearest cases → graph UI
- Makes it research engine like Westlaw
- Requires graph visualization
- **Next Tasks**: 11, 12, 16

### 🅒 Clause-to-PDF Highlighting
**Impact**: Medium | **Complexity**: High | **Time**: 3-4 tasks
- Legal zoom + synced citations
- Perfect for lawyers/judges
- Requires PDF manipulation
- **Next Tasks**: 8, 11, 24

### 🅓 Taxonomy / Law Map Explorer
**Impact**: Medium | **Complexity**: Medium | **Time**: 3-4 tasks
- SOM clusters → browse law categories visually
- Most futuristic and accessible
- Requires clustering completion
- **Next Tasks**: 20, 21, 25

### 🅔 Research Workspace + Memo Builder
**Impact**: High | **Complexity**: Medium | **Time**: 3-4 tasks
- Save statutes, notes, statements → auto skeleton memo
- Best for practitioners and students
- Requires workspace state management
- **Next Tasks**: 8, 9, 10

---

## 🧱 Inline Category Badges + Mini-Dialog Architecture

### Component Stack
- **Bits-UI v2** (headless)
- **Svelte 5 runes** (reactivity)
- **UnoCSS** (styling)
- **HTML5 `<dialog>`** (fallback)
- **Svelte transitions** (motion-safe animations)

### Data Flow
```
Statute Result
    ↓
Extract category (from Qdrant payload)
    ↓
Render inline badge
    ↓
On click → fetch metadata
    ↓
Open mini-dialog with:
├─ Category name
├─ Description
├─ Related categories
├─ Semantic score
└─ "Search Similar" button
```

### Badge Colors (Legal Theme)
| Category | Color | Hex |
|----------|-------|-----|
| Violent Crime | red-700 on pale-red-100 | #b91c1c / #fee2e2 |
| Financial/Fraud | amber-700 on pale-yellow-100 | #b45309 / #fef3c7 |
| Procedural/Court | blue-700 on pale-blue-100 | #1d4ed8 / #dbeafe |
| Civil | green-700 on pale-green-100 | #15803d / #dcfce7 |

---

## 🔌 LLM Agent Function Calling Architecture

### Function Schema
```typescript
interface StatuteFunction {
  name: "fetch_statute";
  description: "Return statute metadata by title and section";
  parameters: {
    titleNumber: number;
    section: string;
  };
}

interface ExplainStatuteFunction {
  name: "explain_statute";
  description: "Provide legal explanation of statute";
  parameters: {
    titleNumber: number;
    section: string;
    aspect: "summary" | "penalties" | "defenses" | "elements";
  };
}
```

### LLM Models
- **Server**: `gemma3-legal:latest` (Ollama)
- **Browser Fallback**: `gemma3-270m-onnx` (WebGPU)
- **Embeddings**: `embeddinggemma:latest` (pgvector/Qdrant)

### Endpoint: `/api/chat/explain-statute`
```typescript
POST /api/chat/explain-statute
{
  "titleNumber": 18,
  "section": "1201",
  "aspect": "summary"
}

Response:
{
  "explanation": "...",
  "elements": [...],
  "penalties": [...],
  "defenses": [...],
  "relatedStatutes": [...]
}
```

---

## 📊 Title Retrieval Architecture

### Data Sources (Priority Order)
1. **MinIO XML/PDF** → Canonical titles
2. **PostgreSQL** → Parsed titles + metadata
3. **IndexedDB** → Cached titles (offline)
4. **Fuse.js** → Fuzzy title search

### Query Flow
```
User Query
    ↓
Tier 1: IndexedDB + Fuse.js (fast local)
    ↓
Tier 2: pgvector cosine similarity (deep match)
    ↓
Tier 3: Qdrant tag suggestions (categorical hints)
    ↓
Return: {
  titleNumber,
  section,
  sectionTitle,
  category,
  tags,
  score
}
```

---

## 🧩 Implementation Skeleton

### 1. CategoryBadge.svelte
```svelte
<script lang="ts">
  import { Dialog } from "bits-ui";
  import { fly, fade } from "svelte/transition";

  export let label: string;
  export let description: string;
  export let score: number = 0.9;
  export let onSimilar: () => void;

  let open = $state(false);

  const categoryColors: Record<string, { bg: string; fg: string }> = {
    "violent crime": { bg: "bg-red-100", fg: "text-red-700" },
    "financial": { bg: "bg-amber-100", fg: "text-amber-700" },
    "procedural": { bg: "bg-blue-100", fg: "text-blue-700" },
    "civil": { bg: "bg-green-100", fg: "text-green-700" },
  };

  const colors = categoryColors[label.toLowerCase()] ||
    { bg: "bg-gray-100", fg: "text-gray-700" };
</script>

<span
  class="badge {colors.bg} {colors.fg}"
  role="button"
  tabindex="0"
  on:click={() => (open = true)}
  on:keydown={(e) => e.key === "Enter" && (open = true)}
>
  {label}
</span>

<Dialog.Root bind:open>
  <Dialog.Overlay class="fixed inset-0 z-50 bg-black/20" />
  <Dialog.Content
    class="fixed top-1/3 left-1/2 -translate-x-1/2 z-50 bg-white rounded-lg shadow-lg p-4 max-w-xs"
    transition:fly={{ y: 16, duration: 180 }}
  >
    <header class="font-semibold mb-2">{label}</header>
    <p class="text-sm text-gray-600 mb-3">{description}</p>
    <p class="text-xs text-gray-500 mb-3">
      Relevance: {(score * 100).toFixed(0)}%
    </p>
    <button
      class="w-full px-3 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
      on:click={onSimilar}
    >
      Search Similar Statutes
    </button>
  </Dialog.Content>
</Dialog.Root>

<style>
  .badge {
    display: inline-block;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border-radius: 0.25rem;
    cursor: pointer;
    border: 1px solid currentColor;
    opacity: 0.8;
    transition: opacity 0.2s;
  }

  .badge:hover {
    opacity: 1;
  }
</style>
```

### 2. explain-statute Endpoint
```typescript
// src/routes/api/chat/explain-statute/+server.ts
import { json, type RequestHandler } from '@sveltejs/kit';
import { db } from '$lib/server/db/drizzle';
import { lawSections } from '$lib/server/db/schema/legal-index';
import { eq } from 'drizzle-orm';

export const POST: RequestHandler = async ({ request }) => {
  try {
    const { titleNumber, section, aspect = "summary" } = await request.json();

    // Fetch statute from database
    const statute = await db
      .select()
      .from(lawSections)
      .where(eq(lawSections.fullCitation, `${titleNumber} U.S.C. § ${section}`))
      .then(r => r[0]);

    if (!statute) {
      return json({ error: "Statute not found" }, { status: 404 });
    }

    // Call LLM for explanation
    const explanation = await explainStatute(statute, aspect);

    return json({
      titleNumber,
      section,
      explanation,
      elements: extractElements(statute.text),
      penalties: extractPenalties(statute.text),
      defenses: extractDefenses(statute.text),
    });
  } catch (error) {
    console.error('[Explain] Error:', error);
    return json({ error: "Failed to explain statute" }, { status: 500 });
  }
};

async function explainStatute(statute: any, aspect: string): Promise<string> {
  // Call Ollama or browser LLM
  const response = await fetch('http://localhost:11434/api/generate', {
    method: 'POST',
    body: JSON.stringify({
      model: 'gemma3-legal:latest',
      prompt: `Explain this statute in simple legal terms (${aspect}):\n\n${statute.text}`,
      stream: false,
    }),
  });

  const result = await response.json();
  return result.response;
}

function extractElements(text: string): string[] {
  // Parse statute text for key elements
  return [];
}

function extractPenalties(text: string): string[] {
  // Extract penalty information
  return [];
}

function extractDefenses(text: string): string[] {
  // Extract defense information
  return [];
}
```

### 3. SearchResultRow.svelte (with Badge)
```svelte
<script lang="ts">
  import CategoryBadge from "./CategoryBadge.svelte";

  export let result: any;

  async function handleSimilar() {
    // Search for similar statutes in same category
    const response = await fetch('/api/search/laws', {
      method: 'POST',
      body: JSON.stringify({
        query: result.category,
        limit: 5,
      }),
    });

    const similar = await response.json();
    // Update sidebar or modal with results
  }
</script>

<li class="row">
  <span class="code">{result.titleNumber} U.S.C. § {result.section}</span>
  <span class="label ml-1">{result.sectionTitle}</span>
  <CategoryBadge
    label={result.category}
    description={result.categoryDescription}
    score={result.score}
    onSimilar={handleSimilar}
  />
</li>

<style>
  .row {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    border-bottom: 1px solid #e0e0e0;
  }

  .code {
    font-family: monospace;
    font-weight: 600;
  }

  .label {
    flex: 1;
  }
</style>
```

---

## 🎯 Recommended Implementation Order

### Phase 1: Foundation (Tasks 9-10)
1. **Task 9**: Crime metadata extraction
2. **Task 10**: Agentic function calls for LLM

### Phase 2: UI Enhancement (Tasks 24-25)
3. **Task 24**: Echo ranking integration
4. **Task 25**: UI updates with cluster labels

### Phase 3: Advanced Features (Choose Path A-E)
5. Implement selected feature path
6. Add clustering if needed (Tasks 20-21)
7. Add caching if needed (Tasks 22-23)

---

## 📋 Quick Decision Matrix

| Feature | Effort | Impact | Timeline |
|---------|--------|--------|----------|
| 🅐 Explanations | Medium | High | 2-3 weeks |
| 🅑 Case Linking | High | High | 4-5 weeks |
| 🅒 PDF Highlighting | High | Medium | 3-4 weeks |
| 🅓 Law Map | Medium | Medium | 3-4 weeks |
| 🅔 Memo Builder | Medium | High | 3-4 weeks |

**Recommendation**: Start with **🅐 (Explanations)** as it builds on existing infrastructure and provides immediate value.

---

## 🚀 Next Steps

1. Choose primary feature path (A-E)
2. Complete Tasks 9-10 (crime metadata + LLM functions)
3. Implement CategoryBadge component
4. Add explain-statute endpoint
5. Integrate into search results UI

Ready to proceed with implementation?

