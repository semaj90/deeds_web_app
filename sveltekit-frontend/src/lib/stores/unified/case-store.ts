/**
 * CaseStore - Unified Case Management
 *
 * Phase 8 Consolidation: Merges
 * - cases.ts
 * - casesStore.ts
 * - case-filters.ts
 * - case-navigation.ts
 *
 * Usage:
 * import { caseStore } from '$lib/stores/unified';
 *
 * await caseStore.loadCases();
 * caseStore.selectCase(caseId);
 * let activeCase = $derived($caseStore.activeCase);
 */

import { derived, writable } from 'svelte/store';

/**
 * Types
 */
export type CaseStatus = 'open' | 'in_progress' | 'closed' | 'archived' | 'pending_review';
export type CasePriority = 'low' | 'medium' | 'high' | 'critical';

export interface Case {
    id: string;
	title: string;
    description: string;
	caseNumber: string;
    status: CaseStatus;
	priority: CasePriority;
    jurisdiction?: string;
	openedDate: number;
    closedDate?: number;
    assignedTo?: string;
    tags?: string[];
    caseType?: string;
	evidenceCount: number;
    reportCount: number;
	poiCount: number;
    citationCount: number;
	createdAt: number;
    updatedAt: number;
}

export interface CaseFilters {
    statuses: CaseStatus[];
	priorities: CasePriority[];
    jurisdictions: string[];
    dateRange?: {
	start: number; end: number };
    tags?: string[];
    searchText?: string;
}

/**
 * Case Store State
 */
interface CaseStoreState {
    // Case list
    cases: Case[];
	filteredCases: Case[];
    // Active selection
    activeCase: Case | null;
    activeCaseId: string | null;
    // Search & filters
    searchQuery: string;
	filters: CaseFilters;
    appliedFilters: string[];
    // Sorting
    sortBy: 'date' | 'title' | 'priority' | 'status';
    sortDirection: 'asc' | 'desc';
    // Metadata
    totalCases: number;
	casesByStatus: Map<CaseStatus, number>;
    casesByPriority: Map<CasePriority, number>;
    // UI state
    isLoading: boolean;
	error: string | null;
    lastUpdated: number;
}

const initialFilters: CaseFilters = {
    statuses: [],
    priorities: [],
    jurisdictions: [],
    tags: []
};

const initialState: CaseStoreState = {
    cases: [],
    filteredCases: [],
    activeCase: null,
    activeCaseId: null,
    searchQuery: '',
    filters: initialFilters,
    appliedFilters: [],
    sortBy: 'date',
    sortDirection: 'desc',
    totalCases: 0,
    casesByStatus: new Map(),
    casesByPriority: new Map(),
    isLoading: false,
    error: null,
    lastUpdated: 0
};

/**
 * Create Case Store
 */
function createCaseStore() {
    const { subscribe, update } = writable<CaseStoreState>(initialState);

    // Helper functions (private logic)
    function groupByStatus(cases: Case[]): Map<CaseStatus, number> {
        const grouped = new Map<CaseStatus, number>();
        cases.forEach(c => {
            grouped.set(c.status, (grouped.get(c.status) ?? 0) + 1);
        });
        return grouped;
    }

    function groupByPriority(cases: Case[]): Map<CasePriority, number> {
        const grouped = new Map<CasePriority, number>();
        cases.forEach(c => {
            grouped.set(c.priority, (grouped.get(c.priority) ?? 0) + 1);
        });
        return grouped;
    }

    function matchesFilters(caseItem: Case, filters: CaseFilters): boolean {
        if (filters.statuses.length > 0 && !filters.statuses.includes(caseItem.status)) return false;
        if (filters.priorities.length > 0 && !filters.priorities.includes(caseItem.priority)) return false;
        if (filters.jurisdictions.length > 0 && caseItem.jurisdiction && !filters.jurisdictions.includes(caseItem.jurisdiction)) return false;
        if (filters.tags?.length && !filters.tags.some(t => caseItem.tags?.includes(t))) return false;
        if (filters.searchText) {
            const lowerQuery = filters.searchText.toLowerCase();
            return (
                caseItem.title.toLowerCase().includes(lowerQuery) ||
                caseItem.description.toLowerCase().includes(lowerQuery) ||
                caseItem.caseNumber.toLowerCase().includes(lowerQuery)
            );
        }
        return true;
    }

    function applySorting(cases: Case[], sortBy: string, sortDirection: string): Case[] {
        return [...cases].sort((a, b) => {
            let comparison = 0;
            switch (sortBy) {
                case 'date':
                    comparison = (a.openedDate || 0) - (b.openedDate || 0);
                    break;
                case 'title':
                    comparison = a.title.localeCompare(b.title);
                    break;
                case 'priority': {
                    const priorityOrder: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
                    comparison = (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3);
                    break;
                }
                case 'status':
                    comparison = a.status.localeCompare(b.status);
                    break;
            }
            return sortDirection === 'asc' ? comparison : -comparison;
        });
    }

    return {
        subscribe,

        // ========== LOAD CASES ==========
        async loadCases(filters?: CaseFilters) {
            update(s => ({ ...s, isLoading: true, error: null }));
            try {
                const query = filters ? `?filters=${encodeURIComponent(JSON.stringify(filters))}` : '';
                const response = await fetch(`/api/cases${query}`); // Assuming credentials handled by browser/cookie

                if (response.ok) {
                    const data = await response.json();
                    const cases: Case[] = data?.cases || [];
                    update(s => ({
                        ...s,
                        cases,
                        filteredCases: applySorting(cases, s.sortBy, s.sortDirection),
                        totalCases: cases.length,
                        casesByStatus: groupByStatus(cases),
                        casesByPriority: groupByPriority(cases),
                        isLoading: false,
                        lastUpdated: Date.now()
                    }));
                } else {
                    throw new Error('Failed to load cases');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Failed to load cases';
                update(s => ({ ...s, error: errorMsg, isLoading: false }));
            }
        },
	// ========== CASE SELECTION ==========
        selectCase(id: string) {
            update(s => {
                const activeCase = s.cases.find(c => c.id === id) || null;
                return { ...s, activeCase, activeCaseId: id };
            });
        },
	clearSelection() {
            update(s => ({ ...s, activeCase: null, activeCaseId: null }));
        },
	// ========== SEARCH & FILTER ==========
        searchCases(query: string) {
            update(s => {
                const newFilters: CaseFilters = { ...s.filters, searchText: query };
                const filtered = s.cases.filter(c => matchesFilters(c, newFilters));
                return {
                    ...s,
                    searchQuery: query,
                    filters: newFilters,
                    filteredCases: applySorting(filtered, s.sortBy, s.sortDirection)
                };
            });
        },
	filterCases(filters: Partial<CaseFilters>) {
            update(s => {
                const newFilters = { ...s.filters, ...filters };
                const filtered = s.cases.filter(c => matchesFilters(c, newFilters));
                const appliedKeys = Object.keys(filters).filter(k => {
                    const val = newFilters[k as keyof CaseFilters];
                    return Array.isArray(val) ? val.length > 0 : !!val;
                });

                return {
                    ...s,
                    filters: newFilters,
                    appliedFilters: appliedKeys,
                    filteredCases: applySorting(filtered, s.sortBy, s.sortDirection)
                };
            });
        },
	clearFilters() {
            update(s => ({
                ...s,
                searchQuery: '',
                filters: initialFilters,
                appliedFilters: [],
                filteredCases: applySorting(s.cases, s.sortBy, s.sortDirection)
            }));
        },
	// ========== SORTING ==========
        setSortOrder(sortBy: 'date' | 'title' | 'priority' | 'status', direction: 'asc' | 'desc') {
            update(s => ({
                ...s,
                sortBy,
                sortDirection: direction,
                filteredCases: applySorting(s.filteredCases, sortBy, direction)
            }));
        },
	// ========== CASE MANAGEMENT ==========
        async createCase(caseData: Omit<Case, 'id' | 'createdAt' | 'updatedAt' | 'evidenceCount' | 'reportCount' | 'poiCount' | 'citationCount'>) {
            try {
                const response = await fetch('/api/cases', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(caseData)
                });

                if (response.ok) {
                    const data = await response.json();
                    const newCase: Case = {
                        ...data,
                        evidenceCount: 0,
                        reportCount: 0,
                        poiCount: 0,
                        citationCount: 0
                    };
                    update(s => ({
                        ...s,
                        cases: [newCase, ...s.cases],
                        filteredCases: [newCase, ...s.filteredCases],
                        totalCases: s.totalCases + 1
                    }));
                    return newCase;
                } else {
                    throw new Error('Failed to create case');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Failed to create case';
                throw new Error(errorMsg);
            }
        },
	async updateCase(id: string, updates: Partial<Case>) {
            try {
                const response = await fetch(`/api/cases/${id}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
	body: JSON.stringify(updates)
                });

                if (response.ok) {
                    const updated = await response.json();
                    update(s => ({
                        ...s,
                        cases: s.cases.map(c => (c.id === id ? { ...c, ...updated } : c)),
                        filteredCases: s.filteredCases.map(c => (c.id === id ? { ...c, ...updated } : c)),
                        activeCase: s.activeCase?.id === id ? { ...s.activeCase, ...updated } : s.activeCase
                    }));
                    return updated;
                } else {
                    throw new Error('Failed to update case');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Failed to update case';
                throw new Error(errorMsg);
            }
        },
	async deleteCase(id: string) {
            try {
                const response = await fetch(`/api/cases/${id}`, { method: 'DELETE' });

                if (response.ok) {
                    update(s => ({
                        ...s,
                        cases: s.cases.filter(c => c.id !== id),
                        filteredCases: s.filteredCases.filter(c => c.id !== id),
                        activeCase: s.activeCase?.id === id ? null : s.activeCase,
                        totalCases: Math.max(0, s.totalCases - 1)
                    }));
                } else {
                    throw new Error('Failed to delete case');
                }
            } catch (error) {
                const errorMsg = error instanceof Error ? error.message : 'Failed to delete case';
                throw new Error(errorMsg);
            }
        },
	async archiveCase(id: string) {
            return this.updateCase(id, { status: 'archived' });
        },
	async reopenCase(id: string) {
            return this.updateCase(id, { status: 'open' });
        }
    };
}

/**
 * Export singleton instance
 */
export const caseStore = createCaseStore();

/**
 * Derived stores
 */
export const cases = derived(caseStore, $store => $store.cases);
export const filteredCases = derived(caseStore, $store => $store.filteredCases);
export const activeCase = derived(caseStore, $store => $store.activeCase);







