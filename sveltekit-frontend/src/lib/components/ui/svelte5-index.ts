/**
 * Svelte 5 UI Components
 *
 * Native HTML components with Svelte 5 runes:
 * - $props() for prop declaration
 * - $state() for reactive state
 * - $derived() for computed values
 * - $bindable() for two-way binding
 * - $effect() for side effects
 *
 * Features:
 * - Zero external dependencies (no bits-ui required)
 * - UnoCSS/Tailwind-compatible utility classes
 * - Full accessibility (ARIA, keyboard navigation)
 * - HTML fallback for SSR/progressive enhancement
 * - NES.css inspired design variants
 */

// Dialog components (compound pattern)
export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogRoot,
  DialogTitle,
  DialogTrigger,
} from './dialog/index.js';

// Bits-UI components (Svelte 5 compatible)
export { Svelte5Button, Svelte5Dialog } from './bits/index.js';

// Type exports
export type * from './dialog/types.js';

// Utility functions
export function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ');
}
