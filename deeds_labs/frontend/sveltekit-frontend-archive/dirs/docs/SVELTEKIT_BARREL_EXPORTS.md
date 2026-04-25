# SvelteKit 2 + TypeScript Barrel Export Patterns

**Version**: @sveltejs/kit 2.x
**TypeScript**: 5.9.3
**Last Updated**: January 9, 2026

## Barrel Exports (index.ts)

Barrel files aggregate multiple exports from a directory into a single import point.

### Basic Barrel Export

```typescript
// src/lib/utils/index.ts
export * from './cn';
export * from './dates';
export * from './validation';

// OR explicit exports
export { cn, legalCn } from './cn';
export { formatDate, parseDate } from './dates';
export { validateEmail, validatePhone } from './validation';
```

### Component Barrel Export

```typescript
// src/lib/components/ui/index.ts
export { default as Button } from './button/Button.svelte';
export { default as Card } from './card/Card.svelte';
export { default as Dialog } from './dialog/Dialog.svelte';

// Export types
export type { ButtonProps } from './button/Button.svelte';
export type { CardProps } from './card/Card.svelte';
```

### Usage

```svelte
<script lang="ts">
  // Import from barrel
  import { cn, formatDate, validateEmail } from '$lib/utils';
  import { Button, Card, Dialog } from '$lib/components/ui';
</script>
```

## Svelte 5 Component Exports

### Component with Type Export

```svelte
<!-- Button.svelte -->
<script lang="ts" module>
  export interface ButtonProps {
    variant?: 'primary' | 'secondary';
    size?: 'sm' | 'md' | 'lg';
    disabled?: boolean;
  }
</script>

<script lang="ts">
  let {
    variant = 'primary',
    size = 'md',
    disabled = false,
    ...rest
  }: ButtonProps = $props();
</script>

<button class="btn-{variant} btn-{size}" {disabled} {...rest}>
  <slot />
</button>
```

### Barrel Export for Component

```typescript
// src/lib/components/ui/button/index.ts
export { default as Button } from './Button.svelte';
export type { ButtonProps } from './Button.svelte';
```

## Module Resolution

### tsconfig.json Path Mapping

```json
{
  "compilerOptions": {
    "baseUrl": ".",
    "paths": {
      "$lib/*": ["src/lib/*"],
      "$lib": ["src/lib/index.ts"]
    }
  }
}
```

### SvelteKit Auto-Generated Paths

SvelteKit automatically handles `$lib` alias. The `.svelte-kit/tsconfig.json` is auto-generated.

## Named vs Default Exports

### Named Exports (Recommended)

```typescript
// utils/cn.ts
export function cn(...inputs: string[]): string {
  return inputs.join(' ');
}

export function legalCn(...inputs: string[]): string {
  return `legal-${cn(...inputs)}`;
}

// Import
import { cn, legalCn } from '$lib/utils/cn';
```

### Default Exports (Components)

```svelte
<!-- Button.svelte -->
<script lang="ts">
  // Component code
</script>

<!-- Default export (implicit) -->
```

```typescript
// Import
import Button from '$lib/components/ui/button/Button.svelte';
```

## TypeScript Type-Only Imports

### Importing Types

```typescript
// Import types separately from values
import type { ButtonProps } from '$lib/components/ui';
import { Button } from '$lib/components/ui';

// OR combined
import { Button, type ButtonProps } from '$lib/components/ui';
```

### Re-exporting Types

```typescript
// src/lib/types/index.ts
export type { User, Post, Comment } from './models';
export type { APIResponse, APIError } from './api';

// Export with type modifier
export type { ButtonProps } from '../components/ui/button/Button.svelte';
```

## Store Exports

### Svelte 5 Runes-Based Store

```typescript
// src/lib/stores/counter.svelte.ts
export function createCounter(initial = 0) {
  let count = $state(initial);

  return {
    get count() { return count; },
    increment: () => count++,
    decrement: () => count--,
    reset: () => count = initial
  };
}
```

### Barrel Export for Stores

```typescript
// src/lib/stores/index.ts
export { createCounter } from './counter.svelte';
export { createAuth } from './auth.svelte';
export { createTheme } from './theme.svelte';

// Export types
export type { Counter } from './counter.svelte';
export type { AuthStore } from './auth.svelte';
```

## Server-Only Exports

### Mark Server-Only Modules

```typescript
// src/lib/server/db/index.ts
import { dev } from '$app/environment';

if (dev) {
  console.log('Loading server-only database module');
}

export { db } from './client';
export * from './schema';
export * from './queries';
```

### Prevent Client Import

```typescript
// vite.config.ts
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  resolve: {
    conditions: dev ? ['development'] : []
  }
});
```

## Common Patterns

### Utility Barrel

```typescript
// src/lib/utils/index.ts
// Class name utilities
export { cn, legalCn, confidenceClass, priorityClass } from './cn';

// Date utilities
export { formatDate, formatProcessingTime, generateId } from './dates';

// Validation
export { validateEmail, validatePhone, sanitizeInput } from './validation';

// Performance
export { debounce, throttle } from './performance';
```

### Component Library Barrel

```typescript
// src/lib/components/ui/index.ts
// Form components
export { default as Button } from './button/Button.svelte';
export { default as Input } from './input/Input.svelte';
export { default as Checkbox } from './checkbox/Checkbox.svelte';
export { default as Label } from './label/Label.svelte';

// Layout components
export { default as Card } from './card/Card.svelte';
export { default as CardHeader } from './card/CardHeader.svelte';
export { default as CardContent } from './card/CardContent.svelte';

// Dialog components
export { default as Dialog } from './dialog/Dialog.svelte';
export { default as DialogContent } from './dialog/DialogContent.svelte';

// Types
export type { ButtonProps } from './button/Button.svelte';
export type { InputProps } from './input/Input.svelte';
```

### API Client Barrel

```typescript
// src/lib/api/index.ts
export { createClient } from './client';
export * from './users';
export * from './posts';
export * from './auth';

// Types
export type * from './types';
```

## Best Practices

1. **One Barrel Per Directory**: Create `index.ts` in each major directory
2. **Explicit Over Star Exports**: Use named exports instead of `export *` when possible
3. **Type-Only Exports**: Use `export type` for types to enable tree-shaking
4. **Avoid Circular Dependencies**: Don't create circular barrel references
5. **Server vs Client**: Keep server-only code in `$lib/server`
6. **Component Props**: Export prop types alongside components

## Troubleshooting

### Module Not Found

If TypeScript can't find a barrel export:

```bash
# Clear .svelte-kit cache
rm -rf .svelte-kit

# Rebuild
npm run dev
```

### Circular Dependencies

```typescript
// BAD - Circular
// a.ts
import { b } from './b';
export const a = b + 1;

// b.ts
import { a } from './a';
export const b = a + 1;

// GOOD - No circular
// a.ts
export const a = 1;

// b.ts
import { a } from './a';
export const b = a + 1;
```

## Resources

- [SvelteKit Documentation](https://kit.svelte.dev/docs)
- [TypeScript Module Resolution](https://www.typescriptlang.org/docs/handbook/module-resolution.html)
- [Svelte 5 Components](https://svelte.dev/docs/svelte/svelte-components)
