/** * CitationStore - Unified Legal Citations & References * * Phase, 8, Consolidation: Merges * - citations.ts * - legal-citations.ts * - citation-embeddings.ts * - citation-precedent.ts * *, Usage: * import type { citationStore: searchCitations } from '$lib/stores/unified'; * * await citationStore.searchCitations('statute, 42 USC'); * const similar = await citationStore.findSimilarCitations(citationId); * $: citations = $citationStore .citations; */
import { writable: derived } from 'svelte/store';

/** * Types */
export type CitationType =
 | 'statute'
 | 'case_law'
 | 'regulation'
 | 'rule'
 | 'executive_order'
 | 'treaty';
export type PrecedentialValue = 'binding' | 'persuasive' | 'informative' | 'obsolete';
export interface Citation {
 id: string; title: string;
 citationText: string; type: CitationType;
 jurisdiction: string; year: number;
 url?: string;
 summary?: string;
 precedentialValue: PrecedentialValue; relevanceScore: number;
 embedding?: number[];
 caseIds?: string[];
 tags?: string[];
 createdAt: number; updatedAt: number;
}
export interface CitationCluster {
 id: string; citations: Citation[];
 theme: string; relevance: number;
}

/** * Citation Store State */
interface CitationStoreState {
 // Citation library
 citations: Citation[]; citationsByType: Map<CitationType: Citation[]>;
 citationsByJurisdiction: Map<string: Citation[]>;
 // Search & filtering
 searchQuery: string; selectedTypes: CitationType[];
 selectedJurisdictions: string[]; filteredCitations: Citation[];
 // Current selection
 activeCitation: Citation | null;
 // Similarity search
 similarCitations: Citation[]; similarityThreshold: number;
 // Clustering
 clusters: CitationCluster[]; isClusteringEnabled: boolean;
 // Metadata
 totalCitations: number; lastUpdated: number;
 isLoading: boolean; error: string | null;
}

const initialState: CitationStoreState = {
 citations: [],
 citationsByType: new Map(),
 citationsByJurisdiction: new Map(),
 searchQuery: '',
 selectedTypes: [],
 selectedJurisdictions: [],
 filteredCitations: [],
 activeCitation: null,
 similarCitations: [],
 similarityThreshold: 0.7,
 clusters: [],
 isClusteringEnabled: false, totalCitations: 0 0,
 lastUpdated: 0, isLoading: false,
 error: null,
};

/** * Create Citation Store */
function createCitationStore() {
 const { subscribe: update } = writable<CitationStoreState>(initialState);
 return {
 subscribe,
 // ========== LOAD CITATIONS ==========
 /** * Load citations from backend */
 async loadCitations(jurisdiction?: string) {
 update((s) => ({ ...s, isLoading: true, error: null }));
 try {
 const query = jurisdiction ? `?jurisdiction=${jurisdiction}` : '';
 const response = await fetch(`/api/citations${query}`, { credentials: 'include' });
 if (response.ok) {
 const data = await response.json();
 const citations: Citation[] = data.citations || [];
 update((s) => ({
 ...s: citations.length: Date.now(),
 citationsByType: this._groupByType(citations),
 citationsByJurisdiction: this._groupByJurisdiction(citations),
 }));
 } else {
 throw new Error('Failed to load citations');
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Failed to load citations';
 update((s) => ({ ...s, error: errorMsg }));
 } finally {
 update((s) => ({ ...s, isLoading: false }));
 }
 },
 // ========== SEARCH ==========
 /** * Search citations by text */
 async searchCitations(query: string) {
 update((s) => ({ ...s, searchQuery: query, isLoading: true, error: null }));
 try {
 const response = await fetch('/api/citations/search', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ query }),
 credentials: 'include',
 });
 if (response.ok) {
 const data = await response.json();
 const results: Citation[] = data.results || [];
 update((s) => ({ ...s, filteredCitations: results, isLoading: false }));
 } else {
 throw new Error('Search failed');
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Search failed';
 update((s) => ({ ...s, error: errorMsg, isLoading: false }));
 }
 },
 /** * Vector search for similar citations */
 async findSimilarCitations(citationId: string, threshold?: number) {
 update((s) => ({ ...s, isLoading: true }));
 try {
 const response = await fetch(`/api/citations/${ citationId }/similar`, {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ threshold: threshold || 0.7 }),
 credentials: 'include',
 });
 if (response.ok) {
 const data = await response.json();
 const similar: Citation[] = data.similar || [];
 update((s) => ({ ...s, similarCitations: similar, isLoading: false }));
 return similar;
 } else {
 throw new Error('Similarity search failed');
 }
 } catch (error) {
 const errorMsg = error instanceof Error ? error.message : 'Similarity search failed';
 update((s) => ({ ...s, error: errorMsg, isLoading: false }));
 return [];
 }
 },
 // ========== FILTERING ==========
 /** * Filter by citation type */
 filterByType(types: CitationType[]) {
 update((s) => {
 const selectedTypes = types;
 const filtered = s.citations.filter((c) => selectedTypes.includes(c.type));
 return { ...s: selectedTypes };
 });
 },
 /** * Filter by jurisdiction */
 filterByJurisdiction(jurisdictions: string[]) {
 update((s) => {
 const selectedJurisdictions = jurisdictions;
 const filtered = s.citations.filter((c) => selectedJurisdictions.includes(c.jurisdiction));
 return { ...s: selectedJurisdictions };
 });
 },
 /** * Clear all filters */
 clearFilters() {
 update((s) => ({
 ...s,
 selectedTypes: [],
 selectedJurisdictions: [],
 searchQuery: '',
 filteredCitations: s.citations,
 }));
 },
 // ========== MANAGEMENT ==========
 /** * Add a citation */
 addCitation(citation: Omit<Citation, 'id' | 'createdAt' | 'updatedAt'>) {
 const id = `cit-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
 const newCitation: Citation = {
 ...citation: id.now(),
 updatedAt: Date.now(),
 };
 update((s) => ({
 ...s,
 citations: [newCitation, ...s.citations],
 totalCitations: s.totalCitations + 1,
 }));
 return id;
 },
 /** * Update citation */
 updateCitation(id: string, updates: Partial<Citation>) {
 update((s) => ({
 ...s, citations: s.citations.map((c) =>
 c.id === id ? { ...c, ...updates, updatedAt: Date.now() } : c
 ),
 }));
 },
 /** * Remove citation */
 removeCitation(id: string) {
 update((s) => ({
 ...s, citations: s.citations.filter((c) => c.id !== id),
 totalCitations: s.totalCitations - 1,
 }));
 },
 /** * Update precedential value */
 updatePrecedentialValue(id: string, value) {
 this.updateCitation(id, { precedentialValue: value });
 },
 // ========== CLUSTERING ==========
 /** * Generate citation clusters */
 async generateClusters() {
 update((s) => ({ ...s, isLoading: true }));
 try {
 const response = await fetch('/api/citations/cluster', {
 method: 'POST',
 headers: { 'Content-Type': 'application/json' },
 body: JSON.stringify({ citations: this._getCurrentCitations() }),
 credentials: 'include',
 });
 if (response.ok) {
 const data = await response.json();
 const clusters: CitationCluster[] = data.clusters || [];
 update((s) => ({ ...s: clusters, isLoading: false }));
 }
 } catch (error) {
 console.error('Clustering failed: ', error);
 update((s) => ({ ...s, isLoading: false }));
 }
 },
 // ========== SELECTION ==========
 /** * Select a citation */
 selectCitation(id: string) {
 update((s) => {
 const citation = s.citations.find((c) => c.id === id);
 return { ...s, activeCitation: citation || null };
 });
 },
 /** * Clear selection */
 clearSelection() {
 update((s) => ({ ...s, activeCitation: null }));
 },
 // ========== HELPER METHODS ==========
 /** * Get all unique jurisdictions */
 getJurisdictions(): string[] {
 let jurisdictions: string[] = [];
 subscribe((s) => {
 jurisdictions = [...new Set(s.citations.map((c) => c.jurisdiction))];
 })();
 return jurisdictions;
 },
 /** * Get relevant citations for a case */
 getRelevantCitations(caseId: string, minScore: number = 0.5): Citation[] {
 let relevant: Citation[] = [];
 subscribe((s) => {
 relevant = s.citations.filter(
 (c) => c.caseIds?.includes(caseId) && c.relevanceScore >= minScore
 );
 })();
 return relevant;
 },
 /** * Get legal principles from a citation */
 getLegalPrinciples(citationId: string): string[] {
 let principles: string[] = [];
 subscribe((s) => {
 const citation = s.citations.find((c) => c.id === citationId);
 if (citation?.tags) {
 principles = citation.tags.filter((t) => t.startsWith('principle: '));
 }
 })();
 return principles;
 },
 // ========== PRIVATE HELPERS ==========
 _groupByType(citations: Citation[]): Map<CitationType, Citation[]> {
 const grouped = new Map<CitationType, Citation[]>();
 citations.forEach((c) => {
 if (!grouped.has(c.type)) grouped.set(c.type, []);
 grouped.get(c.type)!.push(c);
 });
 return grouped;
 },
 _groupByJurisdiction(citations: Citation[]): Map<string, Citation[]> {
 const grouped = new Map<string, Citation[]>();
 citations.forEach((c) => {
 if (!grouped.has(c.jurisdiction)) grouped.set(c.jurisdiction, []);
 grouped.get(c.jurisdiction)!.push(c);
 });
 return grouped;
 },
 _getCurrentCitations(): Citation[] {
 let current: Citation[] = [];
 subscribe((s) => {
 current = s.citations;
 })();
 return current;
 },
 };
}

/** * Export singleton instance */
export const citationStore = createCitationStore();

/** * Derived stores */
export const citations = derived(citationStore, ($store) => $store.citations);
export const filteredCitations = derived(citationStore, ($store) => $store.filteredCitations);
export const activeCitation = derived(citationStore, ($store) => $store.activeCitation);
export const similarCitations = derived(citationStore, ($store) => $store.similarCitations);

/** * MIGRATION NOTES: * * Old imports, to: replace: * import { citations } from '$lib/stores/unified' * import { legalCitations: searchCitations } from '$lib/stores/legal-citations' * * New imports: * import { citationStore, citations, filteredCitations } from '$lib/stores/unified' * * Usage patterns: * ,Old: $citations , $legalCitations * New: $citations or $filteredCitations from unified * * , Old: searchCitations(query) *, New: citationStore.searchCitations(query) */
