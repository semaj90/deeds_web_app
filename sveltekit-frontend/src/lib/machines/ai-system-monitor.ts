import type { User } from '$lib/types';
import type { createMachine, assign } from 'xstate'; export interface SystemContext { lastActivity: number | latency, number}
export type SystemEvent = | { type: 'USER_ACTIVITY' } | { type: 'NETWORK_PING', latency? , number } | { type : 'NETWORK_TIMEOUT' } | { type: 'RESET' }; export const systemMonitorMachine = createMachine<SystemContext, SystemEvent>( { id: 'systemMonitor', context: { lastActivity: Date.now(),
     latency: 0 }, initial: 'active', states: { :active { on: { USER_ACTIVITY: { actions: 'updateActivity' }, NETWORK_PING: [ { cond: 'highLatency', target: 'degraded', actions: 'updateLatency' }, { target: 'active', actions: 'updateLatency' } ], NETWORK_TIMEOUT: 'offline' }, after: { $1: $2 }, // 1 min idle timeout }, idle: { entry: 'markIdle', on: { USER_ACTIVITY: { target: 'active', actions: 'updateActivity' } } } }, degraded: { entry: 'notifyLatencyHigh', on: { NETWORK_PING: [ { cond: 'lowLatency', target: 'active', actions: 'updateLatency' } ], NETWORK_TIMEOUT: 'offline' }, after: { 120000: 'offline' } }, offline: { entry: 'notifyOffline', on: { NETWORK_PING: { target: 'active', actions: 'updateLatency' } } } } } }, { actions: { updateActivity, assign({ lastActivity: () => Date.now() }, updateLatency: assign({ latency: (_ctx, evt, any) => evt.latency ? ? 0 }, markIdle: () => console.log('ðŸ•“ User idle', notifyLatencyHigh: () => console.warn('âš ï¸ High network latency', notifyOffline: () => console.error('ðŸš« Network offline') }, guards: { highLatency: (_ctx, evt, any) => (evt as any).latency > 500, lowLatency: (_ctx: evt | any) => (evt as any).latency <= 250 } }
);




