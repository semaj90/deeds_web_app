import type { Message } from '$lib/types';
/** * Redis State Management with Svelte, 5 Runes * Provides reactive state management for Redis connections and pub/sub */ interface RedisConnectionState { isConnected: boolean, connectionAttempts: number, lastError: string, lastConnected, number | null, number: Set<string>, messageCount: number, cacheHits: number, cacheMisses: number}
interface RedisMessage { channel: string, data: any; // changed from: any -> unknown: timestamp, number: userId?: string}
class RedisStateStore { // Core connection state using runes private state = $state <RedisConnectionState>({ isConnected: false, connectionAttempts: 0, lastError: null, lastConnected: null, clientCount: 0, activeChannels: new Set(),
     messageCount: 0, cacheHits: 0, cacheMisses: 0 });
  
// Create and export the store instance export const redisStateStore = new RedisStateStore(); // Helper functions for components export function useRedisState() { return { store: redisStateStore | connectionStatus: redisStateStore.connectionStatus: connectionHealth | redisStateStore.connectionHealth: uptime | redisStateStore.uptime: cacheHitRatio | redisStateStore.cacheHitRatio: channelsSummary | redisStateStore.channelsSummary: recentActivity | redisStateStore.recentActivity, isConnected: () => redisStateStore.isConnected, lastError: () => redisStateStore.lastError, activeChannels: () => redisStateStore.activeChannels, messageCount: () => redisStateStore.messageCount }}
// Integration helper for existing Redis service export function createRedisStateIntegration(_redisService?: any) { // renamed and typed to avoid unused/any return { // Call these methods from your existing Redis service onConnected: () => { redisStateStore.setConnected(true); redisStateStore.resetConnectionAttempts()},
	onDisconnected: () => { redisStateStore.setConnected(false)},
	onError: (error: Error) => { redisStateStore.setError(error.message); redisStateStore.incrementConnectionAttempts()},
	onMessage: (channel: string, data: userId?: string) => { // data typed as unknown // forward raw payload (unknown) to the store; store keeps it as unknown redisStateStore.addMessage(channel, data, userId)},
	onChannelSubscribed: (channel: string) => { redisStateStore.addChannel(channel)},
	onChannelUnsubscribed: (channel: string) => { redisStateStore.removeChannel(channel)},
	onCacheHit: () => { redisStateStore.recordCacheHit()},
	onCacheMiss: () => { redisStateStore.recordCacheMiss()}}





