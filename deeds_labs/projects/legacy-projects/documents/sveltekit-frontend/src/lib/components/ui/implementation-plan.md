# Bits UI v2 Implementation Plan - Legal AI Platform

## 🎯 Component Selection Strategy

Based on the analysis, **Bits UI v2** is the optimal choice because it offers:

### 🧩 **Exclusive Components Not Available in Melt UI:**
1. **Alert Dialog** - Critical for case deletion confirmations
2. **Button** - Essential for all interactions (✅ Already implemented)
3. **Command** - Perfect for global search/case finder (Ctrl+K style)
4. **Context Menu** - Right-click actions on evidence/cases
5. **Menubar** - Application-level navigation
6. **Navigation Menu** - Main site navigation
7. **PIN Input** - Secure access to sensitive evidence
8. **Time Field** - Precise timestamp entry for incidents
9. **Aspect Ratio** - Consistent evidence image display

## 📋 Implementation Priority Queue

### **Phase 1: Essential Foundation (Immediate)**
```typescript
// 1. Dialog System
import { Dialog } from 'bits-ui';
// Use case: Case details, evidence viewer, modal forms

// 2. Alert Dialog  
import { AlertDialog } from 'bits-ui';
// Use case: Destructive actions, confirmations

// 3. Command Palette
import { Command } from 'bits-ui'; 
// Use case: Global search, case finder, AI commands

// 4. Navigation Menu
import { NavigationMenu } from 'bits-ui';
// Use case: Main navigation, case categories
```

### **Phase 2: Core Interactions (Week 1)**
```typescript
// 5. Form Controls
import { Checkbox, Select, RadioGroup } from 'bits-ui';
// Use case: Evidence selection, case status, filters

// 6. Context Menu
import { ContextMenu } from 'bits-ui';
// Use case: Right-click actions on cases/evidence

// 7. Combobox
import { Combobox } from 'bits-ui';
// Use case: Case search, jurisdiction selection
```

### **Phase 3: Data Organization (Week 2)**
```typescript
// 8. Layout Components
import { Accordion, Tabs, Collapsible } from 'bits-ui';
// Use case: Case sections, evidence categories

// 9. Lists & Navigation
import { Pagination } from 'bits-ui';
// Use case: Case lists, evidence galleries

// 10. Contextual UI
import { Popover, Tooltip } from 'bits-ui';
// Use case: Evidence preview, help text
```

## 🏗️ Implementation Template

### **Standard Component Wrapper Pattern:**
```typescript
// src/lib/components/ui/[component]/index.ts
export { default as [Component] } from './[component].svelte';
export type { [Component]Props } from './types.ts';

// src/lib/components/ui/[component]/[component].svelte  
<script lang="ts">
  import { [Component] } from 'bits-ui';
  import { cn } from '$lib/utils';
  import type { [Component]Props } from './types';
  
  let { children, class: className, ...props }: [Component]Props = $props();
</script>

<[Component].Root class={cn('legal-ai-[component]', className)} {...props}>
  {@render children?.()}
</[Component].Root>
```

## 📊 Legal AI Platform Mapping

### **Case Management Flow:**
- **Navigation Menu** → Case categories/sections
- **Command** → Global case search (Ctrl+K)
- **Dialog** → Case details modal
- **Tabs** → Evidence/Documents/Timeline
- **Context Menu** → Case actions (edit/delete/assign)

### **Evidence Workflow:**
- **Combobox** → Evidence search/filter
- **Accordion** → Evidence categories
- **Aspect Ratio** → Consistent image display
- **Popover** → Quick evidence preview
- **Alert Dialog** → Evidence deletion confirmation

### **User Interface:**
- **Avatar** → User profiles, case assignees
- **Tooltip** → Field explanations, help text
- **Progress** → Document processing, AI analysis
- **Switch** → Feature toggles, notifications

### **Data Entry:**
- **Checkbox** → Multi-select evidence/filters
- **Radio Group** → Evidence type selection
- **Select** → Case status, priority levels
- **Calendar + Time Field** → Incident date/time
- **PIN Input** → Secure evidence access

## 🎨 Styling Integration

### **UnoCSS + Bits UI Classes:**
```css
/* Legal AI Component Themes */
.legal-ai-button {
  @apply bg-slate-900 text-white hover:bg-slate-800 
         px-4 py-2 rounded-md font-medium
         focus:ring-2 focus:ring-blue-500;
}

.legal-ai-dialog {
  @apply bg-white rounded-lg shadow-xl
         max-w-2xl mx-auto p-6
         border border-gray-200;
}

.legal-ai-command {
  @apply bg-white rounded-lg shadow-lg
         border border-gray-300 
         max-w-lg mx-auto;
}
```

## ✅ Next Steps

1. **Implement Phase 1 components** (Dialog, Alert Dialog, Command, Navigation)
2. **Create reusable wrapper components** with legal AI styling
3. **Update cases page** to use new Dialog and Command components
4. **Add Command palette** for global case/evidence search
5. **Implement Context Menu** for case/evidence actions

## 🔄 Migration Benefits

**From current implementation → Bits UI v2:**
- ✅ **Better Svelte 5 compatibility** - Native runes support
- ✅ **More components available** - 9 exclusive components
- ✅ **Consistent API** - Unified patterns across all components  
- ✅ **Better TypeScript support** - Full type safety
- ✅ **Active maintenance** - Regular updates and bug fixes

This comprehensive approach ensures we leverage Bits UI v2's full potential while building a cohesive, professional legal AI platform interface.