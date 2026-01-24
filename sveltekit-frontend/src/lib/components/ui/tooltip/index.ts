// Tooltip Component - Svelte 5 Native Implementation
import Tooltip from './Tooltip.svelte';
import TooltipContent from './TooltipContent.svelte';
import TooltipProvider from './TooltipProvider.svelte';
import TooltipRoot from './TooltipRoot.svelte';
import TooltipTrigger from './TooltipTrigger.svelte';

// Named exports
export {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipRoot,
    TooltipTrigger
};

// Aliased exports for compound pattern
export {
    TooltipContent as Content,
    TooltipProvider as Provider,
    TooltipRoot as Root,
    TooltipTrigger as Trigger
};

// Type exports
export type * from './types';
