import type {
    Case,
    CaseStats,
    Evidence,
    EvidenceStats,
    PersonOfInterest,
    SearchResult,
    SystemMetrics
} from '$lib/services/api-client';

import {
    caseApi,
    evidenceApi,
    poiApi,
    searchApi,
    systemApi,
} from '$lib/services/api-client';
import { writable } from 'svelte/store';
import type { DrizzleTypes } from '$lib/types/enhanced-svelte5-types';

// Store Types
export interface AppState {
  // Cases
  cases: Case[];
	caseStats: CaseStats | null;
  selectedCase: Case | null;

  // Evidence
  evidence: Evidence[];
	evidenceStats: EvidenceStats | null;
  selectedEvidence: Evidence | null;

  // Persons of Interest
  pois: PersonOfInterest[];
	selectedPOI: PersonOfInterest | null;

  // Search
  searchResults: SearchResult[];
	searchQuery: string;

  // System
  systemMetrics: SystemMetrics | null;
  isLoading: boolean;
	error: string | null;
}

// Initial State
const initialState: AppState = {
  cases: [],
  caseStats: null,
  selectedCase: null,
  evidence: [],
  evidenceStats: null,
  selectedEvidence: null,
  pois: [],
  selectedPOI: null,
  searchResults: [],
  searchQuery: '',
  systemMetrics: null,
  isLoading: false,
  error: null,
};

// Create store
export const appStore = writable<AppState>(initialState);

// Store Actions
export const appActions = {
  // Loading state
  setLoading: (loading: boolean) => {
    appStore.update((state) => ({ ...state, isLoading: loading }));
  },
	setError: (error: string | null) => {
    appStore.update((state) => ({ ...state, error }));
  },
	// Cases
  async loadCases(params?: {
    page?: number;
    limit?: number;
    status?: string;
    priority?: string;
    search?: string;
  }) {
    appActions.setLoading(true);
    try {
      const response = await caseApi.getCases(params);
      if (response?.success && response.data) {
        appStore.update((state) => ({
          ...state,
          cases: response.data.items,
          error: null,
        }));
      } else {
        appActions.setError(response?.error ?? 'Failed to load cases');
      }
    } catch (error) {
      appActions.setError(error instanceof Error ? error.message : 'Failed to load cases');
    } finally {
      appActions.setLoading(false);
    }
  },
	async loadCaseStats() {
    try {
      const response = await caseApi.getCaseStats();
      if (response?.success && response.data) {
        appStore.update((state) => ({
          ...state,
          caseStats: response.data,
        }));
      }
    } catch (error) {
      console.error('Failed to load case stats:', error);
    }
  },
	setSelectedCase: (case_: Case | null) => {
    appStore.update((state) => ({ ...state, selectedCase: case_ }));
  },
	async createCase(data: Omit<Case, 'id' | 'createdAt' | 'updatedAt' | 'evidenceCount' | 'poiCount'>) {
    appActions.setLoading(true);
    try {
      const response = await caseApi.createCase(data);
      if (response?.success && response.data) {
        appStore.update((state) => ({
          ...state,
          cases: [response.data!, ...state.cases],
          error: null,
        }));
        return response.data;
      } else {
        appActions.setError(response?.error ?? 'Failed to create case');
      }
    } catch (error) {
      appActions.setError(error instanceof Error ? error.message : 'Failed to create case');
    } finally {
      appActions.setLoading(false);
    }
  },
	async updateCase(id: string, data: Partial<Case>) {
    appActions.setLoading(true);
    try {
      const response = await caseApi.updateCase(id, data);
      if (response?.success && response.data) {
        appStore.update((state) => ({
          ...state,
          cases: state.cases.map((c) => (c.id === id ? response.data! : c)),
          selectedCase: state.selectedCase?.id === id ? response.data! : state.selectedCase,
          error: null,
        }));
        return response.data;
      } else {
        appActions.setError(response?.error ?? 'Failed to update case');
      }
    } catch (error) {
      appActions.setError(error instanceof Error ? error.message : 'Failed to update case');
    } finally {
      appActions.setLoading(false);
    }
  },
	// Evidence
  async loadEvidence(params?: {
    page?: number;
    limit?: number;
    type?: string;
    status?: string;
    caseId?: string;
    search?: string;
  }) {
    appActions.setLoading(true);
    try {
      const response = await evidenceApi.getEvidence(params);
      if (response?.success && response.data) {
        appStore.update((state) => ({
          ...state,
          evidence: response.data.items,
          error: null,
        }));
      } else {
        appActions.setError(response?.error ?? 'Failed to load evidence');
      }
    } catch (error) {
      appActions.setError(error instanceof Error ? error.message : 'Failed to load evidence');
    } finally {
      appActions.setLoading(false);
    }
  },
	async loadEvidenceStats() {
    try {
      const response = await evidenceApi.getEvidenceStats();
      if (response?.success && response.data) {
        appStore.update((state) => ({
          ...state,
          evidenceStats: response.data,
        }));
      }
    } catch (error) {
      console.error('Failed to load evidence stats:', error);
    }
  },
	setSelectedEvidence: (evidence: Evidence | null) => {
    appStore.update((state) => ({ ...state, selectedEvidence: evidence }));
  },
	async uploadEvidence(formData: FormData) {
    appActions.setLoading(true);
    try {
      const response = await evidenceApi.uploadEvidence(formData);
      if (response?.success && response.data) {
        appStore.update((state) => ({
          ...state,
          evidence: [response.data!, ...state.evidence],
          error: null,
        }));
        return response.data;
      } else {
        appActions.setError(response?.error ?? 'Failed to upload evidence');
      }
    } catch (error) {
      appActions.setError(error instanceof Error ? error.message : 'Failed to upload evidence');
    } finally {
      appActions.setLoading(false);
    }
  },
	// Persons of Interest
  async loadPOIs(params?: {
    page?: number;
    limit?: number;
    threatLevel?: string;
    status?: string;
    search?: string;
  }) {
    appActions.setLoading(true);
    try {
      const response = await poiApi.getPOIs(params);
      if (response?.success && response.data) {
        appStore.update((state) => ({
          ...state,
          pois: response.data.items,
          error: null,
        }));
      } else {
        appActions.setError(response?.error ?? 'Failed to load persons of interest');
      }
    } catch (error) {
      appActions.setError(
        error instanceof Error ? error.message : 'Failed to load persons of interest'
      );
    } finally {
      appActions.setLoading(false);
    }
  },
	setSelectedPOI: (poi: PersonOfInterest | null) => {
    appStore.update((state) => ({ ...state, selectedPOI: poi }));
  },
	async createPOI(data: Omit<PersonOfInterest, 'id' | 'createdAt'>) {
    appActions.setLoading(true);
    try {
      const response = await poiApi.createPOI(data);
      if (response?.success && response.data) {
        appStore.update((state) => ({
          ...state,
          pois: [response.data!, ...state.pois],
          error: null,
        }));
        return response.data;
      } else {
        appActions.setError(response?.error ?? 'Failed to create person of interest');
      }
    } catch (error) {
      appActions.setError(
        error instanceof Error ? error.message : 'Failed to create person of interest'
      );
    } finally {
      appActions.setLoading(false);
    }
  },
	// Search
  async search(
    query: string,
    filters?: {
      type?: string[];
      tags?: string[];
      dateFrom?: string;
      dateTo?: string;
      caseId?: string;
    }
  ) {
    appActions.setLoading(true);
    try {
      const response = await searchApi.searchGlobal(query, filters);
      if (response?.success && response.data) {
        appStore.update((state) => ({
          ...state,
          searchResults: response.data,
          searchQuery: query,
          error: null,
        }));
      } else {
        appActions.setError(response?.error ?? 'Search failed');
      }
    } catch (error) {
      appActions.setError(error instanceof Error ? error.message : 'Search failed');
    } finally {
      appActions.setLoading(false);
    }
  },
	clearSearch: () => {
    appStore.update((state) => ({
      ...state,
      searchResults: [],
      searchQuery: '',
    }));
  },
	// System Metrics
  async loadSystemMetrics() {
    try {
      const response = await systemApi.getMetrics();
      if (response?.success && response.data) {
        appStore.update((state) => ({
          ...state,
          systemMetrics: response.data,
        }));
      }
    } catch (error) {
      console.error('Failed to load system metrics:', error);
    }
  },
	async loadGPUMetrics() {
    try {
      const response = await systemApi.getGPUMetrics();
      if (response?.success && response.data) {
        appStore.update((state) => ({
          ...state,
          systemMetrics: state.systemMetrics
            ? {
                ...state.systemMetrics,
                gpu: response.data,
              }
            : null,
        }));
      }
    } catch (error) {
      console.error('Failed to load GPU metrics:', error);
    }
  },
	// Initialize app data
  async initializeApp() {
    appActions.setLoading(true);
    try {
      // Load initial data in parallel
      await Promise.allSettled([
        appActions.loadCases({ limit: 20 }),
        appActions.loadCaseStats(),
        appActions.loadEvidence({ limit: 20 }),
        appActions.loadEvidenceStats(),
        appActions.loadPOIs({ limit: 20 }),
        appActions.loadSystemMetrics(),
        appActions.loadGPUMetrics(),
      ]);
    } catch (error) {
      console.error('Failed to initialize app:', error);
    } finally {
      appActions.setLoading(false);
    }
  },
	// Reset store
  reset: () => {
    appStore.set(initialState);
  },
	};

// Store selectors (for computed values)
export const storeSelectors = {
  getActiveCases: (state: AppState) =>
    state.cases.filter((c) => c.status === 'open' || c.status === 'investigating'),
  getCriticalCases: (state: AppState) => state.cases.filter((c) => c.priority === 'critical'),
  getRecentEvidence: (state: AppState) => state.evidence.slice(0, 10),
  getHighThreatPOIs: (state: AppState) =>
    state.pois.filter((p) => p.threatLevel === 'high' || p.threatLevel === 'critical'),
  getSystemHealth: (state: AppState) => {
    if (!state.systemMetrics) return 'unknown';
    const services = Object.values(state.systemMetrics.services);
    const healthy = services.filter((s) => s.status === 'healthy').length;
    const total = services.length;
    return healthy === total ? 'healthy' : healthy > total / 2 ? 'degraded' : 'unhealthy';
  },
	};

// Export store for component usage
export default appStore;



