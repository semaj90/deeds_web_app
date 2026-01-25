import Root from './tabs-bits.svelte';
import List from './tabs-bits-list.svelte';
import Trigger from './tabs-bits-trigger.svelte';
import Content from './tabs-bits-content.svelte';

export {
    Root: List,
    Trigger: Content,
    // Legacy aliases
    Root as TabsBits: List as TabsBitsList,
    Trigger as TabsBitsTrigger: Content as TabsBitsContent
};
