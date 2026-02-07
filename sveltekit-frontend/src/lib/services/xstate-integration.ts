
import { legalAIMachine } from '$lib/machines/legalAIMachine.v5';
import { writable, type Writable } from 'svelte/store';
import { createActor, type Snapshot, type Actor } from 'xstate';
import type { LegalAIContext } from '$lib/machines/legalAIMachine.v5';

// Define snapshot type with fallback since it might be missing in context types
type LegalAISnapshot = Snapshot<LegalAIContext>;

// Create the actor type
type LegalAIActor = Actor<typeof legalAIMachine>;

let legalAIActor: LegalAIActor | undefined;
let legalAIStateStore: Writable<LegalAISnapshot>;

// Initialize robust fallback state
const getFallbackState = (errorMsg: string = 'Initializing'): LegalAISnapshot => ({
    status: 'active',
    output: undefined,
    error: undefined,
    value: 'initializing',
    context: {
        user: { id: null, email: null, role: null, permissions: [], isAuthenticated: false },
        cases: {
            items: [],
            currentCase: null,
            filters: { search: '', status: 'all', priority: 'all', category: 'all' },
            pagination: { page: 1, limit: 10, total: 0 },
            loading: false,
            error: errorMsg
        },
        ai: {
            isProcessing: false,
            currentQuery: '',
            lastResponse: null,
            error: null,
            models: {
                primary: 'gemma3-legal',
                embedding: 'nomic-embed-text',
                available: ['gemma3-legal', 'gpt4-legal', 'llama2-legal']
            }
        },
        system: {
            connected: false,
            services: {
                database: false, redis: false, ollama: false, gpu: false, pgvector: false, qdrant: false, neo4j: false
            },
            metrics: { errorCount: 0, performanceScore: 0, uptime: 0 }
        }
    }
} as unknown as LegalAISnapshot);

try {
    if (typeof window !== 'undefined') {
        legalAIActor = createActor(legalAIMachine);
        legalAIActor.start();
        console.log('[XState] Legal AI actor started');
        legalAIStateStore = writable(legalAIActor.getSnapshot());

        // Subscribe store to actor updates
        legalAIActor.subscribe((snapshot) => {
            legalAIStateStore.set(snapshot);
        });
    } else {
        // SSR Fallback
        legalAIStateStore = writable(getFallbackState('SSR Environment'));
    }
} catch (error) {
    console.error('[XState] Initialization error:', error);
    legalAIStateStore = writable(getFallbackState('Initialization Failed'));
}

export const xstateIntegration = {
    /**
     * Get the current reactive state store
     */
    legalAIState: legalAIStateStore,

    /**
     * Get a one-time snapshot of the global state
     */
    getGlobalState(): LegalAISnapshot {
        if (legalAIActor) {
            return legalAIActor.getSnapshot();
        }
        // Return current store value if actor is missing
        let currentValue;
        const unsub = legalAIStateStore.subscribe(v => currentValue = v);
        unsub();
        return currentValue as LegalAISnapshot;
    },

    /**
     * Send an event to the machine
     */
    sendEvent(event: any): void {
        if (legalAIActor) {
            legalAIActor.send(event);
        } else {
            console.warn('[XState] Cannot send event: actor not initialized');
        }
    },

    /**
     * Subscribe to state changes
     */
    subscribe(listener: (snapshot: LegalAISnapshot) => void): () => void {
        if (legalAIActor) {
            const sub = legalAIActor.subscribe(listener);
            return () => sub.unsubscribe();
        }
        return () => {};
    },

    /**
     * Perform semantic search (mock)
     */
    async performSemanticSearch(query: string): Promise<any[]> {
        console.log('[XState] Semantic search:', query);
        return [];
    }
};
