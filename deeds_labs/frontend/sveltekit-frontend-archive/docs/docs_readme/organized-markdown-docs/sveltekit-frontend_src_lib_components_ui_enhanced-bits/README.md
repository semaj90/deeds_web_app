# Enhanced Bits UI v2 Integration with Svelte 5 & UnoCSS

A comprehensive integration of Bits UI v2 components enhanced with Svelte 5 runes, UnoCSS styling, and specialized features for legal AI applications with NieR theming.

## Features

### 🚀 Core Technologies

- **Svelte 5 Runes**: Modern reactive state management with `$state`, `$derived`, `$effect`
- **Bits UI v2.8.13**: Headless, accessible component primitives
- **UnoCSS 66.3.3**: Atomic CSS with custom NieR theme shortcuts
- **TypeScript**: Full type safety with comprehensive interfaces
- **Legal AI Context**: Specialized components for evidence management and case analysis

### 🎨 NieR Theming

- Custom color palette inspired by NieR: Automata
- Gothic typography with MS Gothic and JetBrains Mono fonts
- Evidence board styling with grid patterns
- Priority indicators and confidence badges
- AI status indicators with animations

### ⚡ Performance Optimizations

- Tree-shaking support for optimal bundle sizes
- Lazy loading for non-critical components
- Virtual scrolling for large evidence lists
- Memoization for expensive computations
- Resource pooling for heavy operations

## Quick Start

### Installation

```bash
npm install bits-ui@^2.8.13 unocss@^66.3.3
```

### Basic Usage

```svelte
<script>
  import { Button, Dialog, Select, Input, Card } from '$lib/components/ui/enhanced-bits';

  let dialogOpen = $state(false);
  let selectedCase = $state('');
</script>

<!-- Enhanced Button with legal context -->
<Button variant="yorha" legal priority="high" on:click={() => dialogOpen = true}>
  Critical Evidence Review
</Button>

<!-- Legal AI Dialog -->
<Dialog bind:open={dialogOpen} legal evidenceAnalysis>
  <div slot="content">
    <h2>Evidence Analysis</h2>
    <!-- Dialog content -->
  </div>
</Dialog>
```

## Component Reference

### Button Component

Enhanced button with legal AI features and NieR theming.

```svelte
<Button
  variant="yorha"          // Button style variant
  size="md"               // Button size
  legal={true}            // Enable legal context styling
  priority="critical"     // Priority level indicator
  confidence="high"       // AI confidence level
  loading={false}         // Loading state
  fullWidth={false}       // Full width option
>
  Button Text
</Button>
```

**Variants**: `default`, `primary`, `destructive`, `outline`, `secondary`, `ghost`, `link`, `yorha`, `crimson`, `gold`

**Sizes**: `sm`, `md`, `lg`, `icon`

**Priorities**: `critical`, `high`, `medium`, `low`

**Confidence**: `high`, `medium`, `low`

### Dialog Component

Modal dialogs optimized for legal workflows.

```svelte
<Dialog
  bind:open={dialogOpen}
  size="lg"               // Dialog size
  legal={true}            // Legal context styling
  evidenceAnalysis={true} // Evidence analysis mode
  caseManagement={false}  // Case management mode
  modal={true}            // Modal behavior
>
  <div slot="content">
    <!-- Dialog content -->
  </div>
</Dialog>
```

**Sizes**: `sm`, `md`, `lg`, `xl`, `full`

### Select Component

Enhanced select with categorized options and AI recommendations.

```svelte
<script>
  const caseTypes = [
    { value: 'criminal', label: 'Criminal Cases', category: 'Type' },
    { value: 'civil', label: 'Civil Litigation', category: 'Type' }
  ];
</script>

<Select
  bind:value={selectedValue}
  options={caseTypes}
  placeholder="Select case type..."
  legal={true}
  caseType={true}
  aiRecommendations={true}
  error={false}
  errorMessage=""
/>
```

### Input Component

Smart inputs with AI assistance and legal validation.

```svelte
<Input
  variant="search"         // Input variant
  bind:value={searchQuery}
  legal={true}            // Legal context styling
  evidenceSearch={true}   // Evidence search mode
  aiAssisted={true}       // AI assistance indicator
  showCharCount={true}    // Character counter
  maxLength={200}         // Maximum length
  icon={SearchIcon}       // Icon component
  iconPosition="left"     // Icon position
/>
```

**Variants**: `default`, `search`, `password`, `email`, `legal`, `evidence`

### Card Component

Interactive cards for evidence and case management.

```svelte
<Card
  variant="evidence"      // Card variant
  evidenceCard={true}     // Evidence card mode
  legal={true}           // Legal context styling
  priority="high"        // Priority indicator
  confidence="medium"    // AI confidence level
  clickable={true}       // Clickable behavior
  hoverable={true}       // Hover effects
  selected={false}       // Selected state
>
  <!-- Card content -->
</Card>
```

**Variants**: `default`, `elevated`, `outline`, `ghost`, `yorha`, `evidence`, `case`

## Advanced Features

### Vector Intelligence Integration

```svelte
<script>
  import { VectorIntelligenceDemo } from '$lib/components/ui/enhanced-bits';
</script>

<VectorIntelligenceDemo />
```

Features semantic search, entity extraction, and confidence scoring for legal documents.

### Performance Optimization

```typescript
import {
  componentFactory,
  performanceMonitor,
  createDebouncedSearch,
  VirtualScrollManager,
} from "$lib/components/ui/enhanced-bits/performance";

// Lazy load components
const Button = await componentFactory.getComponent("Button");

// Debounced search
const debouncedSearch = createDebouncedSearch(searchAPI, 300);

// Virtual scrolling for large lists
const virtualScroll = new VirtualScrollManager({
  itemHeight: 100,
  bufferSize: 5,
});
```

### Custom Theming

```typescript
import { cn, legalClasses, getAIConfidenceClass } from "$lib/utils/cn";

// Use predefined legal classes
const buttonClass = cn(
  legalClasses.yorha.button,
  legalClasses.priority.critical,
);

// Dynamic confidence classes
const confidenceClass = getAIConfidenceClass(85); // ai-confidence-80
```

## UnoCSS Shortcuts

### NieR/YoRHa Components

- `yorha-button` - Basic YoRHa button styling
- `yorha-button-primary` - Primary YoRHa button
- `yorha-card` - YoRHa card container
- `yorha-panel` - YoRHa panel layout
- `yorha-input` - YoRHa input field

### Evidence Management

- `yorha-evidence-board` - Evidence board background
- `yorha-evidence-item` - Evidence card styling
- `yorha-drop-zone` - File drop zone
- `yorha-priority-critical` - Critical priority indicator

### AI System

- `ai-status-indicator` - AI status dot
- `ai-status-online` - Online status (green)
- `ai-status-processing` - Processing status (animated)
- `vector-search-input` - Vector search input
- `vector-confidence-high` - High confidence badge

### Hybrid Classes

- `nier-bits-card` - Combined NieR + Bits UI card
- `nier-bits-button` - Combined NieR + Bits UI button
- `nier-bits-input` - Combined NieR + Bits UI input

## Type Definitions

### Core Types

```typescript
export type LegalPriority = "critical" | "high" | "medium" | "low";
export type AIConfidence = "high" | "medium" | "low";
export type ComponentSize = "sm" | "md" | "lg" | "xl";

export interface EvidenceItem {
  id: string;
  title: string;
  type: "document" | "image" | "video" | "audio" | "transcript";
  priority: LegalPriority;
  confidence?: AIConfidence;
  tags: string[];
  metadata: Record<string, any>;
}

export interface VectorSearchResult {
  id: string;
  content: string;
  score: number;
  highlights: string[];
  source: {
    type: "document" | "case" | "precedent";
    name: string;
    url?: string;
  };
}
```

## Configuration

### Theme Configuration

```typescript
export const DEFAULT_THEME_CONFIG = {
  mode: "light",
  legal: true,
  nierTheme: true,
};
```

### Performance Configuration

```typescript
export const DEFAULT_PERFORMANCE_CONFIG = {
  enableTreeShaking: true,
  lazyLoadComponents: true,
  enableVirtualization: false,
  debounceDelay: 300,
};
```

## Best Practices

### Component Usage

1. Always use `legal={true}` for legal context components
2. Provide appropriate `priority` and `confidence` props
3. Use `bind:` for two-way data binding with Svelte 5 runes
4. Implement proper error handling with `error` and `errorMessage` props

### Performance

1. Use lazy loading for heavy components like `VectorIntelligenceDemo`
2. Implement virtual scrolling for lists > 100 items
3. Debounce search inputs with 300ms delay
4. Monitor performance metrics in development

### Accessibility

1. All components include proper ARIA attributes
2. Keyboard navigation is fully supported
3. Screen reader optimizations are included
4. High contrast mode support available

### Styling

1. Use UnoCSS shortcuts instead of custom CSS when possible
2. Follow NieR theming conventions for consistency
3. Implement proper dark mode support
4. Use legal-specific classes for context

## Examples

### Complete Evidence Management Interface

```svelte
<script>
  import { Button, Dialog, Select, Input, Card } from '$lib/components/ui/enhanced-bits';

  let evidenceItems = $state([]);
  let searchQuery = $state('');
  let selectedFilter = $state('all');
  let uploadDialogOpen = $state(false);
</script>

<div class="yorha-evidence-board">
  <!-- Search and Filters -->
  <div class="flex gap-4 mb-6">
    <Input
      variant="search"
      bind:value={searchQuery}
      placeholder="Search evidence..."
      evidenceSearch
      legal
      class="flex-1"
    />

    <Select
      bind:value={selectedFilter}
      options={filterOptions}
      evidenceCategory
      legal
    />

    <Button
      variant="yorha"
      legal
      on:click={() => uploadDialogOpen = true}
    >
      Upload Evidence
    </Button>
  </div>

  <!-- Evidence Grid -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each evidenceItems as item (item.id)}
      <Card
        variant="evidence"
        evidenceCard
        legal
        priority={item.priority}
        confidence={item.confidence}
        clickable
        hoverable
      >
        <h3 class="font-semibold">{item.title}</h3>
        <p class="text-sm text-muted-foreground">{item.description}</p>
      </Card>
    {/each}
  </div>

  <!-- Upload Dialog -->
  <Dialog bind:open={uploadDialogOpen} legal evidenceAnalysis>
    <div slot="content">
      <!-- Upload form content -->
    </div>
  </Dialog>
</div>
```

## Browser Support

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Full support (with CSS custom properties polyfill for older versions)
- **Mobile**: Responsive design with touch support

## Dependencies

### Required

- `svelte: ^5.14.2`
- `bits-ui: ^2.8.13`
- `unocss: ^66.3.3`
- `clsx: ^2.0.0`
- `tailwind-merge: ^2.2.0`

### Recommended

- `lucide-svelte: ^0.474.0` (for icons)
- `@unocss/transformer-compile-class: ^66.3.3`
- `@unocss/svelte-scoped: ^66.3.3`

## Contributing

When contributing to this component library:

1. Follow Svelte 5 runes patterns
2. Maintain TypeScript strict mode compliance
3. Add comprehensive JSDoc comments
4. Include performance considerations
5. Test accessibility with screen readers
6. Validate legal AI context functionality

## License

This enhanced component library maintains the same license as the base Bits UI library while adding value through legal AI specialization and NieR theming.
