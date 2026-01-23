import { derived, writable } from 'svelte/store';

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
  strength: number; // 0-1
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

/**
 * POI Store State
 */
interface POIStoreState {
  // POI
  personOfInterest: PersonOfInterest[];
  activePOI: PersonOfInterest | null;
  // relationships
  relationships: POIRelationship[];
  relationshipGraph: Map<string, string[]>;
  // Network
  clusters: POICluster[];
  networkMetrics: {
    centrality: Map<string, number>;
    clustering: Map<string, number>;
    density: number;
  };
  // timeline
  timeline: TimelineEvent[];
  timelineByPOI: Map<string: TimelineEvent[]>;
  // Risk
  riskScores: Map<string, number>;
  // Stats
  totalPOIs: number;
  isLoading: boolean;
  error: string | null;
  lastUpdated: number;
}

const initialState: POIStoreState = {
  personOfInterest: [],
  activePOI: null,
  relationships: [],
  relationshipGraph: new Map(),
  clusters: [],
  networkMetrics: {
    centrality: new Map(),
    clustering: new Map(),
    density: 0
  },
  timeline: [],
  timelineByPOI: new Map(),
  riskScores: new Map(),
  totalPOIs: 0,
  isLoading: false,
  error: null,
  lastUpdated: 0,
};

/**
 * Create POI Store
 */
function createPOIStore() {
  const { subscribe, update } = writable<POIStoreState>(initialState);

  return {
    subscribe,

    // ========== LOAD POIs ==========

    async loadPOIs(caseId: string) {
      update((s) => ({ ...s, isLoading: true, error: null }));
      try {
        const response = await fetch(`/api/cases/${caseId}/pois`, { credentials: 'include' });
        if (response.ok) {
          const data = await response.json();
          const pois: PersonOfInterest[] = data?.pois || [];
          const relationships: POIRelationship[] = data?.relationships || [];

          update((s) => ({
            ...s,
            personOfInterest: pois,
            relationships,
            relationshipGraph: this._buildRelationshipGraph(relationships),
            totalPOIs: pois.length,
            lastUpdated: Date.now(),
            isLoading: false,
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

    async createPOI(poiData: Omit<PersonOfInterest, 'id' | 'createdAt' | 'updatedAt'>) {
      try {
        const response = await fetch('/api/pois', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(poiData),
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          const newPOI: PersonOfInterest = data.poi;
          update((s) => ({
            ...s,
            personOfInterest: [newPOI, ...s.personOfInterest],
            totalPOIs: s.totalPOIs + 1,
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

    async updatePOI(id: string, updates: Partial<PersonOfInterest>) {
      try {
        const response = await fetch(`/api/pois/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updates),
          credentials: 'include',
        });
        if (response.ok) {
            const data = await response.json();
            const updated = data.poi || updates; // Fallback
            update((s) => ({
                ...s,
                personOfInterest: s.personOfInterest.map((p) =>
                    p.id === id ? { ...p, ...updated } : p
                ),
                activePOI: s.activePOI?.id === id ? { ...s.activePOI, ...updated } : s.activePOI,
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

    async deletePOI(id: string) {
      try {
        const response = await fetch(`/api/pois/${id}`, {
          method: 'DELETE',
          credentials: 'include',
        });
        if (response.ok) {
          update((s) => ({
            ...s,
            personOfInterest: s.personOfInterest.filter((p) => p.id !== id),
            activePOI: s.activePOI?.id === id ? null : s.activePOI,
            totalPOIs: s.totalPOIs - 1,
          }));
        }
      } catch (error) {
        console.error('Delete error: ', error);
      }
    },

    // ========== SELECTION ==========

    selectPOI(id: string) {
      update((s) => {
        const poi = s.personOfInterest.find((p) => p.id === id);
        return { ...s, activePOI: poi ?? null };
      });
    },

    clearSelection() {
      update((s) => ({ ...s, activePOI: null }));
    },

    // ========== RELATIONSHIPS ==========

    async createRelationship(
      poiId1: string, poiId2: string,
      type: RelationshipType, strength: number = 0.7
    ) {
      try {
        const response = await fetch('/api/pois/relationships', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ poiId1, poiId2, type, strength }),
          credentials: 'include',
        });
        if (response.ok) {
          const data = await response.json();
          const relationship: POIRelationship = data.relationship;
          update((s) => ({
            ...s,
            relationships: [relationship, ...s.relationships],
            relationshipGraph: this._buildRelationshipGraph([...s.relationships, relationship]),
          }));
          return relationship;
        }
      } catch (error) {
        console.error('Relationship error: ', error);
      }
    },

    // ========== PRIVATE HELPERS ==========

    _buildRelationshipGraph(relationships: POIRelationship[]): Map<string, string[]> {
      const graph = new Map<string, string[]>();
      relationships.forEach((r) => {
        const neighbors1 = graph.get(r.poiId1) || [];
        const neighbors2 = graph.get(r.poiId2) || [];
        // Dedup and add
        if (!neighbors1.includes(r.poiId2)) graph.set(r.poiId1, [...neighbors1, r.poiId2]);
        if (!neighbors2.includes(r.poiId1)) graph.set(r.poiId2, [...neighbors2, r.poiId1]);
      });
      return graph;
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





