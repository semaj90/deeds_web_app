# Copilot Context for Prosecutor Legal CMS

## Stack Overview

- UI: SvelteKit (SSR-first, no VDOM), Tailwind or Vanilla CSS only
- Desktop: (Rust backend, secure command API)
- Mobile: Flutter + Riverpod + Tauri bridge
- Backend: Postgres + Drizzle ORM
- Vector Search: Qdrant (Docker)
- NLP Microservices: Python + FastAPI (NER, LLM masking)
- LLM Inference: Local via llama.cpp or Ollama (CLI or Tauri-integrated)
- Shared Logic: All UI and store logic in `/packages/`

---

## Project Goals

- 📂 JSON-first case management
- 🧠 Personalized LLM inference based on `user.history[]`
- 🖱️ Drag-and-drop evidence canvas (Svelte + Fabric.js)
- 🧾 Auto-saving + undo/redo of all case changes
- 🧠 Contextual search using Qdrant
- 📤 Export case summaries and visuals to PDF (via Rust or Puppeteer)
- 🔁 SSR-first; caching and deduplication of all LLM outputs
- 🧪 Full test coverage: Playwright + tokio + Flutter integration_test

---

# Styling Documentation

## Component Libraries & Styling Approaches

### Bits UI Styling for Law-Themed CMS

Bits UI ships almost zero styles by design, giving you complete flexibility when styling components. This is perfect for our law-themed visual evidence management system. For each component that renders an HTML element, we expose the `class` and `style` props to apply styles directly.

#### Law-Themed Color System

First, establish your law-themed color palette in CSS variables:

```css
/* app.css or global.css */
:root {
  --law-black: #0e0e0e;
  --law-gold: #d4af37;
  --law-white: #f5f5f5;
  --law-blue: #001f3f;
  --law-red: #8b0000;

  /* Typography */
  --font-heading: "Playfair Display", serif;
  --font-body: "Inter", sans-serif;

  /* Spacing for legal components */
  --spacing-evidence: 1.5rem;
  --spacing-node: 1rem;
  --border-legal: 2px solid var(--law-gold);
}
```

Or in Tailwind config:

```js
// tailwind.config.cjs
theme: {
  extend: {
    colors: {
      law: {
        black: '#0e0e0e',
        gold: '#d4af37',
        white: '#f5f5f5',
        blue: '#001f3f',
        red: '#8b0000',
      },
    },
    fontFamily: {
      heading: ['Playfair Display', 'serif'],
      body: ['Inter', 'sans-serif'],
    },
  },
}
```

#### CSS Frameworks (Tailwind/UnoCSS) with Law Theme

```svelte
<script lang="ts">
  import { Accordion } from "bits-ui";
</script>
<Accordion.Trigger class="h-12 w-full bg-law-black text-law-gold hover:bg-law-blue font-heading border-b border-law-gold">
  Legal Evidence Node
</Accordion.Trigger>
```

#### Data Attributes for Law-Themed Components

Each Bits UI component applies specific data attributes to its rendered elements. Use these for consistent legal styling:

```css
/* app.css - Legal Evidence Accordion */
[data-accordion-trigger] {
  height: 3rem;
  width: 100%;
  background-color: var(--law-black);
  color: var(--law-gold);
  font-family: var(--font-heading);
  border-bottom: 1px solid var(--law-gold);
  transition: all 0.2s ease;
}

/* Component state styling for legal theme */
[data-accordion-trigger][data-state="open"] {
  background-color: var(--law-blue);
  border-left: 4px solid var(--law-gold);
}

[data-accordion-trigger][data-state="closed"] {
  background-color: var(--law-black);
}

[data-accordion-trigger][data-disabled] {
  opacity: 0.5;
  cursor: not-allowed;
  background-color: #2a2a2a;
}

/* Evidence content styling */
[data-accordion-content] {
  background-color: var(--law-white);
  color: var(--law-black);
  border-left: 4px solid var(--law-gold);
  font-family: var(--font-body);
}
```

#### Global Classes for Legal Components

```css
/* app.css */
.evidence-trigger {
  height: 3rem;
  width: 100%;
  background-color: var(--law-black);
  color: var(--law-gold);
  font-family: var(--font-heading);
  border: var(--border-legal);
  padding: var(--spacing-node);
}

.case-card {
  background: var(--law-white);
  border: var(--border-legal);
  border-radius: 0.5rem;
  padding: var(--spacing-evidence);
  box-shadow: 0 4px 6px rgba(212, 175, 55, 0.1);
}

.legal-node {
  background: linear-gradient(
    135deg,
    var(--law-black) 0%,
    var(--law-blue) 100%
  );
  color: var(--law-gold);
  border-radius: 0.75rem;
  padding: 1.5rem;
  position: relative;
}

.legal-node::before {
  content: "";
  position: absolute;
  top: -2px;
  left: -2px;
  right: -2px;
  bottom: -2px;
  background: linear-gradient(45deg, var(--law-gold), var(--law-red));
  border-radius: inherit;
  z-index: -1;
}
```

#### Scoped Styles with Child Snippet for Evidence Nodes

The child snippet gives you complete control while maintaining accessibility:

```svelte
<!-- EvidenceAccordion.svelte -->
<script lang="ts">
  import { Accordion } from "bits-ui";

  export let evidenceType = 'document';
  export let isTagged = false;
</script>

<Accordion.Trigger>
  {#snippet child({ props })}
    <button
      {...props}
      class="evidence-trigger"
      class:tagged={isTagged}
      data-evidence-type={evidenceType}
    >
      <div class="evidence-header">
        <span class="evidence-icon">⚖️</span>
        <span class="evidence-title">
          <slot name="title" />
        </span>
        {#if isTagged}
          <span class="ai-badge">AI</span>
        {/if}
      </div>
    </button>
  {/snippet}
</Accordion.Trigger>

<style>
  .evidence-trigger {
    width: 100%;
    background: var(--law-black);
    color: var(--law-gold);
    font-family: var(--font-heading);
    border: 2px solid var(--law-gold);
    border-radius: 0.5rem;
    padding: 1rem;
    transition: all 0.3s ease;
    cursor: pointer;
  }

  .evidence-trigger:hover {
    background: var(--law-blue);
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(212, 175, 55, 0.3);
  }

  .evidence-trigger.tagged {
    border-color: var(--law-red);
    background: linear-gradient(135deg, var(--law-black) 0%, #2a0000 100%);
  }

  .evidence-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .evidence-icon {
    font-size: 1.25rem;
  }

  .evidence-title {
    flex: 1;
    text-align: left;
    font-weight: 600;
  }

  .ai-badge {
    background: var(--law-red);
    color: var(--law-white);
    padding: 0.25rem 0.5rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    font-weight: bold;
  }
</style>
```

#### Dynamic Color Maps for Evidence Types

Create dynamic styling based on evidence types:

```ts
// lib/theme/evidence-colors.ts
export const evidenceColorMap = {
  document: {
    bg: "bg-law-black",
    text: "text-law-gold",
    border: "border-law-gold",
    hover: "hover:bg-law-blue",
  },
  witness: {
    bg: "bg-law-blue",
    text: "text-law-white",
    border: "border-law-white",
    hover: "hover:bg-law-black",
  },
  physical: {
    bg: "bg-law-gold",
    text: "text-law-black",
    border: "border-law-black",
    hover: "hover:bg-law-red",
  },
  digital: {
    bg: "bg-law-red",
    text: "text-law-white",
    border: "border-law-gold",
    hover: "hover:bg-law-black",
  },
};

export const getEvidenceClasses = (type: keyof typeof evidenceColorMap) => {
  const colors = evidenceColorMap[type];
  return `${colors.bg} ${colors.text} ${colors.border} ${colors.hover}`;
};
```

#### CSS Variables for Dynamic Components

Bits UI components expose CSS variables for internal component values:

```css
/* Evidence node width matching */
[data-select-content] {
  width: var(--bits-select-anchor-width);
  min-width: var(--bits-select-anchor-width);
  max-width: var(--bits-select-anchor-width);
  background: var(--law-white);
  border: var(--border-legal);
}

/* Animated legal accordion content */
[data-accordion-content] {
  overflow: hidden;
  transition: height 300ms ease-out, opacity 200ms ease;
  height: 0;
  opacity: 0;
  background: var(--law-white);
  border-left: 4px solid var(--law-gold);
}

[data-accordion-content][data-state="open"] {
  height: var(--bits-accordion-content-height);
  opacity: 1;
}
```

#### Advanced Legal-Themed Animations

```css
/* Legal document reveal animation */
@keyframes legalReveal {
  0% {
    height: 0;
    opacity: 0;
    transform: translateY(-10px);
  }
  50% {
    height: var(--bits-accordion-content-height);
    opacity: 0.7;
  }
  100% {
    height: var(--bits-accordion-content-height);
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes legalHide {
  0% {
    height: var(--bits-accordion-content-height);
    opacity: 1;
    transform: translateY(0);
  }
  50% {
    opacity: 0.3;
  }
  100% {
    height: 0;
    opacity: 0;
    transform: translateY(-10px);
  }
}

/* Evidence node pulse for AI activity */
@keyframes evidencePulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(212, 175, 55, 0.7);
  }
  50% {
    box-shadow: 0 0 0 10px rgba(212, 175, 55, 0);
  }
}

[data-accordion-content][data-state="open"] {
  animation: legalReveal 400ms cubic-bezier(0.16, 1, 0.3, 1) forwards;
}

[data-accordion-content][data-state="closed"] {
  animation: legalHide 300ms cubic-bezier(0.7, 0, 0.84, 0) forwards;
}

.ai-processing {
  animation: evidencePulse 2s ease-in-out infinite;
}
```

#### Floating Components for Legal Tooltips

For floating content (tooltips, popovers, dropdowns), maintain the required two-level structure:

```svelte
<!-- LegalTooltip.svelte -->
<script lang="ts">
  import { Tooltip } from "bits-ui";

  export let precedentInfo = '';
  export let caseReference = '';
</script>

<Tooltip.Content>
  {#snippet child({ wrapperProps, props, open })}
    {#if open}
      <div {...wrapperProps}>
        <div
          {...props}
          class="legal-tooltip"
          transition:fade={{ duration: 200 }}
        >
          <div class="tooltip-header">
            <span class="scales-icon">⚖️</span>
            <span class="case-ref">{caseReference}</span>
          </div>
          <p class="precedent-text">{precedentInfo}</p>
          <div class="ai-attribution">
            <span class="ai-icon">🤖</span>
            <span>AI Legal Analysis</span>
          </div>
        </div>
      </div>
    {/if}
  {/snippet}
</Tooltip.Content>

<style>
  .legal-tooltip {
    background: var(--law-black);
    color: var(--law-gold);
    border: 2px solid var(--law-gold);
    border-radius: 0.5rem;
    padding: 1rem;
    max-width: 300px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.5);
    font-family: var(--font-body);
  }

  .tooltip-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    margin-bottom: 0.5rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--law-gold);
  }

  .case-ref {
    font-family: var(--font-heading);
    font-weight: 600;
    color: var(--law-white);
  }

  .precedent-text {
    margin: 0.5rem 0;
    line-height: 1.5;
    font-size: 0.875rem;
  }

  .ai-attribution {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    margin-top: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid rgba(212, 175, 55, 0.3);
    font-size: 0.75rem;
    color: var(--law-red);
  }
</style>
```

### Melt UI Styling

Melt UI provides headless, unstyled UI primitives that can be styled with any CSS approach:

#### Basic Melt UI Component Styling

```svelte
<script lang="ts">
  import { createAccordion, melt } from '@melt-ui/svelte';

  const {
    elements: { root, item, trigger, content },
    states: { value }
  } = createAccordion();
</script>

<div use:melt={$root} class="accordion-root">
  <div use:melt={$item('item-1')} class="accordion-item">
    <button use:melt={$trigger('item-1')} class="accordion-trigger">
      Section 1
    </button>
    <div use:melt={$content('item-1')} class="accordion-content">
      Content for section 1
    </div>
  </div>
</div>

<style>
  .accordion-root {
    width: 100%;
    max-width: 600px;
  }

  .accordion-item {
    border: 1px solid #e2e8f0;
    border-radius: 0.25rem;
    margin-bottom: 0.5rem;
  }

  .accordion-trigger {
    width: 100%;
    padding: 1rem;
    background: white;
    border: none;
    text-align: left;
    cursor: pointer;
  }

  .accordion-trigger:hover {
    background-color: #f7fafc;
  }

  .accordion-content {
    padding: 1rem;
    border-top: 1px solid #e2e8f0;
  }
</style>
```

#### Melt UI State-Based Styling

```svelte
<script lang="ts">
  import { createSelect, melt } from '@melt-ui/svelte';

  const {
    elements: { trigger, menu, option },
    states: { open, selected }
  } = createSelect();
</script>

<button
  use:melt={$trigger}
  class="select-trigger"
  class:open={$open}
>
  {$selected?.label ?? 'Select an option'}
</button>

{#if $open}
  <div use:melt={$menu} class="select-menu">
    <div use:melt={$option({ value: 'option1', label: 'Option 1' })} class="select-option">
      Option 1
    </div>
  </div>
{/if}

<style>
  .select-trigger {
    padding: 0.5rem 1rem;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    background: white;
    cursor: pointer;
  }

  .select-trigger.open {
    border-color: #3b82f6;
    box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.1);
  }

  .select-menu {
    position: absolute;
    z-index: 50;
    background: white;
    border: 1px solid #d1d5db;
    border-radius: 0.375rem;
    box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
  }

  .select-option {
    padding: 0.5rem 1rem;
    cursor: pointer;
  }

  .select-option:hover {
    background-color: #f3f4f6;
  }
</style>
```

### Web-App CSS Architecture

#### Global Styles Structure

```css
/* app.css or global.css */

/* Reset and base styles */
*,
*::before,
*::after {
  box-sizing: border-box;
}

html {
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  line-height: 1.6;
}

/* Design tokens */
:root {
  /* Colors */
  --color-primary: #1e40af;
  --color-primary-dark: #1e3a8a;
  --color-secondary: #64748b;
  --color-success: #059669;
  --color-warning: #d97706;
  --color-error: #dc2626;

  /* Spacing */
  --spacing-xs: 0.25rem;
  --spacing-sm: 0.5rem;
  --spacing-md: 1rem;
  --spacing-lg: 1.5rem;
  --spacing-xl: 2rem;

  /* Typography */
  --text-xs: 0.75rem;
  --text-sm: 0.875rem;
  --text-base: 1rem;
  --text-lg: 1.125rem;
  --text-xl: 1.25rem;

  /* Border radius */
  --radius-sm: 0.25rem;
  --radius-md: 0.375rem;
  --radius-lg: 0.5rem;

  /* Shadows */
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1);
}

/* Component base classes */
.btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: var(--spacing-sm) var(--spacing-md);
  border-radius: var(--radius-md);
  font-weight: 500;
  text-decoration: none;
  border: 1px solid transparent;
  cursor: pointer;
  transition: all 0.2s ease-in-out;
}

.btn-primary {
  background-color: var(--color-primary);
  color: white;
}

.btn-primary:hover {
  background-color: var(--color-primary-dark);
}

.btn-secondary {
  background-color: white;
  color: var(--color-secondary);
  border-color: #d1d5db;
}

.btn-secondary:hover {
  background-color: #f9fafb;
}

/* Card component */
.card {
  background: white;
  border-radius: var(--radius-lg);
  box-shadow: var(--shadow-sm);
  border: 1px solid #e5e7eb;
}

.card-header {
  padding: var(--spacing-lg);
  border-bottom: 1px solid #e5e7eb;
}

.card-content {
  padding: var(--spacing-lg);
}

/* Legal-specific components */
.case-card {
  background: white;
  border: 1px solid #e5e7eb;
  border-radius: var(--radius-lg);
  padding: var(--spacing-lg);
  transition: all 0.2s ease;
}

.case-card:hover {
  box-shadow: var(--shadow-md);
  border-color: var(--color-primary);
}

.evidence-item {
  display: flex;
  align-items: center;
  padding: var(--spacing-md);
  border: 1px solid #e5e7eb;
  border-radius: var(--radius-md);
  margin-bottom: var(--spacing-sm);
}

.evidence-item:hover {
  background-color: #f9fafb;
}

.status-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.25rem 0.75rem;
  border-radius: 9999px;
  font-size: var(--text-xs);
  font-weight: 500;
}

.status-active {
  background-color: #dcfce7;
  color: var(--color-success);
}

.status-pending {
  background-color: #fef3c7;
  color: var(--color-warning);
}

.status-closed {
  background-color: #f3f4f6;
  color: var(--color-secondary);
}
```

#### Component-Specific Styling Patterns

```svelte
<!-- EvidenceCard.svelte -->
<script lang="ts">
  export let evidence: Evidence;
  export let selected = false;
  export let draggable = false;
</script>

<div
  class="evidence-card"
  class:selected
  class:draggable
  data-evidence-id={evidence.id}
>
  <div class="evidence-header">
    <h3>{evidence.title}</h3>
    <span class="evidence-type">{evidence.evidenceType}</span>
  </div>
  <p class="evidence-description">{evidence.description}</p>
</div>

<style>
  .evidence-card {
    background: white;
    border: 2px solid transparent;
    border-radius: var(--radius-lg);
    padding: var(--spacing-md);
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .evidence-card:hover {
    border-color: #e5e7eb;
    box-shadow: var(--shadow-sm);
  }

  .evidence-card.selected {
    border-color: var(--color-primary);
    box-shadow: 0 0 0 3px rgba(30, 64, 175, 0.1);
  }

  .evidence-card.draggable {
    cursor: grab;
  }

  .evidence-card.draggable:active {
    cursor: grabbing;
    transform: rotate(2deg);
  }

  .evidence-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: var(--spacing-sm);
  }

  .evidence-header h3 {
    margin: 0;
    font-size: var(--text-lg);
    font-weight: 600;
    color: #1f2937;
  }

  .evidence-type {
    background: #f3f4f6;
    color: var(--color-secondary);
    padding: 0.25rem 0.5rem;
    border-radius: var(--radius-sm);
    font-size: var(--text-xs);
    font-weight: 500;
    text-transform: uppercase;
  }

  .evidence-description {
    color: var(--color-secondary);
    font-size: var(--text-sm);
    margin: 0;
    line-height: 1.5;
  }
</style>
```

#### Responsive Design Patterns

```css
/* Responsive utilities */
.container {
  width: 100%;
  max-width: 1200px;
  margin: 0 auto;
  padding: 0 var(--spacing-md);
}

@media (min-width: 768px) {
  .container {
    padding: 0 var(--spacing-lg);
  }
}

/* Grid layouts */
.grid {
  display: grid;
  gap: var(--spacing-lg);
}

.grid-cols-1 {
  grid-template-columns: 1fr;
}

@media (min-width: 768px) {
  .grid-cols-2 {
    grid-template-columns: repeat(2, 1fr);
  }

  .grid-cols-3 {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (min-width: 1024px) {
  .grid-cols-4 {
    grid-template-columns: repeat(4, 1fr);
  }
}

/* Flex utilities */
.flex {
  display: flex;
}

.flex-col {
  flex-direction: column;
}

.items-center {
  align-items: center;
}

.justify-between {
  justify-content: space-between;
}

.gap-2 {
  gap: var(--spacing-sm);
}

.gap-4 {
  gap: var(--spacing-md);
}
```

#### Dark Mode Support

```css
/* Dark mode variables */
@media (prefers-color-scheme: dark) {
  :root {
    --color-bg: #0f172a;
    --color-surface: #1e293b;
    --color-text: #f1f5f9;
    --color-text-secondary: #94a3b8;
    --color-border: #334155;
  }

  body {
    background-color: var(--color-bg);
    color: var(--color-text);
  }

  .card {
    background-color: var(--color-surface);
    border-color: var(--color-border);
  }

  .btn-secondary {
    background-color: var(--color-surface);
    color: var(--color-text);
    border-color: var(--color-border);
  }
}

/* Manual dark mode toggle */
[data-theme="dark"] {
  --color-bg: #0f172a;
  --color-surface: #1e293b;
  --color-text: #f1f5f9;
  --color-text-secondary: #94a3b8;
  --color-border: #334155;
}
```

### Animation & Transition Guidelines

```css
/* Standard transitions */
.transition-all {
  transition: all 0.2s ease-in-out;
}

.transition-colors {
  transition: background-color 0.2s ease-in-out, border-color 0.2s ease-in-out,
    color 0.2s ease-in-out;
}

/* Entrance animations */
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@keyframes slideIn {
  from {
    transform: translateX(-100%);
  }
  to {
    transform: translateX(0);
  }
}

.animate-fade-in {
  animation: fadeIn 0.3s ease-out;
}

.animate-slide-in {
  animation: slideIn 0.3s ease-out;
}

/* Loading states */
@keyframes pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.5;
  }
}

.animate-pulse {
  animation: pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite;
}

@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}

.animate-spin {
  animation: spin 1s linear infinite;
}
```

---

## Architecture Summary & Next Steps

- Use Drizzle orm, drizzle-kit, postgresql, + pg_vector for backend.
- SSR all initial data in +page.server.ts.
- Hydrate Loki.js on client for fast queries.
- Use Fuse.js for fuzzy search.
- Use XState for complex UI state.
- Use shadcn-svelte + UnoCSS for beautiful, customizable UI.
- Svelte stores for UI state and displaying query results.

### Implementation Details

1. **Data Loading & Persistence**
   - Server-side: Use Drizzle ORM (with drizzle-kit migrations) to store all evidence, reports, and metadata in PostgreSQL. Store file blobs in cloud storage (S3, R2, etc.), and keep metadata (including AI embeddings via pg_vector) in your evidence table.
   - SvelteKit SSR: Centralize all initial data loading in +page.server.ts using the load function. Return all needed data (case, evidence, reports) as props.
   - Client-side: Hydrate a Loki.js database with this data on mount for instant querying/filtering/search.
2. **State & Search**
   - Loki.js: Use for client-side caching and fast queries. Replace large Svelte stores with Loki.js collections for evidence/reports.
   - Fuse.js: Use for fuzzy search over Loki.js data. On search input, update a Svelte store with results to display in the UI.
   - Svelte Stores: Use for UI state (active tab, sidebar open, notifications) and for holding filtered/search results.
   - XState: Use for complex UI workflows (evidence upload, AI report generation, autosave). Replace multiple booleans with a state machine.
3. **Mutations & Autosave**
   - Form Actions: Use SvelteKit form actions for user-initiated mutations (e.g., generate summary/strategy).
   - API Endpoints: Use dedicated API routes (+server.ts) for autosave and background tasks, validating user sessions.
4. **Styling & Components**
   - shadcn-svelte + UnoCSS: Use shadcn-svelte CLI to add headless, accessible UI components. Style and customize with UnoCSS utility classes.
   - Customize: Edit component files directly (e.g., Button, Dialog, Card) to match your brand and UX needs. You own the code—change variants, colors, sizes, etc.
5. **AI & Recommendations**
   - pg_vector: Store AI-generated vector embeddings in PostgreSQL for evidence. Use these for semantic search and recommendations.
   - Fuse.js: Use for instant client-side fuzzy search.
   - Loki.js: Use for offline/instant UI updates.
     ollama using local llm, legal gemma3, from our app directory.
     use nomic ebmed for embedding of user history store of data, pg vectors.

#### Example: Custom Button Variant

```ts
// src/lib/components/ui/button/index.ts
import { cva } from "class-variance-authority";

export const buttonVariants = cva(
  "inline-flex items-center justify-center rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:opacity-50",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-blue-500 to-blue-600 text-white hover:from-blue-600 hover:to-blue-700",
        success: "bg-green-600 text-white hover:bg-green-700",
        outline: "border border-input bg-background hover:bg-accent",
        // ...other variants
      },
      size: {
        default: "h-10 px-4 py-2",
        sm: "h-9 px-3",
        lg: "h-11 px-8",
        icon: "h-10 w-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);
```

Use in Svelte:

```svelte
<Button>Default</Button>
<Button variant="success">Success</Button>
<Button variant="outline">Cancel</Button>
```

---

## File and Feature Hints (for Copilot)

### SvelteKit UI

```ts
// File: CaseForm.svelte
// Instructions:
// SSR form handler with hidden user + case metadata.
// Submits via <form method="POST"> and saves with Drizzle.
// Auto-enhanced via SvelteKit use:enhance.
// JSON autosave + undo logic syncs with Tauri via stores.
```

### Rust Backend

```rust
// File: commands.rs
// Instructions:
// Tauri commands like `save_case`, `search_vectors`, `upload_llm`.
// All commands async using tokio. All input/output is JSON.
// Store LLM prompts + responses with md5(query+context) as key.
// Integrate with Qdrant via HTTP or client lib.
```

### Flutter Mobile

```dart
// File: evidence_timeline.dart
// Instructions:
// Stateless UI that mirrors desktop CaseEditor.
// Store user edits offline and sync to Tauri bridge.
// Load `user.history` from secure_storage for LLM queries.
```

### Data Flow Best Practices

Use user.history[] (recent edits, prior case summaries, annotations)

For each LLM request, include:

user_id

case_id

timestamp

current note / JSON state

Hash LLM prompt + metadata to deduplicate cache (md5)

### Component Sharing

```pgsql
/packages/
  ui/               → Drag/drop canvas, timeline, autosave forms
  stores/           → Undo/redo state, LLM cache
  rust-core/        → Vector helpers, file IO, PDF export
  flutter-core/     → Bridge-compatible widgets + storage
  llm-cache/        → Universal cache by md5(query+context)
```

### Vector Search (Qdrant)

Use semantic embeddings to group related case notes

Store in Qdrant as { user_id, case_id, embedding, type, tags[] }

Run search_vectors() in Rust to return relevant LLM context

### PDF Export

SSR route /export/pdf/[case_id]

Uses HTML + Tailwind → PDF via:

Puppeteer (Node)

or Tauri + wkhtmltopdf

Must include metadata, summary, timeline, evidence layout (canvas)

### Recommended Dev Commands

```bash
pnpm dev            # Web frontend (SvelteKit)
cargo tauri dev     # Desktop app (Rust + SvelteKit)
docker-compose up   # Postgres + Qdrant
uvicorn main:app    # Python NLP server
pnpm test:e2e       # Playwright
cargo test          # Rust unit tests
flutter test        # Mobile integration tests
```
