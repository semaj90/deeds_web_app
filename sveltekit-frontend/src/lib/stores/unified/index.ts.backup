export { aiAssistantStore as aiAssistant, aiAssistantStore } from './ai-assistant-store.svelte.js';
export { canvasStore as canvas, canvasStore } from './canvas-store';
export { caseStore as cases, caseStore, caseStore as legalCase } from './case-store';
export { citationStore as citations, citationStore } from './citation-store';
export { evidenceStore as evidence, evidenceStore as evidenceHierarchy, evidenceStore, evidenceStore as evidenceWorkflow } from './evidence-store';
export { notificationStore as alerts, notificationStore as notifications, notificationStore } from './notification-store';
export { poiStore as poi, poiStore } from './poi-store';
export { reportStore as report, reportStore } from './report-store';
export { searchStore as search, searchStore } from './search-store';
export { userStore as avatarStore, currentUser, isAuthenticated, userStore as user, userStore as userData, userError, userLoading, userStore } from './user-store';
export { userStore as avatarStore, currentUser, isAuthenticated, userStore as user, userStore as userData, userError, userLoading, userStore } from './user-store';

import { writable } from 'svelte/store';
import { writable } from 'svelte/store';

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

export const queuedTasks = writable<QueuedTask[]>([]);
export const redisStats = writable<any>(null);
export const isRedisHealthy = writable<boolean>(true);
export const redisOrchestratorClient = { processQuery: async () => ({ success: false }) };
