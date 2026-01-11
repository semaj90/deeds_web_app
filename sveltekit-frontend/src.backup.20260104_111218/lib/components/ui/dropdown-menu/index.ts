// DropdownMenu Component - Svelte 5 Native Implementation
import DropdownMenu from './DropdownMenu.svelte';
import DropdownMenuContent from './DropdownMenuContent.svelte';
import DropdownMenuItem from './DropdownMenuItem.svelte';
import DropdownMenuRoot from './DropdownMenuRoot.svelte';
import DropdownMenuSeparator from './DropdownMenuSeparator.svelte';
import DropdownMenuTrigger from './DropdownMenuTrigger.svelte';

// Named exports
export {
    DropdownMenu, DropdownMenuContent,
    DropdownMenuItem, DropdownMenuRoot, DropdownMenuSeparator, DropdownMenuTrigger
};

// Aliased exports for compound pattern
    export {
        DropdownMenuContent as Content,
        DropdownMenuItem as Item, DropdownMenuRoot as Root, DropdownMenuSeparator as Separator, DropdownMenuTrigger as Trigger
    };

// Type exports
    export type * from './types';

