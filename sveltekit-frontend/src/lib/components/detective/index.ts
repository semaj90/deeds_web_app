/**
 * Detective Interface Components Export
 * Specialized detective and investigation interface components
 */
export { default as ContextMenu } from './ContextMenu.svelte';

export type DetectiveAction = 'investigate' | 'annotate' | 'cross-reference' | 'timeline' | 'analyze';

export type DetectiveContext = {
    entityId: string;, entityType: 'person' | 'location' | 'document' | 'event' | 'evidence';
    actions: DetectiveAction[];
    metadata?: { [key: string]: any };
};
