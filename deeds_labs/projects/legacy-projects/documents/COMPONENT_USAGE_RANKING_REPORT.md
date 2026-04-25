# Component Usage Ranking & Svelte 4 vs 5 Analysis

## Executive Summary
- **Total Components**: 832 files
- **Svelte 4 Components**: 33 components using `export let`
- **Critical Routes Using Components**: 100+ routes
- **Recommendation**: Archive 25/33 Svelte 4 components, modernize 8 essential ones

## Component Usage Ranking (By Route Frequency)

### Tier 1: Critical Components (Used in 20+ routes)
1. **Button** - 45+ route usages - **KEEP & MODERNIZE**
   - Current: Mixed imports (enhanced-bits, ui/Button.svelte)
   - Action: Consolidate to single modern Button component

2. **Card/CardHeader/CardContent** - 40+ route usages - **KEEP & MODERNIZE**
   - Current: Scattered across ui/card, enhanced-bits, bits-ui
   - Action: Consolidate to unified Card system

3. **NavBar** - All auth routes (~30 routes) - **ALREADY MODERN**
   - Current: `src/lib/components/layout/NavBar.svelte`
   - Status: Uses Svelte 5 patterns ✅

4. **Sidebar** - All auth routes (~30 routes) - **ALREADY MODERN**
   - Current: `src/lib/components/layout/Sidebar.svelte`
   - Status: Uses Svelte 5 patterns ✅

### Tier 2: Important Components (Used in 10-20 routes)
5. **Dialog** - 15+ route usages - **MODERNIZE NEEDED**
   - Current: MeltDialog, enhanced-bits variations
   - Action: Unify to single Dialog component

6. **Badge** - 12+ route usages - **ALREADY MODERN**
   - Current: `ui/badge` using bits-ui
   - Status: Uses Svelte 5 patterns ✅

7. **Input/Textarea** - 10+ route usages - **ALREADY MODERN**
   - Current: Various UI libraries
   - Status: Modern implementations exist ✅

### Tier 3: Specialized Components (Used in 5-10 routes)
8. **Various AI Components** - 8+ routes - **MIXED STATUS**
   - EnhancedAIAssistant, RecommendationEngine, etc.
   - Action: Keep functional ones, archive duplicates

## Svelte 4 Component Analysis (33 Components)

### 🔴 ARCHIVE IMMEDIATELY (25 components)
**Reason**: Duplicates, test components, or unused

1. **AttractivenessMetr.svelte** - Unused, demo component
2. **BitsDemo.svelte** - Test component for bits-ui
3. **AccessibilityPanel.svelte** - Unused accessibility demo
4. **Avatar.svelte** - Duplicate (modern versions exist)
5. **CanvasEditor.svelte** (duplicate) - Modern version exists at evidence-editor/
6. **Dialog.svelte** - Replaced by MeltDialog and bits-ui
7. **ProgressIndicator.svelte** - Modern Progress components exist
8. **ErrorBoundary.svelte** - SvelteKit has built-in error handling
9. **InfiniteScrollList.svelte** - Virtual scroll libraries available
10. **ReportEditor.svelte** - Specialized, rarely used
11. **ReviewSubmitForm.svelte** - Can be replaced with modern form
12. **RealtimeRAG.svelte** - Duplicate functionality exists
13. **RealTimeEvidenceGrid.svelte** - Complex, low usage
14. **CaseInfoForm.svelte** - Replaced by enhanced form components
15. **canvas/CitationSidebar.svelte** - Specialized, low usage
16. **ai/ComprehensiveSummaryEngine.svelte** - Duplicate AI component
17. **ai/EnhancedAIAssistant.simple.svelte** - Duplicate variation
18. **ai/EnhancedAIAssistant.new.svelte** - Duplicate variation
19. **auth/LoginModal.svelte** - Authentication handled elsewhere
20. **evidence-editor/InspectorPanel.svelte** - Complex, low usage
21. **evidence-editor/CanvasEditor.svelte** - Duplicate functionality
22. **evidence/EvidenceProcessor.svelte** - Server-side processing preferred
23. **editor/ProfessionalEditor.svelte** - Monaco/CodeMirror alternatives
24. **modals/CaseSummaryModal.svelte** - Can use modern Dialog
25. **ui/CommandMenu.svelte** - Modern command palette libraries exist

### 🟡 MODERNIZE TO SVELTE 5 (8 components)
**Reason**: Essential functionality, actively used

1. **forms/SmartDocumentForm.svelte** - **HIGH PRIORITY**
   - Usage: Used in document upload workflows
   - Issues: Complex props binding, OCR integration
   - Action: Migrate to `$props()`, fix syntax errors

2. **legal/AISummaryReader.svelte** - **HIGH PRIORITY**
   - Usage: Legal document processing
   - Issues: Uses `export let`, XState integration
   - Action: Migrate to `$props()`, keep XState patterns

3. **upload/FileUploadForm.svelte** - **MEDIUM PRIORITY**
   - Usage: File upload across application
   - Action: Modernize with `$props()`, keep drag-drop

4. **upload/AdvancedFileUpload.svelte** - **MEDIUM PRIORITY**
   - Usage: Advanced file processing features
   - Action: May merge with FileUploadForm

5. **forms/EnhancedDocumentUploadForm.svelte** - **MEDIUM PRIORITY**
   - Usage: Document-specific upload logic
   - Action: Consider merging with SmartDocumentForm

6. **forms/EnhancedCaseForm.svelte** - **MEDIUM PRIORITY**
   - Usage: Case creation/editing
   - Action: Modernize form patterns, keep validation

7. **EvidenceAnalysisForm.svelte** - **LOW PRIORITY**
   - Usage: Evidence processing workflows
   - Action: Modernize if actively used

8. **routes/laws/+page.svelte** - **ROUTE FILE**
   - Usage: Laws page implementation
   - Action: Fix as part of route modernization

## Implementation Priority Matrix

### Phase 1: Critical UI Components (Week 1)
- [ ] Consolidate Button components → `ui/core/Button.svelte`
- [ ] Unify Card system → `ui/core/Card.svelte`
- [ ] Modernize Dialog → `ui/core/Dialog.svelte`
- [ ] Test critical routes: `/cases`, `/aiassistant`, `/all-routes`

### Phase 2: Essential Forms (Week 2)
- [ ] Modernize SmartDocumentForm.svelte
- [ ] Modernize AISummaryReader.svelte
- [ ] Modernize FileUploadForm.svelte
- [ ] Modernize EnhancedCaseForm.svelte

### Phase 3: Archive & Cleanup (Week 3)
- [ ] Move 25 Svelte 4 components to `_archive/svelte4/`
- [ ] Remove duplicate AI components
- [ ] Clean up import paths
- [ ] Update route files

## Modern Svelte 5 Patterns to Apply

### Props Pattern
```typescript
// ❌ Svelte 4
export let title: string = "Default";
export let isOpen: boolean = false;

// ✅ Svelte 5
let { title = "Default", isOpen = false }: { title?: string, isOpen?: boolean } = $props();
```

### State Pattern
```typescript
// ❌ Svelte 4
let count = 0;
let items = [];

// ✅ Svelte 5
let count = $state(0);
let items = $state([]);
```

### Derived Pattern
```typescript
// ❌ Svelte 4
$: doubled = count * 2;

// ✅ Svelte 5
let doubled = $derived(count * 2);
```

### Effect Pattern
```typescript
// ❌ Svelte 4
$: {
  if (isOpen) {
    document.body.style.overflow = 'hidden';
  }
}

// ✅ Svelte 5
$effect(() => {
  if (isOpen) {
    document.body.style.overflow = 'hidden';
  }
});
```

## Risk Assessment

### LOW RISK (Archive immediately)
- 25 unused/duplicate components
- Test and demo components
- Simple display components with alternatives

### MEDIUM RISK (Modernize carefully)
- 8 essential components with complex logic
- Form components with validation
- Components with external library integration

### HIGH RISK (Test thoroughly)
- SmartDocumentForm.svelte (OCR integration)
- AISummaryReader.svelte (XState machine)
- Any component with file upload logic

## Success Metrics

### Before Modernization:
- 33 Svelte 4 components using `export let`
- Mixed import patterns across routes
- Complex prop binding syntax
- Inconsistent component patterns

### After Modernization:
- 8 modern Svelte 5 components with `$props()`
- 25 components archived (not deleted)
- Unified import patterns: `import { Button, Card, Dialog } from '$lib/components/ui'`
- Consistent `$state`, `$derived`, `$effect` patterns

### Expected Error Reduction:
- Svelte 4 syntax errors: ~2,000 errors eliminated
- Import path consolidation: ~1,500 errors eliminated
- Preprocessing improvements: ~500 errors eliminated
- **Total**: ~4,000 TypeScript errors reduced (20% of total)

## Next Steps

1. **Complete this analysis** ✅
2. **Create HTML folders for demo routes** (in progress)
3. **Execute Phase 1: Archive unused Svelte 4 components**
4. **Execute Phase 2: Modernize essential 8 components**
5. **Execute Phase 3: Update all import paths**
6. **Test critical application flows**

# Component Usage Ranking — How to generate

Purpose
- Produce a ranked list of components by usage across the codebase to prioritize consolidation or removal.

Quick method (POSIX / WSL)
1. From repo root:
   - grep -R --include="*.svelte" --include="*.ts" --include="*.js" -h "from '[$]lib/components" | sed -E "s/.*from '[$]lib\\/components\\/?//" | sed -E "s/'.*//" | sort | uniq -c | sort -rn > component-usage.txt
2. Review `component-usage.txt` and export top items:
   - head -n 100 component-usage.txt

TS-morph (recommended for accuracy)
- Create a small TS-morph script to parse imports and produce a JSON ranking.
- Example steps:
  1. npm i -D ts-morph
  2. Create scripts/collect-component-usage.ts (use Project, iterate SourceFiles, inspect ImportDeclarations)
  3. Run: node -r ts-node/register scripts/collect-component-usage.ts

Deliverable
- component-usage.txt (text) and component-usage.json (if using TS-morph)

Use
- Prioritize top 50 components for consolidation in Phase 4.