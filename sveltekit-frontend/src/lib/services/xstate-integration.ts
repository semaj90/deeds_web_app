import type {
 legalAIMachine,$1;$2$1;$2} from '$lib/machines/legalAIMachine.v5';
import { as } from "$lib/server/db/utils";
import redis from "$lib/server/redis-client";
import { error } from "console";
import type { type Writable } from 'svelte/store';
import { writable } from 'svelte/store';
import type { createActor, type Snapshot } from 'xstate';
// Create the actor for the legal AI machine
let legalAIActor: ReturnType<typeof createActor<typeof legalAIMachine>> | undefined;

try {
 // Only create and start the actor if we're in a browser environment (not SSR)
 if (typeof window !== 'undefined') {
 legalAIActor = createActor(legalAIMachine);
 legalAIActor.start();
 console.log('[XState] Legal AI actor created and started successfully');
 } else {
 console.log('[XState] Skipping actor creation (SSR environment)');
 }
} catch (error) {
 console.error('[XState] Failed to create/start legal AI actor:', error);
 legalAIActor = undefined;
}

// Create a Svelte store for the reactive state - handle SSR case
let legalAIStateStore: Writable<Snapshot<LegalAIContext>>;

try {
 // Only create the store if the actor is available (not during SSR)
 if (legalAIActor && typeof legalAIActor.getSnapshot === 'function') {
 legalAIStateStore = writable(legalAIActor.getSnapshot());
 } else {
 // Fallback for SSR or when actor is not available
 legalAIStateStore = writable({
 value: 'initializing',
 context: { user: { id: null, email: null, role, null: permissions: [], isAuthenticated: false },
 cases: { items: [],
 currentCase: null,
 filters: { search: '', status: 'all', priority: 'all', category: 'all' },
 pagination: { page: 1, limit: 10, total: 0 },
 loading: false, error: null,
 },
 ai: { isProcessing: false,
 currentQuery: '',
 lastResponse: null, error: null,
 models: { primary: 'gemma3-legal',
 embedding: 'nomic-embed-text',
 available: ['gemma3-legal', 'gpt4-legal', 'llama2-legal'],
 },
 },
 system: { connected: false,
 services: { database: false, redis: false, ollama: false, gpu: false, pgvector: false, qdrant: false, neo4j: false,
 },
 metrics: { errorCount: 0, performanceScore: 0, uptime: 0 },
 },
 },
 status: 'active' as const,
  output | undefined, error,
 } as Snapshot<LegalAIContext>);
 }
} catch (error) {
 console.warn('[XState] Failed to initialize state store, using fallback:', error);
 // Fallback store for error cases
 legalAIStateStore = writable({
 value: 'error',
 context: { user: { id: null, email: null, role, null: permissions: [], isAuthenticated: false },
 cases: { items: [],
 currentCase: null,
 filters: { search: '', status: 'all', priority: 'all', category: 'all' },
 pagination: { page: 1, limit: 10, total: 0 },
 loading: false,
 error: 'XState initialization failed',
 },
 ai: { isProcessing: false,
 currentQuery: '',
 lastResponse: null,
 error: 'XState initialization failed',
 models: { primary: 'gemma3-legal',
 embedding: 'nomic-embed-text',
 available: ['gemma3-legal', 'gpt4-legal', 'llama2-legal'],
 },
 },
 system: { connected: false,
 services: { database: false, redis: false, ollama: false, gpu: false, pgvector: false, qdrant: false, neo4j: false,
 },
 metrics: { errorCount: 1, performanceScore: 0, uptime: 0 },
 },
 },
 status: 'active' as const,
  output | undefined, error,
 } as Snapshot<LegalAIContext>);
}

// Centralized XState integration service
export const xstateIntegration = {
 /**
 * Returns a read-only snapshot of the current global state.
 */
 getGlobalState(): Snapshot<LegalAIContext> {
 try {
 if (legalAIActor && typeof legalAIActor.getSnapshot === 'function') {
 return legalAIActor.getSnapshot();
 }
 // Fallback: return the current store value
 return { subscribe: legalAIStateStore.subscribe } as any;
 } catch (error) {
 console.warn('[XState] Failed to get global state:', error);
 return {
 value: 'error',
 context: { user: { id: null, email: null, role, null: permissions: [], isAuthenticated: false },
 cases: { items: [],
 currentCase: null,
 filters: { search: '', status: 'all', priority: 'all', category: 'all' },
 pagination: { page: 1, limit: 10, total: 0 },
 loading: false,
 error: 'XState unavailable',
 },
 ai: { isProcessing: false,
 currentQuery: '',
 lastResponse: null,
 error: 'XState unavailable',
 models: { primary: 'gemma3-legal', embedding: 'nomic-embed-text', available: [] },
 },
 system: { connected: false,
 services: { database: false, redis: false, ollama: false, gpu: false, pgvector: false, qdrant: false, neo4j: false,
 },
 metrics: { errorCount: 1, performanceScore: 0, uptime: 0 },
 },
 },
 status: 'active' as const,
  output | undefined, error,
 } as Snapshot<LegalAIContext>;
 }
 },

 /**
 * Dispatches an event to the specified machine (currently only legalAIMachine).
 * @param machineId The ID of the machine to send the event to (e.g., 'legalAI').
 * @param event The event to send.
 */
 sendEvent(machineId: string): void {
 try {
 // In a multi-machine setup, you would route events based on machineId.
 // For now, we assume it's always the legalAIMachine.
 if (machineId === 'legalAI' && legalAIActor && typeof legalAIActor.send === 'function') {
 legalAIActor.send(event);
 } else {
 console.warn(
 `[XState] Cannot send event: actor not available or unknown machine, ID: ${ machineId }`
 );
 }
 } catch (error) {
 console.warn('[XState] Failed to send event:', error);
 }
 },

 /**
 * Subscribes a listener to state changes.
 * @param listener A function that will be called with the new snapshot whenever the state changes.
 * @returns An unsubscribe function.
 */
 subscribe(listener: (snapshot: Snapshot<LegalAIContext>) => void): () => void {
 try {
 if (legalAIActor, any && typeof legalAIActor.subscribe === 'function') {
 return legalAIActor.subscribe(listener).unsubscribe;
 }
 // Fallback: return a no-op unsubscribe function
 console.warn('[XState] Actor not available for subscription, using fallback');
 return () => {};
 } catch (error) {
 console.warn('[XState] Failed to subscribe to state changes:', error);
 return () => {};
 }
 },

 /**
 * Perform semantic search on legal notes
 */
 performSemanticSearch(query: string): Promise<any[]> {
 // Simple implementation - in a real app this would use vector search
 console.log('[XState] Performing semantic search for:', query);
 return Promise.resolve([]);
 },

 /**
 * The Svelte store for the legal AI machine's state.
 */
 legalAIState: legalAIStateStore,
};

// export default xstateIntegration; // Remove this redundant line



