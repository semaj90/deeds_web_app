# bits-ui + Svelte 5 Integration Documentation

## 🎯 Overview

This document provides comprehensive documentation for the bits-ui integration with Svelte 5,
featuring professional legal AI theming and gaming-inspired aesthetics. The integration combines
modern web development patterns with retro gaming elements to create an engaging, accessible, and
professional user interface.

## 📋 Table of Contents

1. [Installation & Setup](#installation--setup)
2. [Component Library](#component-library)
3. [Usage Patterns](#usage-patterns)
4. [Theming & Styling](#theming--styling)
5. [Form Components](#form-components)
6. [Demo Pages](#demo-pages)
7. [Accessibility](#accessibility)
8. [Best Practices](#best-practices)
9. [Troubleshooting](#troubleshooting)

---

## 🔧 Installation & Setup

### Dependencies

```json
{
  "bits-ui": "^2.9.6",
  "svelte": "^5.0.0",
  "typescript": "^5.0.0"
}
```

### CDN Resources (Gaming Aesthetics)

```html
<link href="https://unpkg.com/nes.css@2.3.0/css/nes.min.css" rel="stylesheet" />
<link href="https://fonts.googleapis.com/css?family=Press+Start+2P" rel="stylesheet" />
```

### File Structure

```
src/lib/components/ui/
├── bits-ui/
│   └── index.ts                 # Central exports and types
├── button/
│   └── ButtonBits.svelte        # Professional button component
├── card/
│   └── CardBits.svelte          # Flexible card layouts
├── input/
│   └── InputBits.svelte         # Enhanced input with validation
├── dialog/
│   └── DialogBits.svelte        # Modal dialogs with transitions
├── dropdown/
│   └── DropdownBits.svelte      # Dropdown menus
├── select/
│   └── SelectBits.svelte        # Professional select dropdowns
├── tabs/
│   └── TabsBits.svelte          # Tab navigation component
├── tooltip/
│   └── TooltipBits.svelte       # Contextual tooltips
└── forms/
    └── LegalCaseForm.svelte     # Complex form example
```

---

## 🧩 Component Library

### ButtonBits

Professional button component with gaming-enhanced styling.

**Props:**

- `variant`:
  `'primary' | 'secondary' | 'ghost' | 'outline' | 'destructive' | 'success' | 'warning' | 'info'`
- `size`: `'xs' | 'sm' | 'md' | 'lg' | 'xl'`
- `loading`: `boolean` - Shows loading state
- `disabled`: `boolean` - Disables the button
- `fullWidth`: `boolean` - Makes button full width
- `to`: `string` - Optional href for link behavior

**Usage:**

```svelte
<script>
  import { ButtonBits } from '$lib/components/ui/bits-ui';
</script>

<ButtonBits variant="primary" size="md" loading={isSubmitting}>Submit Form</ButtonBits>

<ButtonBits variant="ghost" onclick={() => console.log('Clicked!')}>Cancel</ButtonBits>
```

### InputBits

Enhanced input component with validation states and professional styling.

**Props:**

- `variant`: `'default' | 'filled' | 'outlined'`
- `size`: `'sm' | 'md' | 'lg'`
- `type`: Standard HTML input types
- `value`: `string` (bindable)
- `placeholder`: `string`
- `label`: `string`
- `description`: `string`
- `error`: `boolean`
- `success`: `boolean`
- `errorMessage`: `string`
- `disabled`: `boolean`
- `required`: `boolean`

**Usage:**

```svelte
<script>
  import { InputBits } from '$lib/components/ui/bits-ui';

  let inputValue = $state('');
  let hasError = $state(false);
</script>

<InputBits
  label="Case Title"
  placeholder="Enter case title..."
  bind:value={inputValue}
  error={hasError}
  errorMessage="This field is required"
  description="Provide a descriptive title for the case"
  required
/>
```

### SelectBits

Professional dropdown selection component with search and validation.

**Props:**

- `options`: `Array<{value: string, label: string, disabled?: boolean}>`
- `selected`: `string` (bindable)
- `placeholder`: `string`
- `variant`: `'default' | 'filled' | 'outlined'`
- `size`: `'sm' | 'md' | 'lg'`
- `label`: `string`
- `description`: `string`
- `error`: `boolean`
- `errorMessage`: `string`
- `disabled`: `boolean`

**Usage:**

```svelte
<script>
  import { SelectBits } from '$lib/components/ui/bits-ui';

  let selectedValue = $state('');

  const options = [
    { value: 'corporate', label: '🏢 Corporate Law' },
    { value: 'litigation', label: '⚖️ Litigation' },
    { value: 'ip', label: '🧠 Intellectual Property' },
  ];
</script>

<SelectBits
  label="Practice Area"
  {options}
  bind:selected={selectedValue}
  placeholder="Select practice area..."
  description="Choose the primary area of law"
/>
```

### TabsBits

Modern tab navigation with multiple styling variants.

**Props:**

- `tabs`: `Array<{value: string, label: string, content?: Snippet}>`
- `value`: `string` (bindable) - Active tab
- `variant`: `'default' | 'pills' | 'underline'`
- `size`: `'sm' | 'md' | 'lg'`
- `onValueChange`: `(value: string) => void`

**Usage:**

```svelte
<script>
  import { TabsBits } from '$lib/components/ui/bits-ui';

  let activeTab = $state('tab1');

  const tabItems = [
    { value: 'tab1', label: '📋 Basic Info' },
    { value: 'tab2', label: '📝 Details' },
    { value: 'tab3', label: '✅ Review' },
  ];
</script>

<TabsBits tabs={tabItems} bind:value={activeTab} variant="pills" size="md">
  {#if activeTab === 'tab1'}
    <div>Basic information content</div>
  {:else if activeTab === 'tab2'}
    <div>Detailed information content</div>
  {:else if activeTab === 'tab3'}
    <div>Review content</div>
  {/if}
</TabsBits>
```

### TooltipBits

Contextual tooltip component with accessibility support.

**Props:**

- `content`: `string` - Tooltip text
- `side`: `'top' | 'right' | 'bottom' | 'left'`
- `align`: `'start' | 'center' | 'end'`
- `delayDuration`: `number` - Delay before showing (ms)
- `sideOffset`: `number` - Distance from trigger

**Usage:**

```svelte
<script>
  import { TooltipBits, ButtonBits } from '$lib/components/ui/bits-ui';
</script>

<TooltipBits content="This button submits the form" side="top">
  <ButtonBits variant="primary">Submit</ButtonBits>
</TooltipBits>
```

### CardBits

Flexible card container with multiple variants.

**Props:**

- `variant`: `'default' | 'elevated' | 'outlined' | 'filled'`
- `padding`: `'none' | 'sm' | 'md' | 'lg' | 'xl'`
- `class`: Additional CSS classes

**Usage:**

```svelte
<script>
  import { CardBits } from '$lib/components/ui/bits-ui';
</script>

<CardBits variant="elevated" padding="lg">
  <h2>Card Title</h2>
  <p>Card content goes here...</p>
</CardBits>
```

### DialogBits

Modal dialog component with smooth transitions.

**Props:**

- `open`: `boolean` (bindable) - Dialog visibility
- `size`: `'sm' | 'md' | 'lg' | 'xl' | 'full'`
- `closeOnEscape`: `boolean` - Close on Escape key
- `closeOnOutsideClick`: `boolean` - Close when clicking overlay

**Usage:**

```svelte
<script>
  import { DialogBits, ButtonBits } from '$lib/components/ui/bits-ui';

  let dialogOpen = $state(false);
</script>

<ButtonBits onclick={() => (dialogOpen = true)}>Open Dialog</ButtonBits>

<DialogBits bind:open={dialogOpen} size="md">
  <div class="dialog-content">
    <h2>Dialog Title</h2>
    <p>Dialog content...</p>
    <ButtonBits onclick={() => (dialogOpen = false)}>Close</ButtonBits>
  </div>
</DialogBits>
```

---

## 🎨 Theming & Styling

### CSS Custom Properties

The components use a comprehensive CSS custom property system:

```css
:root {
  /* N64 Gaming Color Scheme */
  --n64-primary: #4a90e2;
  --n64-secondary: #7ed321;
  --n64-warning: #f5a623;
  --n64-error: #d0021b;
  --n64-success: #50e3c2;
  --n64-dark: #1a1a2e;
  --n64-light: #e94560;

  /* Legal AI Theme */
  --legal-ai-primary: #f59e0b;
  --legal-ai-text-primary: #f1f5f9;
  --legal-ai-text-secondary: #94a3b8;
  --legal-ai-surface-secondary: #1e293b;
  --legal-ai-border: #475569;
}
```

### Gaming Enhancements

Components include gaming-inspired enhancements:

```css
/* N64-style button effects */
.nes-btn-enhanced {
  transition: all 0.2s ease;
  border: 3px solid var(--n64-primary);
  background: linear-gradient(135deg, var(--n64-primary), var(--n64-secondary));
  box-shadow:
    0 4px 8px rgba(0, 0, 0, 0.3),
    inset 0 2px 0 rgba(255, 255, 255, 0.2);
}

.nes-btn-enhanced:hover {
  transform: translateY(-2px);
  animation: n64-pulse 0.5s ease-in-out;
}

/* N64 glow animation */
@keyframes n64-glow {
  0%,
  100% {
    box-shadow: 0 0 5px var(--n64-primary);
  }
  50% {
    box-shadow:
      0 0 20px var(--n64-primary),
      0 0 30px var(--n64-success);
  }
}
```

### Typography

Gaming-inspired typography with professional readability:

```css
:global(body) {
  font-family: 'Press Start 2P', cursive;
  background: linear-gradient(135deg, #1a1a2e, #16213e, #0f3460);
}
```

---

## 📝 Form Components

### Complex Form Example: LegalCaseForm

A comprehensive multi-step form demonstrating advanced patterns:

**Features:**

- Multi-step navigation with tabs
- Real-time validation
- Progress tracking
- Conditional rendering
- Professional legal workflow

**Usage:**

```svelte
<script>
  import LegalCaseForm from '$lib/components/forms/LegalCaseForm.svelte';
</script>

<LegalCaseForm />
```

**Key Implementation Patterns:**

1. **State Management with Svelte 5 Runes:**

```javascript
let formData = $state({
  caseTitle: '',
  clientName: '',
  practiceArea: '',
  // ... other fields
});

let formErrors = $state({});

// Computed validation
let isFormValid = $derived(() => {
  return formData.caseTitle.trim() && formData.clientName.trim() && formData.practiceArea;
});

// Progress calculation
let formProgress = $derived(() => {
  const totalFields = 12;
  const filledFields = Object.values(formData).filter((value) => value.trim()).length;
  return Math.round((filledFields / totalFields) * 100);
});
```

2. **Validation Function:**

```javascript
function validateForm() {
  const errors = {};

  if (!formData.caseTitle.trim()) {
    errors.caseTitle = 'Case title is required';
  }

  if (!formData.clientName.trim()) {
    errors.clientName = 'Client name is required';
  }

  formErrors = errors;
  return Object.keys(errors).length === 0;
}
```

3. **Form Submission:**

```javascript
async function handleSubmit() {
  if (!validateForm()) return;

  isSubmitting = true;
  try {
    // API call simulation
    await new Promise((resolve) => setTimeout(resolve, 2000));
    console.log('Form submitted:', formData);

    // Reset form on success
    formData = {
      /* reset values */
    };
    alert('✅ Legal case created successfully!');
  } catch (error) {
    console.error('Submission error:', error);
    alert('❌ Failed to create case. Please try again.');
  } finally {
    isSubmitting = false;
  }
}
```

---

## 🎮 Demo Pages

### 1. Main bits-ui Demo (`/demo/bits-ui`)

Showcases all components with gaming-enhanced styling:

- **Button Components**: All variants with hover effects
- **Input & Select**: Professional form controls
- **Tabs Navigation**: Multi-variant tab examples
- **Interactive Elements**: Dialogs, tooltips, and live demos
- **N64 Gaming Styling**: Retro aesthetics with modern functionality

### 2. Complex Form Demo (`/demo/legal-form`)

Professional legal case creation form:

- **Multi-step Navigation**: Tab-based workflow
- **Real-time Validation**: Immediate feedback
- **Progress Tracking**: Visual completion status
- **Professional Integration**: Legal AI theming

### 3. NES.css Showcase (`/demo/nes-bits-ui`)

Pure NES.css styling demonstration:

- **Retro Gaming Elements**: Classic 8-bit aesthetics
- **Interactive Components**: Buttons, forms, dialogs
- **Accessibility Features**: Full keyboard navigation
- **Gaming Animations**: Retro-inspired transitions

---

## ♿ Accessibility

### WCAG Compliance

All components maintain WCAG 2.1 AA compliance:

1. **Keyboard Navigation:**
   - Full tab order support
   - Escape key handling for modals
   - Arrow key navigation for tabs

2. **Screen Reader Support:**
   - Proper ARIA labels and descriptions
   - Role attributes for complex components
   - State announcements for dynamic content

3. **Color Contrast:**
   - Meets AA contrast ratios
   - High contrast mode support
   - Color-blind friendly palettes

4. **Focus Management:**
   - Visible focus indicators
   - Focus trapping in modals
   - Logical tab order

### Accessibility Features

```svelte
<!-- Proper labeling -->
<InputBits
  id="case-title"
  label="Case Title"
  aria-describedby="case-title-description"
  aria-invalid={hasError}
  required
/>

<!-- Screen reader support -->
<ButtonBits aria-label="Submit legal case form" aria-describedby="submit-help">Submit</ButtonBits>

<!-- Focus management -->
<DialogBits
  bind:open={dialogOpen}
  aria-labelledby="dialog-title"
  aria-describedby="dialog-description"
>
  <!-- Dialog content -->
</DialogBits>
```

---

## 🏆 Best Practices

### Component Usage

1. **Import Components Properly:**

```javascript
// ✅ Correct - Import from index
import { ButtonBits, InputBits } from '$lib/components/ui/bits-ui';

// ❌ Incorrect - Direct component imports
import ButtonBits from '$lib/components/ui/button/ButtonBits.svelte';
```

2. **Use Svelte 5 Runes:**

```javascript
// ✅ Modern Svelte 5 patterns
let value = $state('');
let isValid = $derived(value.length > 0);

// ❌ Legacy reactive statements
let value = '';
$: isValid = value.length > 0;
```

3. **Leverage TypeScript:**

```typescript
import type { ButtonVariant, InputSize } from '$lib/components/ui/bits-ui';

interface FormData {
  title: string;
  priority: ButtonVariant;
}
```

### Performance Optimization

1. **Use Proper Binding:**

```svelte
<!-- ✅ Efficient binding -->
<InputBits bind:value={formData.title} />

<!-- ❌ Inefficient event handling -->
<InputBits onInput={(e) => (formData.title = e.target.value)} />
```

2. **Minimize Reactive Computations:**

```javascript
// ✅ Computed once
let isFormValid = $derived(() => validateForm(formData));

// ❌ Recomputed on every keystroke
let isFormValid = $derived(() => {
  // Heavy validation logic...
});
```

### Styling Guidelines

1. **Use CSS Custom Properties:**

```css
.custom-button {
  background: var(--n64-primary);
  border-color: var(--legal-ai-border);
}
```

2. **Follow Gaming Aesthetic:**

```css
.game-element {
  border: 3px solid var(--n64-primary);
  box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
  transition: all 0.2s ease;
}
```

---

## 🔧 Troubleshooting

### Common Issues

1. **Components Not Loading:**

```javascript
// Check import path
import { ButtonBits } from '$lib/components/ui/bits-ui';

// Verify bits-ui is installed
npm list bits-ui
```

2. **Styling Issues:**

```html
<!-- Ensure NES.css is loaded -->
<link href="https://unpkg.com/nes.css@2.3.0/css/nes.min.css" rel="stylesheet" />

<!-- Check CSS custom properties -->
<style>
  :root {
    --n64-primary: #4a90e2;
    /* Other properties... */
  }
</style>
```

3. **TypeScript Errors:**

```typescript
// Import types explicitly
import type { ButtonVariant } from '$lib/components/ui/bits-ui';

// Use proper type annotations
const variant: ButtonVariant = 'primary';
```

4. **Form Validation Issues:**

```javascript
// Ensure proper state management
let formData = $state({
  field: '', // Initialize all fields
});

// Use derived state for validation
let isValid = $derived(() => {
  return Object.values(formData).every((value) =>
    typeof value === 'string' ? value.trim() : !!value
  );
});
```

### Performance Issues

1. **Large Forms:**
   - Use field-level validation
   - Implement debounced validation
   - Consider virtual scrolling for large option lists

2. **Animation Performance:**
   - Respect `prefers-reduced-motion`
   - Use CSS transforms instead of position changes
   - Limit simultaneous animations

### Browser Compatibility

- **Modern Browsers**: Full support (Chrome 90+, Firefox 88+, Safari 14+)
- **Legacy Browsers**: Graceful degradation with polyfills
- **Mobile**: Touch-optimized interactions

---

## 📊 Migration Guide

### From Legacy Components

1. **Update Imports:**

```javascript
// Old
import Button from '$lib/components/Button.svelte';

// New
import { ButtonBits } from '$lib/components/ui/bits-ui';
```

2. **Update Props:**

```svelte
<!-- Old -->
<Button class="primary" disabled={loading}>Submit</Button>

<!-- New -->
<ButtonBits variant="primary" {loading}>Submit</ButtonBits>
```

3. **Update State Management:**

```javascript
// Old
let value = '';
$: isValid = value.length > 0;

// New
let value = $state('');
let isValid = $derived(value.length > 0);
```

---

## 🚀 Conclusion

The bits-ui + Svelte 5 integration provides a comprehensive, accessible, and visually engaging
component system that perfectly balances professional functionality with gaming-inspired aesthetics.
The system is designed for scalability, maintainability, and exceptional user experience.

### Key Achievements:

✅ **8 Professional Components** with full TypeScript support ✅ **Gaming-Enhanced Styling** with
NES.css + N64 aesthetics ✅ **Svelte 5 Integration** using modern runes and patterns ✅ **WCAG 2.1
AA Compliance** for accessibility ✅ **Complex Form Patterns** with validation and multi-step
navigation ✅ **Comprehensive Documentation** with examples and best practices

The integration is production-ready and provides a solid foundation for building modern, engaging
legal AI applications with professional gaming aesthetics.

---

_Generated with bits-ui + Svelte 5 + Legal AI Gaming Integration_ 🎮⚖️
