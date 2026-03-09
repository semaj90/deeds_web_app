/**
 * CitationStore — Svelte 5 Runes (Session 27)
 */

export type CitationType = 'statute' | 'case_law' | 'regulation' | 'rule' | 'executive_order' | 'treaty';
export type PrecedentialValue = 'binding' | 'persuasive' | 'informative' | 'obsolete';

export interface Citation {
  id: string;
  title: string;
  citationText: string;
  type: CitationType;
  jurisdiction: string;
  year: number;
  url?: string;
  summary?: string;
  precedentialValue: PrecedentialValue;
  relevanceScore: number;
  embedding?: number[];
  caseIds?: string[];
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface CitationCluster {
  id: string;
  citations: Citation[];
  theme: string;
  relevance: number;
}

class CitationStore {
  citations = $state<Citation[]>([]);
  searchQuery = $state('');
  selectedTypes = $state<CitationType[]>([]);
  selectedJurisdictions = $state<string[]>([]);
  activeCitation = $state<Citation | null>(null);
  similarCitations = $state<Citation[]>([]);
  similarityThreshold = $state(0.7);
  clusters = $state<CitationCluster[]>([]);
  isClusteringEnabled = $state(false);
  totalCitations = $state(0);
  lastUpdated = $state(0);
  isLoading = $state(false);
  error = $state<string | null>(null);

  filteredCitations = $derived.by(() => {
    let result = this.citations;
    if (this.selectedTypes.length > 0) {
      result = result.filter(c => this.selectedTypes.includes(c.type));
    }
    if (this.selectedJurisdictions.length > 0) {
      result = result.filter(c => this.selectedJurisdictions.includes(c.jurisdiction));
    }
    if (this.searchQuery) {
      const q = this.searchQuery.toLowerCase();
      result = result.filter(c =>
        c.title.toLowerCase().includes(q) ||
        c.citationText.toLowerCase().includes(q) ||
        c.summary?.toLowerCase().includes(q)
      );
    }
    return result;
  });

  citationsByType = $derived.by(() => {
    const m = new Map<CitationType, Citation[]>();
    this.citations.forEach(c => {
      if (!m.has(c.type)) m.set(c.type, []);
      m.get(c.type)!.push(c);
    });
    return m;
  });

  citationsByJurisdiction = $derived.by(() => {
    const m = new Map<string, Citation[]>();
    this.citations.forEach(c => {
      if (!m.has(c.jurisdiction)) m.set(c.jurisdiction, []);
      m.get(c.jurisdiction)!.push(c);
    });
    return m;
  });

  async loadCitations(jurisdiction?: string) {
    this.isLoading = true;
    this.error = null;
    try {
      const query = jurisdiction ? `?jurisdiction=${jurisdiction}` : '';
      const response = await fetch(`/api/citations${query}`, { credentials: 'include' });
      if (response.ok) {
        const data = await response.json();
        this.citations = data?.citations || [];
        this.totalCitations = this.citations.length;
        this.lastUpdated = Date.now();
      } else {
        throw new Error('Failed to load citations');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Failed to load citations';
    } finally {
      this.isLoading = false;
    }
  }

  async searchCitations(query: string) {
    this.searchQuery = query;
    this.isLoading = true;
    this.error = null;
    try {
      const response = await fetch('/api/citations/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query }),
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        this.citations = data?.results || [];
      } else {
        throw new Error('Search failed');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Search failed';
    } finally {
      this.isLoading = false;
    }
  }

  async findSimilarCitations(citationId: string, threshold?: number) {
    this.isLoading = true;
    try {
      const response = await fetch(`/api/citations/${citationId}/similar`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threshold: threshold ?? this.similarityThreshold }),
        credentials: 'include'
      });
      if (response.ok) {
        const data = await response.json();
        this.similarCitations = data?.similar || [];
        return this.similarCitations;
      } else {
        throw new Error('Similarity search failed');
      }
    } catch (err) {
      this.error = err instanceof Error ? err.message : 'Similarity search failed';
      return [];
    } finally {
      this.isLoading = false;
    }
  }

  filterByType(types: CitationType[]) { this.selectedTypes = types; }
  filterByJurisdiction(jurisdictions: string[]) { this.selectedJurisdictions = jurisdictions; }

  clearFilters() {
    this.selectedTypes = [];
    this.selectedJurisdictions = [];
    this.searchQuery = '';
  }

  addCitation(citation: Omit<Citation, 'id' | 'createdAt' | 'updatedAt'>) {
    const id = `cit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newCitation: Citation = { ...citation, id, createdAt: Date.now(), updatedAt: Date.now() };
    this.citations = [newCitation, ...this.citations];
    this.totalCitations = this.totalCitations + 1;
    return id;
  }

  updateCitation(id: string, updates: Partial<Citation>) {
    this.citations = this.citations.map(c =>
      c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
    );
  }

  removeCitation(id: string) {
    this.citations = this.citations.filter(c => c.id !== id);
    this.totalCitations = this.totalCitations - 1;
  }

  selectCitation(id: string) {
    this.activeCitation = this.citations.find(c => c.id === id) ?? null;
  }

  clearSelection() {
    this.activeCitation = null;
  }

  getJurisdictions(): string[] {
    return [...new Set(this.citations.map(c => c.jurisdiction))];
  }

  getRelevantCitations(caseId: string, minScore = 0.5): Citation[] {
    return this.citations.filter(c => c.caseIds?.includes(caseId) && c.relevanceScore >= minScore);
  }
}

export const citationStore = new CitationStore();
