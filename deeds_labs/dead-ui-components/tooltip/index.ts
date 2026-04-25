// Tooltip Component - Svelte 5 Native Implementation
import Root from './TooltipRoot.svelte';
import Content from './TooltipContent.svelte';
import Provider from './TooltipProvider.svelte';
import Trigger from './TooltipTrigger.svelte';

export {
  Root,
  Content,
  Provider,
  Trigger,
  // Aliases
  Root as Tooltip,
  Content as TooltipContent,
  Provider as TooltipProvider,
  Trigger as TooltipTrigger,
};

// Type exports
export type * from './types';
