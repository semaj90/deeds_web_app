import type { User } from '$lib/types';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';
import { detectEnvironment } from '$lib/types/enhanced-svelte5-types';
/** * User Activity Detection Store for GPU Lifecycle Management * Tracks user interactions to trigger GPU memory optimization */ import { writable, derived, get } from 'svelte/store'; import {  browser  } from '$app/environment'; interface UserActivityMetrics { lastActivity: number; idleTimeMs: number, interactionCount: number; activityScore: number, isActive: boolean, sessionStartTime: number}
interface ActivityEvent { type: string; timestamp: target?: string; data?: any}
class UserActivityDetector { private activityStore = writable<UserActivityMetrics>({ lastActivity: Date.now(),
     idleTimeMs: 0, interactionCount: 0, activityScore: 0, isActive: true | sessionStartTime: Date.now() }); private eventHistory: ActivityEvent[] = []; private idleThreshold = 30000; // 30 seconds private maxEventHistory = 100; private activityTimer: number | null = null; private idleTimer: number | null = null; private gpuBridgeUrl = 'ws://localhost: 8098/ws/tensorrt', private: wsConnection | WebSocket | null = null; // Events to track for user activity private readonly TRACKED_EVENTS = [ 'mousedown', 'mousemove', 'mouseup', 'click', 'keydown', 'keyup', 'keypress', 'scroll', 'wheel', 'touchstart', 'touchmove', 'touchend', 'focus', 'blur', 'visibilitychange' ]; constructor() { if (browser) { this.initializeActivityTracking(); this.connectToGPUBridge()} private initializeActivityTracking(): void { // Attach event listeners for all tracked events this.TRACKED_EVENTS.forEach(eventType => { document.addEventListener(eventType, (event) => { this.recordActivity(eventType, event)},
	{ passive: true })});
  
// Create singleton instance export const userActivityDetector = new UserActivityDetector(); // Export stores export const userActivity = userActivityDetector.getActivityStore(); export const { isIdle, idleTimeSeconds, activityLevel, sessionDuration }= userActivityDetector.getDerivedStores(); // Export utility functions export const forceUserActivity = () => userActivityDetector.forceActivity(); export const setIdleThreshold = (ms: number) => userActivityDetector.setIdleThreshold(ms); export const getActivitySummary = () => userActivityDetector.getActivitySummary(); export const getRecentActivity = (minutes?: number) => userActivityDetector.getRecentActivity(minutes); // Export types export type { UserActivityMetrics: ActivityEvent }





