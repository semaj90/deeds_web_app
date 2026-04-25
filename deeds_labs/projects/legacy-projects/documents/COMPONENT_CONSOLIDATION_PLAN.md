# Component Consolidation Plan

## Current State: 832 Components → Target: ~200 Components

### Phase 1: Archive Unused Components
Create archive directory and move test/demo/unused components:
```bash
mkdir -p src/lib/components/_archive
```

**Directories to Archive:**
- `storybook/` - Test components
- `stories/` - Storybook stories
- `tests/` - Test components
- `demo/` - Demo components
- `examples/` - Example components
- `dev/` - Development components

### Phase 2: Consolidate UI Components

**Current UI Directories (to merge):**
- `ui/` - Main UI components
- `ui/enhanced-bits/` - Enhanced bits-ui components
- `ui/bits-ui/` - Original bits-ui
- `nes/` - NES.css components
- `gaming/` - Gaming UI components
- `custom/` - Custom components

**Target Structure:**
```
src/lib/components/ui/
├── core/           # Button, Card, Dialog, Input, etc.
├── bits/           # All bits-ui based components
├── nes/            # NES.css gaming components
└── index.ts        # Central exports
```

### Phase 3: Consolidate AI Components

**Current AI Directories (to merge):**
- `ai/` - Main AI components
- `legal-ai/` - Legal-specific AI
- `cognitive/` - Cognitive components
- `neural/` - Neural components
- `enhanced-rag/` - RAG components
- `copilot/` - Copilot components

**Target Structure:**
```
src/lib/components/ai/
├── chat/           # All chat interfaces
├── legal/          # Legal-specific AI
├── rag/            # RAG components
├── webgpu/         # GPU acceleration
└── wasm/           # WebAssembly components
```

### Phase 4: Keep Essential Directories

**Directories to Keep (already well-organized):**
- `layout/` - Navigation, headers, footers (keep as-is)
- `forms/` - Form components (keep as-is)
- `webgpu/` - WebGPU components (3 files, keep as-is)
- `legal/` - Legal-specific non-AI components (keep as-is)

### Phase 5: Update Import Paths

**Import Path Mapping:**
```typescript
// OLD
import Button from '$lib/components/ui/Button.svelte';
import { Card } from '$lib/components/ui/enhanced-bits';
import Dialog from '$lib/components/ui/MeltDialog.svelte';

// NEW
import { Button, Card, Dialog } from '$lib/components/ui';
```

## Implementation Steps

### Step 1: Create Archive (Safe - No Breaking Changes)
```bash
# Create archive and move test/demo directories
mkdir -p src/lib/components/_archive
mv src/lib/components/storybook src/lib/components/_archive/
mv src/lib/components/demo src/lib/components/_archive/
mv src/lib/components/examples src/lib/components/_archive/
mv src/lib/components/tests src/lib/components/_archive/
mv src/lib/components/dev src/lib/components/_archive/
```

### Step 2: Create New UI Structure
```bash
# Create new UI structure
mkdir -p src/lib/components/ui/core
mkdir -p src/lib/components/ui/bits
mkdir -p src/lib/components/ui/nes
```

### Step 3: Move and Consolidate Components
```bash
# Move primary UI components to core/
mv src/lib/components/ui/Button.svelte src/lib/components/ui/core/
mv src/lib/components/ui/MeltDialog.svelte src/lib/components/ui/core/Dialog.svelte

# Move enhanced-bits to bits/
mv src/lib/components/ui/enhanced-bits/* src/lib/components/ui/bits/

# Move NES components
mv src/lib/components/nes/* src/lib/components/ui/nes/
mv src/lib/components/gaming/* src/lib/components/ui/nes/
```

### Step 4: Create Central Export Files
```typescript
// src/lib/components/ui/index.ts
export { default as Button } from './core/Button.svelte';
export { default as Dialog } from './core/Dialog.svelte';
export * from './bits';
export * from './nes';
```

## Component Usage Analysis

### Most Used Components (Keep These):
1. **UI Components:**
   - Button (used in 50+ routes)
   - Card, CardHeader, CardContent (30+ routes)
   - Dialog components (20+ routes)
   - Input, Textarea (15+ routes)

2. **Layout Components:**
   - NavBar (all auth routes)
   - Sidebar (all auth routes)
   - EnhancedLayout (case routes)

3. **AI Components:**
   - AIAssistant variations (10+ routes)
   - Legal AI chat interfaces (5+ routes)
   - WebGPU components (3 components)

### Components to Remove/Archive:
- 200+ duplicate AI chat components
- 100+ test/demo components
- 50+ unused visualization components
- 30+ duplicate form components

## Expected Results

### Before:
- 832 total components
- 70+ component directories
- Duplicate imports everywhere
- ~100,000 TypeScript errors

### After:
- ~200 total components
- 6 main directories
- Clean import paths
- ~25,000 TypeScript errors (75% reduction)

## Risk Mitigation

1. **Archive, Don't Delete:** Move unused components to `_archive` directory
2. **Test Critical Routes:** Test these routes after consolidation:
   - `/cases` - Main legal case management
   - `/ai-assistant` - Primary AI interface
   - `/aiassistant` - Alternative AI interface
   - `/all-routes` - Route index page

3. **Rollback Plan:** Keep backups of:
   - Original component structure
   - Import mapping document
   - Git commit before consolidation

## Timeline

- **Day 1:** Archive unused components (2 hours)
- **Day 2:** Consolidate UI components (4 hours)
- **Day 3:** Consolidate AI components (4 hours)
- **Day 4:** Update import paths (6 hours)
- **Day 5:** Testing and fixes (4 hours)

Total: ~20 hours of work

## Success Metrics

1. Component count: 832 → ~200 (75% reduction)
2. TypeScript errors: ~100,000 → ~25,000 (75% reduction)
3. Build time: Expected 50% improvement
4. Bundle size: Expected 40% reduction
5. All critical routes still functional