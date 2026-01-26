// DropdownMenu Component - Svelte 5 Native Implementation
import DropdownMenu from './DropdownMenu.svelte';
import DropdownMenuContent from './DropdownMenuContent.svelte';
import DropdownMenuItem from './DropdownMenuItem.svelte';
import DropdownMenuRoot from './DropdownMenuRoot.svelte';
import DropdownMenuSeparator from './DropdownMenuSeparator.svelte';
import DropdownMenuTrigger from './DropdownMenuTrigger.svelte';

// Named exports
export {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuRoot,
    DropdownMenuSeparator,
    DropdownMenuTrigger
};

// Aliased exports for compound component pattern
export const Root = DropdownMenuRoot;
export const Content = DropdownMenuContent;
export const Item = DropdownMenuItem;
export const Separator = DropdownMenuSeparator;
export const Trigger = DropdownMenuTrigger;

// Type exports
export type * from './types';
