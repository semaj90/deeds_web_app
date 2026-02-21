/**
 * POIStore - Unified Persons of Interest Management
 * Rewritten Session 63: Svelte 5 — plain TS class with subscribe contract
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
	id: string;
	name: string;
	role: POIRole;
	caseId: string;
	aliases?: string[];
	description?: string;
	contactInfo?: { phone?: string; email?: string; address?: string };
	riskLevel: 'low' | 'medium' | 'high' | 'critical';
	tags?: string[];
	createdAt: number;
	updatedAt: number;
}

export interface POIRelationship {
	id: string;
	poiId1: string;
	poiId2: string;
	type: RelationshipType;
	strength: number;
	description?: string;
	evidence?: string[];
}

export interface TimelineEvent {
	id: string;
	poiId: string;
	date: number;
	title: string;
	description: string;
	type: string;
	location?: string;
}

export interface POICluster {
	id: string;
	pois: PersonOfInterest[];
	theme: string;
	confidence: number;
}

interface POIStoreState {
	personOfInterest: PersonOfInterest[];
	activePOI: PersonOfInterest | null;
	relationships: POIRelationship[];
	relationshipGraph: Map<string, string[]>;
	clusters: POICluster[];
	networkMetrics: {
		centrality: Map<string, number>;
		clustering: Map<string, number>;
		density: number;
	};
	timeline: TimelineEvent[];
	timelineByPOI: Map<string, TimelineEvent[]>;
	riskScores: Map<string, number>;
	totalPOIs: number;
	isLoading: boolean;
	error: string | null;
	lastUpdated: number;
}

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

class POIStore {
	private _state: POIStoreState = {
		personOfInterest: [],
		activePOI: null,
		relationships: [],
		relationshipGraph: new Map(),
		clusters: [],
		networkMetrics: { centrality: new Map(), clustering: new Map(), density: 0 },
		timeline: [],
		timelineByPOI: new Map(),
		riskScores: new Map(),
		totalPOIs: 0,
		isLoading: false,
		error: null,
		lastUpdated: 0
	};

	private subscribers = new Set<(v: POIStoreState) => void>();

	private notify() {
		this.subscribers.forEach((fn) => fn(this._state));
	}

	private update(fn: (s: POIStoreState) => POIStoreState) {
		this._state = fn(this._state);
		this.notify();
	}

	/** Svelte store contract */
	subscribe(fn: (v: POIStoreState) => void): () => void {
		this.subscribers.add(fn);
		fn(this._state);
		return () => {
			this.subscribers.delete(fn);
		};
	}

	get state(): POIStoreState {
		return this._state;
	}

	async loadPOIs(caseId: string) {
		this.update((s) => ({ ...s, isLoading: true, error: null }));
		try {
			const response = await fetch(`/api/cases/${caseId}/pois`, { credentials: 'include' });
			if (response.ok) {
				const data = await response.json();
				const pois: PersonOfInterest[] = data?.pois || [];
				const relationships: POIRelationship[] = data?.relationships || [];
				this.update((s) => ({
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
			const msg = error instanceof Error ? error.message : 'Failed to load POIs';
			this.update((s) => ({ ...s, error: msg, isLoading: false }));
		}
	}

	async createPOI(
		poiData: Omit<PersonOfInterest, 'id' | 'createdAt' | 'updatedAt'>
	): Promise<PersonOfInterest | null> {
		const response = await fetch('/api/pois', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(poiData),
			credentials: 'include'
		});
		if (!response.ok) throw new Error('Failed to create POI');
		const data = await response.json();
		const newPOI: PersonOfInterest = data.poi;
		this.update((s) => ({
			...s,
			personOfInterest: [newPOI, ...s.personOfInterest],
			totalPOIs: s.totalPOIs + 1
		}));
		return newPOI;
	}

	async updatePOI(
		id: string,
		updates: Partial<PersonOfInterest>
	): Promise<PersonOfInterest | null> {
		const response = await fetch(`/api/pois/${id}`, {
			method: 'PUT',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(updates),
			credentials: 'include'
		});
		if (!response.ok) throw new Error('Failed to update POI');
		const updated = await response.json();
		this.update((s) => ({
			...s,
			personOfInterest: s.personOfInterest.map((p) =>
				p.id === id ? { ...p, ...updated } : p
			),
			activePOI: s.activePOI?.id === id ? { ...s.activePOI, ...updated } : s.activePOI
		}));
		return updated;
	}

	async deletePOI(id: string) {
		const response = await fetch(`/api/pois/${id}`, {
			method: 'DELETE',
			credentials: 'include'
		});
		if (response.ok) {
			this.update((s) => ({
				...s,
				personOfInterest: s.personOfInterest.filter((p) => p.id !== id),
				activePOI: s.activePOI?.id === id ? null : s.activePOI,
				totalPOIs: s.totalPOIs - 1
			}));
		}
	}

	selectPOI(id: string) {
		this.update((s) => ({
			...s,
			activePOI: s.personOfInterest.find((p) => p.id === id) ?? null
		}));
	}

	clearSelection() {
		this.update((s) => ({ ...s, activePOI: null }));
	}

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
				this.update((s) => ({
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
	}

	async analyzeNetwork() {
		this.update((s) => ({ ...s, isLoading: true }));
		try {
			// Placeholder for network analysis API call
			this.update((s) => ({ ...s, isLoading: false }));
		} catch (error) {
			console.error('Network error:', error);
			this.update((s) => ({ ...s, isLoading: false }));
		}
	}

	async buildTimeline(poiId: string): Promise<TimelineEvent[]> {
		try {
			const response = await fetch(`/api/pois/${poiId}/timeline`, { credentials: 'include' });
			if (response.ok) {
				const data = await response.json();
				const events: TimelineEvent[] = data?.events || [];
				this.update((s) => ({
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
	}

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
				this.update((s) => {
					const timelineEvents = s.timelineByPOI.get(poiId) || [];
					return {
						...s,
						timeline: [...s.timeline, newEvent],
						timelineByPOI: new Map(s.timelineByPOI).set(poiId, [
							...timelineEvents,
							newEvent
						])
					};
				});
				return newEvent;
			}
			return null;
		} catch (error) {
			console.error('Timeline error:', error);
			return null;
		}
	}

	async predictRisk(poiId: string): Promise<number> {
		try {
			const response = await fetch(`/api/pois/${poiId}/risk`, {
				method: 'POST',
				credentials: 'include'
			});
			if (response.ok) {
				const data = await response.json();
				const riskScore = data?.riskScore ?? 0;
				this.update((s) => ({
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
}

export const poiStore = new POIStore();

// Convenience getters (replace derived stores)
export function getPOIs(): PersonOfInterest[] {
	return poiStore.state.personOfInterest;
}
export function getActivePOI(): PersonOfInterest | null {
	return poiStore.state.activePOI;
}
export function getRelationships(): POIRelationship[] {
	return poiStore.state.relationships;
}