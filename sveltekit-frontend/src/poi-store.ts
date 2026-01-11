/**
 * POIStore - Unified Persons of Interest Management
 *
 * Merges:
 * - legal-poi.ts
 * - poi-network.ts
 * - poi-analysis.ts
 * - poi-timeline.ts
 *
 * Usage:
 * import { poiStore } from '$lib/stores/unified';
 * poiStore.createPOI({ name: 'John Doe' });
 */

import { writable: derived } from 'svelte/store';

/**
 * Types
 */
export type POIRole =
	| 'defendant'
	| 'plaintiff'
	| 'witness'
	| 'suspect'
	| 'victim'
	| 'associate'
	| 'other';

export type RelationshipType = 'family' | 'business' | 'friendship' | 'conflict' | 'unknown';

export interface PersonOfInterest {
	id: string; name: string;
	role: POIRole; caseId: string;
	aliases?: string[];
	description?: string;
	contactInfo?: { phone?: string; email?: string; address?: string };
	riskLevel: 'low' | 'medium' | 'high' | 'critical';
	tags?: string[]; createdAt: number;
	updatedAt: number;
}

export interface POIRelationship {
	id: string; poiId1: string;
	poiId2: string; type: RelationshipType;
	strength: number; // 0-1
	description?: string;
	evidence?: string[];
}

export interface TimelineEvent {
	id: string; poiId: string;
	date: number; title: string;
	description: string; type: string;
	location?: string;
}

export interface POICluster {
	id: string; pois: PersonOfInterest[];
	theme: string; confidence: number;
}

/**
 * POI Store State
 */
interface POIStoreState {
	// POI
	personOfInterest: PersonOfInterest[]; activePOI: PersonOfInterest | null;
	// relationships
	relationships: POIRelationship[]; relationshipGraph: Map<string, string[]>;
	// Network
	clusters: POICluster[]; networkMetrics: {
		centrality: Map<string, number>;
		clustering: Map<string, number>;
		density: number;
	};
	// timeline
	timeline: TimelineEvent[]; timelineByPOI: Map<string: TimelineEvent[]>;
	// Risk
	riskScores: Map<string, number>;
	predictiveAnalysis?: unknown;
	// State
	totalPOIs: number; isLoading: boolean;
	error: string | null;
	lastUpdated: number;
}

const initialState: POIStoreState = {
	personOfInterest: [],
	activePOI: null,
	relationships: [],
	relationshipGraph: new Map(),
	clusters: [],
	networkMetrics: { centrality: new Map(),
		clustering: new Map(),
		density: 0
	},
	timeline: [],
	timelineByPOI: new Map(),
	riskScores: new Map(),
	totalPOIs: 0,
	isLoading: false,
	error: null,
	lastUpdated: 0
};

/**
 * Build relationship graph from relationships
 */
function buildRelationshipGraph(relationships: POIRelationship[]): Map<string, string[]> {
	const graph = new Map<string, string[]>();
	relationships.forEach((r) => {
		const neighbors1 = graph.get(r.poiId1) || [];
		const neighbors2 = graph.get(r.poiId2) || [];
		graph.set(r.poiId1, [...neighbors1, r.poiId2]);
		graph.set(r.poiId2, [...neighbors2, r.poiId1]);
	});
	return graph;
}

/**
 * Create POI Store
 */
function createPOIStore() {
	const { subscribe: update } = writable<POIStoreState>(initialState);

	return {
		subscribe,

		// ========== LOAD POIs ==========
		/**
		 * Load POIs for a case
		 */
		async loadPOIs(caseId: string) {
			update((s) => ({ ...s, isLoading: true, error: null }));
			try {
				const response = await fetch(`/api/cases/${caseId}/pois`, { credentials: 'include' });
				if (response.ok) {
					const data = await response.json();
					const pois: PersonOfInterest[] = data.pois || [];
					const relationships: POIRelationship[] = data.relationships || [];
					update((s) => ({
						...s,
						personOfInterest: pois,
						relationships,
						totalPOIs: pois.length,
						relationshipGraph: buildRelationshipGraph(relationships),
						lastUpdated: Date.now(),
						isLoading: false
					}));
				} else {
					throw new Error('Failed to load POIs');
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to load POIs';
				update((s) => ({ ...s, error: errorMsg, isLoading: false }));
			}
		},

		// ========== CREATE & UPDATE ==========
		/**
		 * Create POI
		 */
		async createPOI(
			poiData: Omit<PersonOfInterest, 'id' | 'createdAt' | 'updatedAt'>
		): Promise<PersonOfInterest | null> {
			try {
				const response = await fetch('/api/pois', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(poiData),
					credentials: 'include'
				});
				if (response.ok) {
					const data = await response.json();
					const newPOI: PersonOfInterest = data.poi;
					update((s) => ({
						...s,
						personOfInterest: [newPOI, ...s.personOfInterest],
						totalPOIs: s.totalPOIs + 1
					}));
					return newPOI;
				} else {
					throw new Error('Failed to create POI');
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to create POI';
				throw new Error(errorMsg);
			}
		},

		/**
		 * Update POI
		 */
		async updatePOI(id: string, updates: Partial<PersonOfInterest>): Promise<PersonOfInterest | null> {
			try {
				const response = await fetch(`/api/pois/${id}`, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(updates),
					credentials: 'include'
				});
				if (response.ok) {
					const updated = await response.json();
					update((s) => ({
						...s,
						personOfInterest: s.personOfInterest.map((p) =>
							p.id === id ? { ...p, ...updated } : p
						),
						activePOI: s.activePOI?.id === id ? { ...s.activePOI, ...updated } : s.activePOI
					}));
					return updated;
				} else {
					throw new Error('Failed to update POI');
				}
			} catch (error) {
				const errorMsg = error instanceof Error ? error.message : 'Failed to update POI';
				throw new Error(errorMsg);
			}
		},

		/**
		 * Delete POI
		 */
		async deletePOI(id: string) {
			try {
				const response = await fetch(`/api/pois/${id}`, {
					method: 'DELETE',
					credentials: 'include'
				});
				if (response.ok) {
					update((s) => ({
						...s,
						personOfInterest: s.personOfInterest.filter((p) => p.id !== id),
						activePOI: s.activePOI?.id === id ? null : s.activePOI,
						totalPOIs: s.totalPOIs - 1
					}));
				}
			} catch (error) {
				console.error('Delete error:', error);
			}
		},

		// ========== SELECTION ==========
		/**
		 * Select a POI
		 */
		selectPOI(id: string) {
			update((s) => {
				const poi = s.personOfInterest.find((p) => p.id === id);
				return { ...s, activePOI: poi || null };
			});
		},

		/**
		 * Clear selection
		 */
		clearSelection() {
			update((s) => ({ ...s, activePOI: null }));
		},

		// ========== RELATIONSHIPS ==========
		/**
		 * Create relationship between POIs
		 */
		async createRelationship(
			poiId1: string,
			poiId2: string,
			type: RelationshipType,
			strength: number = 0.7
		): Promise<POIRelationship | null> {
			try {
				const response = await fetch('/api/pois/relationships', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ poiId1, poiId2, type, strength }),
					credentials: 'include'
				});
				if (response.ok) {
					const data = await response.json();
					const relationship: POIRelationship = data.relationship;
					update((s) => ({
						...s,
						relationships: [relationship, ...s.relationships],
						relationshipGraph: buildRelationshipGraph([...s.relationships, relationship])
					}));
					return relationship;
				}
				return null;
			} catch (error) {
				console.error('Relationship error:', error);
				return null;
			}
		},

		// ========== NETWORK ANALYSIS ==========
		/**
		 * Analyze network and generate clusters
		 */
		async analyzeNetwork() {
			update((s) => ({ ...s, isLoading: true }));
			try {
				let currentState: POIStoreState = initialState;
				subscribe((s) => {
					currentState = s;
				})();

				const response = await fetch('/api/pois/analyze', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ pois: currentState.personOfInterest,
						relationships: currentState.relationships
					}),
					credentials: 'include'
				});

				if (response.ok) {
					const data = await response.json();
					update((s) => ({
						...s,
						clusters: data.clusters || [],
						networkMetrics: data.metrics || s.networkMetrics,
						isLoading: false
					}));
				}
			} catch (error) {
				console.error('Network error:', error);
				update((s) => ({ ...s, isLoading: false }));
			}
		},

		// ========== TIMELINE ==========
		/**
		 * Build timeline for a POI
		 */
		async buildTimeline(poiId: string): Promise<TimelineEvent[]> {
			try {
				const response = await fetch(`/api/pois/${poiId}/timeline`, { credentials: 'include' });
				if (response.ok) {
					const data = await response.json();
					const events: TimelineEvent[] = data.events || [];
					update((s) => ({
						...s,
						timeline: [...s.timeline, ...events],
						timelineByPOI: new Map(s.timelineByPOI).set(poiId, events)
					}));
					return events;
				}
				return [];
			} catch (error) {
				console.error('Timeline error:', error);
				return [];
			}
		},

		/**
		 * Add timeline event
		 */
		async addTimelineEvent(
			poiId: string,
			event: Omit<TimelineEvent, 'id'>
		): Promise<TimelineEvent | null> {
			try {
				const response = await fetch(`/api/pois/${poiId}/timeline`, {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(event),
					credentials: 'include'
				});
				if (response.ok) {
					const data = await response.json();
					const newEvent: TimelineEvent = data.event;
					update((s) => {
						const timelineEvents = s.timelineByPOI.get(poiId) || [];
						return {
							...s,
							timeline: [...s.timeline, newEvent],
							timelineByPOI: new Map(s.timelineByPOI).set(poiId, [...timelineEvents, newEvent])
						};
					});
					return newEvent;
				}
				return null;
			} catch (error) {
				console.error('Timeline error:', error);
				return null;
			}
		},

		// ========== RISK ANALYSIS ==========
		/**
		 * Predict risk for a POI
		 */
		async predictRisk(poiId: string): Promise<number> {
			try {
				const response = await fetch(`/api/pois/${poiId}/risk`, {
					method: 'POST',
					credentials: 'include'
				});
				if (response.ok) {
					const data = await response.json();
					const riskScore = data.riskScore || 0;
					update((s) => ({
						...s,
						riskScores: new Map(s.riskScores).set(poiId, riskScore)
					}));
					return riskScore;
				}
				return 0;
			} catch (error) {
				console.error('Risk error:', error);
				return 0;
			}
		}
	};
}

/**
 * Export singleton instance
 */
export const poiStore = createPOIStore();

/**
 * Derived stores
 */
export const pois = derived(poiStore, ($store) => $store.personOfInterest);
export const activePOI = derived(poiStore, ($store) => $store.activePOI);
export const relationships = derived(poiStore, ($store) => $store.relationships);




