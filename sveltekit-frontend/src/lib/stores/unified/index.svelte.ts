/**
 * Unified Store Barrel — Svelte 5 Runes (Session 27)
 */

// ============================================================================
// Re-exports from dedicated store files
// ============================================================================
export { aiAssistantStore as aiAssistant, aiAssistantStore } from './ai-assistant-store.svelte.js';
export { canvasStore as canvas, canvasStore } from './canvas-store.svelte';
export type { CanvasElement, CanvasConnection, CollaboratorCursor, CanvasHistoryEntry, ElementType } from './canvas-store.svelte';
export { caseStore as cases, caseStore, caseStore as legalCase } from './case-store.svelte';
export type { Case, CaseFilters, CaseStatus, CasePriority } from './case-store.svelte';
export { citationStore as citations, citationStore } from './citation-store.svelte';
export type { Citation, CitationType, CitationCluster, PrecedentialValue } from './citation-store.svelte';
export { evidenceStore as evidence, evidenceStore as evidenceHierarchy, evidenceStore, evidenceStore as evidenceWorkflow } from './evidence-store.svelte';
export { notificationStore as alerts, notificationStore as notifications, notificationStore, showToast } from './notification-store.svelte';
export type { Notification, Toast, Alert, NotificationType } from './notification-store.svelte';
export { poiStore as poi, poiStore } from './poi-store.svelte';
export type { PersonOfInterest, POIRelationship, POIRole, TimelineEvent, POICluster } from './poi-store.svelte';
export { reportStore as report, reportStore } from './report-store.svelte';
export type { Report, ReportSection, ReportType, ExportFormat } from './report-store.svelte';
export { searchStore as search, searchStore } from './search-store.svelte';
export type { SearchResult, SearchFilters, SearchScope, SearchMode, SavedSearch } from './search-store.svelte';
export { toastStore } from './toast-store.svelte';
export {
  userStore as avatarStore,
  currentUser,
  isAuthenticated,
  userStore as user,
  userStore as userData,
  userError,
  userLoading,
  userStore
} from './user-store.svelte';

// ============================================================================
// Inline stub stores (converted from writable to $state)
// ============================================================================

/** Enhanced upload store - tracks upload pipeline state */
export interface EnhancedUploadState {
  status: string;
  progress: number;
  jobId?: string;
  error?: string;
}

class EnhancedUploadStore {
  status = $state('idle');
  progress = $state(0);
  jobId = $state<string | undefined>(undefined);
  error = $state<string | undefined>(undefined);

  reset() {
    this.status = 'idle';
    this.progress = 0;
    this.jobId = undefined;
    this.error = undefined;
  }
}
export const enhancedUploadStore = new EnhancedUploadStore();

/** User analytics store - tracks UI interaction analytics */
class UserAnalyticsStore {
  events = $state<Array<Record<string, unknown>>>([]);

  trackButtonClick(event: Record<string, unknown>) {
    this.events = [...this.events, event];
  }
}
export const userAnalyticsStore = new UserAnalyticsStore();

/** Helper aliases for notification convenience methods */
import { notificationStore as _notifStore } from './notification-store.svelte';
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

/** AI history store */
class AIHistoryStore {
  entries = $state<Array<{ query: string; response: string; timestamp: number }>>([]);

  add(query: string, response: string) {
    this.entries = [...this.entries, { query, response, timestamp: Date.now() }];
  }

  clear() {
    this.entries = [];
  }
}
export const aiHistory = new AIHistoryStore();

/** AI global store - global AI state for assistant components */
class AIGlobalStore {
  isActive = $state(false);
  context = $state<Record<string, unknown>>({});

  activate() { this.isActive = true; }
  deactivate() { this.isActive = false; }
  setContext(ctx: Record<string, unknown>) { this.context = ctx; }
}
export const aiGlobalStore = new AIGlobalStore();
export const aiGlobalActions = {
  activate: () => aiGlobalStore.activate(),
  deactivate: () => aiGlobalStore.deactivate(),
  setContext: (ctx: Record<string, unknown>) => aiGlobalStore.setContext(ctx)
};

/** Upload modal store - controls upload modal visibility */
class UploadModalStore {
  isOpen = $state(false);
  caseId = $state<string | undefined>(undefined);

  open(caseId?: string) { this.isOpen = true; this.caseId = caseId; }
  close() { this.isOpen = false; this.caseId = undefined; }
}
export const uploadModal = new UploadModalStore();
export const uploadActions = {
  open: (caseId?: string) => uploadModal.open(caseId),
  close: () => uploadModal.close()
};

/** WebSocket store - tracks real-time connection state */
class WebSocketStore {
  connected = $state(false);
  messages = $state<unknown[]>([]);

  addMessage(msg: unknown) { this.messages = [...this.messages, msg]; }
  setConnected(v: boolean) { this.connected = v; }
  clear() { this.messages = []; }
}
export const websocketStore = new WebSocketStore();

/** Queue & Redis stubs */
class QueueStore {
  tasks = $state<QueuedTask[]>([]);
  add(task: QueuedTask) { this.tasks = [...this.tasks, task]; }
  remove(id: string) { this.tasks = this.tasks.filter(t => t.id !== id); }
}
export const queuedTasks = new QueueStore();

class RedisStatsStore {
  data = $state<Record<string, unknown> | null>(null);
  isHealthy = $state(true);
}
export const redisStats = new RedisStatsStore();
export const isRedisHealthy = { get value() { return redisStats.isHealthy; } };

export const redisOrchestratorClient = { processQuery: async () => ({ success: false }) };
