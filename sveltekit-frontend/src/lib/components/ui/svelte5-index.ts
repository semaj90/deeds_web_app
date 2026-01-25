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
export { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogOverlay, DialogPortal, DialogRoot, DialogTitle, DialogTrigger } from './dialog';

// Bits-UI components (Svelte 5 compatible)
export { Svelte5Button, Svelte5Dialog } from './bits';

// Form components (Svelte 5 runes)
export { default as Svelte5Checkbox } from './checkbox/Svelte5Checkbox.svelte';
export { default as Svelte5Input } from './input/Svelte5Input.svelte';
export { default as Svelte5Select } from './select/Svelte5Select.svelte';
export { default as Svelte5Switch } from './switch/Svelte5Switch.svelte';

// Navigation components (Svelte 5 runes)
export { default as Svelte5DropdownMenu } from './dropdown/Svelte5DropdownMenu.svelte';
export { default as Svelte5TabPanel } from './tabs/Svelte5TabPanel.svelte';
export { default as Svelte5Tabs } from './tabs/Svelte5Tabs.svelte';

// Overlay components (Svelte 5 runes)
export { default as Svelte5Popover } from './popover/Svelte5Popover.svelte';
export { default as Svelte5Tooltip } from './tooltip/Svelte5Tooltip.svelte';

// Feedback components (Svelte 5 runes)
export { default as Svelte5Alert } from './alert/Svelte5Alert.svelte';
export { default as Svelte5Badge } from './badge/Svelte5Badge.svelte';
export { default as Svelte5Progress } from './progress/Svelte5Progress.svelte';

// Layout components (Svelte 5 runes)
export { default as Svelte5Accordion } from './accordion/Svelte5Accordion.svelte';
export { default as Svelte5Card } from './card/Svelte5Card.svelte';

// Data display components (Svelte 5 runes)
export { default as Svelte5Avatar } from './avatar/Svelte5Avatar.svelte';

// Range/slider components (Svelte 5 runes)
export { default as Svelte5RadioGroup } from './radio/Svelte5RadioGroup.svelte';
export { default as Svelte5Slider } from './slider/Svelte5Slider.svelte';

// Type exports
export type * from './dialog/types';

// Utility functions
export function cn(...classes: (string | undefined | null | false)[]): string {
    return classes.filter(Boolean).join(' ');
}
