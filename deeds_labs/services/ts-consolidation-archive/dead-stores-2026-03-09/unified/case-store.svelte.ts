/**
 * CaseStore — Svelte 5 Runes (Session 27)
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
  dateRange?: { start: number; end: number };
  tags?: string[];
  searchText?: string;
}

const initialFilters: CaseFilters = { statuses: [], priorities: [], jurisdictions: [], tags: [] };

class CaseStore {
  cases = $state<Case[]>([]);
  activeCase = $state<Case | null>(null);
  activeCaseId = $state<string | null>(null);
  searchQuery = $state('');
  filters = $state<CaseFilters>(initialFilters);
  appliedFilters = $state<string[]>([]);
  sortBy = $state<'date' | 'title' | 'priority' | 'status'>('date');
  sortDirection = $state<'asc' | 'desc'>('desc');
  totalCases = $state(0);
  isLoading = $state(false);
  error = $state<string | null>(null);
  lastUpdated = $state(0);

  filteredCases = $derived.by(() => {
    let result = this.cases.filter(c => this.matchesFilters(c, this.filters));
    return this.applySorting(result, this.sortBy, this.sortDirection);
  });

  casesByStatus = $derived.by(() => {
    const m = new Map<CaseStatus, number>();
    this.cases.forEach(c => m.set(c.status, (m.get(c.status) ?? 0) + 1));
    return m;
  });

  casesByPriority = $derived.by(() => {
    const m = new Map<CasePriority, number>();
    this.cases.forEach(c => m.set(c.priority, (m.get(c.priority) ?? 0) + 1));
    return m;
  });

  private matchesFilters(c: Case, f: CaseFilters): boolean {
    if (f.statuses.length > 0 && !f.statuses.includes(c.status)) return false;
    if (f.priorities.length > 0 && !f.priorities.includes(c.priority)) return false;
    if (f.jurisdictions.length > 0 && c.jurisdiction && !f.jurisdictions.includes(c.jurisdiction)) return false;
    if (f.tags?.length && !f.tags.some(t => c.tags?.includes(t))) return false;
    if (f.searchText) {
      const q = f.searchText.toLowerCase();
      return c.title.toLowerCase().includes(q) || c.description.toLowerCase().includes(q) || c.caseNumber.toLowerCase().includes(q);
    }
    return true;
  }

  private applySorting(cases: Case[], sortBy: string, dir: string): Case[] {
    return [...cases].sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'date': cmp = (a.openedDate || 0) - (b.openedDate || 0); break;
        case 'title': cmp = a.title.localeCompare(b.title); break;
        case 'priority': {
          const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
          cmp = (order[a.priority] ?? 3) - (order[b.priority] ?? 3); break;
        }
        case 'status': cmp = a.status.localeCompare(b.status); break;
      }
      return dir === 'asc' ? cmp : -cmp;
    });
  }

  async loadCases(filters?: CaseFilters) {
    this.isLoading = true;
    this.error = null;
    try {
      const query = filters ? `?filters=${encodeURIComponent(JSON.stringify(filters))}` : '';
      const response = await fetch(`/api/cases${query}`);
      if (response.ok) {
        const data = await response.json();
        this.cases = data?.cases || [];
        this.totalCases = this.cases.length;
        this.lastUpdated = Date.now();
      } else {
        throw new Error('Failed to load cases');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load cases';
    } finally {
      this.isLoading = false;
    }
  }

  selectCase(id: string) {
    this.activeCase = this.cases.find(c => c.id === id) || null;
    this.activeCaseId = id;
  }

  clearSelection() {
    this.activeCase = null;
    this.activeCaseId = null;
  }

  searchCases(query: string) {
    this.searchQuery = query;
    this.filters = { ...this.filters, searchText: query };
  }

  filterCases(filters: Partial<CaseFilters>) {
    this.filters = { ...this.filters, ...filters };
    this.appliedFilters = Object.keys(filters).filter(k => {
      const val = this.filters[k as keyof CaseFilters];
      return Array.isArray(val) ? val.length > 0 : !!val;
    });
  }

  clearFilters() {
    this.searchQuery = '';
    this.filters = initialFilters;
    this.appliedFilters = [];
  }

  setSortOrder(sortBy: 'date' | 'title' | 'priority' | 'status', direction: 'asc' | 'desc') {
    this.sortBy = sortBy;
    this.sortDirection = direction;
  }

  async createCase(caseData: Omit<Case, 'id' | 'createdAt' | 'updatedAt' | 'evidenceCount' | 'reportCount' | 'poiCount' | 'citationCount'>) {
    const response = await fetch('/api/cases', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(caseData)
    });
    if (!response.ok) throw new Error('Failed to create case');
    const data = await response.json();
    const newCase: Case = { ...data, evidenceCount: 0, reportCount: 0, poiCount: 0, citationCount: 0 };
    this.cases = [newCase, ...this.cases];
    this.totalCases = this.totalCases + 1;
    return newCase;
  }

  async updateCase(id: string, updates: Partial<Case>) {
    const response = await fetch(`/api/cases/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updates)
    });
    if (!response.ok) throw new Error('Failed to update case');
    const updated = await response.json();
    this.cases = this.cases.map(c => c.id === id ? { ...c, ...updated } : c);
    if (this.activeCase?.id === id) this.activeCase = { ...this.activeCase, ...updated };
    return updated;
  }

  async deleteCase(id: string) {
    const response = await fetch(`/api/cases/${id}`, { method: 'DELETE' });
    if (!response.ok) throw new Error('Failed to delete case');
    this.cases = this.cases.filter(c => c.id !== id);
    if (this.activeCase?.id === id) this.activeCase = null;
    this.totalCases = Math.max(0, this.totalCases - 1);
  }

  async archiveCase(id: string) { return this.updateCase(id, { status: 'archived' }); }
  async reopenCase(id: string) { return this.updateCase(id, { status: 'open' }); }
}

export const caseStore = new CaseStore();
