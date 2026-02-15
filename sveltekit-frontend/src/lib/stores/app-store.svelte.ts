/**
 * App Store - Svelte 5 Runes (Session 30)
 *
 * Migrated from writable + appActions pattern to class-based $state/$derived.
 * Merges appStore (data) and appActions (methods) into a single reactive class.
 */

import type {
	Case,
	CaseStats,
	Evidence,
	EvidenceStats,
	PersonOfInterest,
	SearchResult,
	SystemMetrics,
} from '$lib/services/api-client';

import {
	caseApi,
	evidenceApi,
	poiApi,
	searchApi,
	systemApi,
} from '$lib/services/api-client';

class AppStore {
	// Cases
	cases = $state<Case[]>([]);
	caseStats = $state<CaseStats | null>(null);
	selectedCase = $state<Case | null>(null);

	// Evidence
	evidence = $state<Evidence[]>([]);
	evidenceStats = $state<EvidenceStats | null>(null);
	selectedEvidence = $state<Evidence | null>(null);

	// Persons of Interest
	pois = $state<PersonOfInterest[]>([]);
	selectedPOI = $state<PersonOfInterest | null>(null);

	// Search
	searchResults = $state<SearchResult[]>([]);
	searchQuery = $state('');

	// System
	systemMetrics = $state<SystemMetrics | null>(null);
	isLoading = $state(false);
	error = $state<string | null>(null);

	// Derived selectors
	activeCases = $derived(
		this.cases.filter((c) => c.status === 'open' || c.status === 'investigating'),
	);
	criticalCases = $derived(this.cases.filter((c) => c.priority === 'critical'));
	recentEvidence = $derived(this.evidence.slice(0, 10));
	highThreatPOIs = $derived(
		this.pois.filter((p) => p.threatLevel === 'high' || p.threatLevel === 'critical'),
	);
	systemHealth = $derived.by(() => {
		if (!this.systemMetrics) return 'unknown';
		const services = Object.values(this.systemMetrics.services);
		const healthy = services.filter((s: any) => s.status === 'healthy').length;
		const total = services.length;
		return healthy === total ? 'healthy' : healthy > total / 2 ? 'degraded' : 'unhealthy';
	});

	// --- Actions ---

	setLoading(loading: boolean) {
		this.isLoading = loading;
	}

	setError(error: string | null) {
		this.error = error;
	}

	// Cases
	async loadCases(params?: {
		page?: number;
		limit?: number;
		status?: string;
		priority?: string;
		search?: string;
	}) {
		this.isLoading = true;
		try {
			const response = await caseApi.getCases(params);
			if (response?.success && response.data) {
				this.cases = response.data.items;
				this.error = null;
			} else {
				this.error = response?.error ?? 'Failed to load cases';
			}
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Failed to load cases';
		} finally {
			this.isLoading = false;
		}
	}

	async loadCaseStats() {
		try {
			const response = await caseApi.getCaseStats();
			if (response?.success && response.data) {
				this.caseStats = response.data;
			}
		} catch (error) {
			console.error('Failed to load case stats:', error);
		}
	}

	setSelectedCase(case_: Case | null) {
		this.selectedCase = case_;
	}

	async createCase(
		data: Omit<Case, 'id' | 'createdAt' | 'updatedAt' | 'evidenceCount' | 'poiCount'>,
	) {
		this.isLoading = true;
		try {
			const response = await caseApi.createCase(data);
			if (response?.success && response.data) {
				this.cases = [response.data, ...this.cases];
				this.error = null;
				return response.data;
			} else {
				this.error = response?.error ?? 'Failed to create case';
			}
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Failed to create case';
		} finally {
			this.isLoading = false;
		}
	}

	async updateCase(id: string, data: Partial<Case>) {
		this.isLoading = true;
		try {
			const response = await caseApi.updateCase(id, data);
			if (response?.success && response.data) {
				this.cases = this.cases.map((c) => (c.id === id ? response.data! : c));
				if (this.selectedCase?.id === id) {
					this.selectedCase = response.data;
				}
				this.error = null;
				return response.data;
			} else {
				this.error = response?.error ?? 'Failed to update case';
			}
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Failed to update case';
		} finally {
			this.isLoading = false;
		}
	}

	// Evidence
	async loadEvidence(params?: {
		page?: number;
		limit?: number;
		type?: string;
		status?: string;
		caseId?: string;
		search?: string;
	}) {
		this.isLoading = true;
		try {
			const response = await evidenceApi.getEvidence(params);
			if (response?.success && response.data) {
				this.evidence = response.data.items;
				this.error = null;
			} else {
				this.error = response?.error ?? 'Failed to load evidence';
			}
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Failed to load evidence';
		} finally {
			this.isLoading = false;
		}
	}

	async loadEvidenceStats() {
		try {
			const response = await evidenceApi.getEvidenceStats();
			if (response?.success && response.data) {
				this.evidenceStats = response.data;
			}
		} catch (error) {
			console.error('Failed to load evidence stats:', error);
		}
	}

	setSelectedEvidence(evidence: Evidence | null) {
		this.selectedEvidence = evidence;
	}

	async uploadEvidence(formData: FormData) {
		this.isLoading = true;
		try {
			const response = await evidenceApi.uploadEvidence(formData);
			if (response?.success && response.data) {
				this.evidence = [response.data, ...this.evidence];
				this.error = null;
				return response.data;
			} else {
				this.error = response?.error ?? 'Failed to upload evidence';
			}
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Failed to upload evidence';
		} finally {
			this.isLoading = false;
		}
	}

	// Persons of Interest
	async loadPOIs(params?: {
		page?: number;
		limit?: number;
		threatLevel?: string;
		status?: string;
		search?: string;
	}) {
		this.isLoading = true;
		try {
			const response = await poiApi.getPOIs(params);
			if (response?.success && response.data) {
				this.pois = response.data.items;
				this.error = null;
			} else {
				this.error = response?.error ?? 'Failed to load persons of interest';
			}
		} catch (error) {
			this.error =
				error instanceof Error ? error.message : 'Failed to load persons of interest';
		} finally {
			this.isLoading = false;
		}
	}

	setSelectedPOI(poi: PersonOfInterest | null) {
		this.selectedPOI = poi;
	}

	async createPOI(data: Omit<PersonOfInterest, 'id' | 'createdAt'>) {
		this.isLoading = true;
		try {
			const response = await poiApi.createPOI(data);
			if (response?.success && response.data) {
				this.pois = [response.data, ...this.pois];
				this.error = null;
				return response.data;
			} else {
				this.error = response?.error ?? 'Failed to create person of interest';
			}
		} catch (error) {
			this.error =
				error instanceof Error ? error.message : 'Failed to create person of interest';
		} finally {
			this.isLoading = false;
		}
	}

	// Search
	async search(
		query: string,
		filters?: {
			type?: string[];
			tags?: string[];
			dateFrom?: string;
			dateTo?: string;
			caseId?: string;
		},
	) {
		this.isLoading = true;
		try {
			const response = await searchApi.searchGlobal(query, filters);
			if (response?.success && response.data) {
				this.searchResults = response.data;
				this.searchQuery = query;
				this.error = null;
			} else {
				this.error = response?.error ?? 'Search failed';
			}
		} catch (error) {
			this.error = error instanceof Error ? error.message : 'Search failed';
		} finally {
			this.isLoading = false;
		}
	}

	clearSearch() {
		this.searchResults = [];
		this.searchQuery = '';
	}

	// System Metrics
	async loadSystemMetrics() {
		try {
			const response = await systemApi.getMetrics();
			if (response?.success && response.data) {
				this.systemMetrics = response.data;
			}
		} catch (error) {
			console.error('Failed to load system metrics:', error);
		}
	}

	async loadGPUMetrics() {
		try {
			const response = await systemApi.getGPUMetrics();
			if (response?.success && response.data) {
				if (this.systemMetrics) {
					this.systemMetrics = {
						...this.systemMetrics,
						gpu: response.data,
					};
				}
			}
		} catch (error) {
			console.error('Failed to load GPU metrics:', error);
		}
	}

	// Initialize app data
	async initializeApp() {
		this.isLoading = true;
		try {
			await Promise.allSettled([
				this.loadCases({ limit: 20 }),
				this.loadCaseStats(),
				this.loadEvidence({ limit: 20 }),
				this.loadEvidenceStats(),
				this.loadPOIs({ limit: 20 }),
				this.loadSystemMetrics(),
				this.loadGPUMetrics(),
			]);
		} catch (error) {
			console.error('Failed to initialize app:', error);
		} finally {
			this.isLoading = false;
		}
	}

	// Reset store
	reset() {
		this.cases = [];
		this.caseStats = null;
		this.selectedCase = null;
		this.evidence = [];
		this.evidenceStats = null;
		this.selectedEvidence = null;
		this.pois = [];
		this.selectedPOI = null;
		this.searchResults = [];
		this.searchQuery = '';
		this.systemMetrics = null;
		this.isLoading = false;
		this.error = null;
	}
}

export const appStore = new AppStore();

// Re-export AppState interface for backward compatibility
export type AppState = {
	cases: Case[];
	caseStats: CaseStats | null;
	selectedCase: Case | null;
	evidence: Evidence[];
	evidenceStats: EvidenceStats | null;
	selectedEvidence: Evidence | null;
	pois: PersonOfInterest[];
	selectedPOI: PersonOfInterest | null;
	searchResults: SearchResult[];
	searchQuery: string;
	systemMetrics: SystemMetrics | null;
	isLoading: boolean;
	error: string | null;
};
