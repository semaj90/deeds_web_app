# Enhanced-Bits Implementation Quick Start Guide

## 🚀 Get Started with Enhanced-Bits in 5 Minutes

**For:** Legal AI Platform - SvelteKit 2 + Svelte 5 + Enhanced-Bits UI
**Updated:** 2025-09-21 | **Status:** ✅ Ready to Use

---

## 📦 Installation & Setup

### 1. Basic Component Usage (Start Here)

```svelte
<!-- src/routes/+page.svelte -->
<script lang="ts">
  // Import core components - SSR-safe
  import { Button, Card, CardHeader, CardTitle, CardContent } from '$lib/components/ui/enhanced-bits';

  let clickCount = $state(0);
</script>

<Card>
  <CardHeader>
    <CardTitle>🎮 Enhanced-Bits Demo</CardTitle>
  </CardHeader>
  <CardContent>
    <p>You've clicked {clickCount} times</p>
    <Button onclick={() => clickCount++}>
      Click me!
    </Button>
  </CardContent>
</Card>
```

### 2. Compound Components (shadcn-style)

```svelte
<!-- src/routes/evidence/+page.svelte -->
<script lang="ts">
  import * as Card from '$lib/components/ui/card';
  import * as Dialog from '$lib/components/ui/dialog';
  import { Button } from '$lib/components/ui/enhanced-bits';

  let dialogOpen = $state(false);
</script>

<Card.Root>
  <Card.Header>
    <Card.Title>Evidence Analysis</Card.Title>
  </Card.Header>
  <Card.Content>
    <Dialog.Root bind:open={dialogOpen}>
      <Dialog.Trigger>
        <Button>View Details</Button>
      </Dialog.Trigger>
      <Dialog.Content>
        <Dialog.Title>Evidence Details</Dialog.Title>
        <Dialog.Description>
          Detailed evidence analysis would go here.
        </Dialog.Description>
      </Dialog.Content>
    </Dialog.Root>
  </Card.Content>
</Card.Root>
```

### 3. Dynamic Component Loading

```svelte
<!-- src/routes/advanced/+page.svelte -->
<script lang="ts">
  import { loadComponent } from '$lib/components/ui/enhanced-bits';
  import { onMount } from 'svelte';

  let EvidenceCard: any = $state(null);
  let FileUploader: any = $state(null);

  onMount(async () => {
    // Load components dynamically - only if they exist
    EvidenceCard = await loadComponent('EvidenceCard');
    FileUploader = await loadComponent('FileUploader');
  });
</script>

{#if EvidenceCard}
  <svelte:component this={EvidenceCard} evidence={{
    id: '1',
    title: 'Sample Evidence',
    confidence: 0.95
  }} />
{/if}

{#if FileUploader}
  <svelte:component this={FileUploader} onUpload={(files) => console.log(files)} />
{/if}
```

---

## 🎨 Custom Themes

### 1. Apply Pre-built Themes

```svelte
<!-- src/lib/components/ThemeDemo.svelte -->
<script lang="ts">
  import { applyTheme } from '$lib/stores/theme-store';
  import { Button } from '$lib/components/ui/enhanced-bits';
</script>

<div class="theme-switcher">
  <Button onclick={() => applyTheme('nes')}>
    🎮 NES Gaming Theme
  </Button>
  <Button onclick={() => applyTheme('legal')}>
    ⚖️ Professional Legal
  </Button>
  <Button onclick={() => applyTheme('minimal')}>
    ✨ Clean Minimal
  </Button>
</div>
```

### 2. Create Custom Theme

```typescript
// src/lib/themes/my-theme.ts
import { createCustomTheme } from '$lib/components/ui/enhanced-bits';

export const MyCompanyTheme = createCustomTheme({
  colors: {
    primary: '#1e40af',      // Your brand blue
    secondary: '#7c3aed',    // Your accent purple
    evidence: '#f59e0b',     // Evidence amber
    ai: '#06b6d4',          // AI cyan
    success: '#10b981',     // Success green
    warning: '#f59e0b',     // Warning orange
    error: '#ef4444',       // Error red
  },
  typography: {
    fontFamily: '"Inter", sans-serif',
  },
  nes: {
    borderWidth: '2px',      // Subtle borders
    shadowDepth: '3px',      // Soft shadows
  }
});
```

### 3. Apply Custom Theme

```svelte
<!-- src/app.html or src/routes/+layout.svelte -->
<script lang="ts">
  import { onMount } from 'svelte';
  import { applyDesignSystemToDocument } from '$lib/components/ui/enhanced-bits';
  import { MyCompanyTheme } from '$lib/themes/my-theme';

  onMount(() => {
    applyDesignSystemToDocument(MyCompanyTheme);
  });
</script>
```

---

## 🏗️ Architecture Integration

### 1. Component Registry

```typescript
// src/lib/stores/component-store.ts
import {
  COMPONENT_REGISTRY,
  getSSRSafeComponents,
  getComponentsByCategory,
  registerCustomComponent
} from '$lib/components/ui/enhanced-bits';

// Get all safe components for SSR
export const ssrSafeComponents = getSSRSafeComponents();

// Get evidence-specific components
export const evidenceComponents = getComponentsByCategory('evidence');

// Register your custom component
registerCustomComponent({
  name: 'MyCustomEvidenceCard',
  component: MyCustomEvidenceCard,
  category: 'evidence',
  customTheme: {
    colors: { evidence: '#gold' }
  }
});
```

### 2. Legal AI Integration

```svelte
<!-- src/lib/components/legal/EvidenceAnalyzer.svelte -->
<script lang="ts">
  import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    Button,
    SearchInput
  } from '$lib/components/ui/enhanced-bits';

  interface Evidence {
    id: string;
    title: string;
    confidence: number;
    priority: 'low' | 'medium' | 'high' | 'critical';
  }

  let evidenceList = $state<Evidence[]>([]);
  let searchQuery = $state('');

  // AI Analysis function
  async function analyzeEvidence(evidence: Evidence) {
    // Call your legal AI service
    const analysis = await fetch('/api/legal/analyze', {
      method: 'POST',
      body: JSON.stringify({ evidenceId: evidence.id }),
    }).then(r => r.json());

    return analysis;
  }
</script>

<div class="evidence-analyzer">
  <Card>
    <CardHeader>
      <CardTitle>🔍 Evidence Analysis Dashboard</CardTitle>
    </CardHeader>
    <CardContent>
      <SearchInput
        bind:value={searchQuery}
        placeholder="Search evidence..."
      />

      {#each evidenceList as evidence}
        <Card class="evidence-item">
          <CardContent>
            <h4>{evidence.title}</h4>
            <p>Confidence: {Math.round(evidence.confidence * 100)}%</p>
            <Button onclick={() => analyzeEvidence(evidence)}>
              🤖 Analyze with AI
            </Button>
          </CardContent>
        </Card>
      {/each}
    </CardContent>
  </Card>
</div>

<style>
  .evidence-analyzer {
    max-width: 1200px;
    margin: 0 auto;
    padding: 2rem;
  }

  .evidence-item {
    margin: 1rem 0;
    border-left: 4px solid var(--enhanced-bits-evidence);
  }
</style>
```

---

## 🔧 Advanced Features

### 1. Responsive Design

```svelte
<!-- src/lib/components/responsive/ResponsiveBoard.svelte -->
<script lang="ts">
  import { createResponsiveBoardLayout } from '$lib/utils/responsive-design';
  import { Card, CardContent } from '$lib/components/ui/enhanced-bits';

  let boardStyle = createResponsiveBoardLayout();
</script>

<div class="evidence-board" style={boardStyle}>
  <aside class="sidebar">
    <Card>
      <CardContent>
        🗂️ Evidence Categories
      </CardContent>
    </Card>
  </aside>

  <main class="main-content">
    <Card>
      <CardContent>
        📊 Main Evidence Display
      </CardContent>
    </Card>
  </main>

  <aside class="details">
    <Card>
      <CardContent>
        🔍 Analysis Details
      </CardContent>
    </Card>
  </aside>
</div>
```

### 2. Accessibility Integration

```svelte
<!-- src/lib/components/accessible/AccessibleEvidenceCard.svelte -->
<script lang="ts">
  import {
    Card,
    CardHeader,
    CardTitle,
    CardContent,
    createAccessibleColorPalette
  } from '$lib/components/ui/enhanced-bits';

  interface Props {
    evidence: {
      title: string;
      priority: 'low' | 'medium' | 'high' | 'critical';
      confidence: number;
    };
  }

  let { evidence }: Props = $props();

  let priorityColors = $derived(() => {
    const baseColor = {
      low: '#10b981',
      medium: '#f59e0b',
      high: '#ef4444',
      critical: '#dc2626'
    }[evidence.priority];

    return createAccessibleColorPalette(baseColor);
  });

  let ariaLabel = $derived(() =>
    `Evidence: ${evidence.title}, Priority: ${evidence.priority}, Confidence: ${Math.round(evidence.confidence * 100)}%`
  );
</script>

<Card
  role="article"
  tabindex="0"
  aria-label={ariaLabel}
  style=\"border-color: {priorityColors[500]}\"
>
  <CardHeader>
    <CardTitle>{evidence.title}</CardTitle>
  </CardHeader>
  <CardContent>
    <div
      class="confidence-bar"
      role="progressbar"
      aria-valuenow={Math.round(evidence.confidence * 100)}
      aria-valuemin="0"
      aria-valuemax="100"
      style=\"
        width: {evidence.confidence * 100}%;
        background: {priorityColors[500]};
      \"
    ></div>
  </CardContent>
</Card>

<style>
  .confidence-bar {
    height: 8px;
    border-radius: 4px;
    transition: width 300ms ease;
  }
</style>
```

---

## 📋 Quick Reference

### Essential Imports
```typescript
// Core components (always available)
import {
  Button,
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  Dialog,
  Input,
  Label
} from '$lib/components/ui/enhanced-bits';

// Compound components
import * as Card from '$lib/components/ui/card';
import * as Dialog from '$lib/components/ui/dialog';

// Dynamic loading
import { loadComponent } from '$lib/components/ui/enhanced-bits';

// Theme utilities
import {
  createCustomTheme,
  applyDesignSystemToDocument,
  NESDesignSystem
} from '$lib/components/ui/enhanced-bits';
```

### Common Patterns
```svelte
<!-- Basic card -->
<Card>
  <CardHeader>
    <CardTitle>Title</CardTitle>
  </CardHeader>
  <CardContent>
    Content goes here
  </CardContent>
</Card>

<!-- Compound style -->
<Card.Root>
  <Card.Header>
    <Card.Title>Title</Card.Title>
  </Card.Header>
  <Card.Content>
    Content goes here
  </Card.Content>
</Card.Root>

<!-- With custom styling -->
<Card style=\"border-color: var(--enhanced-bits-evidence)\">
  <CardContent>
    Custom styled content
  </CardContent>
</Card>
```

---

## ✅ Next Steps

1. **Start with basic components** - Import and use Button, Card, Input
2. **Try compound syntax** - Use `* as Card` pattern for shadcn-style
3. **Apply themes** - Test NES, minimal, and custom themes
4. **Add dynamic loading** - Use `loadComponent()` for advanced components
5. **Integrate with your legal AI** - Connect to your existing services

**You're ready to build with Enhanced-Bits! 🚀**