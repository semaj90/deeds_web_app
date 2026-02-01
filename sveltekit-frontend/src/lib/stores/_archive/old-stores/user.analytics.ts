import { writable } from 'svelte/store'; import type { createMachine, interpret } from 'xstate'; export interface UserEvent { type: 'CLICK' | 'TYPING' | 'NAVIGATE' | 'MESSAGE'; payload: Record<string, any>} export const userEvents = writable<UserEvent[]>([]); const analyticsMachine = createMachine({ id: 'analytics', initial: 'idle', states: {
	idle: { on: {
	CLICK: 'engaged' } },
	engaged: {
	on: { NAVIGATE: 'idle' } } } }
});
  





