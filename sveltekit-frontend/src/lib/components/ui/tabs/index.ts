// Tabs Component - Svelte 5 Native Implementation
import Tabs from './Tabs.svelte';
import TabsContent from './TabsContent.svelte';
import TabsList from './TabsList.svelte';
import TabsRoot from './TabsRoot.svelte';
import TabsTrigger from './TabsTrigger.svelte';

// Named exports
export {
    Tabs, TabsContent,
    TabsList, TabsRoot, TabsTrigger
};

// Aliased exports for compound pattern
    export {
        Content, List, Root,
        //
        Root as Tabs,
        Content as TabsContent,
        List as TabsList,
        Trigger as TabsTrigger, Trigger
    };

// Type exports
    export type * from './types';

