// Tabs Component - Svelte 5 Native Implementation
import Tabs from './Tabs.svelte';
import TabsContent from './TabsContent.svelte';
import TabsList from './TabsList.svelte';
import TabsRoot from './TabsRoot.svelte';
import TabsTrigger from './TabsTrigger.svelte';
import type { BitsUI } from '$lib/types/enhanced-svelte5-types';

// Named exports
export {
    Tabs,
    TabsContent,
    TabsList,
    TabsRoot,
    TabsTrigger
};

// Aliased exports for compound pattern
export const Root = TabsRoot;
export const Content = TabsContent;
export const List = TabsList;
export const Trigger = TabsTrigger;

// Type exports
export type * from './types';
