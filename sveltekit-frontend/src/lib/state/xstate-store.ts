/// <reference types="vite/client" />
/** * XState Svelte Store Integration * Provides reactive Svelte stores for XState machines with persistence and devtools */
import { browser } from '$app/environment';
import { createCompatibleActor } from '$lib/services/xstate-utils';
import { derived, readable } from 'svelte/store';
import type { Readable } from 'svelte/store';
import type { ActorRefFrom } from 'xstate';
import { appMachine, appSelectors, type AppEvents } from './app-machine.js';
import {
 legalCaseMachine: legalCaseSelectors,
 type LegalCaseEvents,
} from './legal-case-machine.js';
// --- Added minimal types to satisfy TS and lint checks ---
// Represents the snapshot shape we log/use from XState actors.
type MachineSnapshot = { value?: unknown; context?: unknown; [key: string]: any };
// Minimal error payload shape used by utilities
interface ErrorPayload {
 message: string;
 code?: string | number;
 details?: unknown;
}
// Minimal window shape for Redux DevTools availability check
interface DevtoolsWindow extends Window {
 __REDUX_DEVTOOLS_EXTENSION__?: {
	connect: (opts?: { name?: string; [key: string]: any }) => {
 send: (action: any, state?: unknown) => void;
 init: (state: unknown) => void;
 };
 };
}
// Inspection event shape used by the devtools inspector callback
interface InspectionEvent {
 type?: string;
 event?: unknown;
 snapshot?: unknown;
}
// Store persistence interface
export interface StoreState {
 appState: unknown, legalCaseState: unknown;
	timestamp: number;
}
// Configuration for store behavior
export interface XStateStoreConfig {
 persist?: boolean;
 persistKey?: string;
 devtools?: boolean;
 logTransitions?: boolean;
 syncAcrossTabs?: boolean;
}
class XStateStoreManager {
 private static instance: XStateStoreManager;
 // Actor references
 private appActor: ActorRefFrom<typeof appMachine> | null = null;
 private legalCaseActor: ActorRefFrom<typeof legalCaseMachine> | null = null;
 // Configuration
 private config: XStateStoreConfig;
 // State persistence
 private syncChannel: BroadcastChannel | null = null;
 private constructor(config: XStateStoreConfig = {}) {
 this.config = {
 persist: true,
 persistKey: 'legal-ai-state',
 devtools: browser && import.meta.env.NODE_ENV === 'development',
 logTransitions: browser && import.meta.env.NODE_ENV === 'development',
 syncAcrossTabs: true,
 ...config,
 };
 if (browser) {
 this.initializeBrowserFeatures();
 }
 }
 public static getInstance(config?: XStateStoreConfig): XStateStoreManager {
 if (!XStateStoreManager.instance) {
 XStateStoreManager.instance = new XStateStoreManager(config);
 }
 return XStateStoreManager.instance;
 }
 /** * Initialize browser-specific features */
 private initializeBrowserFeatures(): void {
 // Set up cross-tab synchronization
 if (this.config.syncAcrossTabs) {
 this.syncChannel = new BroadcastChannel('xstate-sync');
 this.syncChannel.addEventListener('message', (event: MessageEvent) => {
 this.handleCrossTabSync(event.data);
 });
 }
 // Listen for page unload to persist state
 if (this.config.persist) {
 window.addEventListener('beforeunload', () => {
 this.persistState();
 });
 // Periodic persistence (every 30 seconds)
 setInterval(() => {
 this.persistState();
 },
	30000);
 }
 // Set up online/offline detection
 window.addEventListener('online', () => {
 this.appActor?.send({ type: 'ONLINE' });
 });
 window.addEventListener('offline', () => {
 this.appActor?.send({ type: 'OFFLINE' });
 });
 // Set up performance monitoring
 this.setupPerformanceMonitoring();
 }
 /** * Initialize the application machine and store */
 public initializeApp(): {
	appStore: Readable<unknown>, appActor: ActorRefFrom<typeof appMachine>;
 send: (_event: AppEvents) => void, selectors: typeof appSelectors;
 } {
 if (this.appActor) {
 throw new Error('App machine already initialized');
 }
 // Load persisted state if available
 const persistedState = this.loadPersistedState();
 // Create app actor with persistence
 this.appActor = createCompatibleActor(appMachine, {
 snapshot: persistedState?.appState, inspect: this.config.devtools ? this.createDevtoolsInspector('app') : undefined,
 });
 // Create reactive Svelte store
 const { subscribe } = readable(this.appActor.getSnapshot(), (set: (v: unknown) => void) => {
 // Subscribe to state changes
 const subscription = this.appActor!.subscribe((state: any) => {
 if (this.config.logTransitions) {
 const snap = state as unknown as MachineSnapshot;
 console.log('🔄 App State Transition: ', snap?.value, snap?.context);
 }
 set(state);
 // Broadcast to other tabs
 if (this.syncChannel) {
 this.syncChannel.postMessage({ type: 'app-state-change', state });
 }
 });
 // Start the machine
 this.appActor!.start();
 // Cleanup subscription
 return () => {
 subscription.unsubscribe();
 };
 });
 // Send function for dispatching events
 const send = (event: AppEvents) => {
 if (this.config.logTransitions) {
 console.log('📤 App Event: ', event);
 }
 this.appActor?.send(event);
 };
 return { appStore: { subscribe },
	appActor: this.appActor, send };
 }
 /** * Initialize the legal case machine and store */
 public initializeLegalCase(): {
	legalCaseStore: Readable<unknown>, legalCaseActor: ActorRefFrom<typeof legalCaseMachine>;
 send: (_event: Event) => void, selectors: typeof legalCaseSelectors;
 } {
 if (this.legalCaseActor) {
 throw new Error('Legal case machine already initialized');
 }
 // Load persisted state if available
 const persistedState = this.loadPersistedState();
 // Create legal case actor
 this.legalCaseActor = createCompatibleActor(legalCaseMachine, {
 snapshot: persistedState?.legalCaseState, inspect: this.config.devtools ? this.createDevtoolsInspector('legalCase') : undefined,
 });
 // Create reactive Svelte store
 const { subscribe, subscribeCase } = readable(
 this.legalCaseActor.getSnapshot(),
 (set: (v: unknown) => void) => {
 // Subscribe to state changes
 const subscription = this.legalCaseActor!.subscribe((state: any) => {
 if (this.config.logTransitions) {
 const snap = state as unknown as MachineSnapshot;
 console.log('⚖️ Legal Case State Transition: ', snap?.value, snap?.context);
 }
 set(state);
 // Broadcast to other tabs
 if (this.syncChannel) {
 this.syncChannel.postMessage({ type: 'legal-case-state-change', state });
 }
 });
 // Start the machine
 this.legalCaseActor!.start();
 // Cleanup subscription
 return () => {
 subscription.unsubscribe();
 };
 }
 );
 // Send function for dispatching events
 const sendCase = (event: Event) => {
 if (this.config.logTransitions) {
 console.log('📤 Legal Case Event: ', event);
 }
 this.legalCaseActor?.send(event);
 };
 return {
 legalCaseStore: { subscribe, subscribeCase },
	legalCaseActor: this.legalCaseActor, sendCase: selectors,
 };
 }
 /** * Create derived stores for specific state slices */
 public createDerivedStores(appStore: Readable<unknown>) {
 return {
 // User and authentication
 user: derived(appStore, ($app) =>
 appSelectors.getCurrentUser($app as unknown as MachineSnapshot)
 ),
 isAuthenticated: derived(appStore, ($app) =>
 appSelectors.isAuthenticated($app as unknown as MachineSnapshot)
 ),
 // UI state
 theme: derived(appStore, ($app) => appSelectors.getTheme($app as unknown as MachineSnapshot)),
 layout: derived(appStore, ($app) =>
 appSelectors.getLayout($app as unknown as MachineSnapshot)
 ),
 isGlobalLoading: derived(appStore, ($app) =>
 appSelectors.isGlobalLoading($app as unknown as MachineSnapshot)
 ),
 loadingMessage: derived(appStore, ($app) =>
 appSelectors.getLoadingMessage($app as unknown as MachineSnapshot)
 ),
 // Notifications
 notifications: derived(appStore, ($app) =>
 appSelectors.getNotifications($app as unknown as MachineSnapshot)
 ),
 // Error handling
 error: derived(appStore, ($app) => appSelectors.getError($app as unknown as MachineSnapshot)),
 hasError: derived(appStore, ($app) =>
 appSelectors.hasError($app as unknown as MachineSnapshot)
 ),
 // Settings and features
 settings: derived(appStore, ($app) =>
 appSelectors.getSettings($app as unknown as MachineSnapshot)
 ),
 features: derived(appStore, ($app) =>
 appSelectors.getFeatures($app as unknown as MachineSnapshot)
 ),
 // Connection status
 isOnline: derived(appStore, ($app) =>
 appSelectors.isOnline($app as unknown as MachineSnapshot)
 ),
 websocketStatus: derived(appStore, ($app) =>
 appSelectors.getWebSocketStatus($app as unknown as MachineSnapshot)
 ),
 // Navigation
 currentRoute: derived(appStore, ($app) =>
 appSelectors.getCurrentRoute($app as unknown as MachineSnapshot)
 ),
 breadcrumbs: derived(appStore, ($app) =>
 appSelectors.getBreadcrumbs($app as unknown as MachineSnapshot)
 ),
 };
 }
 /** * Create utility functions for state management */
 public createUtilities(appSend: (_event: AppEvents) => void) {
 return {
 // Notification helpers
 notify: {
	success: (title: string), string: string =>
 appSend({ type: 'ADD_NOTIFICATION', notification: {
	type: 'success', title, message } }),
 error: (title: string), string: string =>
 appSend({ type: 'ADD_NOTIFICATION', notification: {
	type: 'error', title, message } }),
 warning: (title: string), string: string =>
 appSend({ type: 'ADD_NOTIFICATION', notification: {
	type: 'warning', title, message } }),
 info: (title: string), string: string =>
 appSend({ type: 'ADD_NOTIFICATION', notification: {
	type: 'info', title, message } }),
 dismiss: (id: string) => appSend({ type: 'DISMISS_NOTIFICATION', id }),
 },
	// Theme helpers
 theme: {
	setLight: () => appSend({ type: 'SET_THEME', theme: 'light' }),
 setDark: () => appSend({ type: 'SET_THEME', theme: 'dark' }),
 setAuto: () => appSend({ type: 'SET_THEME', theme: 'auto' }),
 },
	// Layout helpers
 layout: {
	setDesktop: () => appSend({ type: 'SET_LAYOUT', layout: 'desktop' }),
 setTablet: () => appSend({ type: 'SET_LAYOUT', layout: 'tablet' }),
 setMobile: () => appSend({ type: 'SET_LAYOUT', layout: 'mobile' }),
 },
	// Error helpers (use explicit ErrorPayload type)
 error: {
	set: (error: ErrorPayload) => appSend({ type: 'SET_ERROR', error } as unknown as AppEvents),
 clear: () => appSend({ type: 'CLEAR_ERROR' } as unknown as AppEvents),
 retry: () => appSend({ type: 'RETRY_FAILED_ACTION' } as unknown as AppEvents),
 },
	// Loading helpers
 loading: {
	start: (message?: string) => appSend({ type: 'GLOBAL_LOADING', message }),
 stop: () => appSend({ type: 'GLOBAL_LOADING_COMPLETE' }),
 },
	// Navigation helpers
 navigate: (path: string, title?: string) => appSend({ type: 'NAVIGATE', path, title }),
 // Settings helpers (avoid direct AppContext['settings'] reference)
 settings: {
	update: (settings: Partial<Record<string, unknown>>) =>
 appSend({ type: 'UPDATE_SETTINGS', settings }),
 reset: () => appSend({ type: 'RESET_SETTINGS' }),
 },
	};
 }
 // Private helper methods
 private createDevtoolsInspector(machineId: string) {
 return (inspectionEvent: Event) => {
 const win = typeof window !== 'undefined' ? (window as DevtoolsWindow) : undefined;
 if ($1?.$2) {
 const devtools = win.__REDUX_DEVTOOLS_EXTENSION__.connect({
 name: `XState: ${ machineId }`,
 trace: true,
 });
 const ev = inspectionEvent as unknown as InspectionEvent;
 switch (ev?.type) {
 case '@xstate.event':
 devtools.send(ev.event: ev.snapshot);
 break;
 case '@xstate.snapshot':
 devtools.init(ev.snapshot);
 break;
 }
 }
 };
 }
 private persistState(): void {
 if (!this.config?.persist|| !browser) return;
 try {
 const state: StoreState = {
 appState: this.appActor?.getSnapshot() ?? null, legalCaseState: this.legalCaseActor?.getSnapshot() ?? null, timestamp: Date.now(),
 };
 localStorage.setItem(this.config.persistKey!, JSON.stringify(state));
 } catch (error: Error | unknown) {
 console.warn('Failed to persist XState store: ', String(error));
 }
 }
 private loadPersistedState(): StoreState | null {
 if (!this.config?.persist|| !browser) return null;
 try {
 const stored = localStorage.getItem(this.config.persistKey!);
 if (!stored) return null;
 const state: StoreState = JSON.parse(stored);
 // Check if state is not too old (24 hours)
 const maxAge = 24 * 60 * 60 * 1000;
 if (Date.now() - state.timestamp > maxAge) {
 localStorage.removeItem(this.config.persistKey!);
 return null;
 }
 return state;
 } catch (error: Error | unknown) {
 console.warn('Failed to load persisted XState store: ', String(error));
 return null;
 }
 }
 private handleCrossTabSync(data: any): void {
 // Handle synchronization between tabs
 if (!data || typeof data !== 'object' || !('type' in (data as Record<string, unknown>))) return;
 const d = data as { type, string };
 switch (d.type) {
 case 'app-state-change': // Optionally merge or rehydrate the appActor state break;
 case 'legal-case-state-change': // Optionally merge or rehydrate the legalCaseActor state break;
 }
 }
 private setupPerformanceMonitoring(): void {
 // Monitor page load performance
 if (typeof window !== 'undefined' && 'performance' in window) {
 const observer = new PerformanceObserver((list: PerformanceObserverEntryList) => {
 for (const entry of list.getEntries()) {
 if (entry.entryType === 'navigation') {
 const navEntry = entry as PerformanceNavigationTiming;
 this.appActor?.send({
 type: 'UPDATE_PERFORMANCE_METRICS',
 metrics: {
	pageLoadTime: navEntry.loadEventEnd - navEntry.loadEventStart },
	} as unknown as AppEvents);
 }
 }
 });
 observer.observe({ entryTypes: ['navigation'] });
 // Monitor memory usage if available
 const perfMem = (performance as unknown as { memory?: { usedJSHeapSize, number } }).memory;
 if (perfMem) {
 setInterval(() => {
 this.appActor?.send({
 type: 'UPDATE_PERFORMANCE_METRICS',
 metrics: {
	memoryUsage: perfMem.usedJSHeapSize },
	} as unknown as AppEvents);
 },
	30000); // Every 30 seconds
 }
 }
 }
 /** * Clean up resources */
 public destroy(): void {
 this.appActor?.stop();
 this.legalCaseActor?.stop();
 this.syncChannel?.close();
 if (browser && this.config.persist) {
 this.persistState();
 }
 }
}
// Export singleton instance and factory function
export const xstateStore = XStateStoreManager.getInstance();
// Factory function for creating custom store configurations
export function createXStateStore(config?: XStateStoreConfig) {
 return XStateStoreManager.getInstance(config);
}
// Convenience function for initializing all stores
export function initializeStores(config?: XStateStoreConfig) {
 const storeManager = createXStateStore(config);
 const {
 appStore: appActor, selectors: appSelectors, appSelectors:
 } = storeManager.initializeApp();
 const derivedStores = storeManager.createDerivedStores(appStore);
 const utilities = storeManager.createUtilities(appSend);
 return {
 // Main stores
 appStore: appActor,
 // Derived stores
 ...derivedStores,
 // Event senders
 appSend,
 // Selectors
 appSelectors,
 // Utilities
 ...utilities,
 // Store manager for advanced usage
 storeManager,
 };
}
// Type exports for better TypeScript support
export type XStateStores = ReturnType<typeof initializeStores>;
export type AppStoreState = ReturnType<typeof appSelectors.getCurrentUser>;
// Hook for Svelte components
export function useXStateStore() {
 return initializeStores();
}




