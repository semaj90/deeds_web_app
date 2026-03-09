# Enhanced Bits UI Library Documentation

**Version:** 2.0
**Framework:** Svelte 5 + Runes
**Styling:** UnoCSS + NES.css + NieR Theming
**Domain:** Legal AI Platform

## Overview

Enhanced Bits is a comprehensive UI component library specifically built for Legal AI applications. It combines the retro aesthetics of NES.css with modern Svelte 5 runes, UnoCSS utility classes, and NieR-inspired theming to create a unique and functional interface for legal professionals.

## Key Features

- ✅ **Svelte 5 Native**: Built with modern runes (`$props()`, `$state()`, `$derived()`, `$effect()`)
- ✅ **SSR-Friendly**: All components support server-side rendering
- ✅ **Compound Components**: Flexible `.Root`, `.Header`, `.Content` structure
- ✅ **Legal Domain Types**: Built-in interfaces for evidence, cases, and AI analysis
- ✅ **NieR Theming**: Dystopian sci-fi aesthetic perfect for legal tech
- ✅ **TypeScript First**: Full type safety with legal domain models
- ✅ **UnoCSS Integration**: Atomic CSS with legal-specific utilities

## Installation & Import

```typescript
// Individual component imports
import { Card, Button, Input, Alert } from '$lib/components/ui/enhanced-bits';

// Compound component usage
import { Card } from '$lib/components/ui/enhanced-bits';
// Use as: <Card.Root>, <Card.Header>, <Card.Content>, <Card.Footer>

// Type imports
import type { EvidenceItem, CaseData, AIAnalysis } from '$lib/components/ui/enhanced-bits';
```

## Core Components

### Card System

The Card component supports both simple and compound usage patterns:

```svelte
<!-- Simple usage -->
<Card class="nes-container is-rounded">
  <div class="yorha-panel-header">
    <h3>Evidence Analysis</h3>
  </div>
  <div class="yorha-panel-content">
    <p>Content goes here...</p>
  </div>
</Card>

<!-- Compound usage -->
<Card.Root class="nes-container is-rounded">
  <Card.Header>
    <Card.Title>Evidence #{item.id}</Card.Title>
    <Card.Description>Uploaded {formatDate(item.createdAt)}</Card.Description>
  </Card.Header>
  <Card.Content>
    <!-- Evidence content -->
  </Card.Content>
  <Card.Footer>
    <Button variant="primary">Analyze</Button>
    <Button variant="outline">Archive</Button>
  </Card.Footer>
</Card.Root>
```

**Available Card Components:**
- `Card` / `Card.Root` - Main container
- `Card.Header` - Header section with title/description
- `Card.Title` - Primary heading
- `Card.Description` - Secondary text
- `Card.Content` - Main content area
- `Card.Footer` - Action area

### Button Component

```svelte
<Button
  variant="primary"
  size="md"
  class="nes-btn is-primary"
  onclick={() => handleAnalyze()}
>
  <i class="i-lucide-brain w-4 h-4" />
  Analyze Evidence
</Button>
```

**Button Variants:**
- `primary` - Primary actions (blue)
- `secondary` - Secondary actions (gray)
- `success` - Positive actions (green)
- `warning` - Caution actions (yellow)
- `error` - Destructive actions (red)
- `ghost` - Minimal styling
- `outline` - Outlined style

### Input Component

```svelte
<Input
  type="text"
  placeholder="Search evidence..."
  class="nes-input"
  bind:value={searchQuery}
/>
```

### Alert Component

```svelte
<Alert variant="warning" class="nes-container is-dark">
  <AlertDescription>
    This evidence requires additional verification before proceeding.
  </AlertDescription>
</Alert>
```

### Dialog Component

```svelte
<Dialog.Root>
  <Dialog.Trigger>
    <Button>Open Case Details</Button>
  </Dialog.Trigger>
  <Dialog.Content class="nes-dialog">
    <Dialog.Title>Case Analysis Report</Dialog.Title>
    <Dialog.Description>
      Detailed analysis of Case #{caseId}
    </Dialog.Description>
    <!-- Dialog content -->
  </Dialog.Content>
</Dialog.Root>
```

### Select Component

```svelte
<Select.Root bind:value={evidenceType}>
  <Select.Trigger class="nes-select">
    <Select.Value placeholder="Select evidence type" />
  </Select.Trigger>
  <Select.Content>
    {#each EVIDENCE_TYPES as type}
      <Select.Item value={type}>
        {type.charAt(0).toUpperCase() + type.slice(1)}
      </Select.Item>
    {/each}
  </Select.Content>
</Select.Root>
```

## Legal Domain Types

### Evidence Item

```typescript
interface EvidenceItem {
  id: string;
  title: string;
  type: "document" | "image" | "video" | "audio" | "transcript";
  priority: "critical" | "high" | "medium" | "low";
  confidence: number; // 0-1 AI confidence score
  metadata?: Record<string, unknown>;
  createdAt: Date;
  updatedAt: Date;
}
```

### Case Data

```typescript
interface CaseData {
  id: string;
  title: string;
  type: string;
  status: "active" | "closed" | "pending";
  evidence: EvidenceItem[];
  priority: "critical" | "high" | "medium" | "low";
  assignedTo?: string;
}
```

### AI Analysis

```typescript
interface AIAnalysis {
  confidence: number;
  entities: Array<{
    text: string;
    type: string;
    confidence: number;
  }>;
  themes: Array<{
    topic: string;
    weight: number;
  }>;
  summary: string;
}
```

### Vector Search Result

```typescript
interface VectorSearchResult {
  id: string;
  score: number;
  content: string;
  metadata?: Record<string, any>;
  embedding?: number[];
  highlights?: string[];
}
```

## Utility Functions

```typescript
import { cn, legalCn, confidenceClass, priorityClass } from '$lib/components/ui/enhanced-bits';

// Combine CSS classes with legal-specific logic
const cardClasses = legalCn(
  "nes-container",
  confidenceClass(evidence.confidence),
  priorityClass(evidence.priority),
  className
);
```

**Available Utilities:**
- `cn()` - Standard class name merging
- `legalCn()` - Legal domain-aware class merging
- `confidenceClass(score)` - AI confidence styling
- `priorityClass(level)` - Priority level styling

## Constants

```typescript
// Available evidence types
const EVIDENCE_TYPES = ["document", "image", "video", "audio", "transcript"] as const;

// Priority levels
const PRIORITY_LEVELS = ["critical", "high", "medium", "low"] as const;

// Case types
const CASE_TYPES = [
  "criminal",
  "civil",
  "corporate",
  "employment",
  "intellectual_property"
] as const;
```

## Theming

### NieR-Inspired Classes

```css
/* YoRHa panel styling */
.yorha-panel-header {
  border-bottom: 1px solid var(--nier-border);
  padding-bottom: 0.75rem;
}

.yorha-panel-content {
  padding-top: 1rem;
}

/* Confidence indicators */
.confidence-high { border-left: 4px solid #10b981; }
.confidence-medium { border-left: 4px solid #f59e0b; }
.confidence-low { border-left: 4px solid #ef4444; }

/* Priority indicators */
.priority-critical { background: linear-gradient(135deg, #dc2626, #b91c1c); }
.priority-high { background: linear-gradient(135deg, #ea580c, #c2410c); }
.priority-medium { background: linear-gradient(135deg, #ca8a04, #a16207); }
.priority-low { background: linear-gradient(135deg, #65a30d, #4d7c0f); }
```

### UnoCSS Integration

Enhanced Bits works seamlessly with UnoCSS atomic classes:

```svelte
<Card class="nes-container is-rounded hover:shadow-lg transition-shadow">
  <div class="flex items-center gap-3 p-4">
    <i class="i-lucide-file-text w-5 h-5 text-primary" />
    <div class="flex-1 min-w-0">
      <h3 class="font-semibold text-sm truncate">Document Title</h3>
      <p class="text-xs text-muted-foreground">metadata info</p>
    </div>
  </div>
</Card>
```

## Usage Examples

### Evidence Card Component

```svelte
<script lang="ts">
  import { Card, Button } from '$lib/components/ui/enhanced-bits';
  import type { EvidenceItem } from '$lib/components/ui/enhanced-bits';

  let { evidence }: { evidence: EvidenceItem } = $props();

  function handleAnalyze() {
    // AI analysis logic
  }
</script>

<Card class="nes-container is-rounded group hover:shadow-md transition-shadow">
  <div class="yorha-panel-header pb-3">
    <div class="flex items-center justify-between">
      <h3 class="font-semibold">{evidence.title}</h3>
      <span class="px-2 py-1 rounded text-xs font-medium bg-gray-200">
        {evidence.type}
      </span>
    </div>
  </div>

  <div class="yorha-panel-content">
    <!-- Evidence preview -->
    {#if evidence.confidence > 0}
      <div class="flex items-center gap-2 mb-3">
        <i class="i-lucide-brain w-4 h-4 text-primary" />
        <span class="text-xs">AI Confidence: {Math.round(evidence.confidence * 100)}%</span>
      </div>
    {/if}

    <div class="flex gap-2">
      <Button variant="primary" size="sm" onclick={handleAnalyze}>
        Analyze
      </Button>
      <Button variant="outline" size="sm">
        View Details
      </Button>
    </div>
  </div>
</Card>
```

### Case Management Interface

```svelte
<script lang="ts">
  import { Card, Select, Button, Alert, Input, Label } from '$lib/components/ui/enhanced-bits';
  import { CASE_TYPES, PRIORITY_LEVELS } from '$lib/components/ui/enhanced-bits';
  import type { CaseData } from '$lib/components/ui/enhanced-bits';

  let caseData = $state<CaseData>({
    id: 'case-001',
    title: '',
    type: 'criminal',
    status: 'active',
    evidence: [],
    priority: 'medium'
  });
</script>

<Card.Root class="nes-container is-rounded max-w-2xl">
  <Card.Header>
    <Card.Title>Create New Case</Card.Title>
    <Card.Description>Set up a new legal case with evidence tracking</Card.Description>
  </Card.Header>

  <Card.Content class="space-y-4">
    <div>
      <Label for="case-title">Case Title</Label>
      <Input id="case-title" bind:value={caseData.title} />
    </div>

    <div class="grid grid-cols-2 gap-4">
      <div>
        <Label>Case Type</Label>
        <Select.Root bind:value={caseData.type}>
          <Select.Trigger class="nes-select">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {#each CASE_TYPES as type}
              <Select.Item value={type}>{type}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>

      <div>
        <Label>Priority</Label>
        <Select.Root bind:value={caseData.priority}>
          <Select.Trigger class="nes-select">
            <Select.Value />
          </Select.Trigger>
          <Select.Content>
            {#each PRIORITY_LEVELS as priority}
              <Select.Item value={priority}>{priority}</Select.Item>
            {/each}
          </Select.Content>
        </Select.Root>
      </div>
    </div>

    {#if caseData.priority === 'critical'}
      <Alert variant="error">
        <AlertDescription>
          Critical cases require immediate attention and additional verification.
        </AlertDescription>
      </Alert>
    {/if}
  </Card.Content>

  <Card.Footer>
    <Button variant="primary">Create Case</Button>
    <Button variant="outline">Save Draft</Button>
  </Card.Footer>
</Card.Root>
```

## Architecture Notes

- **Component Structure**: All components follow the compound component pattern for maximum flexibility
- **Type Safety**: Every component includes comprehensive TypeScript definitions
- **Performance**: Built with Svelte 5 runes for optimal reactivity and performance
- **Accessibility**: ARIA attributes and semantic HTML throughout
- **Extensibility**: Easy to extend with custom legal domain components

## Migration from Standard UI Libraries

Enhanced Bits is designed to be a drop-in replacement for standard UI libraries with legal domain enhancements:

```typescript
// Before: Generic UI library
import { Card, Button } from '@some/ui-library';

// After: Enhanced Bits with legal domain support
import { Card, Button } from '$lib/components/ui/enhanced-bits';
import type { EvidenceItem } from '$lib/components/ui/enhanced-bits';
```

## Contributing

When adding new components to Enhanced Bits:

1. Follow Svelte 5 runes patterns (`$props()`, `$state()`, `$derived()`)
2. Include legal domain type definitions when applicable
3. Support both simple and compound usage patterns
4. Add comprehensive TypeScript interfaces
5. Include NieR theming and NES.css compatibility
6. Write usage examples and update this documentation

---

**Enhanced Bits UI Library** - Built for the future of legal technology with Svelte 5 and modern web standards.