export { aiAssistantStore as aiAssistant, aiAssistantStore } from './ai-assistant-store.svelte.js';
export { canvasStore as canvas, canvasStore } from './canvas-store';
export { caseStore as cases, caseStore, caseStore as legalCase } from './case-store';
export { citationStore as citations, citationStore } from './citation-store';
export { evidenceStore as evidence, evidenceStore as evidenceHierarchy, evidenceStore, evidenceStore as evidenceWorkflow } from './evidence-store';
export { notificationStore as alerts, notificationStore as notifications, notificationStore, showToast } from './notification-store';
export { poiStore as poi, poiStore } from './poi-store';
export { reportStore as report, reportStore } from './report-store';
export { searchStore as search, searchStore } from './search-store';
export { toastStore, type Toast } from './toast-store';
export {
    userStore as avatarStore,
    currentUser,
    isAuthenticated,
    userStore as user,
    userStore as userData,
    userError,
    userLoading,
    userStore
} from './user-store';

import { writable } from 'svelte/store';

// ============================================================================
// Stub stores for components that import from unified but lack dedicated files
// ============================================================================

/** Enhanced upload store - tracks upload pipeline state */
export interface EnhancedUploadState {
    status: string;
    progress: number;
    jobId?: string;
    error?: string;
}

function createEnhancedUploadStore() {
    const { subscribe, set, update } = writable<EnhancedUploadState>({
        status: 'idle',
        progress: 0
    });
    return {
        subscribe,
        set,
        update,
        reset: () => set({ status: 'idle', progress: 0 })
    };
}
export const enhancedUploadStore = createEnhancedUploadStore();

/** User analytics store - tracks UI interaction analytics */
function createUserAnalyticsStore() {
    const { subscribe, update } = writable<{ events: Array<Record<string, unknown>> }>({ events: [] });
    return {
        subscribe,
        trackButtonClick: (event: Record<string, unknown>) => {
            update(s => ({ events: [...s.events, event] }));
        }
    };
}
export const userAnalyticsStore = createUserAnalyticsStore();

/** Helper aliases for notification convenience methods */
import { notificationStore as _notifStore } from './notification-store';
export function showSuccess(message: string) {
    _notifStore.showToast(message, 'success');
}
export function showError(message: string) {
    _notifStore.showToast(message, 'error');
}

export interface QueuedTask {
    id: string;
	userId: string;
    status: string;
	type: 'complex_legal' | 'document_analysis' | 'case_synthesis' | 'risk_assessment';
    createdAt?: number;
    completedAt?: number;
    priority?: number;
}

export interface RedisOptimizationResult {
    success: boolean;
    data?: unknown;
    error?: string;
}

/** AI history store - tracks AI prompt/response history */
export const aiHistory = writable<Array<{ query: string; response: string; timestamp: number }>>([]);

/** AI global store and actions - global AI state for assistant components */
export const aiGlobalStore = writable<{ isActive: boolean; context: Record<string, unknown> }>({ isActive: false, context: {} });
export const aiGlobalActions = {
    activate: () => aiGlobalStore.update(s => ({ ...s, isActive: true })),
    deactivate: () => aiGlobalStore.update(s => ({ ...s, isActive: false })),
    setContext: (ctx: Record<string, unknown>) => aiGlobalStore.update(s => ({ ...s, context: ctx }))
};

/** Upload modal/actions store - controls upload modal visibility and actions */
export const uploadModal = writable<{ isOpen: boolean; caseId?: string }>({ isOpen: false });
export const uploadActions = {
    open: (caseId?: string) => uploadModal.set({ isOpen: true, caseId }),
    close: () => uploadModal.set({ isOpen: false })
};

/** WebSocket store - tracks real-time connection state */
export const websocketStore = writable<{ connected: boolean; messages: unknown[] }>({ connected: false, messages: [] });

export const queuedTasks = writable<QueuedTask[]>([]);
export const redisStats = writable<any>(null);
export const isRedisHealthy = writable<boolean>(true);
export const redisOrchestratorClient = { processQuery: async () => ({ success: false }) };
