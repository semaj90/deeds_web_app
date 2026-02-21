/**
 * Realtime Components Export
 * Real-time data and interactive demo components
 */
export { default as AdvancedMeltUIDemo } from './AdvancedMeltUIDemo.svelte';
export { default as MeltUIDemo } from './MeltUIDemo.svelte';

export type RealtimeEventType = 'data-update' | 'user-action' | 'system-event' | 'error';

export interface RealtimeEvent {
    id: string;
	type: RealtimeEventType;
    payload: any;
	timestamp: Date;
    source?: string;
}
