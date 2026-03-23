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
    DialogTrigger
} from './dialog/index.js';

// Bits-UI components (Svelte 5 compatible — Svelte5Dialog removed, use $lib/components/ui/dialog)
export { Svelte5Button } from './bits/index.js';

// Type exports
export type * from './dialog/types.js';

// Utility functions
export function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ');
}

/** Svelte 5 Components — only exports for files that exist **/
export { default as Svelte5Avatar } from './avatar/Avatar.svelte';
export { default as Svelte5Badge } from './badge/Badge.svelte';
export { default as Svelte5Card } from './card/Card.svelte';
export { default as Svelte5Input } from './input/Input.svelte';
export { default as Svelte5Progress } from './progress/Progress.svelte';
export { default as Svelte5RadioGroup } from './radio/Svelte5RadioGroup.svelte';
export { default as Svelte5TabPanel } from './tabs/Svelte5TabPanel.svelte';
export { default as Svelte5Tabs } from './tabs/Svelte5Tabs.svelte';

// Components removed — source files archived in prior sessions:
// Svelte5Alert (alert/Svelte5Alert.svelte)
// Svelte5Checkbox (checkbox/Checkbox.svelte)
// Svelte5DropdownMenu (dropdown-menu/DropdownMenu.svelte)
// Svelte5Slider (slider/Svelte5Slider.svelte)
// Svelte5Switch (switch/Svelte5Switch.svelte)
// Svelte5Tooltip (tooltip/Tooltip.svelte)