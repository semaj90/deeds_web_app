# bits-ui API Reference

## 🎯 Quick Reference Guide

### Import Statement

```javascript
import {
  ButtonBits,
  CardBits,
  InputBits,
  DialogBits,
  DropdownBits,
  SelectBits,
  TabsBits,
  TooltipBits,
} from '$lib/components/ui/bits-ui';
```

---

## 📚 Component API

### ButtonBits

```typescript
interface ButtonProps {
  variant?:
    | 'primary'
    | 'secondary'
    | 'ghost'
    | 'outline'
    | 'destructive'
    | 'success'
    | 'warning'
    | 'info';
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl';
  loading?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  to?: string;
  class?: string;
  onclick?: (event: MouseEvent) => void;
  children?: Snippet;
}
```

**Examples:**

```svelte
<ButtonBits variant="primary">Submit</ButtonBits>
<ButtonBits variant="ghost" size="sm">Cancel</ButtonBits>
<ButtonBits loading disabled>Processing...</ButtonBits>
```

---

### InputBits

```typescript
interface InputProps {
  variant?: 'default' | 'filled' | 'outlined';
  size?: 'sm' | 'md' | 'lg';
  type?: string;
  value?: string;
  placeholder?: string;
  label?: string;
  description?: string;
  error?: boolean;
  success?: boolean;
  errorMessage?: string;
  disabled?: boolean;
  required?: boolean;
  class?: string;
  leftIcon?: Snippet;
  rightIcon?: Snippet;
}
```

**Examples:**

```svelte
<InputBits
  label="Email Address"
  type="email"
  bind:value={email}
  placeholder="Enter your email..."
  error={emailError}
  errorMessage="Please enter a valid email"
  required
/>
```

---

### SelectBits

```typescript
interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps {
  options: SelectOption[];
  selected?: string;
  placeholder?: string;
  variant?: 'default' | 'filled' | 'outlined';
  size?: 'sm' | 'md' | 'lg';
  label?: string;
  description?: string;
  error?: boolean;
  errorMessage?: string;
  disabled?: boolean;
  class?: string;
  onSelectedChange?: (value: string | undefined) => void;
}
```

**Examples:**

```svelte
<script>
  const practiceAreas = [
    { value: 'corporate', label: '🏢 Corporate Law' },
    { value: 'litigation', label: '⚖️ Litigation' },
  ];

  let selectedArea = $state('');
</script>

<SelectBits
  label="Practice Area"
  options={practiceAreas}
  bind:selected={selectedArea}
  placeholder="Choose area..."
/>
```

---

### TabsBits

```typescript
interface TabItem {
  value: string;
  label: string;
  disabled?: boolean;
  content?: Snippet;
}

interface TabsProps {
  tabs: TabItem[];
  value?: string;
  variant?: 'default' | 'pills' | 'underline';
  size?: 'sm' | 'md' | 'lg';
  class?: string;
  onValueChange?: (value: string) => void;
  children?: Snippet;
}
```

**Examples:**

```svelte
<script>
  const tabItems = [
    { value: 'basic', label: '📋 Basic' },
    { value: 'advanced', label: '🔧 Advanced' },
  ];

  let activeTab = $state('basic');
</script>

<TabsBits tabs={tabItems} bind:value={activeTab} variant="pills">
  {#if activeTab === 'basic'}
    <div>Basic content</div>
  {:else}
    <div>Advanced content</div>
  {/if}
</TabsBits>
```

---

### TooltipBits

```typescript
interface TooltipProps {
  content: string;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  delayDuration?: number;
  sideOffset?: number;
  class?: string;
  children?: Snippet;
}
```

**Examples:**

```svelte
<TooltipBits content="This saves your progress" side="top">
  <ButtonBits>Save</ButtonBits>
</TooltipBits>
```

---

### CardBits

```typescript
interface CardProps {
  variant?: 'default' | 'elevated' | 'outlined' | 'filled';
  padding?: 'none' | 'sm' | 'md' | 'lg' | 'xl';
  class?: string;
  children?: Snippet;
}
```

**Examples:**

```svelte
<CardBits variant="elevated" padding="lg">
  <h3>Card Title</h3>
  <p>Card content goes here...</p>
</CardBits>
```

---

### DialogBits

```typescript
interface DialogProps {
  open?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl' | 'full';
  closeOnEscape?: boolean;
  closeOnOutsideClick?: boolean;
  class?: string;
  children?: Snippet;
}
```

**Examples:**

```svelte
<script>
  let dialogOpen = $state(false);
</script>

<ButtonBits onclick={() => (dialogOpen = true)}>Open Dialog</ButtonBits>

<DialogBits bind:open={dialogOpen} size="md">
  <div class="p-6">
    <h2>Dialog Title</h2>
    <p>Dialog content...</p>
    <ButtonBits onclick={() => (dialogOpen = false)}>Close</ButtonBits>
  </div>
</DialogBits>
```

---

## 🎨 Type Definitions

### Component Variants

```typescript
// Button variants
export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'ghost'
  | 'outline'
  | 'destructive'
  | 'success'
  | 'warning'
  | 'info';

// Input variants
export type InputVariant = 'default' | 'filled' | 'outlined';

// Select variants
export type SelectVariant = 'default' | 'filled' | 'outlined';

// Tab variants
export type TabsVariant = 'default' | 'pills' | 'underline';

// Card variants
export type CardVariant = 'default' | 'elevated' | 'outlined' | 'filled';
```

### Component Sizes

```typescript
// Button sizes
export type ButtonSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';

// Input sizes
export type InputSize = 'sm' | 'md' | 'lg';

// Select sizes
export type SelectSize = 'sm' | 'md' | 'lg';

// Tab sizes
export type TabsSize = 'sm' | 'md' | 'lg';

// Card padding
export type CardPadding = 'none' | 'sm' | 'md' | 'lg' | 'xl';

// Dialog sizes
export type DialogSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';
```

---

## 🔧 Utility Functions

### CSS Class Helper

```typescript
// Available in all components
import { cn } from '$lib/utils';

// Usage
const className = cn(
  'base-class',
  variant === 'primary' && 'primary-class',
  disabled && 'disabled-class',
  customClass
);
```

### Accessibility Helpers

```typescript
// Generate unique IDs for form elements
const fieldId = `field-${Math.random().toString(36).substr(2, 9)}`;

// ARIA attributes
const ariaProps = {
  'aria-describedby': description ? `${fieldId}-description` : undefined,
  'aria-invalid': error,
  'aria-required': required,
};
```

---

## 🎮 Gaming CSS Classes

### N64-Enhanced Classes

```css
/* Available for custom styling */
.nes-btn-enhanced {
  /* Gaming-enhanced buttons */
}
.nes-input-enhanced {
  /* Gaming-enhanced inputs */
}
.nes-select-enhanced {
  /* Gaming-enhanced selects */
}
.nes-tabs-enhanced {
  /* Gaming-enhanced tabs */
}

/* Color variants */
.n64-primary {
  background: var(--n64-primary);
}
.n64-secondary {
  background: var(--n64-secondary);
}
.n64-success {
  background: var(--n64-success);
}
.n64-warning {
  background: var(--n64-warning);
}
.n64-error {
  background: var(--n64-error);
}
```

### Animation Classes

```css
/* Gaming animations */
@keyframes n64-glow {
  /* Glowing effect */
}
@keyframes n64-pulse {
  /* Pulsing effect */
}

.game-element {
  animation: n64-glow 3s infinite;
}

.interactive-element:hover {
  animation: n64-pulse 0.5s ease-in-out;
}
```

---

## 📱 Responsive Breakpoints

```css
/* Mobile First Approach */
@media (max-width: 640px) {
  /* Mobile */
}
@media (min-width: 641px) and (max-width: 768px) {
  /* Tablet */
}
@media (min-width: 769px) and (max-width: 1024px) {
  /* Small Desktop */
}
@media (min-width: 1025px) {
  /* Large Desktop */
}
```

---

## ♿ Accessibility Properties

### Standard ARIA Support

All components include proper ARIA attributes:

```svelte
<!-- Automatic ARIA labeling -->
<InputBits
  label="Username"
  description="Enter your username"
  error={hasError}
  errorMessage="Username is required"
  required
/>
<!-- Generates:
  aria-label="Username"
  aria-describedby="username-description username-error"
  aria-invalid="true"
  aria-required="true"
-->
```

### Keyboard Navigation

- **Tab**: Navigate between focusable elements
- **Enter/Space**: Activate buttons and toggles
- **Escape**: Close modals and dropdowns
- **Arrow Keys**: Navigate tabs and dropdown options

---

## 🚀 Performance Optimizations

### Bundle Size

- Tree-shakable components
- Minimal runtime overhead
- Optimized CSS-in-JS

### Runtime Performance

- Virtual scrolling for large lists
- Debounced form validation
- Efficient state updates with Svelte 5 runes

### Best Practices

```javascript
// ✅ Efficient state management
let formData = $state({ /* initial state */ });
let isValid = $derived(() => validateForm(formData));

// ✅ Proper event handling
<ButtonBits onclick={(e) => handleClick(e)}>

// ✅ Conditional rendering
{#if showDialog}
  <DialogBits bind:open={showDialog}>
    <!-- Content -->
  </DialogBits>
{/if}
```

---

## 🔍 Error Handling

### Common Validation Patterns

```javascript
// Form validation
function validateField(value, rules) {
  const errors = [];

  if (rules.required && !value.trim()) {
    errors.push('This field is required');
  }

  if (rules.minLength && value.length < rules.minLength) {
    errors.push(`Minimum length is ${rules.minLength}`);
  }

  if (rules.pattern && !rules.pattern.test(value)) {
    errors.push('Invalid format');
  }

  return errors;
}

// Usage
let emailErrors = $derived(() =>
  validateField(email, {
    required: true,
    pattern: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
  })
);
```

### Error Display

```svelte
<InputBits bind:value={email} error={emailErrors.length > 0} errorMessage={emailErrors[0]} />
```

---

This API reference provides comprehensive documentation for all components in the bits-ui
integration, including TypeScript definitions, usage examples, and best practices for building
professional gaming-enhanced legal AI applications.
